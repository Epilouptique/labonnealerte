// Source calculée : grands tours cyclistes d'outre-mer (zéro API). Fenêtre J-3 → fin.
//
// ── SOURCE EN SOMMEIL (aucune date active au déploiement) ─────────────────────
// Comme tour-de-france-passage.js et elections-france.js : la source charge, reste
// inactive, et se « réveillera » dès qu'on remplira TOURS avec des dates OFFICIELLES.
//
// ⚠️ TODO daté (dates à transcrire dès publication des calendriers officiels) :
//   • Tour cycliste de la GUADELOUPE : l'édition 2026 (31 juillet → 9 août 2026)
//     est déjà close au déploiement. → ajouter l'édition 2027 dès l'annonce de la
//     Fédération / du comité d'organisation (habituellement au 1er semestre).
//   • Tour cycliste de la MARTINIQUE : dates 2027 NON trouvées lors de l'exploration
//     (19/07/2026). → ajouter dès publication officielle. NE RIEN inventer.
// Aucune date présumée : une date fausse est inacceptable, une source qui dort est
// acceptable.

const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { nom, annee, m1, d1 (début), m2, d2 (dernier jour inclus) }.
// VIDE tant que les calendriers officiels 2027 ne sont pas publiés.
const TOURS = [
  // { nom: 'Tour cycliste de la Guadeloupe', annee: 2027, m1: ?, d1: ?, m2: ?, d2: ? },
  // { nom: 'Tour cycliste de la Martinique', annee: 2027, m1: ?, d1: ?, m2: ?, d2: ? },
];

function events(now) {
  return TOURS
    .map((t) => ({
      start: new Date(t.annee, t.m1 - 1, t.d1),
      end: new Date(new Date(t.annee, t.m2 - 1, t.d2).getTime() + DAY_MS),
      nom: t.nom,
    }))
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'tours-cyclistes-outremer',
  announceDays: 3,
  url: 'https://www.tourcyclisteguadeloupe.com/',
  events: events,
  message: function (ev, phase) {
    if (phase === 'before') {
      return '🚴 Bientôt le départ du ' + ev.nom + ' — grand rendez-vous cycliste local, à partir du ' + formatAvecJour(ev.start) + '.';
    }
    return '🚴 C\'est parti pour le ' + ev.nom + ' — la course est lancée.';
  },
});
