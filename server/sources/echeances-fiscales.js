// Source calculée : grandes échéances fiscales des particuliers (zéro API).
//
// Les dates de paiement changent chaque année et ne sont pas exposées en flux
// exploitable : impots.gouv.fr/particulier/calendrier-fiscal est une page dynamique
// (elle n'affiche que les échéances proches). On code donc les dates officielles
// par année, comme bison-fute.js. Fenêtre d'annonce J-7 → date limite en ligne.
//
// Dates 2026 (schéma statutaire stable, à confirmer sur la page officielle quand les
// avis 2026 seront publiés) :
//   • Taxe foncière : 15 octobre (papier/non mensualisé) / 20 octobre (en ligne)
//   • Taxe d'habitation sur les résidences secondaires : 15 décembre / 20 décembre
// On vise le grand public : PAS d'IFI, logements vacants, acomptes indépendants…
//
// ⚠️ TODO début 2027 : ajouter l'entrée 2027 dans ECHEANCES.

const { createCalendarSource, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// Config par année. paper = date limite papier/non mensualisé ; online = paiement
// en ligne (délai supplémentaire) — c'est online qui borne la fenêtre d'activation.
const ECHEANCES = {
  2026: [
    { label: 'Taxe foncière', paper: '2026-10-15', online: '2026-10-20' },
    { label: 'Taxe d\'habitation', paper: '2026-12-15', online: '2026-12-20', secondaires: true },
  ],
};

function ymd(str) { const p = str.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }

function events(now) {
  const list = ECHEANCES[now.getFullYear()] || [];
  return list
    .map(function (e) {
      const online = ymd(e.online);
      return {
        start: online,
        end: new Date(online.getTime() + DAY_MS), // actif jusqu'à la fin du jour limite
        paper: ymd(e.paper),
        label: e.label,
        secondaires: !!e.secondaires,
      };
    })
    .filter(function (e) { return e.end.getTime() >= now.getTime(); })
    .sort(function (a, b) { return a.start - b.start; });
}

module.exports = createCalendarSource({
  id: 'echeances-fiscales',
  announceDays: 7,
  url: 'https://www.impots.gouv.fr/particulier/calendrier-fiscal',
  events: events,
  message: function (ev) {
    const precision = ev.secondaires ? ' (résidences secondaires uniquement)' : '';
    return '💶 ' + ev.label + precision + ' : jusqu\'au ' + formatJourMois(ev.paper) +
      ' (' + formatJourMois(ev.start) + ' en ligne)';
  },
});
