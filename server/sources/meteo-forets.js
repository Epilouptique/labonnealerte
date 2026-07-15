// Source PARAMÉTRÉE (OpenAlert v2) : Météo des forêts (risque feux de forêt,
// Météo-France), DÉPARTEMENT au choix. Actif si danger TRÈS ÉLEVÉ (rouge)
// UNIQUEMENT (anti-spam). Publiée juin→septembre, silencieuse hors saison.
//
// ⚠️ PRÊTE-À-BRANCHER : produit Météo-France « DonneesPubliquesMeteoForets »
// nécessitant une SOUSCRIPTION portail distincte → clé env METEOFRANCE_FORETS_API_KEY.
// Sans clé → no-op silencieux. Enum limité aux départements les plus exposés
// (arc méditerranéen + Sud) ; extensible. Passer enabled=true après souscription.
//
// ⚠️ TODO à la souscription : confirmer l'URL exacte de l'endpoint temps réel et le
// nom du champ de niveau de danger (échelle 1..4 : faible/modéré/élevé/très élevé)
// dans la réponse — le mapping ci-dessous (niveau 4 = très élevé) est à valider.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const KEY = (process.env.METEOFRANCE_FORETS_API_KEY || '').trim();
// URL de base à confirmer au moment de la souscription (produit id 309).
const BASE = (process.env.METEOFRANCE_FORETS_URL || 'https://public-api.meteofrance.fr/public/DPMeteoForets/v1/departement').replace(/\/$/, '');
const PUBLIC_URL = 'https://meteofrance.com/meteo-des-forets';
const TIMEOUT_MS = 10_000;
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);
const SEUIL = 4; // 4 = très élevé (rouge)

// Départements les plus exposés au risque feux de forêt.
const DEPTS = [
  { value: '04', label: 'Alpes-de-Haute-Provence' }, { value: '05', label: 'Hautes-Alpes' },
  { value: '06', label: 'Alpes-Maritimes' }, { value: '07', label: 'Ardèche' },
  { value: '11', label: 'Aude' }, { value: '13', label: 'Bouches-du-Rhône' },
  { value: '26', label: 'Drôme' }, { value: '2A', label: 'Corse-du-Sud' },
  { value: '2B', label: 'Haute-Corse' }, { value: '30', label: 'Gard' },
  { value: '34', label: 'Hérault' }, { value: '48', label: 'Lozère' },
  { value: '66', label: 'Pyrénées-Orientales' }, { value: '83', label: 'Var' },
  { value: '84', label: 'Vaucluse' },
];
const NAME = {};
DEPTS.forEach((d) => { NAME[d.value] = d.label; });

const paramsSchema = [
  { key: 'departement', label: 'Département', type: 'enum', values: DEPTS, multiple: true, required: true, default: null },
];

function isEnabled() { return !!KEY; }
function inactive(params) { return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

// Extrait le niveau de danger max d'une réponse (JSON best-effort : cherche un
// champ numérique de niveau/danger). À affiner selon la structure réelle.
function maxDanger(payload) {
  let max = 0;
  const scan = (v) => {
    if (v == null) return;
    if (Array.isArray(v)) return v.forEach(scan);
    if (typeof v === 'object') {
      for (const k of Object.keys(v)) {
        if (/niveau|danger|risque/i.test(k)) {
          const n = parseInt(v[k], 10);
          if (!Number.isNaN(n) && n > max && n <= 4) max = n;
        }
        scan(v[k]);
      }
    }
  };
  scan(payload);
  return max;
}

async function checkOne(params) {
  const dep = String((params && params.departement) || '');
  if (!NAME[dep]) return inactive(params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(`${BASE}/${encodeURIComponent(dep)}`, {
      headers: { apikey: KEY, Accept: 'application/json' }, signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout Météo forêts (dep ${dep})`);
    throw new Error(`Appel Météo forêts échoué (dep ${dep}) : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204 || res.status === 404) return inactive(params); // hors saison
  if (!res.ok) throw new Error(`Réponse HTTP inattendue Météo forêts (dep ${dep}) : ${res.status}`);

  let payload;
  try { payload = await res.json(); } catch (err) { throw new Error(`JSON invalide (dep ${dep})`); }
  if (maxDanger(payload) < SEUIL) return inactive(params);

  return {
    params, state: 'active', since: new Date(), until: null,
    message: `🔥 Danger feux de forêt TRÈS ÉLEVÉ dans le ${NAME[dep]} — évitez tout feu, prudence absolue`,
    url: PUBLIC_URL,
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (!KEY) return combos.map(inactive); // no-op sans souscription
  let list = combos.length > MAX_COMBOS ? combos.slice(0, MAX_COMBOS) : combos;
  const settled = await Promise.allSettled(list.map(checkOne));
  const out = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') out.push(r.value);
    else console.warn(`[meteo-forets] ${JSON.stringify(list[i])} : ${r.reason && r.reason.message}`);
  });
  return out;
}

module.exports = { id: 'meteo-forets', paramsSchema, checkWithParams, isEnabled };
