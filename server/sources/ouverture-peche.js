// Source calculée : ouverture de la pêche en 1re catégorie — 2e samedi de mars.
// Cadre national ; dates fixées par arrêté préfectoral (adaptations locales).
const { createCalendarSource, nthWeekday } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

function evenements(now) {
  const y = now.getFullYear();
  return [y, y + 1]
    .map((year) => {
      const samedi2 = nthWeekday(year, 2, 6, 2); // mars, samedi, 2e
      return { start: samedi2, end: new Date(samedi2.getTime() + DAY_MS) };
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'ouverture-peche',
  announceDays: 3,
  url: 'https://www.service-public.fr/',
  events: evenements,
  message() {
    return '🎣 Ouverture de la pêche en 1re catégorie ce samedi (sauf adaptations préfectorales)';
  },
});
