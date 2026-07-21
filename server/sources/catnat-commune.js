// Source PARAMÉTRÉE (OpenAlert v2) — vague VILLE : arrêtés de catastrophe naturelle (CatNat)
// pour la COMMUNE au choix. Alerte quand un NOUVEL arrêté est publié pour la commune (utile
// pour les démarches d'assurance : un arrêté CatNat ouvre un délai de déclaration). Fonctionne
// jusqu'au petit village.
//
// Champ paramètre de type 'commune' : nom de ville saisi/pré-rempli → résolu en CODE INSEE à
// la souscription (lib/commune-insee). Ici on ne reçoit que des codes INSEE.
//
// API publique officielle, SANS clé : Géorisques (BRGM / Ministère Transition écologique)
//   GET https://georisques.gouv.fr/api/v1/gaspar/catnat?code_insee=<INSEE>
//   → data[] d'arrêtés : date_publication_jo (DD/MM/YYYY), libelle_risque_jo (type de
//     catastrophe), libelle_commune, code_national_catnat…
//
// ── INITIALISATION SANS FAUSSE ALERTE RÉTROACTIVE (POINT CRITIQUE) ────────────
// Une commune a souvent un HISTORIQUE riche d'arrêtés (inondations, sécheresse…). Au 1er
// passage, on MÉMORISE la date de l'arrêté le PLUS RÉCENT comme RÉFÉRENCE, SANS alerter :
// surtout NE PAS remonter tout l'historique comme des alertes. Seul un arrêté PLUS RÉCENT que
// cette référence (donc publié APRÈS la souscription) déclenche. Cache mémoire (comme
// veille-rss) : un redémarrage ré-initialise la référence → on peut manquer un arrêté publié
// pendant l'arrêt, jamais en inventer un (direction SÛRE).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { rememberName, nameForInsee } = require('./lib/commune-insee');

const API = 'https://georisques.gouv.fr/api/v1/gaspar/catnat';
const PUBLIC_URL = 'https://www.georisques.gouv.fr/';
const TIMEOUT_MS = 10_000;
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

// Cache par INSEE : { lastKey } (clé YYYYMMDD de l'arrêté le plus récent vu = référence).
const cache = new Map();

function inactive(params) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

// "DD/MM/YYYY" → clé comparable "YYYYMMDD" (ou "0" si illisible).
function dateKey(fr) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(fr || ''));
  return m ? m[3] + m[2] + m[1] : '0';
}

async function fetchArretes(insee) {
  const url = API + '?code_insee=' + encodeURIComponent(insee) + '&page=1&page_size=200';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) return [];
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const body = await res.json();
  return Array.isArray(body.data) ? body.data : [];
}

async function checkOne(params) {
  const insee = String((params && params.commune) || '').trim().toUpperCase();
  const arretes = await fetchArretes(insee);
  if (!arretes.length) return inactive(params);

  // Arrêté le plus récent (par date de publication au Journal Officiel).
  let latest = null; let latestKey = '0';
  for (const a of arretes) {
    const k = dateKey(a.date_publication_jo || a.date_publication_arrete);
    if (k > latestKey) { latestKey = k; latest = a; }
  }
  if (!latest) return inactive(params);
  if (latest.libelle_commune) rememberName(insee, latest.libelle_commune);

  const prev = cache.get(insee);
  // 1er passage : mémorise la référence SANS alerter (pas de remontée de l'historique).
  if (!prev) { cache.set(insee, { lastKey: latestKey }); return inactive(params); }
  if (latestKey <= prev.lastKey) return inactive(params); // déjà vu / plus ancien
  // NOUVEL arrêté publié après la souscription → alerte.
  cache.set(insee, { lastKey: latestKey });

  const nom = latest.libelle_commune || nameForInsee(insee) || ('commune ' + insee);
  const type = String(latest.libelle_risque_jo || 'catastrophe naturelle').trim();
  const dateFr = String(latest.date_publication_jo || latest.date_publication_arrete || '').trim();
  return {
    params,
    state: 'active',
    since: new Date(),
    until: null,
    message: `⚠️ Nouvel arrêté de catastrophe naturelle pour ${nom} (${type}, publié le ${dateFr}). Un arrêté CatNat ouvre un délai pour déclarer les dommages à votre assurance.`,
    url: PUBLIC_URL,
  };
}

async function checkWithParams(paramsList) {
  let combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length > MAX_COMBOS) {
    console.warn(`[catnat-commune] ${combos.length} communes suivies — plafonné à ${MAX_COMBOS} ce cycle.`);
    combos = combos.slice(0, MAX_COMBOS);
  }
  const settled = await Promise.allSettled(combos.map(checkOne));
  const out = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') out.push(r.value);
    else { console.warn(`[catnat-commune] ${JSON.stringify(combos[i])} : ${r.reason && r.reason.message}`); out.push(inactive(combos[i])); }
  });
  return out;
}

module.exports = { id: 'catnat-commune', paramsSchema: [
  { key: 'commune', label: 'Commune', type: 'commune', placeholder: 'Votre commune', multiple: true, required: true, default: null,
    hint: 'Le nom de votre commune (ou une autre). Alerte à la publication d’un nouvel arrêté de catastrophe naturelle.' },
], checkWithParams };
