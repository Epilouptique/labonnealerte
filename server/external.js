// Poller des sources EXTERNES (OpenAlert) : construit à la volée, depuis une ligne
// `sources` (type 'external', endpoint_url), un objet compatible avec le poller —
// broadcast { id, check } ou paramétré { id, paramsSchema, checkWithParams }.
//
// Contrairement aux factories internes (cache mutualisé), CHAQUE combinaison d'une
// source externe = un appel réseau réel → on plafonne le nombre de combinaisons
// interrogées par cycle (EXTERNAL_MAX_COMBOS, défaut 20) et on isole les échecs.

const { safeFetchJson } = require('./safe-fetch');

const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);
const STATE_ENUM = ['active', 'inactive', 'pending'];

// Manifeste OpenAlert v1 → résultat interne { state, since, until, message, url }.
function manifestToResult(m) {
  const state = m && STATE_ENUM.includes(m.state) ? m.state : 'inactive';
  const d = (v) => (v ? new Date(v) : null);
  return {
    state,
    since: d(m && m.since),
    until: d(m && m.until),
    message: m && m.message != null ? String(m.message) : null,
    url: m && m.url != null ? String(m.url) : null,
  };
}

function urlWithParams(endpoint, params) {
  const u = new URL(endpoint);
  Object.keys(params || {}).forEach((k) => u.searchParams.set(k, params[k]));
  return u.href;
}

function buildExternalBroadcast(row) {
  return {
    id: row.id,
    check: async () => manifestToResult(await safeFetchJson(row.endpoint_url)),
  };
}

function buildExternalParam(row) {
  return {
    id: row.id,
    paramsSchema: row.params_schema,
    checkWithParams: async (list) => {
      let combos = Array.isArray(list) ? list : [];
      if (combos.length > MAX_COMBOS) {
        console.warn(`[external] ${row.id} : ${combos.length} combinaisons souscrites — plafonné à ${MAX_COMBOS} ce cycle (les autres seront traitées aux cycles suivants).`);
        combos = combos.slice(0, MAX_COMBOS);
      }
      // Chaque combinaison est indépendante : un échec/timeout n'affecte pas les autres.
      const settled = await Promise.allSettled(combos.map(async (params) => {
        const m = await safeFetchJson(urlWithParams(row.endpoint_url, params));
        return Object.assign({ params }, manifestToResult(m));
      }));
      const out = [];
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') out.push(r.value);
        else console.warn(`[external] ${row.id} ${JSON.stringify(combos[i])} : ${r.reason && r.reason.message}`);
      });
      return out;
    },
  };
}

// row : { id, endpoint_url, params_schema } → objet source, ou null si inexploitable.
function buildExternalSource(row) {
  if (!row || !row.endpoint_url) return null;
  return row.params_schema != null ? buildExternalParam(row) : buildExternalBroadcast(row);
}

module.exports = { buildExternalSource, manifestToResult, MAX_COMBOS };
