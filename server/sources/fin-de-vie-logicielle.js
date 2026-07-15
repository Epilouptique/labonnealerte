// Source PARAMÉTRÉE (OpenAlert v2) : fin de vie logicielle (endoflife.date).
// L'abonné choisit un ou plusieurs produits (OS, langages, bases, frameworks) ;
// il est prévenu quand une version ENCORE supportée arrive en fin de vie (EOL)
// dans <= 30 jours, ou l'a atteinte depuis <= 7 jours. Vitrine du standard côté dev.
//
// API publique endoflife.date, SANS clé : GET https://endoflife.date/api/{slug}.json
// → tableau de cycles { cycle, releaseDate, eol, support, latest, lts, ... }.
// ⚠️ `eol` peut être une DATE ISO, `false` (pas d'EOL planifié) ou `true` (EOL
// sans date) : seul le cas DATE déclenche une alerte (les autres = pas de bruit).
//
// Contrat v2 : { id, paramsSchema, checkWithParams(paramsList) }. Un appel réseau
// par produit souscrit, mutualisé par un cache mémoire 12h (la donnée bouge peu).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { formatJourMois } = require('./lib/calendar-factory');

const API = (slug) => `https://endoflife.date/api/${slug}.json`;
const PAGE = (slug) => `https://endoflife.date/${slug}`;
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const DAY_MS = 24 * 60 * 60 * 1000;
const IMMINENT_DAYS = 30;
const RECENT_DAYS = 7;

// Produits proposés : value = slug RÉEL confirmé dans l'API ; label = libellé propre.
const PRODUCTS = [
  { value: 'windows', label: 'Windows' },
  { value: 'ubuntu', label: 'Ubuntu' },
  { value: 'debian', label: 'Debian' },
  { value: 'nodejs', label: 'Node.js' },
  { value: 'php', label: 'PHP' },
  { value: 'python', label: 'Python' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'docker-engine', label: 'Docker Engine' },
  { value: 'django', label: 'Django' },
  { value: 'laravel', label: 'Laravel' },
  { value: 'kubernetes', label: 'Kubernetes' },
  { value: 'angular', label: 'Angular' },
  { value: 'dotnet', label: '.NET' },
  { value: 'eclipse-temurin', label: 'Java (Eclipse Temurin)' },
];
const LABEL = {};
PRODUCTS.forEach((p) => { LABEL[p.value] = p.label; });
const VALID = new Set(PRODUCTS.map((p) => p.value));

const paramsSchema = [
  {
    key: 'produit',
    label: 'Produit',
    type: 'enum',
    values: PRODUCTS,
    multiple: true,
    required: true,
    default: 'nodejs',
  },
];

// Cache mémoire par produit + fetch unique en vol.
const cache = new Map();   // slug → { at, cycles }
const inflight = new Map(); // slug → Promise

async function doFetch(slug) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API(slug), { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout endoflife (${slug}, >${TIMEOUT_MS} ms)`);
    throw new Error(`Appel endoflife échoué (${slug}) : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue endoflife (${slug}) : ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function cyclesFor(slug) {
  const now = Date.now();
  const c = cache.get(slug);
  if (c && now - c.at < CACHE_TTL_MS) return c.cycles;
  if (inflight.has(slug)) return inflight.get(slug);
  const p = doFetch(slug)
    .then((cycles) => { cache.set(slug, { at: Date.now(), cycles }); return cycles; })
    .finally(() => { inflight.delete(slug); });
  inflight.set(slug, p);
  return p;
}

// Date « nue » (minuit) d'une chaîne YYYY-MM-DD, ou null.
function parseDay(value) {
  if (typeof value !== 'string') return null;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

function todayUTC() {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

// Sélectionne le cycle dont l'EOL (date) est le plus proche d'aujourd'hui dans la
// fenêtre [-7j, +30j]. Ignore eol booléen (true/false) = pas de date exploitable.
function pickCycle(cycles) {
  const today = todayUTC().getTime();
  let best = null;
  let bestAbs = Infinity;
  for (const c of (cycles || [])) {
    const d = parseDay(c && c.eol);
    if (!d) continue; // eol=false/true ou absent → pas d'alerte datée
    const delta = Math.round((d.getTime() - today) / DAY_MS);
    if (delta > IMMINENT_DAYS || delta < -RECENT_DAYS) continue;
    const abs = Math.abs(delta);
    if (abs < bestAbs) { bestAbs = abs; best = { cycle: c, eol: d, delta }; }
  }
  return best;
}

function resultFor(params) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: PAGE(params.produit) };
}

async function checkOne(params) {
  const slug = String((params && params.produit) || '');
  if (!VALID.has(slug)) return resultFor(params);

  const cycles = await cyclesFor(slug);
  const hit = pickCycle(cycles);
  if (!hit) return resultFor(params);

  const name = LABEL[slug] || slug;
  const version = hit.cycle.cycle ? ` ${hit.cycle.cycle}` : '';
  const whenStr = formatJourMois(hit.eol); // « 31 décembre » (sans année)
  let quand;
  if (hit.delta === 0) quand = "aujourd'hui";
  else if (hit.delta === 1) quand = 'demain';
  else quand = `le ${whenStr}`;

  const message = hit.delta >= 0
    ? `⏳ ${name}${version} : fin de vie ${quand} — pensez à migrer`
    : `⏳ ${name}${version} n'est plus supporté depuis le ${whenStr} — migrez pour rester à jour`;

  return {
    params,
    state: 'active',
    since: hit.eol,     // épisode par version : un nouvel EOL (date différente) re-notifie
    until: null,
    message,
    url: PAGE(slug),
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  // Chaque produit est indépendant : un échec n'affecte pas les autres.
  const settled = await Promise.allSettled(combos.map(checkOne));
  const out = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') out.push(r.value);
    else console.warn(`[fin-de-vie] ${JSON.stringify(combos[i])} : ${r.reason && r.reason.message}`);
  });
  return out;
}

module.exports = { id: 'fin-de-vie-logicielle', paramsSchema, checkWithParams };
