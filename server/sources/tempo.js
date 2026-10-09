// Source interne : jour Tempo EDF ROUGE demain — électricité au tarif fort.
//
// La source de référence est RTE « Tempo Like Supply Contract » (data.rte-france.com,
// réutiliserait rte-auth.js getToken()), mais elle nécessite une souscription au
// portail RTE. En attendant, on utilise le repli communautaire api-couleur-tempo.fr,
// public et SANS clé (badge verified côté init.sql) :
//   GET https://www.api-couleur-tempo.fr/api/jourTempo/tomorrow
//     → { "dateJour": "2026-07-16", "codeJour": 1, "periode": "...", "libCouleur": "Bleu" }
//   codeJour : 0=inconnu (non publié), 1=Bleu, 2=Blanc, 3=Rouge.
//
// On n'alerte QUE sur les jours ROUGES (codeJour === 3) : bleus/blancs et non-publiés
// sont ignorés (anti-spam). La source est naturellement en sommeil l'été (les jours
// rouges vont de novembre à mars) — c'est normal.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_URL = 'https://www.api-couleur-tempo.fr/api/jourTempo/tomorrow';
const PUBLIC_URL = 'https://www.api-couleur-tempo.fr/';
const TIMEOUT_MS = 8_000;

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
    // Réseau / timeout : on PROPAGE (incident de surveillance). Le poller journalise un 'failed',
    // conserve l'état précédent et ne notifie personne. Renvoyer inactive() masquait la panne.
    if (err.name === 'AbortError') throw new Error(`Timeout api-couleur-tempo (>${TIMEOUT_MS} ms)`);
    throw new Error('Appel api-couleur-tempo échoué : ' + err.message);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error('tempo : réponse HTTP ' + res.status);

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error('tempo : réponse JSON illisible');
  }

  // Seul le rouge (codeJour 3) déclenche. 0 (non publié), 1 (bleu), 2 (blanc) → ignorés.
  if (!payload || payload.codeJour !== 3) return inactive();

  const now = new Date();
  // Fin de journée de demain (couvre toute la journée rouge).
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 0, 0, 0);

  return {
    state: 'active',
    since: now,
    until: tomorrow,
    message: '🔴 Demain : jour Tempo ROUGE — électricité au tarif fort de 6h à 22h, limitez les gros usages',
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'tempo', check };
