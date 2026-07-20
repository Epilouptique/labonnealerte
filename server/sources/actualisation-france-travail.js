// Source calculée : actualisation mensuelle France Travail — zéro API, format GÉNÉRIQUE.
//
// Chaque mois, la fenêtre d'actualisation (déclaration de situation) est ouverte
// « du 28 au 15 du mois suivant ». Rappel calculable, SANS aucune donnée
// personnelle ni montant : on n'affiche que la fenêtre collective.
//
// Détail de calcul du jour d'ouverture : c'est le 28 de chaque mois, SAUF en
// février où le mois est plus court → ouverture le 26 (années non bissextiles)
// ou le 27 (années bissextiles). Autrement dit : (nombre de jours de février) − 2.
// La fenêtre se ferme le 15 du mois suivant.

const { createCalendarSource, formatJourMois } = require('./lib/calendar-factory');

function isLeap(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Jour d'ouverture de la fenêtre pour le mois `monthIdx` (0=janv) de `year`.
function openingDay(year, monthIdx) {
  if (monthIdx === 1) return isLeap(year) ? 27 : 26; // février : (28|29) − 2
  return 28;
}

function events(now) {
  const out = [];
  const y = now.getFullYear();
  const m = now.getMonth();
  // On couvre le mois précédent (fenêtre encore ouverte jusqu'au 15) → +2 mois.
  for (let off = -1; off <= 2; off++) {
    const d = new Date(y, m + off, 1);
    const year = d.getFullYear();
    const monthIdx = d.getMonth();
    const start = new Date(year, monthIdx, openingDay(year, monthIdx));
    // Fenêtre ouverte jusqu'à la fin du 15 du mois suivant → borne = 16 à 0h.
    const end = new Date(year, monthIdx + 1, 16);
    out.push({ start: start, end: end });
  }
  return out
    .filter(function (e) { return e.end.getTime() >= now.getTime(); })
    .sort(function (a, b) { return a.start - b.start; });
}

module.exports = createCalendarSource({
  id: 'actualisation-france-travail',
  announceDays: 1,
  url: 'https://www.francetravail.fr/candidat/mon-inscription-mon-suivi/mactualiser.html',
  events: events,
  message: function (ev) {
    return '📋 Actualisation mensuelle France Travail : la fenêtre de déclaration est ouverte du ' +
      formatJourMois(ev.start) + ' au 15 du mois suivant.';
  },
});
