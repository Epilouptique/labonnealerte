// Source PARAMÉTRÉE (OpenAlert v2) : avertissements météo au Québec, RÉGION au
// choix. Actif UNIQUEMENT sur un AVERTISSEMENT (alert_type = warning) ; les veilles
// (watch), avis (advisory) et bulletins (statement) sont ignorés (anti-spam).
//
// API : MSC GeoMet ECCC (api.weather.gc.ca, OGC API Features, GeoJSON, sans clé,
// bilingue FR natif). Un SEUL appel province=QC renvoie toutes les alertes du
// Québec → mutualisation (1 appel réseau par cycle). On mappe côté client chaque
// région souscrite par inclusion sur feature_name_fr (noms de zones de prévision
// ECCC — appariement défensif, insensible à la casse et aux accents).
const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_URL = 'https://api.weather.gc.ca/collections/weather-alerts/items?f=json&province=QC&limit=1000';
const PUBLIC_URL = 'https://meteo.gc.ca/warnings/index_f.html';
const TIMEOUT_MS = 12_000;

// Régions québécoises proposées → terme(s) recherché(s) dans feature_name_fr.
const REGIONS = [
  { value: 'montreal', label: 'Montréal', match: ['montreal'] },
  { value: 'quebec', label: 'Ville de Québec', match: ['quebec'] },
  { value: 'gatineau', label: 'Gatineau', match: ['gatineau'] },
  { value: 'sherbrooke', label: 'Sherbrooke', match: ['sherbrooke'] },
  { value: 'trois-rivieres', label: 'Trois-Rivières', match: ['trois-rivieres', 'trois rivieres'] },
  { value: 'saguenay', label: 'Saguenay', match: ['saguenay'] },
  { value: 'laval', label: 'Laval', match: ['laval'] },
  { value: 'longueuil', label: 'Longueuil', match: ['longueuil'] },
  { value: 'levis', label: 'Lévis', match: ['levis'] },
  { value: 'drummondville', label: 'Drummondville', match: ['drummondville'] },
  { value: 'rimouski', label: 'Rimouski', match: ['rimouski'] },
  { value: 'rouyn-noranda', label: 'Rouyn-Noranda', match: ['rouyn'] },
];
const BY_VALUE = {};
REGIONS.forEach((r) => { BY_VALUE[r.value] = r; });

const paramsSchema = [
  {
    key: 'region',
    label: 'Région',
    type: 'enum',
    values: REGIONS.map((r) => ({ value: r.value, label: r.label })),
    multiple: true,
    required: true,
    default: null,
  },
];

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function emojiFor(nameFr) {
  const n = norm(nameFr);
  if (n.includes('chaleur') || n.includes('canicule')) return '🌡️';
  if (n.includes('froid')) return '🥶';
  if (n.includes('verglas')) return '🧊';
  if (n.includes('neige') || n.includes('hivernale') || n.includes('bordee') || n.includes('poudrerie')) return '❄️';
  if (n.includes('orage')) return '⛈️';
  if (n.includes('pluie')) return '🌧️';
  if (n.includes('vent')) return '💨';
  return '⚠️';
}

function parseDate(v) { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
function inactive(params) { return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

async function fetchWarnings() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout ECCC (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel ECCC échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue ECCC : ${res.status}`);
  const payload = await res.json();
  const feats = payload && Array.isArray(payload.features) ? payload.features : [];
  // Ne garder que les AVERTISSEMENTS (warning).
  return feats
    .map((f) => f && f.properties)
    .filter((p) => p && String(p.alert_type).toLowerCase() === 'warning');
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];

  let warnings;
  try { warnings = await fetchWarnings(); }
  catch (err) { console.warn(`[meteo-quebec] ${err.message}`); return combos.map(inactive); }

  return combos.map((p) => {
    const region = BY_VALUE[String((p && p.region) || '')];
    if (!region) return inactive(p);
    // Premier avertissement dont la zone contient un terme de la région.
    const hit = warnings.find((w) => {
      const zone = norm(w.feature_name_fr);
      return region.match.some((m) => zone.includes(m));
    });
    if (!hit) return inactive(p);
    const nameFr = hit.alert_name_fr || 'avertissement météo';
    const since = parseDate(hit.publication_datetime) || parseDate(hit.validity_datetime);
    const until = parseDate(hit.expiration_datetime) || parseDate(hit.event_end_datetime);
    return {
      params: p,
      state: 'active',
      since,
      until,
      message: `${emojiFor(nameFr)} Avertissement météo à ${region.label} (Québec) : ${nameFr}.`,
      url: PUBLIC_URL,
    };
  });
}

module.exports = { id: 'meteo-quebec', paramsSchema, checkWithParams };
