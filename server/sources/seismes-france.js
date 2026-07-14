// Source interne : séismes ressentis en France métropolitaine.
//
// API : EMSC / seismicportal.eu (FDSN event, public sans clé). On interroge la
// bbox métropole (~ 41–51,5 N / -5,5–10 E) sur les dernières 24h, magnitude ≥ 4.
//
// STRUCTURE RÉELLE CONSTATÉE : FeatureCollection GeoJSON. Chaque
// features[].properties porte : mag (nombre), time (ISO UTC 'Z'),
// flynn_region (libellé région, ex. « PYRENEES »), lat, lon, unid (identifiant
// d'événement, réutilisable pour la page publique).
//
// Règle d'alerte : un séisme M≥4 dans la bbox reste « ressenti possible » 12h.
// Comme le poller n'expire pas sur `until`, check() ne renvoie 'active' que tant
// que now < heure_du_séisme + 12h (l'alerte s'éteint donc d'elle-même). Plusieurs
// séismes actifs → on retient le plus fort. Un nouveau séisme dont le `since`
// avance ≥ 24h est traité comme un nouvel épisode par le poller.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_BASE = 'https://www.seismicportal.eu/fdsnws/event/1/query';
const EVENT_PAGE = 'https://www.seismicportal.eu/eventdetails.html?unid=';
const FALLBACK_URL = 'https://www.franceseisme.fr/';
const TIMEOUT_MS = 10_000;

const MIN_MAG = 4.0;
const ACTIVE_MS = 12 * 60 * 60 * 1000; // 12h : durée de vie de l'alerte
const LOOKBACK_MS = 24 * 60 * 60 * 1000; // fenêtre de requête EMSC
// Bbox métropole (inclut un liseré frontalier : un séisme proche peut être ressenti).
const BBOX = { minlat: 41, maxlat: 51.5, minlon: -5.5, maxlon: 10 };

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// « PYRENEES » → « Pyrenees » : capitalise chaque mot pour un rendu moins criard.
function titleCase(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\b[\p{L}]/gu, (c) => c.toUpperCase());
}

function buildUrl() {
  const now = Date.now();
  const start = new Date(now - LOOKBACK_MS).toISOString();
  const params = new URLSearchParams({
    format: 'json',
    minmagnitude: String(MIN_MAG),
    starttime: start,
    minlatitude: String(BBOX.minlat),
    maxlatitude: String(BBOX.maxlat),
    minlongitude: String(BBOX.minlon),
    maxlongitude: String(BBOX.maxlon),
    limit: '30',
    orderby: 'time',
  });
  return `${API_BASE}?${params.toString()}`;
}

async function check() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(buildUrl(), { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API EMSC (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API EMSC échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  // EMSC renvoie 204 (No Content) quand aucun événement ne correspond : pas une erreur.
  if (res.status === 204) {
    return { state: 'inactive', since: null, until: null, message: null, url: FALLBACK_URL };
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue EMSC : ${res.status} ${res.statusText}`);

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error(`Réponse EMSC illisible (JSON invalide) : ${err.message}`);
  }
  const features = payload && Array.isArray(payload.features) ? payload.features : [];

  const now = Date.now();
  let best = null; // séisme actif (now < time+12h) le plus fort
  for (const f of features) {
    const p = f && f.properties;
    if (!p) continue;
    const mag = Number(p.mag);
    const time = parseDate(p.time);
    if (Number.isNaN(mag) || mag < MIN_MAG || !time) continue;
    if (now >= time.getTime() + ACTIVE_MS) continue; // séisme trop ancien : éteint
    if (!best || mag > best.mag) best = { mag, time, region: p.flynn_region, unid: p.unid };
  }

  if (!best) {
    return { state: 'inactive', since: null, until: null, message: null, url: FALLBACK_URL };
  }

  const zone = best.region ? titleCase(best.region) : 'zone non précisée';
  const url = best.unid ? EVENT_PAGE + encodeURIComponent(best.unid) : FALLBACK_URL;
  return {
    state: 'active',
    since: best.time,
    until: new Date(best.time.getTime() + ACTIVE_MS),
    message: `🫨 Séisme de magnitude ${best.mag.toFixed(1)} détecté (${zone}), ressenti possible`,
    url,
  };
}

module.exports = { id: 'seismes-france', check };
