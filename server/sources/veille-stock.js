// Source PARAMÉTRÉE (OpenAlert v2) : VEILLE DE STOCK. Variante spécialisée de veille-page :
// au lieu d'un simple hash, on détecte une TRANSITION d'état de disponibilité (disponible ↔
// indisponible) sur une page produit, via mots-clés.
//
// ⚠️ HEURISTIQUE BEST-EFFORT, honnête sur ses limites : fiable sur du HTML « server-rendered »
// classique, PEU fiable sur les sites à rendu JavaScript (SPA : le stock est chargé après, donc
// invisible dans le HTML brut → état « inconnu », aucune alerte). On ne déclenche QUE sur une
// transition entre deux états CONNUS (jamais sur « inconnu »).
//
// Anti-SSRF via safeFetchText (URL utilisateur). Référence au 1er cycle sans alerte. Cache
// mémoire par URL, TTL 6h, plafond de fetchs. Dégradation silencieuse sur échec.

const { safeFetchText, BROWSER_UA } = require('../safe-fetch');
const { visibleText } = require('./lib/hash-diff-html');

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 2 * 1024 * 1024;
const TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);
const URL_RE = /^https:\/\/[^\s]{1,300}$/i;

// Mots-clés (insensibles casse/accents). L'indisponibilité PRIME sur la disponibilité si les
// deux apparaissent (un « rupture » explicite est un signal plus fort qu'un « disponible » de nav).
const KW_INDISPO = ['rupture', 'epuise', 'indisponible', 'out of stock', 'sold out', 'plus disponible'];
const KW_DISPO = ['en stock', 'disponible', 'in stock', 'ajouter au panier', 'add to cart'];

const paramsSchema = [
  {
    key: 'url',
    label: 'URL de la page produit',
    type: 'string',
    placeholder: 'https://boutique.fr/produit',
    pattern: '^https://[^\\s]{1,300}$',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'URL https d\'une page produit. Vous êtes prévenu quand la disponibilité change (retour en stock / rupture). Heuristique : fonctionne mieux sur les sites classiques, pas sur les boutiques 100% JavaScript.',
  },
];

// Cache par URL : { state: 'dispo'|'indispo', at, ttl, result }.
const cache = new Map();

function inactive(url) {
  return { state: 'inactive', since: null, until: null, message: null, url: URL_RE.test(url) ? url : 'https://labonnealerte.fr' };
}

function norm(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

// Déduit l'état stock d'un texte : 'indispo' | 'dispo' | null (inconnu).
function stockState(text) {
  const t = norm(text);
  if (KW_INDISPO.some((k) => t.includes(k))) return 'indispo';
  if (KW_DISPO.some((k) => t.includes(k))) return 'dispo';
  return null;
}

async function stateOf(url) {
  const html = await safeFetchText(url, {
    timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES, accept: 'text/html',
    headers: { 'User-Agent': BROWSER_UA },
  });
  return stockState(visibleText(html));
}

function message(url, state) {
  return state === 'dispo'
    ? { state: 'active', since: new Date(), until: null, message: `📦 De nouveau disponible : ${url}`, url }
    : { state: 'active', since: new Date(), until: null, message: `📦 En rupture / indisponible : ${url}`, url };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  let fetches = 0;
  const out = [];

  for (const params of combos) {
    const url = String((params && params.url) || '');
    if (!URL_RE.test(url)) { out.push(Object.assign({ params }, inactive(url))); continue; }

    const entry = cache.get(url);
    if (entry && now - entry.at < entry.ttl) { out.push(Object.assign({ params }, entry.result)); continue; }
    if (fetches >= MAX_FETCH) { out.push(Object.assign({ params }, entry ? entry.result : inactive(url))); continue; }
    fetches += 1;

    let result;
    try {
      const state = await stateOf(url);
      if (state == null) {
        // État indéterminé (site JS ou page sans mot-clé) → inactive, référence stock INCHANGÉE
        // (on ne transite jamais depuis/vers « inconnu »).
        result = inactive(url);
        cache.set(url, { state: entry ? entry.state : null, at: now, ttl: TTL_MS, result });
      } else if (!entry || entry.state == null) {
        result = inactive(url); // 1er état connu = référence, AUCUNE alerte
        cache.set(url, { state, at: now, ttl: TTL_MS, result });
      } else if (state !== entry.state) {
        result = message(url, state); // TRANSITION réelle disponible↔indisponible
        cache.set(url, { state, at: now, ttl: TTL_MS, result });
      } else {
        result = inactive(url);
        cache.set(url, { state, at: now, ttl: TTL_MS, result });
      }
    } catch (err) {
      console.warn(`[veille-stock] ${url} : ${err.message} → inactive.`);
      result = inactive(url);
      cache.set(url, { state: entry ? entry.state : null, at: now, ttl: RETRY_MS, result });
    }
    out.push(Object.assign({ params }, result));
  }
  return out;
}

module.exports = { id: 'veille-stock', paramsSchema, checkWithParams };
