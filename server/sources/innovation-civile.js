// Source calculée : journées de l'innovation et de l'aviation civile. Fenêtre J-2 → jour J.
//   • Journée mondiale de la propriété intellectuelle : 26 avril (fixe, OMPI)
//   • Journée internationale de l'aviation civile : 7 décembre (fixe, OACI)
const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const EMO = '💡';

function events(now) {
  const y = now.getFullYear();
  const out = [];
  for (const year of [y, y + 1]) {
    out.push({ nom: 'Journée mondiale de la propriété intellectuelle', start: new Date(year, 3, 26), end: new Date(year, 3, 27) });
    out.push({ nom: "Journée internationale de l'aviation civile", start: new Date(year, 11, 7), end: new Date(year, 11, 8) });
  }
  return out.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'innovation-civile',
  announceDays: 2,
  url: 'https://www.wipo.int/',
  events,
  message(ev, phase) {
    if (phase === 'during') return `${EMO} Aujourd'hui : ${ev.nom}.`;
    return `${EMO} ${ev.nom} : ${formatAvecJour(ev.start)}.`;
  },
});
