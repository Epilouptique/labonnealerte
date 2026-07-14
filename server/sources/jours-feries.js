// Source interne : jours fériés & ponts (API gouv, sans clé).
//
// API : https://calendrier.api.gouv.fr/jours-feries/metropole.json
// STRUCTURE : objet { "YYYY-MM-DD": "Nom du férié" }.
//
// Fenêtre d'annonce : 7 jours avant chaque férié. Le message dépend du jour de la
// semaine (détection des ponts) : mardi → pont si on pose le lundi, jeudi → pont si
// on pose le vendredi, lundi/vendredi → week-end de 3 jours, etc.
// Cache mémoire 24h (le calendrier ne bouge pas dans la journée).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { formatDateFr } = require('./lib/format-fr');

const API_URL = 'https://calendrier.api.gouv.fr/jours-feries/metropole.json';
const PUBLIC_URL = 'https://www.service-public.fr/particuliers/vosdroits/F2405';
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ERROR_TTL_MS = 5 * 60 * 1000;
const ANNOUNCE_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

let cache = { at: 0, feries: null, error: null };
let inflight = null;

async function doFetch() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API jours fériés (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API jours fériés échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue jours fériés : ${res.status} ${res.statusText}`);

  let obj;
  try {
    obj = await res.json();
  } catch (err) {
    throw new Error(`Réponse jours fériés illisible (JSON invalide) : ${err.message}`);
  }
  if (!obj || typeof obj !== 'object') throw new Error('Structure jours fériés inattendue');

  // { 'YYYY-MM-DD': nom } → [{ dateStr, name }] trié par date.
  return Object.keys(obj)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .map((k) => ({ dateStr: k, name: obj[k] }))
    .sort((a, b) => (a.dateStr < b.dateStr ? -1 : 1));
}

async function fetchFeries() {
  const now = Date.now();
  if (cache.feries && now - cache.at < CACHE_TTL_MS) return cache.feries;
  if (cache.error && now - cache.at < ERROR_TTL_MS) throw cache.error;
  if (inflight) return inflight;
  inflight = doFetch()
    .then((feries) => { cache = { at: Date.now(), feries, error: null }; return feries; })
    .catch((err) => { cache = { at: Date.now(), feries: null, error: err }; throw err; })
    .finally(() => { inflight = null; });
  return inflight;
}

function _resetCache() { cache = { at: 0, feries: null, error: null }; inflight = null; }

// Message selon le jour de la semaine du férié (détection des ponts).
function messageFor(name, start) {
  const wd = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12).getDay();
  const jour = JOURS[wd];
  const d = formatDateFr(start);
  if (wd === 2) return `📅 ${name} tombe mardi ${d} — posez le lundi, c'est un pont de 4 jours !`;
  if (wd === 4) return `📅 ${name} tombe jeudi ${d} — posez le vendredi, c'est un pont de 4 jours !`;
  if (wd === 1 || wd === 5) return `📅 ${name} tombe ${jour} ${d} — un week-end de 3 jours !`;
  if (wd === 3) return `📅 ${name} tombe mercredi ${d}.`;
  return `📅 Cette année, ${name} tombe un ${jour} (${d}).`;
}

async function check() {
  const feries = await fetchFeries();
  const now = Date.now();

  let hit = null;
  for (const f of feries) {
    // Minuit local du férié (les dates sont des jours calendaires FR).
    const [y, m, day] = f.dateStr.split('-').map(Number);
    const start = new Date(y, m - 1, day);
    const windowStart = start.getTime() - ANNOUNCE_MS;
    const activeEnd = start.getTime() + DAY_MS; // reste actif le jour même
    if (now >= windowStart && now < activeEnd) {
      if (!hit || start.getTime() < hit.start.getTime()) hit = { start, name: f.name };
    }
  }

  if (!hit) {
    return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
  }
  return {
    state: 'active',
    since: new Date(hit.start.getTime() - ANNOUNCE_MS),
    until: new Date(hit.start.getTime() + DAY_MS),
    message: messageFor(hit.name, hit.start),
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'jours-feries', check, _resetCache };
