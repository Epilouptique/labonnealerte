// Source calculée : éclipses de Soleil visibles depuis la France (dates connues).
// Fenêtre d'annonce J-7 → jour J. Après l'événement, la source redevient inactive
// jusqu'à l'éclipse suivante déclarée dans ECLIPSES.
//
// ⚠️ TODO : compléter ECLIPSES avec les éclipses notables suivantes au fil du temps.
const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// Éclipses notables visibles depuis la France (date locale + note descriptive).
const ECLIPSES = [
  { date: '2026-08-12', note: 'forte éclipse partielle visible partout en France en fin de journée' },
  { date: '2027-08-02', note: 'éclipse partielle en France (totale depuis l\'Espagne)' },
];

function eclipses(now) {
  return ECLIPSES
    .map((e) => {
      const [y, m, d] = e.date.split('-').map(Number);
      const start = new Date(y, m - 1, d);
      return { start, end: new Date(start.getTime() + DAY_MS), note: e.note }; // actif tout le jour J
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'eclipse-solaire',
  announceDays: 7,
  url: 'https://www.afastronomie.fr/',
  events: eclipses,
  message(ev) {
    return `🌒 Éclipse de Soleil ${formatAvecJour(ev.start)} — ${ev.note}. Lunettes de protection homologuées obligatoires, jamais à l'œil nu !`;
  },
});
