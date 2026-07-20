// Source calculée : dates de versement des prestations CAF (zéro API).
//
// La CAF verse les prestations d'un mois « au début du mois suivant », en
// pratique autour du 5. La date exacte est décalée : avancée au vendredi si le
// 5 tombe un samedi, reportée au lundi si le 5 tombe un dimanche ou un férié.
// La CAF ne publie pas de flux exploitable → on code une table annuelle en dur,
// comme echeances-fiscales.js et bison-fute.js.
//
// Dates 2026 confirmées avec décalages réels (source : calendrier des versements
// caf.fr) : 7 avril, 4 septembre, 4 décembre ; tous les autres mois = le 5 exact.
//
// ⚠️ TODO à construire avant janvier 2027 : table 2027 (VERSEMENTS[2027]) à
//    partir du calendrier officiel caf.fr, en reprenant les décalages réels.
//
// Message factuel, SANS montant (donnée strictement individuelle, jamais affichée).
// Fenêtre d'annonce courte : J-1 suffit (simple rappel).

const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// Table en dur par année. Une entrée par mois : la date effective du versement.
// [année, moisIdx(0=janv), jour]. Décalages réels 2026 déjà appliqués.
const VERSEMENTS = {
  2026: [
    [2026, 0, 5],  // 5 janvier
    [2026, 1, 5],  // 5 février
    [2026, 2, 5],  // 5 mars
    [2026, 3, 7],  // 7 avril (le 5 est un dimanche → report)
    [2026, 4, 5],  // 5 mai
    [2026, 5, 5],  // 5 juin
    [2026, 6, 5],  // 5 juillet
    [2026, 7, 5],  // 5 août
    [2026, 8, 4],  // 4 septembre (décalage réel)
    [2026, 9, 5],  // 5 octobre
    [2026, 10, 5], // 5 novembre
    [2026, 11, 4], // 4 décembre (décalage réel)
  ],
};

function events(now) {
  const list = VERSEMENTS[now.getFullYear()] || [];
  return list
    .map(function (t) {
      const start = new Date(t[0], t[1], t[2]);
      return { start: start, end: new Date(start.getTime() + DAY_MS) };
    })
    .filter(function (e) { return e.end.getTime() >= now.getTime(); })
    .sort(function (a, b) { return a.start - b.start; });
}

module.exports = createCalendarSource({
  id: 'versement-prestations-caf',
  announceDays: 1,
  url: 'https://www.caf.fr/allocataires/vies-de-famille/articles/les-dates-de-versement-de-vos-prestations',
  events: events,
  message: function (ev, phase) {
    var quand = phase === 'during' ? "c'est aujourd'hui" : 'le ' + formatAvecJour(ev.start);
    return '💶 Versement CAF : les prestations du mois sont versées ' + quand + '.';
  },
});
