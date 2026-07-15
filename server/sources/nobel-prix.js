// Source calculée : semaine des annonces des prix Nobel.
// TODO 2027 : mettre à jour les dates depuis nobelprize.org.
const { createCalendarSource } = require('./lib/calendar-factory');

function events(now) {
  // 2026 : Médecine 5 oct. → Économie 12 oct. Un seul événement couvrant la
  // semaine ; announceDays 2 → actif du 3 au 12 oct. inclus (end = 13 oct 00h).
  return [
    { start: new Date(2026, 9, 5), end: new Date(2026, 9, 13) },
  ].filter((e) => e.end.getTime() >= now.getTime());
}

module.exports = createCalendarSource({
  id: 'nobel-prix',
  announceDays: 2,
  url: 'https://www.nobelprize.org/',
  events,
  message(ev, phase) {
    return phase === 'during'
      ? '🏅 C\'est la semaine des prix Nobel — les lauréats 2026 sont dévoilés jour après jour (médecine, physique, chimie, littérature, paix, économie)'
      : '🏅 La semaine des prix Nobel commence lundi — les lauréats 2026 dévoilés du 5 au 12 octobre';
  },
});
