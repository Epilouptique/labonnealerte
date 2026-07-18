// Source interne : tempête solaire à IMPACT TECHNOLOGIQUE (réseaux électriques, GPS,
// radio HF, satellites). Données NOAA SWPC (public, sans clé).
//
// API : https://services.swpc.noaa.gov/products/noaa-scales.json
// STRUCTURE CONSTATÉE : objet clé par décalage de jour — "-1" (hier), "0" (courant),
// "1".."3" (prévisions). Chaque entrée : { DateStamp, TimeStamp, R:{Scale,Text,...},
// S:{Scale,Text,...}, G:{Scale,Text} }. Scale = chaîne "0".."5" (fiable, machine-lisible).
// Les entrées de prévision donnent des probabilités (MinorProb/MajorProb), pas un Scale
// réalisé → on n'utilise QUE l'entrée courante "0" (événement EN COURS), anti-faux-positif.
//
// SEUIL (distinct de aurores-france qui alerte sur Kp≥7 = visibilité d'aurores) : ici on
// vise l'impact techno, donc plus rare — tempête géomagnétique G≥4 (sévère) OU blackout
// radio R≥3 (forte éruption solaire, coupures HF). Fréquence ~une poignée/an au max solaire,
// quasi nulle au minimum (validé sur l'historique du cycle). Ton factuel et calme.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_URL = 'https://services.swpc.noaa.gov/products/noaa-scales.json';
const PUBLIC_URL = 'https://www.swpc.noaa.gov/noaa-scales-explanation';
const TIMEOUT_MS = 10_000;
const G_THRESHOLD = 4; // tempête géomagnétique sévère
const R_THRESHOLD = 3; // blackout radio fort (éruption solaire X)

function inactive() { return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }
function scaleOf(entry, key) {
  if (!entry || !entry[key]) return 0;
  const n = parseInt(entry[key].Scale, 10);
  return Number.isFinite(n) ? n : 0;
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

  let data;
  try { data = await res.json(); } catch (err) { throw new Error(`Réponse NOAA illisible : ${err.message}`); }
  const cur = data && data['0'];
  if (!cur) throw new Error('Structure NOAA inattendue : entrée courante "0" absente');

  const g = scaleOf(cur, 'G');
  const r = scaleOf(cur, 'R');
  if (g < G_THRESHOLD && r < R_THRESHOLD) return inactive();

  // Message factuel et calme : on décrit l'impact possible, on rassure sur le sol.
  const parts = [];
  if (g >= G_THRESHOLD) parts.push(`tempête géomagnétique sévère (G${g})`);
  if (r >= R_THRESHOLD) parts.push(`fort blackout radio (R${r}, éruption solaire)`);
  return {
    state: 'active',
    since: new Date(),
    until: null,
    message: `☀️ Tempête solaire en cours : ${parts.join(' et ')}. Des perturbations sont possibles sur le GPS, les radios HF et les réseaux électriques (surtout aux hautes latitudes). Aucun effet sur la santé au sol.`,
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'tempete-solaire', check };
