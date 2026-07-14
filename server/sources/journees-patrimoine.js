// Source calculée : Journées européennes du patrimoine — 3e week-end de septembre.
const { createCalendarSource, nthWeekday } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

function weekends(now) {
  const y = now.getFullYear();
  return [y, y + 1]
    .map((year) => {
      const samedi3 = nthWeekday(year, 8, 6, 3); // septembre, samedi, 3e
      // Actif tout le week-end : fin = lundi 00h (couvre samedi ET dimanche).
      return { start: samedi3, end: new Date(samedi3.getTime() + 2 * DAY_MS) };
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'journees-patrimoine',
  announceDays: 7,
  url: 'https://journeesdupatrimoine.culture.gouv.fr/',
  events: weekends,
  message() {
    return '🏛️ Journées du patrimoine ce week-end — monuments et lieux habituellement fermés ouverts gratuitement';
  },
});
