// Source PARAMÉTRÉE (OpenAlert v2) — EXPÉRIMENTALE : prochain passage VISIBLE à
// l'œil nu de la Station spatiale internationale (ISS) au-dessus de la COMMUNE au
// choix (n'importe quelle commune française, plus un enum fermé de 16 villes).
//
// Champ `ville` de type 'commune-coords' : l'abonné saisit/pré-remplit un NOM de commune,
// résolu en coordonnées { lat, lon, nom } à la SOUSCRIPTION (lib/commune-insee →
// resolveCommuneCoords, via la route). La valeur stockée est ENCODÉE "lat|lon|nom" ; le poll
// ne géocode jamais. Mutualisation par lat/lon ARRONDIS (2 décimales ~1,1 km, l'ISS n'exige pas
// une précision extrême) → deux communes voisines partagent un seul appel API.
//
// ⚠️ SOURCE FRAGILE (à surveiller — cf. meteo-suisse / pannes-hydro-quebec) :
// l'API `iss-api.fly.dev` est un service COMMUNAUTAIRE (hébergé fly.dev, sans SLA).
// Techniquement fiable (propagation SGP4/Skyfield, TLE CelesTrak rafraîchies /6 h,
// teste bien la visibilité réelle : ISS éclairée + observateur dans le noir), mais
// peut disparaître sans préavis → lecture défensive, échecs isolés, jamais de crash.
// REPLI durable prêt-à-brancher : N2YO (endpoint /visualpasses, clé gratuite
// N2YO_API_KEY, apporte en plus la magnitude) — non branché ici (zéro clé).
//
// API SANS clé (constaté 07/2026) :
//   GET https://iss-api.fly.dev/iss-pass?lat={lat}&lon={lon}&visible_only=true&days_ahead=1
//   → { passes:[{ visible, visible_start, visible_end, visible_duration_sec,
//                 culmination:{elevation_deg}, rise:{compass}, set:{compass} }, ...] }
// Actif si un passage VISIBLE de qualité est prévu dans les 12 h. Message 🛰️.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { decodeCoords } = require('./lib/commune-insee');

const API = (lat, lon) =>
  `https://iss-api.fly.dev/iss-pass?lat=${lat}&lon=${lon}&visible_only=true&days_ahead=1&n=10`;
const PUBLIC_URL = 'https://spotthestation.nasa.gov/';
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 appel/ville par heure
const HORIZON_MS = 12 * 60 * 60 * 1000; // passages dans les 12 h
const MIN_ELEVATION = 20; // ° au zénith : écarte les passages rasants peu visibles
const MIN_VISIBLE_SEC = 60; // au moins 1 min de visibilité
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

// Table interne (lat, lon) — CONSERVÉE pour RÉTROCOMPATIBILITÉ : les abonnements créés avant
// le passage au champ 'commune-coords' portent une clé d'enum ('paris'…), pas des coordonnées
// encodées. On les résout encore via cette table (aucun abonnement perdu silencieusement).
const VILLES = {
  paris: { nom: 'Paris', lat: 48.8566, lon: 2.3522 },
  marseille: { nom: 'Marseille', lat: 43.2965, lon: 5.3698 },
  lyon: { nom: 'Lyon', lat: 45.7640, lon: 4.8357 },
  toulouse: { nom: 'Toulouse', lat: 43.6045, lon: 1.4440 },
  nice: { nom: 'Nice', lat: 43.7009, lon: 7.2683 },
  nantes: { nom: 'Nantes', lat: 47.2184, lon: -1.5536 },
  montpellier: { nom: 'Montpellier', lat: 43.6108, lon: 3.8767 },
  strasbourg: { nom: 'Strasbourg', lat: 48.5734, lon: 7.7521 },
  bordeaux: { nom: 'Bordeaux', lat: 44.8378, lon: -0.5792 },
  lille: { nom: 'Lille', lat: 50.6292, lon: 3.0573 },
  rennes: { nom: 'Rennes', lat: 48.1173, lon: -1.6778 },
  reims: { nom: 'Reims', lat: 49.2583, lon: 4.0317 },
  toulon: { nom: 'Toulon', lat: 43.1258, lon: 5.9306 },
  grenoble: { nom: 'Grenoble', lat: 45.1885, lon: 5.7245 },
  dijon: { nom: 'Dijon', lat: 47.3220, lon: 5.0415 },
  gap: { nom: 'Gap', lat: 44.5590, lon: 6.0790 },
};

