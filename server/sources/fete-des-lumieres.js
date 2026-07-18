// Source calculée : Fête des Lumières de Lyon. Très grand public, très partagé.
// Fenêtre : J-3 → dernier soir (announceDays 3).
//
// DATES 2026 VÉRIFIÉES : du samedi 5 au mardi 8 décembre 2026 — OFFICIEL, annoncé sur
// fetedeslumieres.lyon.fr (« du samedi 5 au mardi 8 décembre 2026 »).
// ⚠️ TODO ANNUEL : ajouter l'édition suivante dès publication (autour du 8 décembre).
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { annee, début (0-based m,d), fin (jour du dernier soir inclus) }.
const EDITIONS = [
  { annee: 2026, m: 11, d1: 5, d2: 8 },
];

function events(now) {
  return EDITIONS
    .map((e) => ({
      start: new Date(e.annee, e.m, e.d1),
      // fin = lendemain minuit du dernier soir (le 8 au soir reste actif).
      end: new Date(new Date(e.annee, e.m, e.d2).getTime() + DAY_MS),
      annee: e.annee,
    }))
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'fete-des-lumieres',
  announceDays: 3,
  url: 'https://www.fetedeslumieres.lyon.fr/',
  events,
  message(ev, phase) {
    if (phase === 'before') {
      return '✨ Bientôt la Fête des Lumières de Lyon — quatre soirs d\'illuminations dans toute la ville.';
    }
    return '✨ C\'est la Fête des Lumières à Lyon — installations et illuminations partout dans la ville jusqu\'au 8 décembre.';
  },
});
