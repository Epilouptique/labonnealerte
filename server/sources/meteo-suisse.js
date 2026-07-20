// Source PARAMÉTRÉE (OpenAlert v2) : dangers météo en Suisse romande, CANTON au
// choix. Actif au niveau de danger 3 ou plus (échelle MétéoSuisse 1-5) ; niveaux
// 1-2 ignorés (anti-spam).
//
// ⚠️ RÉSERVE ASSUMÉE : MétéoSuisse n'expose PAS encore les dangers dans son open
// data officiel. On interroge l'API de l'application mobile (app-prod-ws.
// meteoswiss-app.ch, sans clé) — NON documentée / reverse-engineered : elle peut
// changer sans préavis. Lecture DÉFENSIVE (champs optionnels). Le maillage réel est
// par NPA (code postal) : on prend un NPA représentatif par canton romand. 1 appel
// par canton souscrit, plafonné (EXTERNAL_MAX_COMBOS), échecs isolés.
const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const BASE = 'https://app-prod-ws.meteoswiss-app.ch/v1/plzDetail';
const PUBLIC_URL = 'https://www.meteosuisse.admin.ch/meteo/dangers.html';
const TIMEOUT_MS = 12_000;
const SEUIL_NIVEAU = 3;
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

// Cantons romands → NPA représentatif (4 chiffres) + « 00 » = plz à 6 chiffres.
const CANTONS = [
  { value: 'geneve', label: 'Genève', plz: '120000' },      // Genève 1200
  { value: 'vaud', label: 'Vaud', plz: '100000' },          // Lausanne 1000
  { value: 'valais', label: 'Valais', plz: '195000' },      // Sion 1950
  { value: 'neuchatel', label: 'Neuchâtel', plz: '200000' }, // Neuchâtel 2000
  { value: 'fribourg', label: 'Fribourg', plz: '170000' },  // Fribourg 1700
  { value: 'jura', label: 'Jura', plz: '280000' },          // Delémont 2800
];
const BY_VALUE = {};
CANTONS.forEach((c) => { BY_VALUE[c.value] = c; });

const paramsSchema = [
  {
    key: 'canton',
    label: 'Canton',
    type: 'enum',
    values: CANTONS.map((c) => ({ value: c.value, label: c.label })),
    multiple: true,
    required: true,
    default: null,
  },
];

// warnType MétéoSuisse (constatés) → { fr, emoji }.
const TYPES = {
  1: { fr: 'orages', emoji: '⛈️' },
  2: { fr: 'pluie', emoji: '🌧️' },
  3: { fr: 'vent', emoji: '💨' },
  4: { fr: 'neige', emoji: '❄️' },
  5: { fr: 'verglas', emoji: '🧊' },
  6: { fr: 'canicule', emoji: '🌡️' },
  7: { fr: 'grand froid', emoji: '🥶' },
  10: { fr: 'feu de forêt', emoji: '🔥' },
  11: { fr: 'crues', emoji: '🌊' },
};
function typeFor(t) { return TYPES[Number(t)] || { fr: 'phénomène dangereux', emoji: '⚠️' }; }

function parseDate(v) {
  if (v == null) return null;
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}
function inactive(params) { return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

// Extrait défensivement la liste des avertissements d'un payload plzDetail.
function extractWarnings(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const cand = payload.warnings || (payload.currentWeather && payload.currentWeather.warnings) || payload.warning;
  const arr = Array.isArray(cand) ? cand : (cand ? [cand] : []);
  return arr.map((w) => ({
    level: Number(w.warnLevel != null ? w.warnLevel : w.level),
    type: w.warnType != null ? w.warnType : w.type,
    outlook: Boolean(w.outlook),
    from: parseDate(w.validFrom != null ? w.validFrom : w.from),
    to: parseDate(w.validTo != null ? w.validTo : w.to),
  })).filter((w) => Number.isFinite(w.level));
}

async function checkOne(params) {
  const canton = BY_VALUE[String((params && params.canton) || '')];
  if (!canton) return inactive(params);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(`${BASE}?plz=${canton.plz}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout MétéoSuisse (${canton.value})`);
    throw new Error(`Appel MétéoSuisse échoué (${canton.value}) : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue MétéoSuisse (${canton.value}) : ${res.status}`);

  let payload;
  try { payload = await res.json(); } catch (err) { throw new Error(`JSON MétéoSuisse invalide (${canton.value})`); }

  // Pire danger actif (non « outlook ») de niveau >= seuil.
  let best = null;
  for (const w of extractWarnings(payload)) {
    if (w.outlook || w.level < SEUIL_NIVEAU) continue;
    if (!best || w.level > best.level) best = w;
  }
  if (!best) return inactive(params);
  const t = typeFor(best.type);
  return {
    params,
    state: 'active',
    since: best.from,
    until: best.to,
    message: `${t.emoji} Suisse — ${canton.label} : danger météo niveau ${best.level}/5 (${t.fr}).`,
    url: PUBLIC_URL,
  };
}

async function checkWithParams(paramsList) {
  let combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];
  if (combos.length > MAX_COMBOS) {
    console.warn(`[meteo-suisse] ${combos.length} cantons — plafonné à ${MAX_COMBOS} ce cycle.`);
    combos = combos.slice(0, MAX_COMBOS);
  }
  const settled = await Promise.allSettled(combos.map(checkOne));
  const out = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') out.push(r.value);
    else { console.warn(`[meteo-suisse] ${JSON.stringify(combos[i])} : ${r.reason && r.reason.message}`); out.push(inactive(combos[i])); }
  });
  return out;
}

module.exports = { id: 'meteo-suisse', paramsSchema, checkWithParams };