const paramsSchema = [
  {
    key: 'ville',
    label: 'Commune',
    type: 'commune-coords',
    placeholder: 'Votre commune',
    multiple: true,
    required: true,
    default: null,
    hint: 'Le nom de votre commune (ou une autre). Alerte quand la Station spatiale internationale sera visible à l\'œil nu au-dessus.',
  },
];

// Cache par coordonnées ARRONDIES : clé "lat|lon" → { at, result } (result sans params).
const cache = new Map();

// Arrondi de mutualisation : 2 décimales (~1,1 km) — deux communes proches → 1 seul appel.
function coordKey(lat, lon) { return `${lat.toFixed(2)}|${lon.toFixed(2)}`; }

// Résout la valeur d'un combo en { lat, lon, nom } : d'abord coordonnées encodées (nouveau
// format), sinon clé d'enum héritée (RÉTROCOMPAT), sinon null.
function resolveCombo(value) {
  const v = String(value == null ? '' : value).trim();
  const dec = decodeCoords(v);
  if (dec) return dec;
  const legacy = VILLES[v.toLowerCase()];
  if (legacy) return { lat: legacy.lat, lon: legacy.lon, nom: legacy.nom };
  return null;
}

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

// "21h07" en heure de Paris depuis un ISO UTC.
function heureParis(iso) {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === 'hour');
  const m = parts.find((p) => p.type === 'minute');
  return `${h ? h.value : '??'}h${m ? m.value : '??'}`;
}

// Jour calendaire (Paris) d'un ISO, pour distinguer « ce soir » / « demain soir ».
function jourParis(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

async function fetchVille(lat, lon, nom) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API(lat, lon), { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout ISS API (${nom})`);
    throw new Error(`Appel ISS API échoué (${nom}) : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue ISS API (${nom}) : ${res.status}`);
  const payload = await res.json();
  const passes = payload && Array.isArray(payload.passes) ? payload.passes : [];

  const now = Date.now();
  let best = null;
  for (const p of passes) {
    if (!p || !p.visible || !p.visible_start) continue;
    const start = new Date(p.visible_start);
    if (Number.isNaN(start.getTime())) continue;
    const dt = start.getTime() - now;
    if (dt < -5 * 60 * 1000 || dt > HORIZON_MS) continue; // hors fenêtre 12 h
    const elev = p.culmination && Number(p.culmination.elevation_deg);
    if (!(elev >= MIN_ELEVATION)) continue;
    if (!(Number(p.visible_duration_sec) >= MIN_VISIBLE_SEC)) continue;
    if (!best || start.getTime() < new Date(best.visible_start).getTime()) best = p;
  }
  if (!best) return inactive();

  const start = new Date(best.visible_start);
  const quand = jourParis(start) === jourParis(new Date()) ? 'ce soir' : 'demain soir';
  const minutes = Math.max(1, Math.round(Number(best.visible_duration_sec) / 60));
  const dir = (best.rise && best.rise.compass && best.set && best.set.compass)
    ? ` (du ${best.rise.compass} vers le ${best.set.compass})` : '';
  return {
    state: 'active',
    since: start,
    until: best.visible_end ? new Date(best.visible_end) : null,
    message: `🛰️ Station spatiale visible à l'œil nu ${quand} à ${heureParis(best.visible_start)} depuis ${nom} — environ ${minutes} min${dir}`,
    url: PUBLIC_URL,
  };
}

async function checkWithParams(paramsList) {
  let combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length > MAX_COMBOS) {
    console.warn(`[iss-passages] ${combos.length} communes — plafonné à ${MAX_COMBOS} ce cycle.`);
    combos = combos.slice(0, MAX_COMBOS);
  }
  const now = Date.now();
  const out = [];
  for (const params of combos) {
    const geo = resolveCombo(params && params.ville);
    if (!geo) { out.push(Object.assign({ params }, inactive())); continue; }
    // Mutualisation : clé par coordonnées ARRONDIES → deux communes voisines = 1 appel.
    const key = coordKey(geo.lat, geo.lon);
    const cached = cache.get(key);
    if (cached && now - cached.at < CACHE_TTL_MS) {
      out.push(Object.assign({ params }, cached.result));
      continue;
    }
    try {
      const result = await fetchVille(geo.lat, geo.lon, geo.nom);
      cache.set(key, { at: Date.now(), result });
      out.push(Object.assign({ params }, result));
    } catch (err) {
      console.warn(`[iss-passages] ${geo.nom} : ${err.message}`);
      out.push(Object.assign({ params }, cached ? cached.result : inactive()));
    }
  }
  return out;
}

module.exports = { id: 'iss-passages', paramsSchema, checkWithParams };
