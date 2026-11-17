// Source interne : lancements spatiaux EUROPÉENS (Launch Library 2, sans clé).
//
// API : ll.thespacedevs.com/2.2.0/launch/upcoming (rate limit ~15 req/h ; notre
// cycle 30 min = 2 req/h, large marge). On utilise mode=list (payload allégé).
// STRUCTURE list constatée : results[] = { name, net (ISO), status.abbrev
// ('Go'|'TBC'|'TBD'…), lsp_name (fournisseur), pad (string), location (string,
// ex. « Guiana Space Centre, French Guiana » / « Esrange Space Center ») }.
//
// ANTI-SPAM : il y a des lancements quasi quotidiens (Starlink…). On filtre
// STRICTEMENT les lancements européens/français : provider Arianespace / ESA / CNES
// / Avio (Vega) OU pad au Centre spatial guyanais (Kourou) — quelques-uns par an.
//
// Actif quand un lancement filtré, confirmé (status 'Go'), décolle dans les 24h :
// fenêtre [net-24h, net+2h[. until = net+2h (extinction seule, comme les séismes).
// Un nouveau lancement (net différent, ≥24h d'écart) est re-notifié par le poller.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { withFailThreshold, freshFallback } = require('./lib/fail-threshold');

const API_URL = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=40&mode=list';
// 2026-11-17 : 10 s → 25 s. L'API n'est PAS en panne (mesurée à 159-445 ms depuis un
// poste tiers le 2026-11-17, 3/3, HTTP 200) ; les 44 timeouts/7 j en prod viennent de
// l'egress Railway lent sur cet hôte, pas de l'API. Un timeout plus large l'absorbe.
const TIMEOUT_MS = 25_000;
// Replis identifiés et TESTÉS le 2026-11-17 (HTTP 200), documentés SANS être branchés :
//   · API v2.3.0 : https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=40&mode=list
//     (schéma différent — results[].launch_service_provider, pad.location… — à valider
//      avant toute bascule : la normalisation isEuropean/net/status serait à revoir).
//   · Miroir de dev : https://lldev.thespacedevs.com/2.2.0/launch/upcoming/?limit=40&mode=list
//     (même schéma 2.2.0, utile en secours ponctuel ; non garanti pour la prod).
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // succès 2 h : le calendrier des lancements bouge peu
// Borne d'âge du REPLI (voir freshFallback) : un état 'active' (« lancement aujourd'hui »)
// est aussi périssable qu'un signal réseau — sa fenêtre se ferme à net+2h. Au-delà de 6 h
// (3× le TTL de succès), on ne ressert plus l'état en cache → inactive, pour ne pas laisser
// stagner un « aujourd'hui » périmé que decideTransition (qui ne lit jamais until) ne ferme pas.
const MAX_FALLBACK_AGE_MS = 6 * 60 * 60 * 1000;
const INACTIVE = () => ({ state: 'inactive', since: null, until: null, message: null, url: ARIANE_LIVE });
const WINDOW_BEFORE_MS = 24 * 60 * 60 * 1000;
const WINDOW_AFTER_MS = 2 * 60 * 60 * 1000;

// Cache de succès en mémoire (patron veille-rss/veille-page) : { at, result }.
let okCache = null;

const PROVIDER_RE = /arianespace|european space agency|cnes|avio/i;
const PAD_RE = /guiana|kourou|french guiana|guyane/i;
const ARIANE_LIVE = 'https://www.arianespace.com/';
const ESA_LIVE = 'https://www.esa.int/';

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Lancement européen ? (fournisseur OU lieu au Centre spatial guyanais)
function isEuropean(l) {
  const prov = l.lsp_name || '';
  const loc = l.location || '';
  return PROVIDER_RE.test(prov) || PAD_RE.test(loc);
}

function heureParis(date) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit',
  }).format(date).replace(':', 'h');
}

async function checkRaw(opts = {}) {
  const now0 = Date.now();
  // Cache de succès frais → aucun appel réseau (absorbe aussi l'egress Railway lent).
  if (okCache && now0 - okCache.at < CACHE_TTL_MS) return okCache.result;
  const doFetch = (opts && opts._fetch) || fetchFn;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await doFetch(API_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API Launch Library (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API Launch Library échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new Error('Quota API Launch Library dépassé (HTTP 429)');
  if (!res.ok) throw new Error(`Réponse HTTP inattendue Launch Library : ${res.status} ${res.statusText}`);

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error(`Réponse Launch Library illisible (JSON invalide) : ${err.message}`);
  }
  const results = Array.isArray(payload && payload.results) ? payload.results : [];

  const now = Date.now();
  let best = null; // lancement européen confirmé, le plus proche, dans la fenêtre
  for (const l of results) {
    if (!isEuropean(l)) continue;
    const abbrev = (l.status && (l.status.abbrev || l.status.name)) || '';
    if (!/^go$/i.test(abbrev)) continue; // uniquement confirmé « Go »
    const net = parseDate(l.net);
    if (!net) continue;
    const ms = net.getTime();
    if (now < ms - WINDOW_BEFORE_MS || now >= ms + WINDOW_AFTER_MS) continue;
    if (!best || ms < best.netMs) {
      const prov = l.lsp_name || '';
      const pad = l.location || 'un site européen';
      best = { name: l.name, net, netMs: ms, prov, pad };
    }
  }

  if (!best) {
    const result = INACTIVE();
    okCache = { at: Date.now(), result }; // fetch réussi (même « rien à signaler ») → en cache
    return result;
  }

  const nom = String(best.name).replace(/\s*\|\s*/, ' – ');
  const url = /european space agency/i.test(best.prov) ? ESA_LIVE : ARIANE_LIVE;
  const result = {
    state: 'active',
    since: best.net,
    until: new Date(best.netMs + WINDOW_AFTER_MS),
    message: `🚀 Lancement ${nom} aujourd'hui à ${heureParis(best.net)} depuis ${best.pad} — suivez le direct`,
    url,
  };
  okCache = { at: Date.now(), result };
  return result;
}

// Seuil N=3 (patron veille-rss) : un timeout isolé (egress Railway) ne produit plus un
// 'failed' en base ; repli = dernier bon état connu s'il a moins de 6 h, sinon inactive
// (borne d'âge factorisée, cf. ecowatt : sans elle un 'active' périmé stagnerait, le poller
// ne fermant un épisode que sur state:'inactive'). recordSuccess est géré par
// withFailThreshold sur TOUT retour non-exception (y compris inactive légitime).
const check = withFailThreshold('lancement-spatial', checkRaw, {
  threshold: 3,
  fallback: freshFallback(() => okCache, MAX_FALLBACK_AGE_MS, INACTIVE),
});

module.exports = {
  id: 'lancement-spatial',
  check,
  _test: { raw: checkRaw, reset() { okCache = null; }, peekCache: () => okCache },
};
