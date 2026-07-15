// Source PARAMÉTRÉE (OpenAlert v2) : jours fériés & ponts, ZONE au choix de
// l'abonné (métropole, Alsace-Moselle, DOM, COM…). Remplace la source broadcast
// (abonnés migrés vers {zone:"metropole"} — comportement identique).
//
// API : https://calendrier.api.gouv.fr/jours-feries/{zone}.json (publique, sans
// clé). STRUCTURE : objet { "YYYY-MM-DD": "Nom du férié" }. Un appel par zone
// souscrite, mutualisé par un cache mémoire 24h.
//
// Contrat v2 : { id, paramsSchema, checkWithParams(paramsList) }. La logique de
// détection des ponts (message selon le jour de la semaine) est conservée.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { formatDateFr } = require('./lib/format-fr');

const API = (zone) => `https://calendrier.api.gouv.fr/jours-feries/${zone}.json`;
const PUBLIC_URL = 'https://www.service-public.fr/particuliers/vosdroits/F2405';
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ANNOUNCE_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

// Zones réelles de l'API (slugs confirmés), avec libellés FR propres.
const ZONES = [
  { value: 'metropole', label: 'Métropole' },
  { value: 'alsace-moselle', label: 'Alsace-Moselle' },
  { value: 'guadeloupe', label: 'Guadeloupe' },
  { value: 'martinique', label: 'Martinique' },
  { value: 'guyane', label: 'Guyane' },
  { value: 'la-reunion', label: 'La Réunion' },
  { value: 'mayotte', label: 'Mayotte' },
  { value: 'saint-barthelemy', label: 'Saint-Barthélemy' },
  { value: 'saint-martin', label: 'Saint-Martin' },
  { value: 'nouvelle-caledonie', label: 'Nouvelle-Calédonie' },
  { value: 'polynesie-francaise', label: 'Polynésie française' },
  { value: 'wallis-et-futuna', label: 'Wallis-et-Futuna' },
  { value: 'saint-pierre-miquelon', label: 'Saint-Pierre-et-Miquelon' },
];
const VALID = new Set(ZONES.map((z) => z.value));

const paramsSchema = [
  {
    key: 'zone',
    label: 'Zone',
    type: 'enum',
    values: ZONES,
    multiple: true,
    required: true,
    default: 'metropole',
  },
];

// Cache mémoire par zone + fetch unique en vol.
const cache = new Map();    // zone → { at, feries }
const inflight = new Map();  // zone → Promise

async function doFetch(zone) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API(zone), { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout jours fériés (${zone}, >${TIMEOUT_MS} ms)`);
    throw new Error(`Appel jours fériés échoué (${zone}) : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue jours fériés (${zone}) : ${res.status}`);
  const obj = await res.json();
  if (!obj || typeof obj !== 'object') throw new Error(`Structure jours fériés inattendue (${zone})`);
  return Object.keys(obj)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .map((k) => ({ dateStr: k, name: obj[k] }))
    .sort((a, b) => (a.dateStr < b.dateStr ? -1 : 1));
}

async function feriesFor(zone) {
  const now = Date.now();
  const c = cache.get(zone);
  if (c && now - c.at < CACHE_TTL_MS) return c.feries;
  if (inflight.has(zone)) return inflight.get(zone);
  const p = doFetch(zone)
    .then((feries) => { cache.set(zone, { at: Date.now(), feries }); return feries; })
    .finally(() => { inflight.delete(zone); });
  inflight.set(zone, p);
  return p;
}

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

async function checkOne(params) {
  const zone = String((params && params.zone) || '');
  if (!VALID.has(zone)) return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };

  const feries = await feriesFor(zone);
  const now = Date.now();
  let hit = null;
  for (const f of feries) {
    const [y, m, day] = f.dateStr.split('-').map(Number);
    const start = new Date(y, m - 1, day);
    const windowStart = start.getTime() - ANNOUNCE_MS;
    const activeEnd = start.getTime() + DAY_MS;
    if (now >= windowStart && now < activeEnd) {
      if (!hit || start.getTime() < hit.start.getTime()) hit = { start, name: f.name };
    }
  }
  if (!hit) return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
  return {
    params,
    state: 'active',
    since: new Date(hit.start.getTime() - ANNOUNCE_MS),
    until: new Date(hit.start.getTime() + DAY_MS),
    message: messageFor(hit.name, hit.start),
    url: PUBLIC_URL,
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const settled = await Promise.allSettled(combos.map(checkOne));
  const out = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') out.push(r.value);
    else console.warn(`[jours-feries] ${JSON.stringify(combos[i])} : ${r.reason && r.reason.message}`);
  });
  return out;
}

module.exports = { id: 'jours-feries', paramsSchema, checkWithParams };
