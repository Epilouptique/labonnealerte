// Source calculée : grands rendez-vous sportifs (ton neutre, factuel, sans chauvinisme).
// Fenêtre d'annonce : la veille + le jour J.
const { createCalendarSource } = require('./lib/calendar-factory');

// Dates vérifiées, saisies en dur (aucune date inventée).
// TODO 2027+ (ajouter les autres grands rendez-vous chaque année).
function events(now) {
  const list = [
    {
      name: 'Coupe du monde 2026 — petite finale',
      start: new Date(2026, 6, 18),
      end: new Date(2026, 6, 19),
      message: '⚽ Aujourd\'hui : petite finale de la Coupe du monde (match pour la 3e place)',
    },
    {
      name: 'Coupe du monde 2026 — finale',
      start: new Date(2026, 6, 19),
      end: new Date(2026, 6, 20),
      message: '⚽ Aujourd\'hui : finale de la Coupe du monde de football',
    },
    {
      name: 'Tour de France 2026 — arrivée à Paris',
      start: new Date(2026, 6, 26),
      end: new Date(2026, 6, 27),
      message: '🚴 Aujourd\'hui : arrivée du Tour de France sur les Champs-Élysées',
    },
    // — Ajouts 2026-2027, chaque date VÉRIFIÉE sur le site officiel de l'organisateur —
    // Prix de l'Arc de Triomphe : dim 4 octobre 2026, ParisLongchamp (France Galop).
    {
      name: 'Prix de l\'Arc de Triomphe 2026',
      start: new Date(2026, 9, 4),
      end: new Date(2026, 9, 5),
      message: '🏇 Aujourd\'hui : le Prix de l\'Arc de Triomphe à ParisLongchamp',
    },
    // Route du Rhum 2026 (13e éd.) : départ dim 1er novembre 2026 de Saint-Malo (officiel).
    {
      name: 'Route du Rhum 2026 — départ',
      start: new Date(2026, 10, 1),
      end: new Date(2026, 10, 2),
      message: '⛵ Aujourd\'hui : départ de la Route du Rhum de Saint-Malo, cap sur la Guadeloupe',
    },
    // 24 Heures du Mans 2027 (95e) : course les 12-13 juin 2027 (ACO, officiel).
    {
      name: '24 Heures du Mans 2027',
      start: new Date(2027, 5, 13),
      end: new Date(2027, 5, 14),
      message: '🏁 Aujourd\'hui : arrivée des 24 Heures du Mans',
    },
    // Roland-Garros 2027 : finale dim 6 juin 2027 (fenêtre officielle rolandgarros.com).
    {
      name: 'Roland-Garros 2027 — finale',
      start: new Date(2027, 5, 6),
      end: new Date(2027, 5, 7),
      message: '🎾 Aujourd\'hui : finale de Roland-Garros',
    },
    // CAN 2027 (Kenya/Tanzanie/Ouganda) : ouverture 19 juin, finale 17 juillet 2027 (CAF).
    {
      name: 'CAN 2027 — match d\'ouverture',
      start: new Date(2027, 5, 19),
      end: new Date(2027, 5, 20),
      message: '⚽ Aujourd\'hui : coup d\'envoi de la Coupe d\'Afrique des Nations 2027',
    },
    {
      name: 'CAN 2027 — finale',
      start: new Date(2027, 6, 17),
      end: new Date(2027, 6, 18),
      message: '⚽ Aujourd\'hui : finale de la Coupe d\'Afrique des Nations',
    },
    // — Ajouts vague sport (dates officielles confirmées ; NB : l'entrée « Tour 2026
    //   arrivée Paris » ci-dessus s'auto-périme via le filtre end >= now après juillet
    //   2026 ; le Tour 2027 est ajouté ci-dessous, pas de doublon) —
    // Tournoi des Six Nations 2027 : 5 février - 13 mars 2027 (sixnationsrugby.com) → on annonce l'ouverture.
    {
      name: 'Tournoi des Six Nations 2027 — ouverture',
      start: new Date(2027, 1, 5),
      end: new Date(2027, 1, 6),
      message: '🏉 Aujourd\'hui : coup d\'envoi du Tournoi des Six Nations 2027',
    },
    // Finale Coupe de France 2026-27 : sam 15 mai 2027, Stade de France (fff.fr).
    //   (Distincte de la finale 2025-26 du 22 mai 2026, déjà passée.)
    {
      name: 'Finale de la Coupe de France 2027',
      start: new Date(2027, 4, 15),
      end: new Date(2027, 4, 16),
      message: '⚽ Aujourd\'hui : finale de la Coupe de France, au Stade de France',
    },
    // Roland-Garros 2027 : ouverture du tableau dim 23 mai 2027 (rolandgarros.com).
    //   La finale (6 juin) est déjà présente ci-dessus — ici on élargit à l'ouverture.
    {
      name: 'Roland-Garros 2027 — ouverture',
      start: new Date(2027, 4, 23),
      end: new Date(2027, 4, 24),
      message: '🎾 Aujourd\'hui : ouverture de Roland-Garros (premier tour)',
    },
    // Tour de France 2027 : grand départ 2 juillet (Édimbourg) → arrivée Paris 25 juillet
    //   (letour.fr). Bornes départ/arrivée ; le passage par département reste géré par
    //   tour-de-france-passage.js (source distincte).
    {
      name: 'Tour de France 2027 — grand départ',
      start: new Date(2027, 6, 2),
      end: new Date(2027, 6, 3),
      message: '🚴 Aujourd\'hui : grand départ du Tour de France 2027, depuis Édimbourg',
    },
    {
      name: 'Tour de France 2027 — arrivée à Paris',
      start: new Date(2027, 6, 25),
      end: new Date(2027, 6, 26),
      message: '🚴 Aujourd\'hui : arrivée du Tour de France à Paris',
    },
    // UEFA Euro 2028 (Royaume-Uni/Irlande) : 9 juin - 9 juillet 2028 (uefa.com) → ouverture.
    {
      name: 'Euro 2028 — match d\'ouverture',
      start: new Date(2028, 5, 9),
      end: new Date(2028, 5, 10),
      message: '⚽ Aujourd\'hui : match d\'ouverture de l\'Euro 2028 de football',
    },
    // Vendée Globe 2028 : départ dim 12 novembre 2028, 13h02 des Sables-d'Olonne (vendeeglobe.org).
    {
      name: 'Vendée Globe 2028 — départ',
      start: new Date(2028, 10, 12),
      end: new Date(2028, 10, 13),
      message: '⛵ Aujourd\'hui : départ du Vendée Globe des Sables-d\'Olonne',
    },
    // Coupe du monde 2030 (Espagne/Portugal/Maroc) : 8 juin - 21 juillet 2030 (inside.fifa.com) → ouverture.
    {
      name: 'Coupe du monde 2030 — match d\'ouverture',
      start: new Date(2030, 5, 8),
      end: new Date(2030, 5, 9),
      message: '⚽ Aujourd\'hui : coup d\'envoi de la Coupe du monde 2030',
    },
    // ⚠️ TODO : Marathon de Paris 2027 (annoncé ~11 avril 2027 mais NON confirmé sur le
    //   site officiel schneiderelectricparismarathon.com) → à ajouter après vérification.
    // ⚠️ TODO : Molières / Victoires de la musique / BD Angoulême 2027 → voir sources dédiées.
    // ⚠️ TODO : Rallye Dakar 2027 → date non confirmée (dakar.com bloque les robots), à revérifier.
    // ⚠️ TODO : Grand Prix de France de F1 → retiré du calendrier 2026, calendrier 2027 non publié.
  ];

  return list
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'grands-rendez-vous-sportifs',
  announceDays: 2,
  url: 'https://www.sports.gouv.fr/',
  events,
  message(ev) {
    return ev.message;
  },
});
