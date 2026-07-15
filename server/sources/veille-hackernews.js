// Source PARAMÉTRÉE (OpenAlert v2) : veille Hacker News sur un mot-clé — alerte
// quand une story récente (<24h) et populaire (>100 points) matche le mot-clé.
//
// API publique SANS clé (Algolia HN Search) :
//   GET https://hn.algolia.com/api/v1/search_by_date?query=<motcle>&tags=story
//       &numericFilters=points>100,created_at_i><epoch_now-86400>
//   → { hits: [{ title, url, objectID, points, created_at_i }, ...] } (récent d'abord)
// On prend hits[0]. « Actif » s'il y a au moins un hit. Pas de hit → inactif.
//
// since = date de la story (created_at_i) → l'épisode avance quand une story plus
// récente matche, et le poller re-notifie.
//
// Cache mémoire 2h/combinaison + plafond MAX_COMBOS de fetchs/cycle.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TIMEOUT_MS = 8_000;
const MIN_POINTS = 100;
const WINDOW_S = 24 * 60 * 60;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

const cache = new Map();

const paramsSchema = [
  {
    key: 'motcle',
    label: 'Mot-clé Hacker News',
    type: 'string',
    placeholder: 'rust',
    pattern: '^[a-z0-9][a-z0-9 .-]{1,29}$',
    lowercase: true,
    multiple: true,
    required: true,
    default: null,
    hint: 'mot-clé à surveiller sur Hacker News',
  },
];

function inactive(params) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: 'https://news.ycombinator.com/' };
}

async function checkOne(params) {
  const motcle = String((params && params.motcle) || '').trim();
  const sinceEpoch = Math.floor(Date.now() / 1000) - WINDOW_S;
  const numericFilters = `points>${MIN_POINTS},created_at_i>${sinceEpoch}`;
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(motcle)}`
    + `&tags=story&numericFilters=${encodeURIComponent(numericFilters)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API HN (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API HN échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`Réponse HTTP inattendue HN : ${res.status} ${res.statusText}`);

  let data;
  try { data = await res.json(); }
  catch (err) { throw new Error(`Réponse HN illisible (JSON invalide) : ${err.message}`); }

  const hits = data && Array.isArray(data.hits) ? data.hits : [];
  if (hits.length === 0) return inactive(params);

  const top = hits[0];
  const points = Number(top.points) || 0;
  const link = top.url || `https://news.ycombinator.com/item?id=${top.objectID}`;
  const since = top.created_at_i ? new Date(top.created_at_i * 1000) : null;

  return {
    params,
    state: 'active',
    since,
    until: null,
    message: `🗞️ ${top.title} (${points} pts)`,
    url: link,
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  const out = [];
  const toFetch = [];

  for (const params of combos) {
    const key = String((params && params.motcle) || '').trim();
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) out.push({ ...hit.result, params });
    else toFetch.push({ key, params });
  }

  let batch = toFetch;
  if (batch.length > MAX_COMBOS) {
    console.warn(`[veille-hackernews] ${batch.length} mots-clés à rafraîchir — plafonné à ${MAX_COMBOS} ce cycle.`);
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
      console.warn(`[veille-hackernews] ${JSON.stringify(params)} : ${r.reason && r.reason.message}`);
      const hit = cache.get(key);
      if (hit) out.push({ ...hit.result, params });
    }
  });

  return out;
}

module.exports = { id: 'veille-hackernews', paramsSchema, checkWithParams };
