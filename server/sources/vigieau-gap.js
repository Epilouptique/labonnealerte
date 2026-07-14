// Source interne : VigiEau — restrictions d'usage de l'eau (sécheresse) pour
// Gap et ses environs (commune INSEE 05061).
//
// API publique officielle, SANS clé :
//   GET https://api.vigieau.gouv.fr/api/zones?commune=05061
// Réponse : tableau de zones d'alerte (types SOU/SUP/AEP), chacune avec
//   niveauGravite : 'vigilance' | 'alerte' | 'alerte_renforcee' | 'crise'
//   arrete : { dateDebutValidite (YYYY-MM-DD), dateFinValidite, ... }
// 404 (ou aucune zone) = aucune restriction en vigueur = situation normale.
//
// On prend le niveau le plus grave parmi toutes les zones. 'vigilance' est exclu
// (cohérent avec notre règle du jaune) ; 'alerte'/'alerte_renforcee'/'crise' →
// actif. check() rapporte l'état instantané ; la transition vit dans le poller.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_URL = 'https://api.vigieau.gouv.fr/api/zones?commune=05061';
const PUBLIC_URL = 'https://vigieau.gouv.fr';
const TIMEOUT_MS = 10_000;

// Gravité croissante ; 'vigilance' est sous notre seuil.
const SEVERITY = { vigilance: 1, alerte: 2, alerte_renforcee: 3, crise: 4 };
const LABEL = { alerte: 'ALERTE', alerte_renforcee: 'ALERTE RENFORCÉE', crise: 'CRISE' };
const IMPLICATION = {
  alerte: 'arrosage et remplissage des piscines restreints',
  alerte_renforcee: 'arrosage interdit en journée, lavages et piscines limités',
  crise: 'tous les usages non prioritaires de l\'eau sont interdits',
};

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

async function check() {
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

  // 404 = aucune zone d'alerte pour cette commune → situation normale.
  if (res.status === 404) return inactive();
  if (!res.ok) throw new Error(`Réponse HTTP inattendue VigiEau : ${res.status} ${res.statusText}`);

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error(`Réponse VigiEau illisible (JSON invalide) : ${err.message}`);
  }

  const zones = Array.isArray(payload) ? payload : (payload && payload.zones) || [];
  if (!Array.isArray(zones) || zones.length === 0) return inactive();

  // Zone la plus grave.
  let best = null;
  let bestRank = 0;
  for (const z of zones) {
    const rank = SEVERITY[z && z.niveauGravite] || 0;
    if (rank > bestRank) { bestRank = rank; best = z; }
  }

  if (bestRank < 2 || !best) return inactive(); // vigilance ou aucun → inactif

  const niveau = best.niveauGravite;
  const arrete = best.arrete || {};
  return {
    state: 'active',
    since: parseDate(arrete.dateDebutValidite),
    until: parseDate(arrete.dateFinValidite),
    message: `💧 Restrictions d'eau à Gap : niveau ${LABEL[niveau] || niveau.toUpperCase()} — ${IMPLICATION[niveau] || 'usages de l\'eau restreints'}`,
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'vigieau-gap', check };
