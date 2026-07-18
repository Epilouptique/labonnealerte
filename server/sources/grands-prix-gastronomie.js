// Source calculée : grands rendez-vous de la gastronomie mondiale. Fenêtre J-3 → jour J.
// Dates VÉRIFIÉES :
//   • The World's 50 Best Restaurants 2026 : 4 novembre 2026, à Lima (theworlds50best.com).
//   • Bocuse d'Or (BIENNAL, années impaires) — finale internationale au SIRHA Lyon :
//     24-25 janvier 2027 (sirha-lyon.com).
// TODO : éditions suivantes à leur annonce officielle (50 Best 2027, Bocuse d'Or 2029) —
// non annoncées au 18/07/2026, aucune date inventée.
const { createCalendarSource, formatJourMois } = require('./lib/calendar-factory');

const CATALOGUE = [
  {
    name: 'The World\'s 50 Best Restaurants',
    emoji: '🍽️',
    detail: 'le palmarès mondial est dévoilé à Lima',
    start: new Date(2026, 10, 4),
  },
  {
    name: 'Bocuse d\'Or',
    emoji: '🍽️',
    detail: 'la finale internationale du concours se tient au SIRHA, à Lyon',
    start: new Date(2027, 0, 24),
    end: new Date(2027, 0, 26),
  },
];

function events(now) {
  return CATALOGUE
    .map((e) => ({ ...e, end: e.end instanceof Date ? e.end : e.start }))
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'grands-prix-gastronomie',
  announceDays: 3,
  url: 'https://www.sirha-lyon.com/',
  events,
  message(ev, phase) {
    const quand = phase === 'during' ? 'En ce moment' : `Le ${formatJourMois(ev.start)}`;
    return `${ev.emoji} ${quand} : ${ev.name} — ${ev.detail}`;
  },
});
