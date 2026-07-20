// Source : actualités officielles service-public.gouv.fr (particuliers). BROADCAST,
// pattern « dernier item frais » (cert-fr généralisé).
//
// Flux RSS 2.0 vérifié live le 20/07/2026 (10 items, dates ISO par item) :
//   https://www.service-public.gouv.fr/abonnements/rss/actu-actualites-particuliers.rss
// Annonces pratiques/réglementaires du quotidien (ARS, Livret A, IRL, frais bancaires,
// « ce qui change »…), plusieurs items/semaine.
//
// ── DISTINCTION AVEC ce-qui-change.js (NON-DOUBLON) ──────────────────────────
// ce-qui-change.js est une source CALENDAIRE (calcul zéro API) qui, autour du 1er de
// chaque mois, invite à consulter la page actualités (12 rappels/an, génériques). Elle
// NE consomme PAS ce flux RSS et n'en reproduit AUCUN item. La présente source pousse
// les items INDIVIDUELS au fil de l'eau (cadence et granularité différentes). Les deux
// sont complémentaires, pas un doublon — cf. rapport de fin.

const { createRssAlerteSource, shorten } = require('./lib/rss-alerte');

module.exports = createRssAlerteSource({
  id: 'service-public-actualites',
  urls: ['https://www.service-public.gouv.fr/abonnements/rss/actu-actualites-particuliers.rss'],
  url: 'https://www.service-public.gouv.fr/particuliers/actualites',
  freshDays: 3,
  format: (it) => `📋 Service-public : ${shorten(it.title)}`,
});
