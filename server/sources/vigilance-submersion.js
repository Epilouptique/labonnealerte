// Source PARAMÉTRÉE (OpenAlert v2) : vigilance VAGUES-SUBMERSION (submersion marine /
// tempête littorale, Météo-France), RÉGION CÔTIÈRE au choix. Actif si vigilance orange ou
// rouge (niveau ≥ 3) pour ce phénomène dans au moins un département côtier de la région.
//
// ⚠️ ENUM LIMITÉ AUX 8 RÉGIONS CÔTIÈRES (les régions sans littoral sont volontairement
// absentes de la liste de valeurs). Les valeurs sont les NOMS EXACTS de server/geo.js
// (subdivision IPLocate) → le pré-remplissage profil par région matche silencieusement.
//
// ⚠️ PRÊTE-À-BRANCHER : produit Météo-France DPVigilance (portail public-api.meteofrance.fr)
// → clé gratuite METEOFRANCE_VIGILANCE_API_KEY (même mécanisme apikey que meteo-forets /
// risque-avalanche). Sans clé → no-op silencieux (toutes les combinaisons inactive).
//
// API : GET https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours
//   → JSON. Le phénomène « Vagues-Submersion » porte l'ID « 9 » (1-Vent, 2-Pluie-inondation,
//     3-Orages, 4-Inondation, 5-Neige, 6-Canicule, 7-Grand-froid, 8-Avalanches,
//     9-Vagues-Submersion). Couleurs : 1 vert · 2 jaune · 3 orange · 4 rouge.
// ⚠️ TODO à la souscription : VALIDER sur une réponse réelle la structure exacte
//   (product.periods[].timelaps.domain_ids[].phenomenon_items[] avec domain_id = code
//   département, phenomenon_id, phenomenon_max_color_id). Le parsing ci-dessous est
//   DÉFENSIF (scan tolérant) mais à confirmer clé en main.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { REGION_DEPTS } = require('../geo');

const KEY = (process.env.METEOFRANCE_VIGILANCE_API_KEY || '').trim();
const API_URL = (process.env.METEOFRANCE_VIGILANCE_URL
  || 'https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours').replace(/\/$/, '');
const PUBLIC_URL = 'https://vigilance.meteofrance.fr/fr';
const TIMEOUT_MS = 10_000;
const PHENO_SUBMERSION = '9';
const SEUIL = 3; // orange (3) ou rouge (4)
const COLOR_LABEL = { 3: 'ORANGE', 4: 'ROUGE' };

// 8 régions côtières uniquement (noms EXACTS de geo.js). On dérive leurs départements
// via REGION_DEPTS (source unique dept↔région).
const REGIONS_COTIERES = [
  'Hauts-de-France',
  'Normandie',
  'Bretagne',
  'Pays de la Loire',
  'Nouvelle-Aquitaine',
  'Occitanie',
  "Provence-Alpes-Côte d'Azur",
  'Corse',
];

const paramsSchema = [
  {
    key: 'region',
    label: 'Région',
    type: 'enum',
    values: REGIONS_COTIERES.map((r) => ({ value: r, label: r })),
    multiple: true,
    required: true,
    default: null,
  },
];

function inactive(params) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

// Scan DÉFENSIF de la réponse DPVigilance : construit une map code_département → couleur
// max du phénomène vagues-submersion (ID 9), toutes échéances confondues (pire cas).
function submersionByDept(payload) {
  const byDept = {};
  const visit = (node) => {
    if (node == null) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node !== 'object') return;
    // Un « domaine » (département) porte un domain_id + une liste de phénomènes.
    const domainId = node.domain_id != null ? String(node.domain_id) : null;
    const items = node.phenomenon_items || node.phenomenons_items || node.phenomenons;
    if (domainId && Array.isArray(items)) {
      for (const it of items) {
        if (!it) continue;
        const pid = String(it.phenomenon_id != null ? it.phenomenon_id : it.phenomenonId);
        if (pid !== PHENO_SUBMERSION) continue;
        const c = parseInt(it.phenomenon_max_color_id != null ? it.phenomenon_max_color_id : it.max_color_id, 10);
        if (Number.isFinite(c) && (byDept[domainId] == null || c > byDept[domainId])) byDept[domainId] = c;
      }
    }
    for (const k of Object.keys(node)) visit(node[k]);
  };
  visit(payload);
  return byDept;
}

// Cache mutualisé (1 appel/cycle pour toute la France).
let cache = { at: 0, byDept: null };
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 min (< cycle de poll 30 min)

async function fetchVigilance() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API_URL, { headers: { apikey: KEY, Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timeout DPVigilance');
    throw new Error('Appel DPVigilance échoué : ' + err.message);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error('Réponse HTTP inattendue DPVigilance : ' + res.status);
  return submersionByDept(await res.json());
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];
  if (!KEY) return combos.map(inactive); // no-op sans souscription (prête-à-brancher)

  if (!cache.byDept || Date.now() - cache.at >= CACHE_TTL_MS) {
    try {
      cache = { at: Date.now(), byDept: await fetchVigilance() };
    } catch (err) {
      console.warn('[vigilance-submersion] ' + err.message + ' → inactive.');
      return combos.map(inactive);
    }
  }
  const byDept = cache.byDept;

  return combos.map((params) => {
    const region = String((params && params.region) || '');
    const depts = REGION_DEPTS[region];
    if (!Array.isArray(depts)) return inactive(params); // région hors enum
    // Pire couleur du phénomène 9 parmi les départements de la région.
    let color = 0;
    for (const d of depts) { const c = byDept[d] || 0; if (c > color) color = c; }
    if (color < SEUIL) return inactive(params);
    return {
      params,
      state: 'active',
      since: new Date(),
      until: null,
      message: `🌊 Vigilance ${COLOR_LABEL[color] || 'ORANGE'} vagues-submersion en ${region} — risque de submersion marine sur le littoral, éloignez-vous des côtes exposées`,
      url: PUBLIC_URL,
    };
  });
}

module.exports = { id: 'vigilance-submersion', paramsSchema, checkWithParams };
