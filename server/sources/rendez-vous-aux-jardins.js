// Source calculée : Rendez-vous aux jardins (ministère de la Culture). Fenêtre J-3 →
// dernier jour. DATE VÉRIFIÉE : 4-6 juin 2027 (thème « Gazons, pelouses et prairies »)
// — rendezvousauxjardins.culture.gouv.fr (CONFIRMÉ). ⚠️ TODO ANNUEL.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const EDITIONS = [{ y: 2027, m: 5, d1: 4, d2: 6 }];

function events(now) {
  return EDITIONS
    .map((e) => ({
      start: new Date(e.y, e.m, e.d1),
      end: new Date(new Date(e.y, e.m, e.d2).getTime() + DAY_MS),
    }))
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'rendez-vous-aux-jardins',
  announceDays: 3,
  url: 'https://rendezvousauxjardins.culture.gouv.fr/',
  events,
  message(ev, phase) {
    if (phase === 'before') return '🌷 Bientôt les Rendez-vous aux jardins — trois jours pour visiter des jardins publics et privés partout en France.';
    return '🌷 C\'est les Rendez-vous aux jardins — jardins ouverts, visites et animations partout en France ce week-end.';
  },
});
