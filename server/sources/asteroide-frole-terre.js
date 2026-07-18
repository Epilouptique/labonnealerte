// Source interne : astéroïde qui « frôle » la Terre. Données NASA/JPL CNEOS Close
// Approach Data (public, sans clé).
//
// API : https://ssd-api.jpl.nasa.gov/cad.api
// STRUCTURE CONSTATÉE : { count, fields:[...], data:[[...], ...] }. Champs utiles :
// des (désignation), cd (date UTC "2024-Jan-15 08:11"), dist (distance min en ua),
// v_rel (km/s), h (magnitude absolue — proxy de taille ; le champ diameter est presque
// toujours null, on estime le diamètre depuis h).
//
// SEUIL (rare PAR CONSTRUCTION) : objet notable — h ≤ 24 (≈ ≥ 50 m, « taille d'un
// immeuble ») passant à moins de 1 distance lunaire (1 LD) dans les 7 prochains jours.
// Fréquence réelle validée : ~1/an (h≤24, <1 LD sur 2015-2025). Ton factuel : on donne
// la distance en « x fois la distance Terre-Lune » (parlant) et on rappelle TOUJOURS
// qu'il n'y a aucun risque de collision.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { formatDateFr } = require('./lib/format-fr');

const API_BASE = 'https://ssd-api.jpl.nasa.gov/cad.api';
const PUBLIC_URL = 'https://cneos.jpl.nasa.gov/ca/';
const TIMEOUT_MS = 10_000;
const AU_PER_LD = 0.00256955529; // 1 distance Terre-Lune en unités astronomiques
const H_MAX = 24;                 // ≈ ≥ 50 m
const ALBEDO = 0.14;              // albédo moyen (estimation de diamètre depuis h)
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function inactive() { return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

// "2024-Jan-15 08:11" (UTC) → Date. Sert d'ancre d'épisode (une notif par objet).
function parseCd(cd) {
  const m = String(cd || '').match(/(\d{4})-([A-Za-z]{3})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m || !(m[2] in MONTHS)) return new Date();
  return new Date(Date.UTC(+m[1], MONTHS[m[2]], +m[3], +m[4], +m[5]));
}
// Diamètre estimé (m) depuis la magnitude absolue h.
function estimDiameterM(h) {
  if (!Number.isFinite(h)) return null;
  const km = (1329 / Math.sqrt(ALBEDO)) * Math.pow(10, -0.2 * h);
  return km * 1000;
}
function roundNice(m) {
  if (m >= 1000) return Math.round(m / 100) * 100;
  if (m >= 100) return Math.round(m / 10) * 10;
  return Math.round(m / 5) * 5;
}

async function check() {
  const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const dateMax = to.toISOString().slice(0, 10); // AAAA-MM-JJ (évite l'ambiguïté du relatif "+7")
  const url = `${API_BASE}?dist-max=1LD&h-max=${H_MAX}&date-min=now&date-max=${dateMax}&sort=dist`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API JPL (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API JPL échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue JPL : ${res.status} ${res.statusText}`);

  let data;
  try { data = await res.json(); } catch (err) { throw new Error(`Réponse JPL illisible : ${err.message}`); }
  if (!data || !data.count || !Array.isArray(data.data) || data.data.length === 0) return inactive();

  const fields = data.fields || [];
  const idx = (name) => fields.indexOf(name);
  const iDes = idx('des'), iCd = idx('cd'), iDist = idx('dist'), iVrel = idx('v_rel'), iH = idx('h');
  const row = data.data[0]; // le plus proche (sort=dist)
  if (!row || iDes < 0 || iCd < 0 || iDist < 0) return inactive();

  const des = String(row[iDes]);
  const distAu = parseFloat(row[iDist]);
  const ld = distAu / AU_PER_LD;
  const h = iH >= 0 ? parseFloat(row[iH]) : NaN;
  const vrel = iVrel >= 0 ? parseFloat(row[iVrel]) : NaN;
  const when = parseCd(row[iCd]);

  const dM = estimDiameterM(h);
  const tailleTxt = dM ? ` Diamètre estimé ~${roundNice(dM)} m.` : '';
  const vTxt = Number.isFinite(vrel) ? ` Vitesse ${Math.round(vrel)} km/s.` : '';
  const ldTxt = ld >= 1 ? ld.toFixed(1) : ld.toFixed(2);

  return {
    state: 'active',
    since: when, // ancre l'épisode sur l'objet (une notif par astéroïde)
    until: null,
    message: `☄️ L'astéroïde ${des} passe à ${ldTxt} fois la distance Terre-Lune le ${formatDateFr(when)} — aucun risque de collision.${tailleTxt}${vTxt}`,
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'asteroide-frole-terre', check };
