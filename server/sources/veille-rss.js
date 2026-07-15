// Source PARAMÉTRÉE (OpenAlert v2) : veille sur N'IMPORTE QUEL flux RSS/Atom au
// choix de l'abonné. Actif si un nouvel item a été publié < 72h.
//
// ⚠️ CHANTIER SENSIBLE : l'URL est fournie par l'utilisateur → protections
// anti-SSRF OBLIGATOIRES via safeFetchText (mêmes garde-fous que le validateur
// /proposer : IP privées/loopback interdites, PAS de suivi de redirection, taille
// plafonnée, timeout court). https uniquement. Parseur RSS+Atom partagé, sans
// dépendance. Cache 2h/combinaison, plafond de fetchs/cycle.
//
// NOTE STRATÉGIE : cette source préfigure la famille « veilles surveillées » de la
// future V3 (dépôt de flux tout public). Elle en est le prototype technique sûr.

const { safeFetchText, pubErr } = require('../safe-fetch');
const { parseFeed } = require('./lib/feed-parser');

const TIMEOUT_MS = 6_000;
const MAX_BYTES = 512 * 1024; // 512 Ko (un flux peut être un peu plus gros qu'un JSON d'API)
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const FRESH_MS = 72 * 60 * 60 * 1000;
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);
const URL_RE = /^https:\/\/[^\s]{1,300}$/i;

const paramsSchema = [
  {
    key: 'flux',
    label: 'URL du flux RSS/Atom',
    type: 'string',
    placeholder: 'https://exemple.fr/rss.xml',
    pattern: '^https://[^\\s]{1,300}$',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'URL https d\'un flux RSS ou Atom. Idéal pour les flux qui publient peu — un flux quotidien vous notifiera chaque jour.',
  },
];

// Cache par flux : url → { at, result }.
const cache = new Map();

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: 'https://www.labonnealerte.fr' };
}

async function fetchFlux(url) {
  let xml;
  try {
    xml = await safeFetchText(url, { timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' });
  } catch (err) {
    // Erreur réseau/SSRF/HTTP → inactive silencieux (pas d'alerte d'erreur).
    return inactive();
  }
  const { items } = parseFeed(xml);
  if (!items.length) return inactive();

  // Item le plus récent (les flux ne sont pas toujours triés → on prend le max date).
  let newest = null;
  for (const it of items) {
    if (it.date && (!newest || it.date > newest.date)) newest = it;
  }
  if (!newest || !newest.date) return inactive();
  if (Date.now() - newest.date.getTime() >= FRESH_MS) return inactive();

  const titre = newest.title || 'nouvel article';
  return {
    state: 'active',
    since: newest.date,
    until: null,
    message: `📰 Nouveau : ${titre}`,
    url: newest.link || url,
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  let fetches = 0;
  const out = [];

  for (const params of combos) {
    const url = String((params && params.flux) || '');
    if (!URL_RE.test(url)) { out.push(Object.assign({ params }, inactive())); continue; }

    const cached = cache.get(url);
    if (cached && now - cached.at < CACHE_TTL_MS) {
      out.push(Object.assign({ params }, cached.result));
      continue;
    }
    if (fetches >= MAX_FETCH) {
      out.push(Object.assign({ params }, cached ? cached.result : inactive()));
      continue;
    }
    fetches += 1;
    const result = await fetchFlux(url);
    cache.set(url, { at: Date.now(), result });
    out.push(Object.assign({ params }, result));
  }
  if (combos.length > MAX_FETCH) {
    console.warn(`[veille-rss] ${combos.length} flux souscrits, ${MAX_FETCH} rafraîchis ce cycle.`);
  }
  return out;
}

module.exports = { id: 'veille-rss', paramsSchema, checkWithParams };
