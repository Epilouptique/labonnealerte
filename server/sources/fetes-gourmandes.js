// Source calculée : fêtes gourmandes (Chandeleur, Mardi Gras, Saint-Patrick).
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// Table de Pâques FOURNIE (aucun comput recalculé).
const PAQUES = { 2026: '2026-04-05', 2027: '2027-03-28', 2028: '2028-04-16' };

function evenements(now) {
  const y = now.getFullYear();
  const out = [];
  for (const year of [y, y + 1]) {
    // Chandeleur : 2 février (récurrent).
    const chandeleur = new Date(year, 1, 2);
    out.push({ kind: 'chandeleur', start: chandeleur, end: new Date(chandeleur.getTime() + DAY_MS) });
    // Saint-Patrick : 17 mars (récurrent).
    const patrick = new Date(year, 2, 17);
    out.push({ kind: 'patrick', start: patrick, end: new Date(patrick.getTime() + DAY_MS) });
    // Mardi Gras : Pâques − 47 jours (table de Pâques uniquement).
    if (PAQUES[year]) {
      const [yy, mm, dd] = PAQUES[year].split('-').map(Number);
      const mardiGras = new Date(yy, mm - 1, dd - 47);
      out.push({ kind: 'mardi-gras', start: mardiGras, end: new Date(mardiGras.getTime() + DAY_MS) });
    }
  }
  return out
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'fetes-gourmandes',
  announceDays: 1,
  url: 'https://www.service-public.fr/',
  events: evenements,
  message(ev) {
    if (ev.kind === 'chandeleur') return "🥞 Chandeleur — c'est le jour des crêpes !";
    if (ev.kind === 'mardi-gras') return '🎭 Mardi Gras — beignets, déguisements et Carnaval';
    return "🍀 la Saint-Patrick — l'Irlande à l'honneur";
  },
});
