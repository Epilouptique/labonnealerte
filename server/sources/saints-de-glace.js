// Source calculée : Saints de glace — 11, 12, 13 mai (récurrent).
const { createCalendarSource } = require('./lib/calendar-factory');

function evenements(now) {
  const y = now.getFullYear();
  return [y, y + 1]
    .map((year) => ({ start: new Date(year, 4, 11), end: new Date(year, 4, 14) }))
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'saints-de-glace',
  announceDays: 2,
  url: 'https://www.gammvert.fr/',
  events: evenements,
  message() {
    return "🌱 Les Saints de glace (11-13 mai) — la sagesse paysanne dit d'attendre avant de planter les plants fragiles";
  },
});
