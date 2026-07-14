// Source calculée : Nuits des Étoiles (AFA). Événement annuel, dates fixées par
// l'Association Française d'Astronomie — non déductibles d'une règle, codées en dur.
// Édition 2026 CONSTATÉE sur afastronomie.fr : vendredi 7, samedi 8 et dimanche 9
// août 2026. Fenêtre d'annonce J-3 → dernier jour.
//
// ⚠️ TODO début 2027 : ajouter l'édition 2027 (dates publiées par l'AFA).
const { createCalendarSource, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { firstDay, lastDay } (dates locales) de chaque édition.
const EDITIONS = [
  { first: '2026-08-07', last: '2026-08-09' },
];

function editions(now) {
  return EDITIONS
    .map((e) => {
      const [y, m, d] = e.first.split('-').map(Number);
      const [ly, lm, ld] = e.last.split('-').map(Number);
      const start = new Date(y, m - 1, d);
      const lastDay = new Date(ly, lm - 1, ld);
      return { start, end: new Date(lastDay.getTime() + DAY_MS), last: lastDay }; // actif jusqu'à la fin du dernier jour
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'nuits-des-etoiles',
  announceDays: 3,
  url: 'https://www.afastronomie.fr/les-nuits-des-etoiles',
  events: editions,
  message(ev, phase) {
    const quand = phase === 'during' ? 'C\'est ce week-end' : 'Ce week-end';
    return `🌠 ${quand} : les Nuits des Étoiles (${formatJourMois(ev.start)} au ${formatJourMois(ev.last)}) — soirées d'observation gratuites partout en France.`;
  },
});
