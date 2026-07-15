// Source calculée : Braderie de Lille — dates officielles.
// TODO 2027.
const { createCalendarSource } = require('./lib/calendar-factory');

function events(now) {
  return [
    // Braderie de Lille 2026 : 5 et 6 septembre 2026.
    { start: new Date(2026, 8, 5), end: new Date(2026, 8, 7) },
  ]
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'braderie-lille',
  announceDays: 3,
  url: 'https://www.lille.fr/Braderie-de-Lille',
  events,
  message() {
    return '🛍️ La Braderie de Lille ce week-end — la plus grande brocante d\'Europe';
  },
});
