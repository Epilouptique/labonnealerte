// Source calculée : bourses scolaires (collège et lycée) — zéro API.
//
// La demande de bourse de collège et de lycée se fait en ligne à la rentrée, avec
// une date limite unique. Pas de flux exploitable → dates officielles codées par
// campagne, comme echeances-fiscales.js. Convention Bison Futé : date issue de la
// circulaire de rentrée / education.gouv.fr (déjà vérifiée).
//
// Campagne 2026-2027 confirmée : date limite unique collège ET lycée = 15 octobre 2026.
//
// ⚠️ TODO daté : campagne 2027-2028 non publiée → vérifier avec la circulaire de
//    rentrée avant septembre 2027 et ajouter CAMPAGNES[2027].

const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// [année, moisIdx(0=janv), jour] — date limite de dépôt (collège et lycée confondus).
const CAMPAGNES = {
  2026: [
    [2026, 9, 15], // 15 octobre 2026
  ],
  // ⚠️ TODO : CAMPAGNES[2027] (campagne 2027-2028) dès parution.
};

function events(now) {
  const list = CAMPAGNES[now.getFullYear()] || [];
  return list
    .map(function (t) {
      const start = new Date(t[0], t[1], t[2]);
      return { start: start, end: new Date(start.getTime() + DAY_MS) };
    })
    .filter(function (e) { return e.end.getTime() >= now.getTime(); })
    .sort(function (a, b) { return a.start - b.start; });
}

module.exports = createCalendarSource({
  id: 'bourses-scolaires',
  announceDays: 7,
  url: 'https://www.education.gouv.fr/les-bourses-de-college-et-de-lycee-326728',
  events: events,
  message: function (ev) {
    return '🎓 Bourses de collège et de lycée : date limite pour déposer la demande en ligne, le ' +
      formatAvecJour(ev.start) + '.';
  },
});
