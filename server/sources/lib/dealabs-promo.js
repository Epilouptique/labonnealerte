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

// Extrait les threads pertinents du HTML (blob JSON __INITIAL_STATE__) : pour chaque titre
// promo, on récupère isExpired / publishedAt / status / temperature dans sa fenêtre proche.
function parseDealabs(html) {
  const threads = [];
  const re = /"title":"([^"]{5,140})"/g;
  let m;
  while ((m = re.exec(html))) {
    const rawTitle = m[1];
    const title = rawTitle.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    if (!isPromoTitle(title)) continue;
    const around = html.slice(m.index, m.index + 900);
    const exp = /"isExpired":(true|false)/.exec(around);
    const pub = /"publishedAt":(\d{9,13})/.exec(around);
    const st = /"status":"([^"]+)"/.exec(around);
    const temp = /"temperature":([\d.]+)/.exec(around);
    threads.push({
      title,
      isExpired: exp ? exp[1] === 'true' : null,
      publishedAt: pub ? Number(pub[1]) : null,
      status: st ? st[1] : null,
      temperature: temp ? Number(temp[1]) : null,
    });
  }
  return threads;
}

/**
 * Verdict à partir du HTML seul — pur, sans réseau (donc testable hors ligne).
 * @returns {{ active:boolean, best:object|null, matched_count:number, active_count:number }}
 */
function analyzeDealabs(html) {
  const threads = parseDealabs(html);
  // Un thread ACTIF (isExpired=false) = promo en cours d'après la communauté.
  const active = threads.filter((t) => t.isExpired === false);
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
async function detectDealabsPromo() {
  const r = await fetchDealabs();
  if (r.status == null) {
    throw new Error(`Dealabs injoignable : ${r.error || 'erreur réseau'}`);
  }
  if (r.status !== 200) {
    throw new Error(`Réponse inattendue Dealabs (HTTP ${r.status})`);
  }
  return { ...analyzeDealabs(r.body), latency_ms: r.latency };
}

module.exports = {
  detectDealabsPromo, fetchDealabs, analyzeDealabs, parseDealabs, isPromoTitle, DEALABS_URL,
};
