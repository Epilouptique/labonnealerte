// Source calculée : grands festivals — dates officielles annoncées.
// TODO Festival d'Avignon 2027 (non annoncé), éditions suivantes.
const { createCalendarSource } = require('./lib/calendar-factory');

function events(now) {
  return [
    // Festival de Cannes 2027 : 11 au 22 mai 2027.
    { name: 'Cannes', start: new Date(2027, 4, 11), end: new Date(2027, 4, 23) },
  ]
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'grands-festivals',
  announceDays: 3,
  url: 'https://www.festival-cannes.com/',
  events,
  message() {
    return '🎬 Le Festival de Cannes ouvre ses portes (11-22 mai)';
  },
});
