// Source calculée : 1er avril (zéro API). Fenêtre veille + jour J (annonce J-1).
// Ton complice : méfiance générale… sauf envers vos alertes.

const { createCalendarSource } = require('./lib/calendar-factory');

function events(now) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const y = now.getFullYear();
  return [y, y + 1]
    .map(function (year) {
      const start = new Date(year, 3, 1); // 1er avril
      return { start: start, end: new Date(start.getTime() + DAY_MS) }; // actif tout le jour J
    })
    .filter(function (e) { return e.end.getTime() >= now.getTime(); });
}

module.exports = createCalendarSource({
  id: 'premier-avril',
  announceDays: 1,
  url: 'https://fr.wikipedia.org/wiki/Poisson_d%27avril',
  events: events,
  message: function (ev, phase) {
    if (phase === 'during') {
      return '🐟 Poisson d’avril ! Méfiez-vous de tout ce que vous lisez aujourd’hui… sauf de vos alertes.';
    }
    return '🐟 Demain, c’est le 1er avril : préparez vos poissons (et gardez confiance en vos alertes).';
  },
});
