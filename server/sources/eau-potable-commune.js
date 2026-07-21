// Source PARAMÉTRÉE (OpenAlert v2) — vague VILLE : qualité de l'eau potable pour la COMMUNE
// au choix. Alerte quand un NOUVEAU contrôle sanitaire déclare l'eau NON CONFORME aux limites
// de qualité (bactériologique ou physico-chimique). Fonctionne jusqu'au petit village.
//
// Champ paramètre de type 'commune' : l'abonné saisit/pré-remplit un NOM de ville, résolu en
// CODE INSEE à la souscription (lib/commune-insee, via la route) ; la valeur stockée est
// l'INSEE. Ici on ne reçoit donc que des codes INSEE.
//
// API publique officielle, SANS clé : Hub'Eau (Office français de la biodiversité)
//   GET https://hubeau.eaufrance.fr/api/v1/qualite_eau_potable/resultats_dis?code_commune=<INSEE>
//   &size=1&sort=desc → dernier prélèvement. Champs de conformité au niveau prélèvement :
//   conformite_limites_bact_prelevement / conformite_limites_pc_prelevement = 'C' (conforme)
//   ou 'N' (NON conforme). On alerte sur 'N' aux LIMITES (dépassement sanitaire réel) ; les
//   « références » (indicatives) sont ignorées (anti-bruit).
//
// ── INITIALISATION SANS FAUSSE ALERTE ────────────────────────────────────────
// Au 1er passage sur une commune, on MÉMORISE la date du dernier prélèvement connu comme
// RÉFÉRENCE, SANS alerter (même s'il est non conforme) : on ne veut pas remonter un contrôle
// antérieur à la souscription. Seul un prélèvement PLUS RÉCENT et non conforme déclenche.
// Cache mémoire (comme veille-rss) : un redémarrage ré-initialise la référence → on peut
// manquer un contrôle survenu pendant l'arrêt, jamais en inventer un (direction SÛRE).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { rememberName, nameForInsee } = require('./lib/commune-insee');

const API = 'https://hubeau.eaufrance.fr/api/v1/qualite_eau_potable/resultats_dis';
const PUBLIC_URL = 'https://orobnat.sante.gouv.fr/orobnat/';
const TIMEOUT_MS = 10_000;
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Cache par INSEE : { lastDate } (date ISO du dernier prélèvement vu = référence).
const cache = new Map();

function inactive(params) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

function formatFr(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

// Récupère le dernier prélèvement d'une commune (ou null si aucun / erreur → propagée).
async function fetchLatest(insee) {
  const url = API + '?code_commune=' + encodeURIComponent(insee)
    + '&size=1&sort=desc&fields=date_prelevement,conclusion_conformite_prelevement,'
    + 'conformite_limites_bact_prelevement,conformite_limites_pc_prelevement,nom_commune';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  // 206 = résultat partiel (pagination) mais exploitable ; 200 OK.
  if (res.status !== 200 && res.status !== 206) throw new Error('HTTP ' + res.status);
  const body = await res.json();
  const rows = Array.isArray(body.data) ? body.data : [];
  return rows[0] || null;
}

// Une analyse est « non conforme » si une LIMITE de qualité (bact ou physico-chimique) est
// dépassée ('N'). Repli défensif sur le texte de conclusion.
function isNonConforme(rec) {
  if (!rec) return false;
  if (rec.conformite_limites_bact_prelevement === 'N') return true;
  if (rec.conformite_limites_pc_prelevement === 'N') return true;
  const c = String(rec.conclusion_conformite_prelevement || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /non\s*-?\s*conforme/.test(c);
}

async function checkOne(params) {
  const insee = String((params && params.commune) || '').trim().toUpperCase();
  const rec = await fetchLatest(insee);
  if (!rec || !rec.date_prelevement) return inactive(params); // aucune donnée pour cette commune
  if (rec.nom_commune) rememberName(insee, rec.nom_commune);

  const date = String(rec.date_prelevement);
  const prev = cache.get(insee);
  // 1er passage : mémorise la référence SANS alerter (pas de remontée rétroactive).
  if (!prev) { cache.set(insee, { lastDate: date }); return inactive(params); }
  // Analyse déjà vue (ou plus ancienne) → rien.
  if (date <= prev.lastDate) return inactive(params);
  // NOUVEAU prélèvement : on met à jour la référence, et on alerte SEULEMENT s'il est non conforme.
  cache.set(insee, { lastDate: date });
  if (!isNonConforme(rec)) return inactive(params);

  const nom = rec.nom_commune || nameForInsee(insee) || ('commune ' + insee);
  return {
    params,
    state: 'active',
    since: new Date(date),
    until: null,
    message: `💧 L'eau potable de ${nom} a été déclarée NON CONFORME lors du dernier contrôle sanitaire (${formatFr(date)}). Renseignez-vous auprès de votre mairie / ARS.`,
    url: PUBLIC_URL,
  };
}

async function checkWithParams(paramsList) {
  let combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length > MAX_COMBOS) {
    console.warn(`[eau-potable-commune] ${combos.length} communes suivies — plafonné à ${MAX_COMBOS} ce cycle.`);
    combos = combos.slice(0, MAX_COMBOS);
  }
  const settled = await Promise.allSettled(combos.map(checkOne));
  const out = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') out.push(r.value);
    else { console.warn(`[eau-potable-commune] ${JSON.stringify(combos[i])} : ${r.reason && r.reason.message}`); out.push(inactive(combos[i])); }
  });
  return out;
}

module.exports = { id: 'eau-potable-commune', paramsSchema: [
  { key: 'commune', label: 'Commune', type: 'commune', placeholder: 'Votre commune', multiple: true, required: true, default: null,
    hint: 'Le nom de votre commune (ou une autre). Alerte si un contrôle sanitaire déclare l’eau du robinet non conforme.' },
], checkWithParams };
