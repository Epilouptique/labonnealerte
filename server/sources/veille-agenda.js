// Source PARAMÉTRÉE (OpenAlert v2) : veille sur l'agenda personnel de l'abonné,
// publié au format iCal (Google Agenda « adresse secrète au format iCal »,
// Outlook, Apple Calendar/iCloud exposent tous une adresse de ce type, en
// lecture seule).
//
// PHILOSOPHIE « QUE DU SIGNAL » : on ne notifie PAS chaque événement de
// l'agenda — ce serait un doublon bruyant des rappels natifs. On notifie les
// événements qui ENTRENT dans une fenêtre de préavis choisie par l'abonné
// (« prévenez-moi X jours avant »), et chacun UNE SEULE FOIS.
//
// ⚠️ DONNÉE SENSIBLE : l'adresse d'un agenda personnel donne accès en LECTURE à
// tout son contenu. Elle n'est JAMAIS écrite en clair dans un log — ni en cas
// d'erreur, ni en cas de succès. Les messages de diagnostic n'utilisent qu'une
// empreinte courte et non réversible (refKey), suffisante pour corréler deux
// lignes de log sans jamais exposer l'agenda.
//
// ⚠️ URL fournie par l'utilisateur → safeFetchText OBLIGATOIRE (anti-SSRF :
// IP privées/loopback interdites, pas de suivi de redirection, taille plafonnée,
// timeout court). Plafond relevé à 2 Mo : un agenda chargé est volumineux
// (539 Ko constatés sur un flux public de 1079 événements).
//
// ── ANTI-RÉTROACTIF (état persistant, calqué sur lib/panneaupocket-veille.js) ─
// Contrairement à veille-rss/youtube-chaine (« l'item le plus récent est-il
// frais ? », sans mémoire), il faut ici se souvenir des occurrences DÉJÀ
// annoncées, sinon le même événement re-déclencherait à chaque cycle tant qu'il
// reste dans la fenêtre. D'où loadRef/dumpRef :
//   ref = { seen: [[cléOccurrence, horodatageDébut], …] }
// AMORÇAGE : au tout premier cycle (aucune référence en base), on enregistre les
// occurrences déjà dans la fenêtre SANS alerter. Sinon, s'abonner déclencherait
// immédiatement une rafale sur des événements déjà connus de l'abonné.
// PURGE : les occurrences passées sont retirées à chaque cycle — la référence
// reste bornée par le contenu de la fenêtre, elle ne grossit pas indéfiniment.
//
// Un événement récurrent partageant un seul UID pour toutes ses dates, la clé de
// mémorisation est UID + date de l'occurrence (cf. lib/ics-parser.js).

const crypto = require('crypto');
const { safeFetchText } = require('../safe-fetch');
const { parseIcs, occurrencesInWindow } = require('./lib/ics-parser');

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 2 * 1024 * 1024; // agenda chargé : 539 Ko constatés en réel
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 h
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);
const REF_SOFT_BYTES = 64 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

const URL_RE = /^https:\/\/[^\s]{1,300}$/i;

const PREAVIS = [
  { value: '1', label: 'La veille' },
  { value: '2', label: '2 jours avant' },
  { value: '3', label: '3 jours avant' },
  { value: '7', label: 'Une semaine avant' },
];

const paramsSchema = [
  {
    key: 'agenda',
    label: 'Adresse de votre agenda (format iCal)',
    type: 'string',
    placeholder: 'https://calendar.google.com/calendar/ical/…/basic.ics',
    pattern: URL_RE.source,
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    // Une adresse iCal réelle dépasse le plafond par défaut de 120 caractères
    // (137 mesurés sur une adresse Google typique) — sans ce réglage, elle
    // serait tronquée en silence et l'abonnement resterait muet (cf. params.js).
    maxLength: 300,
    hint: 'Dans Google Agenda : Paramètres > votre agenda > « Adresse secrète au format iCal ». '
      + 'Outlook et Apple Calendar proposent l\'équivalent. Gardez cette adresse privée.',
  },
  {
    key: 'preavis',
    label: 'Me prévenir',
    type: 'enum',
    values: PREAVIS,
    multiple: false,
    // NON requis À DESSEIN : la page de souscription ne rend aujourd'hui que le
    // PREMIER paramètre d'un schéma (public/js/source.js). Marqué `required`, ce
    // champ ferait échouer toute souscription depuis l'interface. Absent, il
    // retombe sur le préavis d'un jour ; il reste réglable via l'URL
    // (?preavis=7), comme pour les autres sources multi-champs existantes.
    required: false,
    // 1 jour : c'est le préavis qui laisse encore agir (se libérer, préparer,
    // s'organiser) sans réveiller un événement qu'on aura de toute façon oublié
    // d'ici là. Au-delà, l'alerte arrive trop tôt pour être utile.
    default: '1',
  },
];

// url → { at, result, seen: Map(clé → horodatage), primed: bool }
const cache = new Map();
// clé de combinaison → JSON persisté (détection de changement)
const snapshot = new Map();

// Empreinte courte et non réversible, pour les logs. L'URL n'y apparaît jamais.
function refKey(url) {
  return crypto.createHash('sha256').update(String(url)).digest('hex').slice(0, 8);
}

function comboKey(params) {
  return `${String((params && params.agenda) || '')}|${String((params && params.preavis) || '')}`;
}

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: 'https://labonnealerte.fr' };
}

function preavisDays(params) {
  const raw = parseInt(String((params && params.preavis) || '1'), 10);
  return PREAVIS.some((p) => Number(p.value) === raw) ? raw : 1;
}

