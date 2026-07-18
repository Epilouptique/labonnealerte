// Source calculée : Fashion Week de Paris (prêt-à-porter femme). Fenêtre : veille + 1er
// jour (announceDays 1). DATES VÉRIFIÉES sur le calendrier officiel FHCM (fhcm.paris) :
//   - Printemps-Été 2027 (défilés en 2026) : 28 septembre - 6 octobre 2026 (CONFIRMÉ).
//   - Automne-Hiver 2027-28 : 1er - 9 mars 2027 (CONFIRMÉ).
//   - Printemps-Été 2028 : 27 septembre - 5 octobre 2027 (CONFIRMÉ).
// ⚠️ TODO ANNUEL : ajouter les saisons suivantes dès publication FHCM.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { saison, y, m(0-based), d (1er jour) }.
const EDITIONS = [
  { saison: 'prêt-à-porter printemps-été', y: 2026, m: 8, d: 28 },
  { saison: 'prêt-à-porter automne-hiver', y: 2027, m: 2, d: 1 },
  { saison: 'prêt-à-porter printemps-été', y: 2027, m: 8, d: 27 },
];

function events(now) {
  return EDITIONS
    .map((e) => {
      const start = new Date(e.y, e.m, e.d);
      return { start, end: new Date(start.getTime() + DAY_MS), saison: e.saison };
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'fashion-week',
  announceDays: 1,
  url: 'https://www.fhcm.paris/',
  events,
  message(ev, phase) {
    if (phase === 'before') return '👗 Demain, ouverture de la Fashion Week de Paris (prêt-à-porter femme).';
    return '👗 La Fashion Week de Paris commence — les défilés prêt-à-porter femme, jusqu\'à la semaine prochaine.';
  },
});
