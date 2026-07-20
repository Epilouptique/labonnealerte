// Source calculée : calendrier Parcoursup (zéro API).
//
// Parcoursup ne publie pas de flux exploitable → dates officielles codées par
// session, comme echeances-fiscales.js. Convention Bison Futé : chaque date vient
// du calendrier officiel parcoursup.gouv.fr (déjà vérifié).
//
// ⚠️ TODO daté : session 2027 NON publiée au 19/07/2026. Le calendrier sort
//    habituellement à l'automne → vérifier parcoursup.gouv.fr/calendrier avant
//    octobre 2026 et ajouter SESSIONS[2027] avec les dates officielles.
//
// NOTE d'utilité (à documenter dans le rapport de fin) : au déploiement réel les
// dates de la session 2026 sont déjà passées. La factory calendar n'affiche que
// les événements à venir dans la fenêtre d'annonce (elle filtre le passé), donc
// ces entrées ne « s'allument » plus en 2026. La source ne devient réellement
// utile qu'une fois SESSIONS[2027] renseignée. Les entrées 2026 sont conservées
// comme trame de référence et pour l'historique.

const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// Une session = 4 jalons. label = intitulé factuel de l'étape.
// [année, moisIdx(0=janv), jour, label]
const SESSIONS = {
  2026: [
    [2026, 0, 19, 'ouverture de la formulation des vœux'],
    [2026, 2, 12, 'date limite pour formuler ses vœux'],
    [2026, 3, 1, 'date limite pour confirmer ses vœux'],
    [2026, 5, 2, 'début de la phase d\'admission (premières réponses)'],
  ],
  // ⚠️ TODO : SESSIONS[2027] à renseigner dès parution du calendrier officiel.
};

function events(now) {
  const list = SESSIONS[now.getFullYear()] || [];
  return list
    .map(function (t) {
      const start = new Date(t[0], t[1], t[2]);
      return { start: start, end: new Date(start.getTime() + DAY_MS), label: t[3] };
    })
    .filter(function (e) { return e.end.getTime() >= now.getTime(); })
    .sort(function (a, b) { return a.start - b.start; });
}

module.exports = createCalendarSource({
  id: 'parcoursup',
  announceDays: 7,
  url: 'https://www.parcoursup.gouv.fr/le-calendrier-parcoursup',
  events: events,
  message: function (ev, phase) {
    var quand = phase === 'during' ? "c'est aujourd'hui" : 'le ' + formatAvecJour(ev.start);
    return '🎓 Parcoursup — ' + ev.label + ' : ' + quand + '.';
  },
});
