// Source PARAMÉTRÉE (OpenAlert v2) : nouvelle version d'un paquet PyPI (Python).
//
// API publique SANS clé : GET https://pypi.org/pypi/<name>/json (User-Agent requis).
//   - data.info.version = dernière version ;
//   - data.releases[version] = tableau de fichiers, chacun avec
//     upload_time_iso_8601 ; on prend la date MAX (dernier fichier publié).
// « Actif » si sortie il y a < 72h. 404 → inactif.
//
// Nom normalisé pour l'URL API : name.replace(/[-_.]+/g,'-').toLowerCase()
// (mais on affiche le nom saisi par l'abonné dans le message).
//
// Cache mémoire 2h/combinaison + plafond MAX_COMBOS de fetchs/cycle.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TIMEOUT_MS = 8_000;
const FRESH_MS = 72 * 60 * 60 * 1000;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

const cache = new Map();

const paramsSchema = [
  {
    key: 'paquet',
    label: 'Paquet PyPI',
    type: 'string',
    placeholder: 'requests',
    pattern: '^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'nom du paquet Python sur PyPI, ex. requests',
  },
];

function normalize(name) {
  return String(name || '').replace(/[-_.]+/g, '-').toLowerCase();
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inactive(params) {
  const paquet = String((params && params.paquet) || '').trim();
  return { params, state: 'inactive', since: null, until: null, message: null, url: `https://pypi.org/project/${paquet}/` };
}

async function checkOne(params) {
  const paquet = String((params && params.paquet) || '').trim();
  const name = normalize(paquet);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
      headers: { Accept: 'application/json', 'User-Agent': 'labonnealerte' }, signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API PyPI (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API PyPI échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) return inactive(params);
  if (!res.ok) throw new Error(`Réponse HTTP inattendue PyPI : ${res.status} ${res.statusText}`);

  let data;
  try { data = await res.json(); }
  catch (err) { throw new Error(`Réponse PyPI illisible (JSON invalide) : ${err.message}`); }

  const latest = data && data.info && data.info.version;
  const files = latest && data.releases ? data.releases[latest] : null;
  if (!latest || !Array.isArray(files) || files.length === 0) return inactive(params);

  let published = null;
  for (const f of files) {
    const d = parseDate(f && f.upload_time_iso_8601);
    if (d && (!published || d.getTime() > published.getTime())) published = d;
  }
  if (!published) return inactive(params);

  if (Date.now() - published.getTime() >= FRESH_MS) return inactive(params);

  return {
    params,
    state: 'active',
    since: published,
    until: null,
    message: `🐍 ${paquet} ${latest} est sortie`,
    url: `https://pypi.org/project/${paquet}/`,
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  const out = [];
  const toFetch = [];

  for (const params of combos) {
    const key = normalize((params && params.paquet) || '');
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) out.push({ ...hit.result, params });
    else toFetch.push({ key, params });
  }

  let batch = toFetch;
  if (batch.length > MAX_COMBOS) {
    console.warn(`[pypi-release] ${batch.length} paquets à rafraîchir — plafonné à ${MAX_COMBOS} ce cycle.`);
    const deferred = batch.slice(MAX_COMBOS);
    batch = batch.slice(0, MAX_COMBOS);
    for (const { key, params } of deferred) {
      const hit = cache.get(key);
      if (hit) out.push({ ...hit.result, params });
    }
  }

  const settled = await Promise.allSettled(batch.map(({ params }) => checkOne(params)));
  settled.forEach((r, i) => {
    const { key, params } = batch[i];
    if (r.status === 'fulfilled') {
      cache.set(key, { at: Date.now(), result: r.value });
      out.push(r.value);
    } else {
      console.warn(`[pypi-release] ${JSON.stringify(params)} : ${r.reason && r.reason.message}`);
      const hit = cache.get(key);
      if (hit) out.push({ ...hit.result, params });
    }
  });

  return out;
}

module.exports = { id: 'pypi-release', paramsSchema, checkWithParams };
