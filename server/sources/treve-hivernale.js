// Source calculée : trêve hivernale — début 1er novembre, fin 31 mars (récurrent).
const { createCalendarSource, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

function evenements(now) {
  const y = now.getFullYear();
  const out = [];
  for (const year of [y, y + 1]) {
    // Début de la trêve : 1er novembre.
    const debut = new Date(year, 10, 1);
    out.push({ kind: 'debut', start: debut, end: new Date(debut.getTime() + DAY_MS) });
    // Fin de la trêve : 31 mars.
    const fin = new Date(year, 2, 31);
    out.push({ kind: 'fin', start: fin, end: new Date(fin.getTime() + DAY_MS) });
  }
  return out
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'treve-hivernale',
  announceDays: 3,
  url: 'https://www.service-public.fr/particuliers/vosdroits/F13723',
  events: evenements,
  message(ev) {
    return ev.kind === 'debut'
      ? "🏠 La trêve hivernale commence le 1er novembre — pas d'expulsion locative ni de coupure d'énergie jusqu'au 31 mars"
      : '🏠 Fin de la trêve hivernale le 31 mars';
  },
});
