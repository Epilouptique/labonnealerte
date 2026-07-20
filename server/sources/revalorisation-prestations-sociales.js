// Source calculée : revalorisations annuelles des prestations sociales (zéro API).
//
// DEUX rendez-vous récurrents, réunis dans UNE seule source (décision actée) :
//   • 1er avril  : revalorisation RSA / prime d'activité / allocations familiales.
//   • 1er octobre : revalorisation des APL.
// Ces dates de principe sont fixées par la loi (art. L. 161-25 CSS pour l'indexation
// annuelle) et récurrentes chaque année → calculables, sans table à maintenir.
//
// AUCUN montant : le coefficient de revalorisation n'est jamais connu de façon
// fiable à l'avance, et le principe collectif se suffit à lui-même ici.
//
// Précision importante dans les messages (ne pas laisser croire à un effet immédiat) :
//   - RSA / prime d'activité : calcul trimestriel → l'effet sur le versement n'est
//     visible qu'à partir de juin.
//   - Allocations familiales : effet direct dès avril.
//   - APL : effet visible sur le versement de début novembre.

const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

function events(now) {
  const out = [];
  // On couvre l'année en cours et la suivante (récurrent, calculable).
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const avril = new Date(year, 3, 1);   // 1er avril
    out.push({ kind: 'avril', start: avril, end: new Date(avril.getTime() + DAY_MS) });
    const octobre = new Date(year, 9, 1); // 1er octobre
    out.push({ kind: 'octobre', start: octobre, end: new Date(octobre.getTime() + DAY_MS) });
  }
  return out
    .filter(function (e) { return e.end.getTime() >= now.getTime(); })
    .sort(function (a, b) { return a.start - b.start; });
}

module.exports = createCalendarSource({
  id: 'revalorisation-prestations-sociales',
  announceDays: 7,
  url: 'https://www.service-public.gouv.fr/particuliers/actualites',
  events: events,
  message: function (ev) {
    if (ev.kind === 'octobre') {
      return '💶 Revalorisation des APL au 1er octobre : l\'effet est visible sur le versement de début novembre.';
    }
    return '💶 Revalorisation au 1er avril : RSA, prime d\'activité et allocations familiales. ' +
      'Effet direct dès avril pour les allocations familiales ; pour le RSA et la prime d\'activité ' +
      '(calcul trimestriel), l\'effet sur le versement n\'est visible qu\'à partir de juin.';
  },
});
