// Source calculée : Semaine du goût — dates officielles.
// TODO 2027.
const { createCalendarSource } = require('./lib/calendar-factory');

function events(now) {
  return [
    // Semaine du goût 2026 : 12 au 18 octobre 2026.
    { start: new Date(2026, 9, 12), end: new Date(2026, 9, 19) },
  ]
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'semaine-du-gout',
  announceDays: 5,
  url: 'https://www.legout.com/',
  events,
  message(ev, phase) {
    return phase === 'during'
      ? '🍴 La Semaine du goût, c\'est en ce moment — ateliers, dégustations et éveil au bien manger'
      : '🍴 La Semaine du goût du 12 au 18 octobre — ateliers, dégustations et éveil au bien manger';
  },
});
