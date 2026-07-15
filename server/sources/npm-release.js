// Source PARAMÉTRÉE (OpenAlert v2) : nouvelle version d'un paquet npm.
//
// API publique SANS clé : GET https://registry.npmjs.org/<paquet>
//   - data["dist-tags"].latest = dernière version publiée ;
//   - data.time[latest] = date ISO de publication de cette version.
// On considère « actif » si la dernière version est sortie il y a < 72h.
// 404 (paquet inexistant) → inactif, jamais de crash.
//
// CONTRAINTE : 1 appel réseau par paquet (aucune mutualisation).
// Cache mémoire 2h/combinaison + plafond MAX_COMBOS de fetchs réels par cycle
// (au-delà on garde l'état connu en cache). Échecs isolés (Promise.allSettled).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const PUBLIC_BASE = 'https://www.npmjs.com/package/';
const TIMEOUT_MS = 8_000;
const FRESH_MS = 72 * 60 * 60 * 1000;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

// Cache par combinaison : clé = nom du paquet → { at, result }.
const cache = new Map();

const paramsSchema = [
  {
    key: 'paquet',
    label: 'Paquet npm',
    type: 'string',
    placeholder: 'express',
    pattern: '^(?:@[a-z0-9-*~][a-z0-9-*._~]*/)?[a-z0-9-~][a-z0-9-._~]*$',
    lowercase: true,
    multiple: true,
    required: true,
    default: null,
    hint: 'nom du paquet npm, ex. express ou @angular/core',
  },
];

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inactive(params) {
  const paquet = String((params && params.paquet) || '').trim();
  return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_BASE + paquet };
}

async function checkOne(params) {
  const paquet = String((params && params.paquet) || '').trim();
  // Le / du scope (@scope/nom) doit rester tel quel dans l'URL du registre.
  const encoded = paquet.split('/').map(encodeURIComponent).join('/');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(`https://registry.npmjs.org/${encoded}`, {
      headers: { Accept: 'application/json' }, signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout registre npm (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel registre npm échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) return inactive(params);
  if (!res.ok) throw new Error(`Réponse HTTP inattendue npm : ${res.status} ${res.statusText}`);

  let data;
  try { data = await res.json(); }
  catch (err) { throw new Error(`Réponse npm illisible (JSON invalide) : ${err.message}`); }

  const latest = data && data['dist-tags'] && data['dist-tags'].latest;
  const published = latest && data.time ? parseDate(data.time[latest]) : null;
  if (!latest || !published) return inactive(params);

  if (Date.now() - published.getTime() >= FRESH_MS) return inactive(params);

  return {
    params,
    state: 'active',
    since: published,
    until: null,
    message: `📦 ${paquet} ${latest} est sortie`,
    url: PUBLIC_BASE + paquet,
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  const out = [];
  const toFetch = [];

  for (const params of combos) {
    const key = String((params && params.paquet) || '').trim();
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      out.push({ ...hit.result, params });
    } else {
      toFetch.push({ key, params });
    }
  }

  let batch = toFetch;
  if (batch.length > MAX_COMBOS) {
    console.warn(`[npm-release] ${batch.length} paquets à rafraîchir — plafonné à ${MAX_COMBOS} ce cycle.`);
    const deferred = batch.slice(MAX_COMBOS);
    batch = batch.slice(0, MAX_COMBOS);
    // Combinaisons différées : on garde l'état connu (cache périmé) si dispo.
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
      console.warn(`[npm-release] ${JSON.stringify(params)} : ${r.reason && r.reason.message}`);
      const hit = cache.get(key);
      if (hit) out.push({ ...hit.result, params });
    }
  });

  return out;
}

module.exports = { id: 'npm-release', paramsSchema, checkWithParams };
