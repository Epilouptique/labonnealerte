// Source calculée : recensement citoyen obligatoire (16 ans) — zéro API, format GÉNÉRIQUE.
//
// Rappel PÉDAGOGIQUE annuel, sans AUCUNE date individuelle ni donnée personnelle :
// on ne connaît pas l'anniversaire de l'abonné, on rappelle simplement le principe.
// Cadence actée : un rappel à chaque rentrée de septembre (période où les jeunes
// nés l'année de leurs 16 ans et leurs familles sont les plus concernés).

const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

function events(now) {
  const out = [];
  // Récurrent, calculable : on couvre l'année en cours et la suivante.
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const start = new Date(year, 8, 1); // 1er septembre
    const end = new Date(new Date(year, 8, 30).getTime() + DAY_MS); // tout septembre
    out.push({ start: start, end: end });
  }
  return out
    .filter(function (e) { return e.end.getTime() >= now.getTime(); })
    .sort(function (a, b) { return a.start - b.start; });
}

module.exports = createCalendarSource({
  id: 'recensement-citoyen',
  announceDays: 0,
  url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F870',
  events: events,
  message: function () {
    return '🪪 Rappel : tout jeune de 16 ans doit se faire recenser dans les 3 mois suivant son ' +
      'anniversaire (en mairie ou en ligne) — utile pour le bac et le permis avant 18 ans, ' +
      'régularisable jusqu\'à 25 ans.';
  },
});
