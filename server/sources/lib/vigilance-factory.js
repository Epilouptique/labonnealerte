// Factory Vigilance Météo-France multi-départements.
//
// API : Bulletin Vigilance (DPVigilance V6), carte en cours. La réponse couvre
// TOUS les départements en une fois → on mutualise un seul fetch (cache mémoire
// TTL 10 min) partagé entre toutes les sources créées par cette factory :
// 4 sources = 1 appel Météo-France par cycle, pas 4.
//
// NB : ce fichier vit dans sources/lib/ et n'est PAS chargé comme source par le
// poller (scan limité aux fichiers .js du dossier sources/, hors sous-dossiers).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_URL =
  'https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours';
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min : succès partagé entre départements
const ERROR_TTL_MS = 60 * 1000;      // 1 min : évite 4 retries dans le même cycle en erreur

// Niveaux DPVigilance : 1 vert · 2 jaune · 3 orange · 4 rouge.
const COLOR_LABEL = { 3: 'ORANGE', 4: 'ROUGE' };
const NIVEAU_NOM = { 1: 'vert', 2: 'jaune', 3: 'orange', 4: 'rouge' };

const PHENOMENON_LABEL = {
  1: 'vent violent',
  2: 'pluie-inondation',
  3: 'orages',
  4: 'crues',
  5: 'neige-verglas',
  6: 'canicule',
  7: 'grand froid',
  8: 'avalanches',
  9: 'vagues-submersion',
};

// Émoji par type de phénomène (préfixe du message, phénomène le plus grave).
const PHENOMENON_EMOJI = {
  1: '💨', // vent
  2: '🌧️', // pluie-inondation
  3: '⛈️', // orages
  4: '🌊', // crues
  5: '❄️', // neige-verglas
  6: '🌡️', // canicule
  7: '🥶', // grand froid
  8: '🏔️', // avalanches
  9: '🌊', // vagues-submersion
};
const DEFAULT_EMOJI = '⛈️';

function labelForPhenomenon(id) {
  return PHENOMENON_LABEL[Number(id)] || `phénomène ${id}`;
}