// Date lisible sans dépendance : « lundi 3 août à 14h30 » / « lundi 3 août ».
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function formatQuand(d, allDay) {
  const base = `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
  if (allDay) return base;
  const h = d.getHours();
  const m = d.getMinutes();
  return `${base} à ${h}h${m ? String(m).padStart(2, '0') : ''}`;
}

function buildMessage(fresh) {
  const first = fresh[0];
  const quand = formatQuand(first.start, first.allDay);
  if (fresh.length === 1) return `📅 ${first.summary} — ${quand}`;
  return `📅 ${fresh.length} événements à venir, à commencer par ${first.summary} — ${quand}`;
}

// Retire les occurrences déjà passées : la référence reste bornée.
function purge(seen, now) {
  for (const [key, startMs] of seen) if (startMs < now) seen.delete(key);
}

function seenToArray(seen) {
  return Array.from(seen.entries());
}

// ── Persistance opt-in (contrat poller.js) ──────────────────────────────────
function loadRef(params, data) {
  const url = String((params && params.agenda) || '');
  if (!URL_RE.test(url)) return;
  const key = comboKey(params);
  // data null/corrompu → amorçage mémoire classique (on n'invente rien).
  if (!data || !Array.isArray(data.seen)) return;

  const seen = new Map();
  for (const entry of data.seen) {
    if (Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string') {
      seen.set(entry[0], Number(entry[1]) || 0);
    }
  }
  const existing = cache.get(key);
  // at:0 → force un fetch frais au prochain cycle (comble le trou d'un redéploiement).
  cache.set(key, {
    at: 0,
    result: existing ? existing.result : inactive(),
    seen,
    primed: true, // une référence existe → l'amorçage a déjà eu lieu
  });
  snapshot.set(key, JSON.stringify({ seen: seenToArray(seen) }));
}

function dumpRef(params) {
  const url = String((params && params.agenda) || '');
  if (!URL_RE.test(url)) return undefined;
  const key = comboKey(params);
  const entry = cache.get(key);
  if (!entry || !entry.seen || !entry.primed) return undefined;

  const payload = { seen: seenToArray(entry.seen) };
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json, 'utf8') > REF_SOFT_BYTES) {
    console.warn(`[veille-agenda] ${refKey(url)} : ref > 64 Ko, non persistée.`);
    return undefined;
  }
  if (json === snapshot.get(key)) return undefined; // inchangé → aucune écriture
  snapshot.set(key, json);
  return payload;
}

async function checkOne(params, entry) {
  const url = String((params && params.agenda) || '');
  const now = Date.now();
  const jours = preavisDays(params);

  let ics;
  try {
    ics = await safeFetchText(url, {
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_BYTES,
      accept: 'text/calendar, application/octet-stream, text/plain',
    });
  } catch (err) {
    // Réseau / SSRF bloqué / 4xx-5xx / trop volumineux → inactive silencieux.
    // On conserve la mémoire existante : ne rien perdre, ne rien inventer.
    // L'adresse n'est JAMAIS journalisée — seulement son empreinte.
    console.warn(`[veille-agenda] ${refKey(url)} : ${err.message} → inactive.`);
    return { result: inactive(), seen: entry ? entry.seen : null, primed: entry ? entry.primed : false };
  }

  let parsed;
  try {
    parsed = parseIcs(ics);
  } catch (err) {
    console.warn(`[veille-agenda] ${refKey(url)} : agenda illisible → inactive.`);
    return { result: inactive(), seen: entry ? entry.seen : null, primed: entry ? entry.primed : false };
  }
  if (parsed.skipped) {
    console.warn(`[veille-agenda] ${refKey(url)} : ${parsed.skipped} événement(s) à répétition non gérée, ignorés.`);
  }

  const occ = occurrencesInWindow(parsed, new Date(now), new Date(now + jours * DAY_MS));
  const seen = entry && entry.seen ? entry.seen : new Map();
  const primed = !!(entry && entry.primed);

  // AMORÇAGE : premier passage → on mémorise sans alerter.
  if (!primed) {
    for (const o of occ) seen.set(o.key, o.start.getTime());
    purge(seen, now);
    return { result: inactive(), seen, primed: true };
  }

  const fresh = occ.filter((o) => !seen.has(o.key));
  for (const o of occ) seen.set(o.key, o.start.getTime());
  purge(seen, now);

  if (!fresh.length) return { result: inactive(), seen, primed: true };
  return {
    result: {
      state: 'active',
      since: new Date(),
      until: fresh[0].start,
      message: buildMessage(fresh),
      url: 'https://labonnealerte.fr',
    },
    seen,
    primed: true,
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  let fetches = 0;
  const out = [];

  for (const params of combos) {
    const url = String((params && params.agenda) || '');
    if (!URL_RE.test(url)) { out.push(Object.assign({ params }, inactive())); continue; }
    const key = comboKey(params);
    const entry = cache.get(key);

    if (entry && now - entry.at < CACHE_TTL_MS) {
      out.push(Object.assign({ params }, entry.result));
      continue;
    }
    if (fetches >= MAX_FETCH) {
      out.push(Object.assign({ params }, entry ? entry.result : inactive()));
      continue;
    }
    fetches += 1;

    const { result, seen, primed } = await checkOne(params, entry);
    cache.set(key, { at: Date.now(), result, seen, primed });
    out.push(Object.assign({ params }, result));
  }
  if (combos.length > MAX_FETCH) {
    console.warn(`[veille-agenda] ${combos.length} agendas souscrits, ${MAX_FETCH} rafraîchis ce cycle.`);
  }
  return out;
}

module.exports = { id: 'veille-agenda', paramsSchema, checkWithParams, loadRef, dumpRef };
