// Source PARAMÉTRÉE (OpenAlert v2) : nouvelle vidéo d'une chaîne YouTube choisie
// par l'abonné (via son channel_id, qui commence par « UC »).
//
// Flux Atom public SANS clé :
//   GET https://www.youtube.com/feeds/videos.xml?channel_id=<id>
// On réutilise le parseur maison (lib/feed-parser) et on prend items[0] (le plus
// récent). « Actif » si publiée il y a < 24h. 404 (chaîne invalide) → inactif.
//
// Honnêteté : opt-in par chaîne — à réserver à des chaînes qui publient PEU
// (sinon flux de notifs). Une seule alerte par nouvelle vidéo (épisode via since).
//
// Cache mémoire 1h/combinaison + plafond MAX_COMBOS de fetchs/cycle.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { parseFeed } = require('./lib/feed-parser');

const TIMEOUT_MS = 8_000;
const FRESH_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 1 * 60 * 60 * 1000;
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

const cache = new Map();

const paramsSchema = [
  {
    key: 'channel_id',
    label: 'ID de chaîne YouTube',
    type: 'string',
    placeholder: 'UCxxxxxxxxxxxxxxxxxxxxxx',
    pattern: '^UC[A-Za-z0-9_-]{22}$',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: "ID de la chaîne (menu Partager la chaîne > Copier l'ID de la chaîne ; commence par UC)",
  },
];

function inactive(params, id) {
  const cid = id || String((params && params.channel_id) || '').trim();
  return { params, state: 'inactive', since: null, until: null, message: null, url: `https://www.youtube.com/channel/${cid}` };
}

async function checkOne(params) {
  const cid = String((params && params.channel_id) || '').trim();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(cid)}`, {
      headers: { Accept: 'application/atom+xml, application/xml, text/xml' }, signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout flux YouTube (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel flux YouTube échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) return inactive(params, cid);
  if (!res.ok) throw new Error(`Réponse HTTP inattendue YouTube : ${res.status} ${res.statusText}`);

  const xml = await res.text();
  const { feedTitle, items } = parseFeed(xml);
  if (!items || items.length === 0) return inactive(params, cid);

  const latest = items[0];
  if (!latest.date || Date.now() - latest.date.getTime() >= FRESH_MS) return inactive(params, cid);

  const m = latest.raw && latest.raw.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i);
  const url = m ? `https://www.youtube.com/watch?v=${m[1]}` : (latest.link || `https://www.youtube.com/channel/${cid}`);

  return {
    params,
    state: 'active',
    since: latest.date,
    until: null,
    message: `▶️ Nouvelle vidéo de ${feedTitle} : ${latest.title}`,
    url,
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  const out = [];
  const toFetch = [];

  for (const params of combos) {
    const key = String((params && params.channel_id) || '').trim();
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) out.push({ ...hit.result, params });
    else toFetch.push({ key, params });
  }

  let batch = toFetch;
  if (batch.length > MAX_COMBOS) {
    console.warn(`[youtube-chaine] ${batch.length} chaînes à rafraîchir — plafonné à ${MAX_COMBOS} ce cycle.`);
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
      console.warn(`[youtube-chaine] ${JSON.stringify(params)} : ${r.reason && r.reason.message}`);
      const hit = cache.get(key);
      if (hit) out.push({ ...hit.result, params });
    }
  });

  return out;
}

module.exports = { id: 'youtube-chaine', paramsSchema, checkWithParams };
