// Source PARAMÉTRÉE (OpenAlert v2) : promotion importante (-40% ou plus) sur un
// jeu Steam choisi par l'abonné (via son appid).
//
// API publique SANS clé :
//   GET https://store.steampowered.com/api/appdetails?appids=<appid>&cc=fr&l=french
//   → { "<appid>": { success, data:{ name, is_free, price_overview:{
//       discount_percent, final_formatted } } } }
// « Actif » si success && data && !is_free && price_overview && discount >= 40.
// Cas success:false / jeu gratuit / pas de price_overview → inactif, sans erreur.
//
// since = null : pas de persistance d'état ; le poller notifie à l'activation
// (passage inactif → actif de la remise). Pas de re-notif pendant la remise.
//
// Steam limite ~200 req/5min : cache 6h/combinaison + plafond MAX_COMBOS/cycle.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TIMEOUT_MS = 10_000;
const MIN_DISCOUNT = 40;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

const cache = new Map();

const paramsSchema = [
  {
    key: 'appid',
    label: 'AppID Steam',
    type: 'string',
    placeholder: '292030',
    pattern: '^[0-9]{1,7}$',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: "l'identifiant numérique dans l'URL de la page Steam du jeu (store.steampowered.com/app/NNNN)",
  },
];

function inactive(params) {
  const appid = String((params && params.appid) || '').trim();
  return { params, state: 'inactive', since: null, until: null, message: null, url: `https://store.steampowered.com/app/${appid}` };
}

async function checkOne(params) {
  const appid = String((params && params.appid) || '').trim();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(`https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appid)}&cc=fr&l=french`, {
      headers: { Accept: 'application/json' }, signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API Steam (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API Steam échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`Réponse HTTP inattendue Steam : ${res.status} ${res.statusText}`);

  let payload;
  try { payload = await res.json(); }
  catch (err) { throw new Error(`Réponse Steam illisible (JSON invalide) : ${err.message}`); }

  const entry = payload && payload[appid];
  if (!entry || !entry.success || !entry.data) return inactive(params);

  const data = entry.data;
  if (data.is_free) return inactive(params);

  const price = data.price_overview;
  if (!price) return inactive(params);

  const discount = Number(price.discount_percent) || 0;
  if (discount < MIN_DISCOUNT) return inactive(params);

  return {
    params,
    state: 'active',
    since: null,
    until: null,
    message: `🎮 ${data.name} à -${discount} % (${price.final_formatted})`,
    url: `https://store.steampowered.com/app/${appid}`,
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  const out = [];
  const toFetch = [];

  for (const params of combos) {
    const key = String((params && params.appid) || '').trim();
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) out.push({ ...hit.result, params });
    else toFetch.push({ key, params });
  }

  let batch = toFetch;
  if (batch.length > MAX_COMBOS) {
    console.warn(`[steam-jeu-promo] ${batch.length} jeux à rafraîchir — plafonné à ${MAX_COMBOS} ce cycle.`);
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
      console.warn(`[steam-jeu-promo] ${JSON.stringify(params)} : ${r.reason && r.reason.message}`);
      const hit = cache.get(key);
      if (hit) out.push({ ...hit.result, params });
    }
  });

  return out;
}

module.exports = { id: 'steam-jeu-promo', paramsSchema, checkWithParams };
