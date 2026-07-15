// Source PARAMÉTRÉE (OpenAlert v2) : indice UV élevé, DÉPARTEMENT au choix.
// Généralise indice-uv-gap : Open-Meteo accepte des lat/lon arbitraires ET
// PLUSIEURS points par requête → on MUTUALISE toutes les combinaisons souscrites
// en 1 (ou quelques) appel(s) par cycle. Actif si l'indice UV max du jour >= 8.
// Remplace indice-uv-gap (abonnés migrés vers {departement:"05"}, source retirée).
//
// API : https://api.open-meteo.com/v1/forecast?latitude=..,..&longitude=..,..
//        &daily=uv_index_max&timezone=Europe/Paris&forecast_days=1 (sans clé).
//        Réponse = objet (1 point) OU tableau (N points, même ordre).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { DEPARTEMENTS } = require('../geo');
const { PREF } = require('./lib/prefectures');

const BASE = 'https://api.open-meteo.com/v1/forecast';
const PUBLIC_URL = 'https://www.soleil.info/';
const TIMEOUT_MS = 10_000;
const SEUIL = 8;            // seuil 8 (aligné sur indice-uv-gap)
const MAX_POINTS = 100;     // plafond de points par requête (marge URL / API)

const NAME = {};
DEPARTEMENTS.forEach((d) => { NAME[d.code] = d.name; });

// Enum limité aux départements dont on a les coordonnées (les 101).
const paramsSchema = [
  {
    key: 'departement',
    label: 'Département',
    type: 'enum',
    values: DEPARTEMENTS.filter((d) => PREF[d.code]).map((d) => ({ value: d.code, label: d.name })),
    multiple: true,
    required: true,
    default: null,
  },
];

function inactive(params) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

// Interroge Open-Meteo pour une liste de départements en UN appel (mutualisé).
// Renvoie Map departement → uvMax (nombre) ou undefined.
async function fetchUv(depts) {
  const lats = depts.map((d) => PREF[d][0]).join(',');
  const lons = depts.map((d) => PREF[d][1]).join(',');
  const url = `${BASE}?latitude=${lats}&longitude=${lons}&daily=uv_index_max&timezone=Europe%2FParis&forecast_days=1`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout Open-Meteo (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel Open-Meteo échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue Open-Meteo : ${res.status}`);
  const payload = await res.json();
  const arr = Array.isArray(payload) ? payload : [payload]; // 1 point → objet ; N → tableau
  const out = new Map();
  depts.forEach((d, i) => {
    const daily = arr[i] && arr[i].daily;
    const v = daily && Array.isArray(daily.uv_index_max) ? daily.uv_index_max[0] : null;
    out.set(d, typeof v === 'number' ? v : undefined);
  });
  return out;
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];

  // Départements uniques valides (avec coordonnées), plafonnés.
  const uniq = [];
  for (const p of combos) {
    const d = String((p && p.departement) || '');
    if (PREF[d] && uniq.indexOf(d) === -1) uniq.push(d);
  }
  let uvByDept = new Map();
  if (uniq.length) {
    const batch = uniq.slice(0, MAX_POINTS);
    if (uniq.length > MAX_POINTS) console.warn(`[indice-uv] ${uniq.length} départements — ${MAX_POINTS} traités ce cycle.`);
    try { uvByDept = await fetchUv(batch); }
    catch (err) { console.warn(`[indice-uv] ${err.message}`); return combos.map(inactive); }
  }

  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(midnight.getTime() + 24 * 60 * 60 * 1000);

  return combos.map((p) => {
    const d = String((p && p.departement) || '');
    const uv = uvByDept.get(d);
    if (typeof uv !== 'number' || uv < SEUIL) return inactive(p);
    const nom = NAME[d] || ('département ' + d);
    return {
      params: p,
      state: 'active',
      since: midnight,
      until: endOfDay,
      message: `☀️ Indice UV très élevé dans ${nom} aujourd'hui (UV ${Math.round(uv)}) — protection solaire recommandée aux heures chaudes`,
      url: PUBLIC_URL,
    };
  });
}

module.exports = { id: 'indice-uv', paramsSchema, checkWithParams };
