// Source API « PRÊTE À BRANCHER » (désactivée dans init.sql : enabled = false).
// Objectif : signaler la publication mensuelle de l'Indice des prix à la
// consommation (IPC) pour le Québec — angle inflation, distinct de tout le reste
// du pack (météo, pannes, fériés). L'IPC est produit par Statistique Canada et
// relayé par l'Institut de la statistique du Québec (ISQ), qui publie un calendrier
// de diffusion mensuel.
//
// Vérifié le 2026-07-19 : un calendrier de diffusion PUBLIC existe (ISQ, « Dates de
// diffusion des principaux indicateurs économiques »), mais AUCUN flux machine-
// lisible (JSON/CSV/API) stable n'a été confirmé au moment de la recherche. On ne
// code donc aucune date en dur (convention Bison Futé : pas de date de mémoire).
//
// TODO daté (2026-07-19) pour activer la source :
//   - Brancher l'API WDS de Statistique Canada (getDataFromVectorsAndLatestNPeriods /
//     getSeriesInfoFromVector) pour l'IPC Québec, OU parser le calendrier de
//     diffusion ISQ si un flux exploitable est confirmé.
//   - Décider l'angle d'alerte : simple rappel de publication mensuelle, OU seuil
//     (variation annuelle au-delà d'un plancher). Ne pas inventer de seuil.
//   - Sources : statistique.quebec.ca (calendrier de diffusion) ;
//     www.statcan.gc.ca/fr/developpeurs/wds (API WDS).
const PUBLIC_URL = 'https://statistique.quebec.ca/fr/produit/tableau/dates-de-diffusion-des-principaux-indicateurs-economiques';

// Tant que le flux n'est pas branché, la source reste inactive (et désactivée en base).
async function check() {
  return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

module.exports = { id: 'ipc-quebec', check };
