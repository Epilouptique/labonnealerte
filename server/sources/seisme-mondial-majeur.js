// Source interne : séisme MONDIAL majeur (magnitude ≥ 7.5). Données USGS FDSN
// (earthquake.usgs.gov, public, sans clé). Public visé : expatriés, actualité.
//
// DISTINCT de seismes-france / seismes-departement : zone MONDIALE et seuil bien plus
// haut (M ≥ 7.5). La France métropolitaine n'atteint jamais ce niveau ; les sources
// françaises couvrent des secousses locales M 3-5 ressenties. Aucun recoupement.
//
// API : https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=7.5
// STRUCTURE : GeoJSON FeatureCollection ; properties { mag, place, time (ms epoch),
// tsunami (0/1), url, magType } ; geometry.coordinates [lon, lat, prof_km]. mag et
// tsunami sont des champs structurés → seuil fiable. Fréquence réelle validée : M≥7.5
// ≈ 4-5/an dans le monde (une poignée) → bon profil anti-spam. Fenêtre : 48 h.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { formatDateFr } = require('./lib/format-fr');

const API_BASE = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const PUBLIC_URL = 'https://earthquake.usgs.gov/earthquakes/map/';
const TIMEOUT_MS = 10_000;
const MIN_MAG = 7.5;
const WINDOW_MS = 48 * 60 * 60 * 1000;

function inactive() { return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

async function check() {
  const start = new Date(Date.now() - WINDOW_MS).toISOString();
  const url = `${API_BASE}?format=geojson&minmagnitude=${MIN_MAG}&starttime=${encodeURIComponent(start)}&orderby=time`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API USGS (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API USGS échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue USGS : ${res.status} ${res.statusText}`);

  let data;
  try { data = await res.json(); } catch (err) { throw new Error(`Réponse USGS illisible : ${err.message}`); }
  const feats = data && data.features;
  if (!Array.isArray(feats) || feats.length === 0) return inactive();

  // Le plus récent (orderby=time → premier). Ancre d'épisode = l'heure du séisme.
  const p = feats[0].properties || {};
  const mag = Number(p.mag);
  if (!Number.isFinite(mag) || mag < MIN_MAG) return inactive();
  const when = p.time ? new Date(p.time) : new Date();
  const place = p.place || 'localisation en cours de précision';
  const tsunami = p.tsunami === 1
    ? ' Une alerte tsunami peut être en vigueur localement — suivez les consignes des autorités sur place.'
    : '';

  return {
    state: 'active',
    since: when,
    until: null,
    message: `🌍 Séisme majeur : magnitude ${mag.toFixed(1)}, ${place}, le ${formatDateFr(when)}.${tsunami} (Événement hors France métropolitaine.)`,
    url: p.url || PUBLIC_URL,
  };
}

module.exports = { id: 'seisme-mondial-majeur', check };
