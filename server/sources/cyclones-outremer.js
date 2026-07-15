// Source PARAMÉTRÉE (OpenAlert v2) — PRÊTE À BRANCHER, désactivée par défaut.
// Vigilance / alerte CYCLONIQUE outre-mer, TERRITOIRE au choix. Actif à partir de
// l'alerte (orange+ / pré-alerte cyclonique dépassée) ; les niveaux de veille
// ordinaires sont ignorés (anti-spam).
//
// ⚠️ NÉCESSITE UNE ACTION HUGO (aucune clé nouvelle codée ici) :
//   La vigilance outre-mer de Météo-France N'EST PAS couverte par la clé
//   DPVigilance métropole existante. Deux voies, toutes deux à débloquer :
//     1) Flux public `vigilance.meteofrance.com/data/vigilance_OM.zip` (+ ...
//        _controle.txt) — mais LICENCE de diffusion requise (vd@meteo.fr), et
//        format ZIP (JSON Antilles-Guyane / Océan Indien, XML NC & St-Pierre).
//     2) API portail « Bulletin Vigilance » (portail-api.meteofrance.fr) couvrant
//        l'outre-mer — SOUSCRIPTION DÉDIÉE à créer.
//   => Renseigner l'URL d'un endpoint JSON outre-mer dans la variable
//      d'environnement METEOFRANCE_VIGILANCE_OM_URL (et, si portail, la clé via
//      METEOFRANCE_API_KEY déjà présente, envoyée en header `apikey`). Sans URL,
//      la source est un no-op (tout inactif). Le PARSER ci-dessous est codé à la
//      spec (descriptif_technique_vigilance_outre_mer_v5) : dès l'URL branchée et
//      la source passée enabled=true, elle fonctionne.
//
// ÉCARTÉS : Nouvelle-Calédonie (flux XML + alerte du ressort du gouvernement NC) et
// Polynésie française (aucun flux JSON/XML public) — hors périmètre, documenté.
const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const OM_URL = (process.env.METEOFRANCE_VIGILANCE_OM_URL || '').trim();
const API_KEY = (process.env.METEOFRANCE_API_KEY || '').trim();
const PUBLIC_URL = 'https://vigilance.meteofrance.fr/fr';
const TIMEOUT_MS = 12_000;
const PHENO_CYCLONE = 10; // identifiant du phénomène « alerte cyclonique »

// Territoires couverts par un flux JSON structuré (domain_id Météo-France).
const TERRITOIRES = [
  { value: 'guadeloupe', label: 'Guadeloupe', domain: 'VIGI971', oceanIndien: false, url: `${PUBLIC_URL}/guadeloupe` },
  { value: 'martinique', label: 'Martinique', domain: 'VIGI972', oceanIndien: false, url: `${PUBLIC_URL}/martinique` },
  { value: 'guyane', label: 'Guyane', domain: 'VIGI973', oceanIndien: false, url: `${PUBLIC_URL}/guyane` },
  { value: 'la-reunion', label: 'La Réunion', domain: 'VIGI974', oceanIndien: true, url: `${PUBLIC_URL}/la-reunion` },
  { value: 'mayotte', label: 'Mayotte', domain: 'VIGI976', oceanIndien: true, url: `${PUBLIC_URL}/mayotte` },
  { value: 'iles-du-nord', label: 'Îles du Nord (St-Martin / St-Barthélemy)', domain: 'VIGI978', oceanIndien: false, url: `${PUBLIC_URL}` },
];
const BY_VALUE = {};
TERRITOIRES.forEach((t) => { BY_VALUE[t.value] = t; });

const paramsSchema = [
  {
    key: 'territoire',
    label: 'Territoire',
    type: 'enum',
    values: TERRITOIRES.map((t) => ({ value: t.value, label: t.label })),
    multiple: true,
    required: true,
    default: null,
  },
];

// Échelle SPÉCIFIQUE alerte cyclonique Océan Indien (phénomène 10).
const CYCLONE_LABEL = { 7: 'pré-alerte cyclonique', 8: 'alerte orange cyclonique', 9: 'alerte rouge cyclonique', 10: 'alerte violette cyclonique', 6: 'phase de sauvegarde' };
// Échelle vigilance normale (Antilles-Guyane : le cyclone y est intégré).
const COULEUR_LABEL = { 3: 'orange', 4: 'rouge', 5: 'violet' };

function parseDate(v) { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
function inactive(params) { return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

// Trouve le domaine du territoire dans une période DPVigilance-like.
function findDomain(payload, domain) {
  const periods = (payload && payload.product && payload.product.periods) || payload.periods || [];
  for (const p of Array.isArray(periods) ? periods : []) {
    const domains = (p.timelaps && p.timelaps.domain_ids) || p.domain_ids || [];
    const d = (Array.isArray(domains) ? domains : []).find((x) => String(x && x.domain_id) === domain);
    if (d) return { d, begin: parseDate(p.begin_validity_time), end: parseDate(p.end_validity_time) };
  }
  return null;
}

// Évalue un territoire ; renvoie un état actif si alerte cyclonique / vigilance orange+.
function evaluate(payload, terr) {
  const found = findDomain(payload, terr.domain);
  if (!found) return null;
  const items = Array.isArray(found.d.phenomenon_items) ? found.d.phenomenon_items : [];
  const cyclone = items.find((it) => Number(it.phenomenon_id) === PHENO_CYCLONE);

  if (terr.oceanIndien) {
    // Océan Indien : échelle cyclonique dédiée ; alerte effective à partir de 8.
    const val = cyclone ? Number(cyclone.phenomenon_max_color_id) : -1;
    if (val >= 8) return { label: CYCLONE_LABEL[val] || `alerte cyclonique (niveau ${val})`, begin: found.begin, end: found.end };
    return null;
  }
  // Antilles-Guyane : cyclone intégré dans l'échelle vigilance normale (orange = 3+).
  const maxColor = Number(found.d.max_color_id) || 0;
  const cycloneColor = cyclone ? Number(cyclone.phenomenon_max_color_id) : 0;
  const level = Math.max(maxColor, cycloneColor);
  if (level >= 3) return { label: `vigilance ${COULEUR_LABEL[level] || 'orange'}`, begin: found.begin, end: found.end };
  return null;
}

async function fetchOM() {
  const headers = { Accept: 'application/json' };
  if (API_KEY) headers.apikey = API_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(OM_URL, { headers, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout Vigilance OM (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel Vigilance OM échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue Vigilance OM : ${res.status}`);
  return res.json();
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];
  // No-op tant que l'endpoint outre-mer n'est pas branché (voir en-tête).
  if (!OM_URL) return combos.map(inactive);

  let payload;
  try { payload = await fetchOM(); }
  catch (err) { console.warn(`[cyclones-outremer] ${err.message}`); return combos.map(inactive); }

  return combos.map((p) => {
    const terr = BY_VALUE[String((p && p.territoire) || '')];
    if (!terr) return inactive(p);
    let evalRes = null;
    try { evalRes = evaluate(payload, terr); } catch (err) { console.warn(`[cyclones-outremer] ${terr.value} : ${err.message}`); }
    if (!evalRes) return inactive(p);
    return {
      params: p,
      state: 'active',
      since: evalRes.begin,
      until: evalRes.end,
      message: `🌀 ${terr.label} : ${evalRes.label} — suivez les consignes officielles.`,
      url: terr.url,
    };
  });
}

module.exports = { id: 'cyclones-outremer', paramsSchema, checkWithParams };
