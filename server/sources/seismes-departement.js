// Source PARAMÉTRÉE (OpenAlert v2) : séismes ressentis près d'un DÉPARTEMENT au
// choix. Complète (ne remplace pas) la source nationale seismes-france, qui reste
// le filet broadcast. 2e cas mixte broadcast+paramétré du kiosque.
//
// API : EMSC/seismicportal.eu FDSN, filtrage CIRCULAIRE latitude/longitude/
// maxradius (en DEGRÉS ; maxradiuskm n'existe pas sur ce serveur). Centre =
// préfecture du département ; rayon ~0,72° (~80 km).
//
// ⚠️ RÉSERVE ASSUMÉE : un rayon fixe autour d'un centroïde départemental est
// imparfait (départements de tailles inégales, chevauchements aux frontières) →
// quelques faux positifs/négatifs de bordure possibles. Acceptable pour une
// alerte sismique (un séisme proche mais hors-limite reste pertinent) ; le
// broadcast national conserve le filet de sécurité. 1 appel par combinaison,
// plafonné, échecs isolés.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { DEPARTEMENTS } = require('../geo');
const { PREF } = require('./lib/prefectures');

const API_BASE = 'https://www.seismicportal.eu/fdsnws/event/1/query';
const EVENT_PAGE = 'https://www.seismicportal.eu/eventdetails.html?unid=';
const FALLBACK_URL = 'https://www.franceseisme.fr/';
const TIMEOUT_MS = 10_000;
const MIN_MAG = 4.0;
const RADIUS_DEG = 0.72; // ~80 km
const ACTIVE_MS = 12 * 60 * 60 * 1000;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

const NAME = {};
DEPARTEMENTS.forEach((d) => { NAME[d.code] = d.name; });

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

function parseDate(v) { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
function inactive(params) { return { params, state: 'inactive', since: null, until: null, message: null, url: FALLBACK_URL }; }

async function checkOne(params) {
  const dep = String((params && params.departement) || '');
  const coord = PREF[dep];
  if (!coord) return inactive(params);

  const start = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const qs = new URLSearchParams({
    format: 'json', minmagnitude: String(MIN_MAG), starttime: start,
    latitude: String(coord[0]), longitude: String(coord[1]), maxradius: String(RADIUS_DEG),
    limit: '20', orderby: 'time',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(`${API_BASE}?${qs.toString()}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout EMSC (dep ${dep})`);
    throw new Error(`Appel EMSC échoué (dep ${dep}) : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return inactive(params); // aucun événement
  if (!res.ok) throw new Error(`Réponse HTTP inattendue EMSC (dep ${dep}) : ${res.status}`);

  let payload;
  try { payload = await res.json(); } catch (err) { throw new Error(`JSON EMSC invalide (dep ${dep})`); }
  const features = payload && Array.isArray(payload.features) ? payload.features : [];

  const now = Date.now();
  let best = null;
  for (const f of features) {
    const p = f && f.properties;
    if (!p) continue;
    const mag = Number(p.mag);
    const time = parseDate(p.time);
    if (Number.isNaN(mag) || mag < MIN_MAG || !time) continue;
    if (now >= time.getTime() + ACTIVE_MS) continue;
    if (!best || mag > best.mag) best = { mag, time, unid: p.unid };
  }
  if (!best) return inactive(params);

  const nom = NAME[dep] || ('département ' + dep);
  return {
    params,
    state: 'active',
    since: best.time,
    until: new Date(best.time.getTime() + ACTIVE_MS),
    message: `🫨 Séisme de magnitude ${best.mag.toFixed(1)} près de ${nom} — ressenti possible`,
    url: best.unid ? EVENT_PAGE + encodeURIComponent(best.unid) : FALLBACK_URL,
  };
}

async function checkWithParams(paramsList) {
  let combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length > MAX_COMBOS) {
    console.warn(`[seismes-departement] ${combos.length} départements — plafonné à ${MAX_COMBOS} ce cycle.`);
    combos = combos.slice(0, MAX_COMBOS);
  }
  const settled = await Promise.allSettled(combos.map(checkOne));
  const out = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') out.push(r.value);
    else console.warn(`[seismes-departement] ${JSON.stringify(combos[i])} : ${r.reason && r.reason.message}`);
  });
  return out;
}

module.exports = { id: 'seismes-departement', paramsSchema, checkWithParams };
