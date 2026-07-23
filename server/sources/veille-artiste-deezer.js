// Source PARAMÉTRÉE (OpenAlert v2) : alerte à la sortie d'un NOUVEL ALBUM d'un ARTISTE suivi,
// via l'API publique Deezer (SANS clé). Remplace le concept veille-artiste-spotify abandonné
// (Spotify a durci son Developer Mode en février 2026) — même architecture, source ouverte.
//
// Endpoints SANS clé (constatés 07/2026) :
//   GET https://api.deezer.com/search/artist?q=<nom>       → { data:[{ id, name, nb_fan, link }] }
//   GET https://api.deezer.com/artist/<id>/albums?limit=50 → { data:[{ id, title, release_date, link, record_type }] }
//
// ── RÉSOLUTION nom → artistId (cache PERMANENT) ──────────────────────────────
// Le nom saisi est résolu UNE FOIS en artistId (la correspondance ne change jamais → cache sans
// TTL). Homonymie levée par correspondance de NOM EXACTE (normalisée), départage par POPULARITÉ
// (nb_fan) si le champ existe, sinon 1er résultat pertinent.
//
// ── DÉTECTION DE NOUVEAUTÉ + ANTI-RÉTROACTIF ─────────────────────────────────
// La nouveauté se détecte par ID d'album. Au 1er cycle sur un artiste, on MÉMORISE les ids
// d'albums existants comme RÉFÉRENCE, SANS alerter (ils sont sortis avant la souscription).
// Seul un id JAMAIS vu ensuite déclenche. Dédoublonnage par id. Cache mémoire.
//
// ── QUOTA (~50 req / 5 s / IP constaté) ──────────────────────────────────────
// Mutualisation PAR ARTISTE (pas par abonné) + cache TTL de plusieurs heures : le coût est
// indépendant du nombre d'abonnés. Message FACTUEL, sans pochette (prudence CGU, comme Spotify :
// le lien Deezer suffit).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const SEARCH = 'https://api.deezer.com/search/artist';
const ARTIST = 'https://api.deezer.com/artist';
const PUBLIC_URL = 'https://www.deezer.com/';
const TIMEOUT_MS = 10_000;
const TTL_MS = 6 * 60 * 60 * 1000; // albums d'un artiste rafraîchis ~4×/jour
const ALBUM_LIMIT = 50;
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

const paramsSchema = [
  {
    key: 'artiste',
    label: 'Artiste',
    type: 'string',
    placeholder: 'Daft Punk, Aya Nakamura…',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'Le nom d\'un artiste ou groupe. Alerte à la sortie d\'un nouvel album sur Deezer.',
  },
];

// nom normalisé → { id, name } | null (PERMANENT) ; artistId → { seen:Set<albumId>, at, result }.
const artistIdCache = new Map();
const albumCache = new Map();

function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' '); }
function inactive() { return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } finally { clearTimeout(timer); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const body = await res.json();
  if (body && body.error) throw new Error('Deezer error ' + JSON.stringify(body.error));
  return body;
}

// Résout un nom d'artiste en { id, name } (cache permanent). null si introuvable.
async function resolveArtist(nomBrut) {
  const key = norm(nomBrut);
  if (!key) return null;
  if (artistIdCache.has(key)) return artistIdCache.get(key);

  let list = [];
  try {
    const data = await getJson(SEARCH + '?q=' + encodeURIComponent(nomBrut) + '&limit=25');
    list = data && Array.isArray(data.data) ? data.data : [];
  } catch (err) {
    return null; // réseau → non résolu (on n'empoisonne pas le cache permanent avec un échec transitoire)
  }
  if (!list.length) { artistIdCache.set(key, null); return null; }

  // Priorité au NOM EXACT (normalisé) ; départage par popularité (nb_fan) décroissante.
  const exact = list.filter((a) => norm(a.name) === key);
  const pool = exact.length ? exact : list;
  pool.sort((a, b) => (Number(b.nb_fan) || 0) - (Number(a.nb_fan) || 0));
  const best = pool[0];
  if (!best || best.id == null) { artistIdCache.set(key, null); return null; }
  const result = { id: String(best.id), name: String(best.name || nomBrut).trim() };
  artistIdCache.set(key, result);
  return result;
}

// Liste des albums d'un artiste : [{ id, title, date, link }], le plus récent d'abord.
async function fetchAlbums(artistId) {
  const data = await getJson(ARTIST + '/' + encodeURIComponent(artistId) + '/albums?limit=' + ALBUM_LIMIT);
  const rows = data && Array.isArray(data.data) ? data.data : [];
  return rows.map((a) => ({
    id: String(a.id),
    title: String(a.title || '').trim(),
    date: String(a.release_date || '').trim(),
    link: typeof a.link === 'string' ? a.link : null,
  })).filter((a) => a.id);
}

// Choisit l'album « le plus récent » parmi un lot (par date ISO, repli sur ordre d'arrivée).
function plusRecent(albums) {
  let best = albums[0];
  for (const a of albums) {
    if (a.date && (!best.date || a.date > best.date)) best = a;
  }
  return best;
}

async function checkOne(params, now) {
  const nom = String((params && params.artiste) || '').trim();
  if (!nom) return Object.assign({ params }, inactive());

  const artist = await resolveArtist(nom);
  if (!artist) return Object.assign({ params }, inactive()); // introuvable → silencieux

  const entry = albumCache.get(artist.id);
  if (entry && now - entry.at < TTL_MS) return Object.assign({ params }, entry.result); // mutualisé

  let albums;
  try { albums = await fetchAlbums(artist.id); }
  catch (err) {
    console.warn(`[veille-artiste-deezer] albums ${artist.name} : ${err.message} → inactive.`);
    return Object.assign({ params }, entry ? entry.result : inactive());
  }
  const ids = albums.map((a) => a.id);

  let result;
  if (!entry) {
    // 1er cycle : référence mémorisée SANS alerte (anti-rétroactif).
    albumCache.set(artist.id, { seen: new Set(ids), at: now, result: inactive() });
    return Object.assign({ params }, inactive());
  }

  const nouveaux = albums.filter((a) => !entry.seen.has(a.id));
  ids.forEach((id) => entry.seen.add(id));
  if (!nouveaux.length) {
    result = inactive();
  } else {
    const a = plusRecent(nouveaux);
    const quand = a.date ? ` (${a.date})` : '';
    result = {
      state: 'active', since: new Date(), until: null,
      message: `🎵 Nouvel album de ${artist.name} : « ${a.title || 'sans titre'} »${quand}. Source : Deezer.`,
      url: a.link || PUBLIC_URL,
    };
  }
  albumCache.set(artist.id, { seen: entry.seen, at: now, result });
  return Object.assign({ params }, result);
}

async function checkWithParams(paramsList) {
  let combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length > MAX_COMBOS) {
    console.warn(`[veille-artiste-deezer] ${combos.length} artistes — plafonné à ${MAX_COMBOS} ce cycle.`);
    combos = combos.slice(0, MAX_COMBOS);
  }
  const now = Date.now();
  const out = [];
  // Séquentiel : respecte la limite ~50 req/5s/IP sans rafale.
  for (const params of combos) {
    try { out.push(await checkOne(params, now)); }
    catch (err) {
      console.warn(`[veille-artiste-deezer] ${JSON.stringify(params)} : ${err.message}`);
      out.push(Object.assign({ params }, inactive()));
    }
  }
  return out;
}

module.exports = { id: 'veille-artiste-deezer', paramsSchema, checkWithParams,
  _test: { artistIdCache, albumCache } };
