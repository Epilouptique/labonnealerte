// Détection de la promo « livraison Mondial Relay 0,99 € leboncoin » via Dealabs.
//
// POURQUOI DEALABS ET PAS LEBONCOIN DIRECT : le scraping direct de leboncoin.fr depuis
// l'IP datacenter Railway est bloqué par DataDome de façon intermittente — ni fiable ni
// mesurable. Dealabs (communauté de bons plans) publie la promo dès son démarrage, sert
// un HTML SSR non protégé, et 42 passages de la sonde d'observation ont tranché :
// vrai négatif le 31/07/2026, vrai positif le 04/09/2026 avec 2 s de latence.
//
// UNE SEULE IMPLÉMENTATION DU PARSEUR, deux appelants :
//   · server/sources/leboncoin-livraison.js  → l'alerte réelle (throw sur erreur)
//   · server/leboncoin-promo-probe.js        → la sonde de contrôle (journalise, ne throw pas)
// D'où le découpage en trois : fetchDealabs (réseau brut, ne throw jamais),
// analyzeDealabs (parsing pur, testable hors ligne), detectDealabsPromo (les deux,
// avec throw — le contrat attendu d'un check() de source).
//
// Ce fichier vit dans sources/lib/ : loadSources() ne lit que les FICHIERS à la racine
// de sources/, un helper de sous-dossier n'est donc jamais chargé comme une source.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const DEALABS_URL = 'https://www.dealabs.com/search?q=mondial%20relay%200%2C99%20leboncoin';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TIMEOUT_MS = 8000;

// Titre pertinent = contient à la fois « mondial relay », « 0,99/0.99 » et « leboncoin ».
// Les trois sont exigés : « mondial relay 0,99 » seul remonte les promos Vinted/Rakuten.
function isPromoTitle(title) {
  const t = String(title || '').toLowerCase();
  return t.includes('mondial relay') && (t.includes('0,99') || t.includes('0.99')) && t.includes('leboncoin');
}

// ── Lecture des dates d'offre dans le corps du thread (correctif 28/10/2026) ─────
// Le faux positif du 28/10 : un thread Deal publié le mercredi ANNONÇANT une offre
// « du 30 octobre au 2 novembre » a été lu comme « en cours ». On lit donc les dates
// réelles pour distinguer « annoncée » (début futur → inactive) de « en cours ».
const FR_MONTHS = {
  janvier: 0, fevrier: 1, 'février': 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, aout: 7, 'août': 7, septembre: 8, octobre: 9, novembre: 10,
  decembre: 11, 'décembre': 11,
};

// Extrait toutes les dates (début de journée, heure locale) d'un texte libre français,
// dans l'ordre d'apparition. Formats : « 30 octobre 2026 », « 30/10/2026 », « 30/10 ».
// refYear sert d'année par défaut pour les formes sans année (JJ/MM) : l'année qui place
// la date au plus près de la publication, pour ne pas glisser d'une année sur un bord.
function parseFrenchDates(text, refYear) {
  const out = [];
  const s = String(text || '');
  // Forme « JJ mois [AAAA] » (la plus fiable : mois en toutes lettres).
  const nameRe = /(\d{1,2})\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)\.?(?:\s+(\d{4}))?/gi;
  let m;
  while ((m = nameRe.exec(s))) {
    const day = Number(m[1]);
    const mon = FR_MONTHS[m[2].toLowerCase()];
    const year = m[3] ? Number(m[3]) : refYear;
    if (mon != null && year) out.push({ idx: m.index, t: new Date(year, mon, day) });
  }
  // Forme numérique « JJ/MM[/AAAA] » (en secours si aucune forme lettrée).
  if (out.length === 0) {
    const numRe = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/g;
    while ((m = numRe.exec(s))) {
      const day = Number(m[1]); const mon = Number(m[2]) - 1;
      const year = m[3] ? Number(m[3]) : refYear;
      if (mon >= 0 && mon <= 11 && day >= 1 && day <= 31 && year) {
        out.push({ idx: m.index, t: new Date(year, mon, day) });
      }
    }
  }
  const valid = out.filter((d) => !Number.isNaN(d.t.getTime())).sort((a, b) => a.idx - b.idx);
  return { start: valid[0] ? valid[0].t : null, end: valid.length > 1 ? valid[valid.length - 1].t : null };
}

// Vrai si `now` tombe dans la fenêtre de promo plausible jeudi 18h → lundi 10h (Europe/Paris).
// Sert de garde-fou UNIQUEMENT quand les dates d'offre sont illisibles : le mercredi
// (jour du faux positif) est hors fenêtre, donc rejeté par défaut.
function isWithinWeekendWindow(now) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', hour12: false,
  }).formatToParts(new Date(now));
  const wd = (parts.find((p) => p.type === 'weekday') || {}).value; // Mon…Sun
  const hour = Number((parts.find((p) => p.type === 'hour') || {}).value);
  if (wd === 'Fri' || wd === 'Sat' || wd === 'Sun') return true;
  if (wd === 'Thu') return hour >= 18;
  if (wd === 'Mon') return hour < 10;
  return false;
}

const FOUR_DAYS_MS = 4 * 24 * 3600 * 1000;
const toMs = (p) => (p == null ? null : (p < 1e12 ? p * 1000 : p)); // publishedAt s → ms

