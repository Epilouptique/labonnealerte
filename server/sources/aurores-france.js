// Source interne : aurores boréales visibles depuis la France (tempêtes
// géomagnétiques). Données NOAA SWPC (public, sans clé).
//
// API : noaa-planetary-k-index-forecast.json.
// STRUCTURE RÉELLE CONSTATÉE (écart vs hypothèse array-of-arrays) : c'est un
// tableau d'OBJETS { time_tag (UTC, sans 'Z'), kp (nombre),
// observed: "observed"|"estimated"|"predicted", noaa_scale }.
// On regarde les prévisions des prochaines 48h ; Kp max >= 7 → active.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';
const PUBLIC_URL = 'https://www.spaceweatherlive.com/fr.html';
const TIMEOUT_MS = 10_000;
const KP_THRESHOLD = 7; // seuil « aurores possibles en France »
const WINDOW_MS = 48 * 60 * 60 * 1000;

function parseUtc(tag) {
  if (!tag) return null;
  // Les time_tag NOAA sont en UTC mais sans suffixe 'Z' : on l'ajoute.
  const d = new Date(String(tag).replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

async function check() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API NOAA (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API NOAA échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue NOAA : ${res.status} ${res.statusText}`);

  let rows;
  try {
    rows = await res.json();
  } catch (err) {
    throw new Error(`Réponse NOAA illisible (JSON invalide) : ${err.message}`);
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Structure NOAA inattendue : tableau vide');
  }

  const now = Date.now();
  let maxKp = 0;
  for (const r of rows) {
    if (!r || typeof r.kp === 'undefined') continue;
    const t = parseUtc(r.time_tag);
    if (!t) continue;
    const ms = t.getTime();
    // Prévisions des prochaines 48h.
    if (ms >= now && ms <= now + WINDOW_MS) {
      const kp = Number(r.kp);
      if (!Number.isNaN(kp) && kp > maxKp) maxKp = kp;
    }
  }

  if (maxKp < KP_THRESHOLD) {
    return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
  }

  const kpAff = Math.round(maxKp);
  return {
    state: 'active',
    since: new Date(),
    until: null,
    message: `🌌 Tempête géomagnétique prévue (Kp ${kpAff}) — des aurores boréales pourraient être visibles depuis la France dans les prochaines 48h, regardez vers le nord une fois la nuit tombée.`,
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'aurores-france', check };
