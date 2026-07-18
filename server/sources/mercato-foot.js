// Source calculée : fermeture des fenêtres de transferts (mercato). Ton léger.
// Fenêtre : veille + jour J (announceDays 1).
//
// DATES VÉRIFIÉES (LFP, Ligue 1) — lfp.fr « dates du mercato 2026-2027 » (CONFIRMÉ) :
//   - Mercato d'été 2026 : clôture le 1er septembre 2026 à 19h59.
//   - Mercato d'hiver 2027 : clôture le 1er février 2027 à 19h59.
// (Dates françaises LFP ; les autres championnats diffèrent.)
// ⚠️ TODO : ajouter les fenêtres suivantes chaque saison.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { saison, y, m(0-based), d }.
const CLOTURES = [
  { saison: 'été', y: 2026, m: 8, d: 1 },
  { saison: 'hiver', y: 2027, m: 1, d: 1 },
];

function events(now) {
  return CLOTURES
    .map((c) => {
      const start = new Date(c.y, c.m, c.d);
      return { start, end: new Date(start.getTime() + DAY_MS), saison: c.saison };
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'mercato-foot',
  announceDays: 1,
  url: 'https://www.lfp.fr/',
  events,
  message(ev, phase) {
    if (phase === 'before') return `⚽ Demain, dernier jour du mercato d'${ev.saison} (clôture à 19h59) — les officialisations vont pleuvoir.`;
    return `⚽ Dernier jour du mercato d'${ev.saison} ! Clôture des transferts ce soir à 19h59.`;
  },
});
