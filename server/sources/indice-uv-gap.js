// Source interne : indice UV à Gap via Open-Meteo (API publique, SANS clé).
//   GET .../v1/forecast?latitude=44.559&longitude=6.079&daily=uv_index_max&...
//   → { daily: { time: ["YYYY-MM-DD", ...], uv_index_max: [num, ...] } }
// Seuil 8 ; si trop fréquent en été, remonter à 9.
// index 0 = aujourd'hui. Actif si UV du jour >= seuil.
const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_URL = 'https://api.open-meteo.com/v1/forecast?latitude=44.559&longitude=6.079&daily=uv_index_max&timezone=Europe/Paris&forecast_days=2';
const PUBLIC_URL = 'https://open-meteo.com/';
const TIMEOUT_MS = 10_000;
const SEUIL = 8; // seuil 8 ; si trop fréquent en été, remonter à 9

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

async function check() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API Open-Meteo (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API Open-Meteo échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`Réponse HTTP inattendue Open-Meteo : ${res.status} ${res.statusText}`);

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error(`Réponse Open-Meteo illisible (JSON invalide) : ${err.message}`);
  }

  const daily = payload && payload.daily;
  const uvArr = daily && Array.isArray(daily.uv_index_max) ? daily.uv_index_max : null;
  if (!uvArr || uvArr.length === 0) return inactive();

  const uv = uvArr[0]; // aujourd'hui
  if (typeof uv !== 'number' || Number.isNaN(uv) || uv < SEUIL) return inactive();

  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const until = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  return {
    state: 'active',
    since,
    until,
    message: `☀️ Indice UV très élevé à Gap aujourd'hui (UV ${Math.round(uv)}) — protection solaire recommandée aux heures chaudes`,
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'indice-uv-gap', check };
