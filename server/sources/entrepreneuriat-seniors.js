// Source calculée : entrepreneuriat & vie économique (fusion légère). Fenêtre J-2 → fin.
//   • GO Entrepreneurs Lyon : 24 septembre 2026 (daté) — TODO 2027
//   • BIG Bpifrance : 8 octobre 2026 (daté) — TODO 2027
//   • Semaine de l'industrie : 16-22 novembre 2026 (daté) — TODO 2027
//   • GO Entrepreneurs Paris : 28-29 avril 2027 (daté) — TODO 2028
//   • Journée internationale des personnes âgées : 1er octobre (fixe)
const { createCalendarSource, formatAvecJour, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const EMO = '💼';

function events(now) {
  const y = now.getFullYear();
  const out = [];
  for (const year of [y, y + 1]) {
    out.push({ nom: 'Journée internationale des personnes âgées', start: new Date(year, 9, 1), end: new Date(year, 9, 2) });
  }
  // Salons/temps forts datés (TODO éditions suivantes en tête de fichier).
  out.push({ nom: 'GO Entrepreneurs (Lyon)', start: new Date(2026, 8, 24), end: new Date(2026, 8, 25) });
  out.push({ nom: 'BIG by Bpifrance (Paris)', start: new Date(2026, 9, 8), end: new Date(2026, 9, 9) });
  out.push({ nom: "Semaine de l'industrie", week: true, start: new Date(2026, 10, 16), end: new Date(2026, 10, 23) });
  out.push({ nom: 'GO Entrepreneurs (Paris)', week: true, start: new Date(2027, 3, 28), end: new Date(2027, 3, 30) });

  return out.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'entrepreneuriat-seniors',
  announceDays: 2,
  url: 'https://www.bpifrance.fr/',
  events,
  message(ev, phase) {
    if (ev.week) {
      const fin = new Date(ev.end.getTime() - DAY_MS);
      if (phase === 'during') return `${EMO} ${ev.nom} : c'est en cours (jusqu'au ${formatJourMois(fin)}).`;
      return `${EMO} Bientôt : ${ev.nom}, du ${formatJourMois(ev.start)} au ${formatJourMois(fin)}.`;
    }
    if (phase === 'during') return `${EMO} Aujourd'hui : ${ev.nom}.`;
    return `${EMO} ${ev.nom} : ${formatAvecJour(ev.start)}.`;
  },
});
