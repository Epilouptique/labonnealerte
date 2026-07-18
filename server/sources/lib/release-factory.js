// Factory « source de release paramétrée » : usine à sources v2 qui surveillent la
// dernière version publiée d'un paquet/dépôt sur un registre public sans clé.
//
// Extrait la mécanique commune de npm-release / pypi-release (cache 2h par combinaison,
// plafond EXTERNAL_MAX_COMBOS de fetchs réels/cycle, Promise.allSettled à échecs isolés,
// 404 → inactif silencieux). Chaque registre ne fournit que :
//   - fetchLatest(name) → { version, published:Date } | null (404/inconnu/pré-release)
//   - publicBase(name)  → URL humaine de la page du paquet
//   - le schéma de paramètre (clé, label, placeholder, pattern, hint)
//
// PROPOSITION (voir rapport) : npm-release et pypi-release pourraient migrer sur cette
// factory à terme (refactor léger, ~100 lignes économisées chacune). Non fait ici pour
// ne pas toucher deux sources en production sans besoin — la factory ne sert QUE les
// trois nouvelles (crates, packagist, rubygems) pour l'instant.

const FRESH_MS = 72 * 60 * 60 * 1000;       // « sortie récente » = < 72h
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;    // cache mémoire 2h/combinaison
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Petit helper réseau partagé (timeout + AbortController). Renvoie la Response.
async function httpGet(url, { timeoutMs = 8000, headers = {}, label = 'registre' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { headers: { Accept: 'application/json', ...headers }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout ${label} (>${timeoutMs} ms)`);
    throw new Error(`Appel ${label} échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} cfg
 * @param {string} cfg.id
 * @param {string} cfg.ecosystem   étiquette courte pour les logs (ex. 'crates')
 * @param {object} cfg.paramSchema { key,label,placeholder,pattern,hint }
 * @param {(name:string)=>string} cfg.publicBase
 * @param {(name:string, deps:{httpGet,parseDate,FRESH_MS})=>Promise<{version,published:Date}|null>} cfg.fetchLatest
 * @param {(name:string,version:string)=>string} [cfg.message]
 */
function createReleaseSource(cfg) {
  const { id, ecosystem, paramSchema, publicBase, fetchLatest } = cfg;
  const messageFn = cfg.message || ((name, version) => `📦 ${name} ${version} est sortie`);
  const cache = new Map();

  const paramsSchema = [{
    key: paramSchema.key,
    label: paramSchema.label,
    type: 'string',
    placeholder: paramSchema.placeholder,
    pattern: paramSchema.pattern,
    lowercase: paramSchema.lowercase !== false,
    multiple: true,
    required: true,
    default: null,
    hint: paramSchema.hint,
  }];

  const nameOf = (params) => String((params && params[paramSchema.key]) || '').trim();
  const inactive = (params) => ({ params, state: 'inactive', since: null, until: null, message: null, url: publicBase(nameOf(params)) });

  async function checkOne(params) {
    const name = nameOf(params);
    const latest = await fetchLatest(name, { httpGet, parseDate, FRESH_MS });
    if (!latest || !latest.version || !latest.published) return inactive(params);
    if (Date.now() - latest.published.getTime() >= FRESH_MS) return inactive(params);
    return {
      params, state: 'active', since: latest.published, until: null,
      message: messageFn(name, latest.version), url: publicBase(name),
    };
  }

  async function checkWithParams(paramsList) {
    const combos = Array.isArray(paramsList) ? paramsList : [];
    const now = Date.now();
    const out = [];
    const toFetch = [];
    for (const params of combos) {
      const key = nameOf(params);
      const hit = cache.get(key);
      if (hit && now - hit.at < CACHE_TTL_MS) out.push({ ...hit.result, params });
      else toFetch.push({ key, params });
    }
    let batch = toFetch;
    if (batch.length > MAX_COMBOS) {
      console.warn(`[${id}] ${batch.length} à rafraîchir — plafonné à ${MAX_COMBOS} ce cycle.`);
      for (const { key, params } of batch.slice(MAX_COMBOS)) {
        const hit = cache.get(key);
        if (hit) out.push({ ...hit.result, params });
      }
      batch = batch.slice(0, MAX_COMBOS);
    }
    const settled = await Promise.allSettled(batch.map(({ params }) => checkOne(params)));
    settled.forEach((r, i) => {
      const { key, params } = batch[i];
      if (r.status === 'fulfilled') { cache.set(key, { at: Date.now(), result: r.value }); out.push(r.value); }
      else {
        console.warn(`[${id}] ${JSON.stringify(params)} : ${r.reason && r.reason.message}`);
        const hit = cache.get(key);
        if (hit) out.push({ ...hit.result, params });
      }
    });
    return out;
  }

  return { id, ecosystem, paramsSchema, checkWithParams, _checkOne: checkOne };
}

module.exports = { createReleaseSource, httpGet, parseDate, FRESH_MS };