// Émoji du phénomène le plus grave d'une échéance : couleur max, puis (à couleur
// égale) le plus petit identifiant de phénomène (ordre officiel Météo-France).
function emojiForEcheance(info) {
  if (!info || !info.phenomena || info.phenomena.size === 0) return DEFAULT_EMOJI;
  let bestId = null;
  let bestColor = -1;
  for (const [id, color] of info.phenomena) {
    const c = Number(color) || 0;
    const nid = Number(id);
    if (c > bestColor || (c === bestColor && (bestId === null || nid < bestId))) {
      bestColor = c;
      bestId = nid;
    }
  }
  return PHENOMENON_EMOJI[bestId] || DEFAULT_EMOJI;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ------------------------------------------------------------------ */
/* Cache mémoire mutualisé + fetch unique en vol.                      */
/* ------------------------------------------------------------------ */
let carteCache = { at: 0, payload: null, error: null };
let inflight = null;

async function doFetchCarte() {
  const apiKey = (process.env.METEOFRANCE_API_KEY || '').trim();
  if (!apiKey) throw new Error('METEOFRANCE_API_KEY absente de l\'environnement');

  // Un seul appel par cycle : ce log doit apparaître UNE fois pour tous les départements.
  console.log('[vigilance-factory] appel API Météo-France (carte vigilance, mutualisé)');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API_URL, {
      headers: { apikey: apiKey, Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API Météo-France (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API Météo-France échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Clé API Météo-France invalide ou non autorisée (HTTP ${res.status})`);
  }
  if (res.status === 429) throw new Error('Quota API Météo-France dépassé (HTTP 429)');
  if (!res.ok) throw new Error(`Réponse HTTP inattendue Météo-France : ${res.status} ${res.statusText}`);

  try {
    return await res.json();
  } catch (err) {
    throw new Error(`Réponse Météo-France illisible (JSON invalide) : ${err.message}`);
  }
}

// Renvoie la carte vigilance (payload), depuis le cache si frais, sinon un seul
// fetch partagé (les appels concurrents attendent la même promesse).
async function fetchCarte() {
  const now = Date.now();
  if (carteCache.payload && now - carteCache.at < CACHE_TTL_MS) return carteCache.payload;
  if (carteCache.error && now - carteCache.at < ERROR_TTL_MS) throw carteCache.error;
  if (inflight) return inflight;

  inflight = doFetchCarte()
    .then((payload) => { carteCache = { at: Date.now(), payload, error: null }; return payload; })
    .catch((err) => { carteCache = { at: Date.now(), payload: null, error: err }; throw err; })
    .finally(() => { inflight = null; });
  return inflight;
}

// Pour les tests : réinitialise le cache mutualisé.
function _resetCache() { carteCache = { at: 0, payload: null, error: null }; inflight = null; }

// Pour les tests : injecte une carte en cache (évite l'appel réseau / la clé API).
function _setCacheForTest(payload) { carteCache = { at: Date.now(), payload, error: null }; inflight = null; }

/* ------------------------------------------------------------------ */
/* Extraction par échéance (J / J1) pour un département donné.         */
/* ------------------------------------------------------------------ */
function summarizeEcheance(period, dept) {
  const out = { maxColor: 0, phenomena: new Map(), begin: null, end: null };
  const domains = period && period.timelaps && period.timelaps.domain_ids;
  if (!Array.isArray(domains)) return out;
  const d = domains.find((x) => String(x && x.domain_id) === dept);
  if (!d) return out;

  out.maxColor = Number(d.max_color_id) || 0;
  const items = Array.isArray(d.phenomenon_items) ? d.phenomenon_items : [];
  for (const it of items) {
    const c = Number(it.phenomenon_max_color_id) || 0;
    if (c >= 3) {
      const id = it.phenomenon_id;
      if (c > (out.phenomena.get(id) || 0)) out.phenomena.set(id, c);
    }
  }
  out.begin = parseDate(period.begin_validity_time);
  out.end = parseDate(period.end_validity_time);
  return out;
}

function extractByEcheance(payload, dept) {
  const periods = payload && payload.product && payload.product.periods;
  if (!Array.isArray(periods)) {
    throw new Error('Structure DPVigilance inattendue : product.periods manquant');
  }
  const byEch = { J: null, J1: null };
  for (const p of periods) {
    const ech = String(p && p.echeance || '').toUpperCase();
    if (ech === 'J' || ech === 'J1') byEch[ech] = summarizeEcheance(p, dept);
  }
  return byEch;
}

function phenomenaText(map) {
  const list = [...map.keys()].map(labelForPhenomenon);
  return list.length ? list.join(', ') : 'phénomène non précisé';
}

// Évalue l'état de vigilance d'UN département à partir de la carte déjà chargée.
// Logique commune aux sources broadcast (une par département) et à la source
// paramétrée (un département par combinaison). Retourne un état OpenAlert.
function evaluateDept(payload, dept, nomDepartement, publicUrl, logId) {
  const ech = extractByEcheance(payload, dept);
  const jColor = ech.J ? ech.J.maxColor : 0;
  const j1Color = ech.J1 ? ech.J1.maxColor : 0;

  // Log debug demandé : niveau de J et J1.
  console.log(`[poller] ${logId} : J=${NIVEAU_NOM[jColor] || 'vert'} J1=${NIVEAU_NOM[j1Color] || 'vert'}`);

  const lines = [];
  let since = null;
  let until = null;
  const active = []; // échéances actives, pour choisir l'émoji le plus grave
  const consider = (info, prefix) => {
    if (!info || info.maxColor < 3) return;
    const label = COLOR_LABEL[info.maxColor] || 'ORANGE';
    lines.push(`${prefix} vigilance ${label} dans ${nomDepartement} : ${phenomenaText(info.phenomena)}`);
    active.push(info);
    if (info.begin && (!since || info.begin < since)) since = info.begin;
    if (info.end && (!until || info.end > until)) until = info.end;
  };
  consider(ech.J, "Aujourd'hui :");
  consider(ech.J1, 'Demain :');

  if (lines.length === 0) {
    return { state: 'inactive', since: null, until: null, message: null, url: publicUrl };
  }

  // Émoji du phénomène le plus grave, toutes échéances actives confondues.
  const merged = new Map();
  for (const info of active) {
    for (const [id, color] of info.phenomena) {
      const c = Number(color) || 0;
      if (c > (merged.get(id) || 0)) merged.set(id, c);
    }
  }
  const emoji = emojiForEcheance({ phenomena: merged });

  return { state: 'active', since, until, message: `${emoji} ${lines.join('\n')}`, url: publicUrl };
}

/**
 * Crée une source de vigilance broadcast pour un département (chemin v1, inchangé).
 * @param {string} dept              code département ('05', '13', ...)
 * @param {string} nomDepartement    libellé pour le message ('les Hautes-Alpes', 'Paris'...)
 * @param {string} slugUrl           slug de l'URL publique ('hautes-alpes'...)
 * @returns {{ id: string, check: () => Promise<object> }}
 */
function createVigilanceSource(dept, nomDepartement, slugUrl) {
  const id = `vigilance-meteo-${dept}`;
  const publicUrl = `https://vigilance.meteofrance.fr/fr/${slugUrl}`;

  async function check() {
    const payload = await fetchCarte(); // mutualisé (1 appel pour tous les départements)
    return evaluateDept(payload, dept, nomDepartement, publicUrl, id);
  }

  return { id, check };
}

/**
 * Crée une source de vigilance PARAMÉTRÉE (OpenAlert v2) : un seul objet source
 * dont l'état est évalué par combinaison { departement }. Réutilise le cache
 * mutualisé → UN appel Météo-France par cycle quel que soit le nombre de
 * départements souscrits.
 * @param {{ id:string, nameFor:(code:string)=>string, urlFor:(code:string)=>string,
 *           paramsSchema:object }} cfg
 * @returns {{ id:string, paramsSchema:object, checkWithParams:(list:Array<object>)=>Promise<Array<object>> }}
 */
function createVigilanceParamSource(cfg) {
  const { id, nameFor, urlFor, paramsSchema } = cfg;

  // paramsList : combinaisons EFFECTIVEMENT souscrites, ex [{departement:'05'}, ...].
  async function checkWithParams(paramsList) {
    const list = Array.isArray(paramsList) ? paramsList : [];
    if (list.length === 0) return [];
    const payload = await fetchCarte(); // un seul appel, partagé entre toutes les combinaisons
    return list.map((params) => {
      const dept = String(params && params.departement || '');
      const res = evaluateDept(payload, dept, nameFor(dept), urlFor(dept), `${id}[${dept}]`);
      return Object.assign({ params }, res);
    });
  }

  return { id, paramsSchema, checkWithParams };
}

module.exports = { createVigilanceSource, createVigilanceParamSource, evaluateDept, _resetCache, _setCacheForTest };
