// Source PARAMÉTRÉE (OpenAlert v2) : niveau de restriction sécheresse (arrêté
// préfectoral) pour le DÉPARTEMENT au choix. Le pendant « arrêté officiel par
// département » de VigiEau (qui, lui, donne les restrictions d'usage par COMMUNE).
//
// DISTINCTION avec la source `vigieau` (à préciser dans les deux descriptions) :
//   • risque-secheresse (ici) = niveau de gravité AGRÉGÉ par département issu des
//     arrêtés préfectoraux (ex-« Propluvia ») — vue d'ensemble départementale ;
//   • vigieau = restrictions d'usage INDIVIDUELLES par commune (code INSEE).
//
// API publique officielle, SANS clé (constaté 07/2026) — un SEUL appel mutualisé
// pour toute la France, filtré ensuite par département souscrit :
//   GET https://api.vigieau.gouv.fr/api/departements
//   → [{ code:"03", nom:"Allier", niveauGraviteMax:"crise", ... }, ...]
// Niveaux : vigilance | alerte | alerte_renforcee | crise. Anti-spam : on n'active
// QU'À PARTIR de « alerte » (la simple vigilance est ignorée). MAJ quotidienne (J-1).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { DEPARTEMENTS } = require('../geo');

const API_URL = 'https://api.vigieau.gouv.fr/api/departements';
const PUBLIC_URL = 'https://vigieau.gouv.fr';
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 appel/heure suffit (donnée quotidienne)

const SEVERITY = { vigilance: 1, alerte: 2, alerte_renforcee: 3, crise: 4 };
const LABEL = { alerte: 'ALERTE', alerte_renforcee: 'ALERTE RENFORCÉE', crise: 'CRISE' };
const IMPLICATION = {
  alerte: 'arrosage et remplissage des piscines restreints',
  alerte_renforcee: 'arrosage interdit en journée, lavages et piscines limités',
  crise: 'tous les usages non prioritaires de l\'eau sont interdits',
};

const NAME = {};
DEPARTEMENTS.forEach((d) => { NAME[d.code] = d.name; });

const paramsSchema = [
  {
    key: 'departement',
    label: 'Département',
    type: 'enum',
    values: DEPARTEMENTS.map((d) => ({ value: d.code, label: d.name })),
    multiple: true,
    required: true,
    default: null,
  },
];

// Cache mutualisé du dernier appel (code → niveauGraviteMax).
let cache = { at: 0, byCode: null };

function inactive(params) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

async function fetchDepartements() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API VigiEau (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API VigiEau échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue VigiEau : ${res.status}`);
  const payload = await res.json();
  if (!Array.isArray(payload)) throw new Error('Réponse VigiEau inattendue (tableau attendu)');
  const byCode = {};
  for (const d of payload) {
    if (d && d.code != null) byCode[String(d.code)] = d.niveauGraviteMax || null;
  }
  return byCode;
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];

  // Un seul appel mutualisé, mis en cache : aucune corrélation au nombre d'abonnés.
  if (!cache.byCode || Date.now() - cache.at >= CACHE_TTL_MS) {
    cache = { at: Date.now(), byCode: await fetchDepartements() };
  }
  const byCode = cache.byCode;

  return combos.map((params) => {
    const dep = String((params && params.departement) || '');
    const niveau = byCode[dep];
    const rank = SEVERITY[niveau] || 0;
    if (rank < 2) return inactive(params); // aucune donnée / vigilance simple → inactif
    const nom = NAME[dep] || ('département ' + dep);
    return {
      params,
      state: 'active',
      since: null,
      until: null,
      message: `🏜️ Sécheresse — niveau ${LABEL[niveau] || niveau.toUpperCase()} dans ${nom} : ${IMPLICATION[niveau] || 'usages de l\'eau restreints'} (arrêté préfectoral en vigueur)`,
      url: PUBLIC_URL,
    };
  });
}

module.exports = { id: 'risque-secheresse', paramsSchema, checkWithParams };