// Extrait les threads pertinents du HTML (blob JSON __INITIAL_STATE__). Pour chaque titre
// promo, on lit isExpired / publishedAt / status / temperature / type / description DANS
// L'OBJET DU THREAD : la fenêtre est bornée au prochain "title" (pas de contamination par
// le thread voisin — cause (c) du faux positif), puis on y cherche les dates d'offre.
function parseDealabs(html) {
  const threads = [];
  const re = /"title":"([^"]{5,140})"/g;
  let m;
  while ((m = re.exec(html))) {
    const rawTitle = m[1];
    const title = rawTitle.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    if (!isPromoTitle(title)) continue;
    // Borne la fenêtre à l'objet du thread courant : jusqu'au prochain "title" (sinon 2500c).
    const nextTitle = html.indexOf('"title":"', m.index + 1);
    const hardEnd = Math.min(m.index + 2500, nextTitle > m.index ? nextTitle : html.length);
    const around = html.slice(m.index, hardEnd);
    const exp = /"isExpired":(true|false)/.exec(around);
    const pub = /"publishedAt":(\d{9,13})/.exec(around);
    const st = /"status":"([^"]+)"/.exec(around);
    const temp = /"temperature":([\d.]+)/.exec(around);
    const typ = /"type":"([^"]+)"/.exec(around);
    const desc = /"description":"((?:[^"\\]|\\.)*)"/.exec(around);
    const publishedAt = pub ? Number(pub[1]) : null;
    const refYear = publishedAt ? new Date(toMs(publishedAt)).getFullYear() : new Date().getFullYear();
    const bodyText = (desc ? desc[1] : '').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    const { start, end } = parseFrenchDates(title + ' ' + bodyText, refYear);
    threads.push({
      title,
      isExpired: exp ? exp[1] === 'true' : null,
      publishedAt,
      status: st ? st[1] : null,
      temperature: temp ? Number(temp[1]) : null,
      type: typ ? typ[1] : null,
      startDate: start ? start.getTime() : null,
      endDate: end ? end.getTime() : null,
    });
  }
  return threads;
}

// Un thread est-il une VRAIE offre en cours à l'instant `now` ? (cœur du correctif)
//   · doit être un Deal non expiré, lu dans son propre objet ;
//   · dates lisibles : début ≤ now (sinon « annoncée » → non) ET (pas de fin OU fin ≥ now) ;
//   · dates illisibles : seulement dans la fenêtre week-end ET publié depuis < 4 jours ;
//   · tout échec de lecture ⇒ NON actif (jamais d'activation par défaut).
function isLiveDeal(t, now) {
  if (t.isExpired !== false) return false;
  // Un vrai Deal : type « deal » si présent ; un statut expiré/brouillon disqualifie.
  if (t.type && t.type.toLowerCase() !== 'deal') return false;
  if (t.status && /expired|draft|deleted|unpublish/i.test(t.status)) return false;
  if (t.startDate != null) {
    if (t.startDate > now) return false;              // annoncée, pas encore commencée
    if (t.endDate != null && t.endDate < now) return false; // déjà terminée
    return true;
  }
  // Dates illisibles : on n'active que dans la fenêtre plausible et sur une pub récente.
  const pubMs = toMs(t.publishedAt);
  if (!isWithinWeekendWindow(now)) return false;
  if (pubMs == null || (now - pubMs) > FOUR_DAYS_MS) return false;
  return true;
}

/**
 * Verdict à partir du HTML seul — pur, sans réseau (donc testable hors ligne).
 * @param {string} html
 * @param {{ now?:number }} [opts] horloge injectable (tests déterministes)
 * @returns {{ active:boolean, best:object|null, matched_count:number, active_count:number }}
 */
function analyzeDealabs(html, opts) {
  const now = (opts && opts.now != null) ? opts.now : Date.now();
  const threads = parseDealabs(html);
  // ACTIF = vraie offre en cours MAINTENANT (début atteint, pas expirée). Plus de « tout
  // thread isExpired=false » : une annonce anticipée n'est plus comptée comme active.
  const active = threads.filter((t) => isLiveDeal(t, now));
  // À défaut d'un actif, on garde le plus récemment publié (info de fraîcheur pour le log).
  const freshest = threads.slice().sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))[0] || null;
  const best = active[0] || freshest;
  return {
    active: active.length > 0,
    active_count: active.length,
    matched_count: threads.length,
    best: best ? {
      title: best.title, isExpired: best.isExpired, publishedAt: best.publishedAt,
      status: best.status, temperature: best.temperature,
      type: best.type, startDate: best.startDate, endDate: best.endDate,
    } : null,
  };
}

/**
 * Fetch brut — NE THROW JAMAIS : la sonde a besoin de journaliser l'échec lui-même.
 * @returns {Promise<{ status:number|null, body:string, latency:number, error?:string }>}
 */
async function fetchDealabs() {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(DEALABS_URL, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' },
      signal: controller.signal,
    });
    const body = await res.text();
    return { status: res.status, body, latency: Date.now() - t0 };
  } catch (err) {
    return { status: null, body: '', latency: Date.now() - t0, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Détection complète pour une source : THROW sur erreur réseau ou HTTP inattendu.
 * Une indisponibilité Dealabs ne doit JAMAIS se traduire en « promo terminée » — le
 * poller sait quoi faire d'un throw (état laissé intact), pas d'un faux inactive().
 * @returns {Promise<{ active, best, matched_count, active_count, latency_ms }>}
 */
async function detectDealabsPromo(opts) {
  const r = await fetchDealabs();
  if (r.status == null) {
    throw new Error(`Dealabs injoignable : ${r.error || 'erreur réseau'}`);
  }
  if (r.status !== 200) {
    throw new Error(`Réponse inattendue Dealabs (HTTP ${r.status})`);
  }
  return { ...analyzeDealabs(r.body, opts), latency_ms: r.latency };
}

module.exports = {
  detectDealabsPromo, fetchDealabs, analyzeDealabs, parseDealabs, isPromoTitle, DEALABS_URL,
  parseFrenchDates, isWithinWeekendWindow, isLiveDeal,
};
