// Source calculée : la Francophonie. La carte identitaire du kiosque (public France,
// Québec, Belgique, Suisse, Afrique francophone, expatriés).
//
// DATES VÉRIFIÉES :
//   - Journée internationale de la Francophonie : 20 MARS, FIXE chaque année (OIF).
//     Source : culture.gouv.fr (« chaque 20 mars »). Récurrente, calculable, zéro TODO.
//   - Semaine de la langue française et de la Francophonie : semaine autour du 20 mars,
//     dates 2027 NON ENCORE PUBLIÉES par le ministère de la Culture (2026 = 17-20 mars)
//     → TODO, aucune date inventée.
//
// Fenêtre : veille + jour J (announceDays 1). Ton valorisant, jamais politique.
// ⚠️ TODO : ajouter la Semaine 2027 dès publication sur culture.gouv.fr.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

function events(now) {
  const y = now.getFullYear();
  return [y, y + 1]
    .map((year) => {
      const start = new Date(year, 2, 20); // 20 mars, fixe
      return { start, end: new Date(start.getTime() + DAY_MS) };
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'francophonie',
  announceDays: 1,
  url: 'https://www.francophonie.org/journee-internationale-de-la-francophonie',
  events,
  message(ev, phase) {
    if (phase === 'before') {
      return '🌍 Demain, Journée internationale de la Francophonie — le 20 mars, la langue que partagent plus de 300 millions de personnes sur cinq continents.';
    }
    return '🌍 Aujourd\'hui, Journée internationale de la Francophonie — France, Québec, Belgique, Suisse, Afrique francophone… une même langue en partage.';
  },
});
