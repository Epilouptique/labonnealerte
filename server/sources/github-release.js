// Source PARAMÉTRÉE (OpenAlert v2) : nouvelle release GitHub d'un dépôt au choix.
// Vitrine dev. Actif quand la dernière release STABLE (non prerelease, non draft)
// d'un dépôt a été publiée depuis < 72h. Épisode par release (le since = date de
// publication → une nouvelle release re-notifie via le poller).
//
// API : GET https://api.github.com/repos/{owner}/{repo}/releases/latest (SANS token).
// LIMITE : 60 req/h/IP (constaté). Dimensionnement : cache par dépôt 2h + plafond
// de FETCHS réels par cycle (réutilise EXTERNAL_MAX_COMBOS, défaut 20). Les dépôts
// non rafraîchis ce cycle gardent leur dernier état connu (ou inactive). 404
// (dépôt inconnu/privé/sans release) → inactive silencieux.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API = (repo) => `https://api.github.com/repos/${repo}/releases/latest`;
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2h par dépôt
const FRESH_MS = 72 * 60 * 60 * 1000;    // release « récente » : < 72h
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);
const REPO_RE = /^[A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/;

const paramsSchema = [
  {
    key: 'depot',
    label: 'Dépôt GitHub',
    type: 'string',
    placeholder: 'vercel/next.js',
    pattern: '^[A-Za-z0-9_.-]{1,39}/[A-Za-z0-9_.-]{1,100}$',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'Format owner/repo, ex. vercel/next.js',
  },
];

// Cache par dépôt : repo → { at, result } (result = objet {state,...} sans params).
const cache = new Map();

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: 'https://github.com' };
}

async function fetchLatest(repo) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API(repo), {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'labonnealerte' },
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout GitHub (${repo})`);
    throw new Error(`Appel GitHub échoué (${repo}) : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) return inactive(); // inconnu / privé / sans release
  if (res.status === 403 || res.status === 429) throw new Error(`GitHub rate-limit (${repo})`);
  if (!res.ok) throw new Error(`Réponse HTTP inattendue GitHub (${repo}) : ${res.status}`);

  const r = await res.json();
  if (!r || r.prerelease || r.draft || !r.published_at) return inactive();
  const published = new Date(r.published_at);
  if (Number.isNaN(published.getTime()) || (Date.now() - published.getTime()) >= FRESH_MS) return inactive();

  const shortName = repo.split('/')[1] || repo;
  const version = r.tag_name || r.name || '';
  return {
    state: 'active',
    since: published,
    until: null,
    message: `🏷️ ${shortName} ${version} est sortie`,
    url: r.html_url || `https://github.com/${repo}/releases`,
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  let fetches = 0;
  const out = [];

  for (const params of combos) {
    const repo = String((params && params.depot) || '');
    if (!REPO_RE.test(repo)) { out.push(Object.assign({ params }, inactive())); continue; }

    const cached = cache.get(repo);
    if (cached && now - cached.at < CACHE_TTL_MS) {
      out.push(Object.assign({ params }, cached.result));
      continue;
    }
    if (fetches >= MAX_FETCH) {
      // Budget de requêtes épuisé ce cycle : garder l'état connu, sinon inactive.
      out.push(Object.assign({ params }, cached ? cached.result : inactive()));
      continue;
    }
    fetches += 1;
    try {
      const result = await fetchLatest(repo);
      cache.set(repo, { at: Date.now(), result });
      out.push(Object.assign({ params }, result));
    } catch (err) {
      console.warn(`[github-release] ${repo} : ${err.message}`);
      out.push(Object.assign({ params }, cached ? cached.result : inactive()));
    }
  }
  if (fetches >= MAX_FETCH && combos.length > MAX_FETCH) {
    console.warn(`[github-release] ${combos.length} dépôts, ${MAX_FETCH} rafraîchis ce cycle (limite GitHub 60/h) — les autres aux cycles suivants.`);
  }
  return out;
}

module.exports = { id: 'github-release', paramsSchema, checkWithParams };
