// Source : alertes & informations de sécurité de l'ANSM (médicaments et dispositifs
// médicaux). BROADCAST (pas de paramétrage), pattern cert-fr-alertes généralisé.
//
// COMPLÉMENTAIRE, PAS REDONDANT avec rappel-conso : RappelConso (DGCCRF) EXCLUT les
// médicaments et dispositifs médicaux — ceux-ci relèvent exclusivement de l'ANSM.
// Confirmé le 20/07/2026 (rappel-conso.js : catégories alimentation/maison/électrique/
// … sans « médicaments »).
//
// Deux flux RSS surveillés (fusionnés), vérifiés live le 20/07/2026 :
//   • https://ansm.sante.fr/rss/actualites            (actualités du jour : ruptures,
//     disponibilité, mesures d'accompagnement…)
//   • https://ansm.sante.fr/rss/informations_securite (signaux de sécurité, retraits,
//     alertes dispositifs/médicaments)
// Volume très faible (~1 item/flux), donc peu de bruit : on retient l'item le plus
// récent et on reste actif 72 h (fenêtre d'épisode). Poll quotidien suffisant.

const { createRssAlerteSource, shorten } = require('./lib/rss-alerte');

module.exports = createRssAlerteSource({
  id: 'ansm-rappels-medicaments',
  urls: [
    'https://ansm.sante.fr/rss/actualites',
    'https://ansm.sante.fr/rss/informations_securite',
  ],
  url: 'https://ansm.sante.fr/actualites',
  freshDays: 3,
  // Les deux flux ANSM sont déjà éditorialisés (pas de communiqués marketing) : on
  // garde tout item daté. Le tri par fraîcheur fait le reste.
  format: (it) => `💊 ANSM : ${shorten(it.title)}`,
});
