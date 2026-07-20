// Source PARAMÉTRÉE (OpenAlert v2) : surveillance de DISPONIBILITÉ d'un domaine au
// choix de l'abonné (carte « webmaster/pro »). La personne saisit un domaine ; la
// source devient active (panne) s'il répond en 4xx/5xx, en timeout, ou ne répond
// plus du tout (DNS/injoignable).
//
// ⚠️ CHANTIER SENSIBLE : le domaine est fourni par l'utilisateur → protections
// anti-SSRF OBLIGATOIRES. On passe par safeProbe (safe-fetch.js) qui rejette les IP
// privées/loopback/lien-local (à chaque saut de redirection), impose un timeout et
// ne télécharge pas le corps. https forcé.
//
// ── ANTI-SPAM : 2 ÉCHECS CONSÉCUTIFS avant alerte ────────────────────────────
// On ne bricole PAS de compteur maison : on réutilise la machine à états du poller.
// La source est déclarée requires_confirmation = TRUE (init.sql). Le poller applique
// alors decideTransition : inactive --(échec)--> PENDING (observation, SANS alerte)
// --(2e échec consécutif)--> ACTIVE (alerte). Un seul succès entre les deux ramène à
// inactive. C'est exactement « 2 échecs consécutifs » (2 cycles de poll = ~1h ici).
//   • Domaine déjà en panne AU MOMENT DE L'AJOUT : pas de ligne d'état → 'inactive' ;
//     le 1er check tombe donc en PENDING (silencieux), jamais en alerte immédiate.
//   • Résolution : dès que le domaine répond (2xx/3xx après redirection), le résultat
//     repasse 'inactive' → le poller déactive proprement l'alerte.

const { safeProbe } = require('../safe-fetch');
const { DOMAIN_RE, DOMAIN_PATTERN, normalizeDomain, horodatage } = require('./lib/domaine');

const TIMEOUT_MS = 7_000;
const CACHE_TTL_MS = 5 * 60 * 1000; // TTL court (< cycle de poll de 30 min → probe frais/cycle)
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

const paramsSchema = [
  {
    key: 'domaine',
    label: 'Domaine à surveiller',
    type: 'string',
    placeholder: 'annad.fr',
    pattern: DOMAIN_PATTERN,
    lowercase: true,
    multiple: true,
    required: true,
    default: null,
    hint: 'Le nom de domaine seul, sans https:// (exemple : annad.fr). Alerte si le site répond en erreur (4xx/5xx) ou ne répond plus, confirmée sur deux vérifications.',
  },
];

// Cache par domaine : domaine → { at, result }.
const cache = new Map();

function inactive(domaine) {
  return { state: 'inactive', since: null, until: null, message: null, url: 'https://' + domaine };
}

// Motif d'échec lisible pour le message.
function raison(probe) {
  if (probe.timedOut) return 'délai dépassé';
  if (probe.status) return 'erreur HTTP ' + probe.status;
  return probe.error || 'injoignable';
}

async function probeDomaine(domaine) {
  const probe = await safeProbe('https://' + domaine, { timeoutMs: TIMEOUT_MS });
  if (probe.ok) return inactive(domaine); // le site répond (2xx/3xx) → rien à signaler
  const now = new Date();
  return {
    state: 'active', // « panne » ; l'alerte réelle n'est envoyée qu'après confirmation (pending→active)
    since: now,
    until: null,
    message: `🔴 Le domaine ${domaine} ne répond plus (${raison(probe)}). Détecté le ${horodatage(now)}.`,
    url: 'https://' + domaine,
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  let fetches = 0;
  const out = [];

  for (const params of combos) {
    const domaine = normalizeDomain(params && params.domaine);
    if (!DOMAIN_RE.test(domaine)) { out.push(Object.assign({ params }, inactive(domaine || 'inconnu'))); continue; }

    const cached = cache.get(domaine);
    if (cached && now - cached.at < CACHE_TTL_MS) {
      out.push(Object.assign({ params }, cached.result));
      continue;
    }
    if (fetches >= MAX_FETCH) {
      out.push(Object.assign({ params }, cached ? cached.result : inactive(domaine)));
      continue;
    }
    fetches += 1;
    const result = await probeDomaine(domaine);
    cache.set(domaine, { at: Date.now(), result });
    out.push(Object.assign({ params }, result));
  }
  if (combos.length > MAX_FETCH) {
    console.warn(`[domaine-disponibilite] ${combos.length} domaines suivis, ${MAX_FETCH} vérifiés ce cycle.`);
  }
  return out;
}

module.exports = { id: 'domaine-disponibilite', paramsSchema, checkWithParams };
