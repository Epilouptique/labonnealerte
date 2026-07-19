// Source calculée : événements de théâtre. Fenêtre veille + jour J (announceDays 1)
// pour la journée mondiale (date fixe), J-3 pour un festival daté.
//
// DATES VÉRIFIÉES le 19/07/2026 (jamais de mémoire) :
//   - Journée mondiale du théâtre : 27 mars, date fixe annuelle depuis 1962
//     (Institut International du Théâtre / partenaire UNESCO) — world-theatre-day.org (CONFIRMÉ).
// TODO (non annoncés au 19/07/2026, sites officiels n'affichent que 2026) :
//   - Festival d'Avignon In 2027 (festival-avignon.com)
//   - Festival d'Avignon Off 2027 (festivaloffavignon.com)
//   - Molières 2027 (lesmolieres.com — annoncés à la conf. de presse des nominations)
//   - Nuits de Fourvière 2027, Lyon (nuitsdefourviere.com)
// → à ajouter dès publication.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

function events(now) {
  const y = now.getFullYear();
  // Journée mondiale du théâtre : 27 mars, chaque année (année en cours + suivante).
  return [y, y + 1]
    .map((year) => {
      const start = new Date(year, 2, 27);
      return { start, end: new Date(start.getTime() + DAY_MS) };
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'theatre-evenements',
  announceDays: 1, // veille + jour J
  url: 'https://www.world-theatre-day.org/fr/',
  events,
  message(ev, phase) {
    if (phase === 'before') return '🎭 Demain, la Journée mondiale du théâtre (27 mars).';
    return '🎭 Journée mondiale du théâtre — un art vivant célébré partout dans le monde.';
  },
});
