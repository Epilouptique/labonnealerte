// Source calculée : Fête de la science (métropole).
// TODO 2027 : mettre à jour les dates depuis fetedelascience.fr.
const { createCalendarSource } = require('./lib/calendar-factory');

function events(now) {
  // 2026 métropole : du 2 au 12 octobre inclus → end = 13 oct 00h.
  return [
    { start: new Date(2026, 9, 2), end: new Date(2026, 9, 13) },
  ].filter((e) => e.end.getTime() >= now.getTime());
}

module.exports = createCalendarSource({
  id: 'fete-science',
  announceDays: 7,
  url: 'https://www.fetedelascience.fr/',
  events,
  message(ev, phase) {
    return phase === 'during'
      ? '🔬 La Fête de la science bat son plein — ateliers, visites et rencontres gratuits partout en France (thème « Saveurs savantes »)'
      : '🔬 La Fête de la science approche (du 2 au 12 octobre) — ateliers et visites gratuits partout en France, thème « Saveurs savantes »';
  },
});
