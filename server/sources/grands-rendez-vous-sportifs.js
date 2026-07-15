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
