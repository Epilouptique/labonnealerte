// Source calculée : Beaujolais nouveau — 3e jeudi de novembre (calculé).
const { createCalendarSource, nthWeekday, formatAvecJour } = require('./lib/calendar-factory');

function sorties(now) {
  const y = now.getFullYear();
  return [y, y + 1]
    .map((year) => ({ start: nthWeekday(year, 10, 4, 3, 0) })) // novembre, jeudi, 3e
    .filter((e) => e.start.getTime() >= now.getTime() - 24 * 3600 * 1000)
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'beaujolais-nouveau',
  announceDays: 2,
  url: 'https://www.beaujolais.com',
  events: sorties,
  message(ev) {
    return `🍷 Le Beaujolais nouveau arrive ${formatAvecJour(ev.start)} ! Cette année encore, on nous promet des notes de banane. On y croit.`;
  },
});
