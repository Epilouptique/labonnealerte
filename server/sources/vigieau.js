// Source PARAMÉTRÉE (OpenAlert v2) : VigiEau — restrictions d'usage de l'eau
// (sécheresse) pour la commune (code INSEE) au choix de l'abonné. Remplace la
// source broadcast vigieau-gap (migrée vers {commune:"05061"} + désactivée).
//
// API publique officielle, SANS clé :
//   GET https://api.vigieau.gouv.fr/api/zones?commune=<INSEE>
// Constats d'exploration (juillet 2026) :
//   - réponse = tableau JSON de zones (niveauGravite vigilance|alerte|
//     alerte_renforcee|crise, arrete{dateDebutValidite,dateFinValidite}) ;
//   - commune inconnue / aucune restriction → HTTP 200 + [] (PAS de 404) ;
//   - certaines communes multi-zones renvoient HTTP 409 → traité comme
//     « indéterminé » (inactif), jamais un crash ;
//   - INSEE Corse 2A/2B accepté ; rate-limit large (300/fenêtre), CORS *.
//
// CONTRAINTE APPELS : 1 appel réseau par commune (aucune mutualisation possible).
// On plafonne le nombre de combinaisons interrogées par cycle (MAX_COMBOS, même
// env que les sources externes) et on isole les échecs (Promise.allSettled) —
// les combinaisons non traitées ce cycle le seront aux suivants.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { DEPARTEMENTS } = require('../geo');

const API_BASE = 'https://api.vigieau.gouv.fr/api/zones?commune=';
const PUBLIC_URL = 'https://vigieau.gouv.fr';
const TIMEOUT_MS = 10_000;
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

const SEVERITY = { vigilance: 1, alerte: 2, alerte_renforcee: 3, crise: 4 };
const LABEL = { alerte: 'ALERTE', alerte_renforcee: 'ALERTE RENFORCÉE', crise: 'CRISE' };
const IMPLICATION = {
  alerte: 'arrosage et remplissage des piscines restreints',
  alerte_renforcee: 'arrosage interdit en journée, lavages et piscines limités',
  crise: 'tous les usages non prioritaires de l\'eau sont interdits',
};

// Schéma déclaré (identique à init.sql). Type string : code INSEE (5 caractères,
// dont 2A/2B pour la Corse). pattern honoré côté plateforme (schéma interne).
const paramsSchema = [
  {
    key: 'commune',
    label: 'Code commune (INSEE)',
    type: 'string',
    placeholder: '05061',
    pattern: '^(?:[0-9]{2}|2[AB])[0-9]{3}$',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'Code INSEE à 5 caractères (≠ code postal). Ex. Gap = 05061.',
  },
];

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inactive(params) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

// Nom de commune inconnu (l'API ne renvoie pas toujours nom_commune) → on affiche
// le code. Le libellé résolu de la notif vient du schéma (resolveLabel) côté poller.
async function checkOne(params) {
  const insee = String((params && params.commune) || '').trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API_BASE + encodeURIComponent(insee), {
      headers: { Accept: 'application/json' }, signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API VigiEau (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API VigiEau échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  // 404 (ancien comportement) OU 409 (commune multi-zones, l'API refuse de
  // trancher) → indéterminé = inactif (jamais de crash, jamais de fausse alerte).
  if (res.status === 404 || res.status === 409) return inactive(params);
  if (!res.ok) throw new Error(`Réponse HTTP inattendue VigiEau : ${res.status} ${res.statusText}`);

  let payload;
  try { payload = await res.json(); }
  catch (err) { throw new Error(`Réponse VigiEau illisible (JSON invalide) : ${err.message}`); }

  const zones = Array.isArray(payload) ? payload : (payload && payload.zones) || [];
  if (!Array.isArray(zones) || zones.length === 0) return inactive(params); // [] = RAS

  let best = null;
  let bestRank = 0;
  for (const z of zones) {
    const rank = SEVERITY[z && z.niveauGravite] || 0;
    if (rank > bestRank) { bestRank = rank; best = z; }
  }
  if (bestRank < 2 || !best) return inactive(params); // vigilance/aucun → inactif

  const niveau = best.niveauGravite;
  const arrete = best.arrete || {};
  const commune = (best.nom || best.nomCommune || '').toString().trim();
  const where = commune ? ` à ${commune}` : '';
  return {
    params,
    state: 'active',
    since: parseDate(arrete.dateDebutValidite),
    until: parseDate(arrete.dateFinValidite),
    message: `💧 Restrictions d'eau${where} : niveau ${LABEL[niveau] || niveau.toUpperCase()} — ${IMPLICATION[niveau] || 'usages de l\'eau restreints'}`,
    url: PUBLIC_URL,
  };
}

async function checkWithParams(paramsList) {
  let combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length > MAX_COMBOS) {
    console.warn(`[vigieau] ${combos.length} communes souscrites — plafonné à ${MAX_COMBOS} ce cycle (les autres aux cycles suivants).`);
    combos = combos.slice(0, MAX_COMBOS);
  }
  const settled = await Promise.allSettled(combos.map(checkOne));
  const out = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') out.push(r.value);
    else console.warn(`[vigieau] ${JSON.stringify(combos[i])} : ${r.reason && r.reason.message}`);
  });
  return out;
}

module.exports = { id: 'vigieau', paramsSchema, checkWithParams };
