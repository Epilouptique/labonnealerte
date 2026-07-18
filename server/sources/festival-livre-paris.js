// Source calculée : Festival du Livre de Paris. Fenêtre J-3 → dernier jour.
// DATE VÉRIFIÉE : 16-18 avril 2027, Grand Palais — festivaldulivredeparis.fr (CONFIRMÉ).
// ⚠️ TODO ANNUEL : ajouter l'édition suivante dès publication.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const EDITIONS = [{ y: 2027, m: 3, d1: 16, d2: 18 }];

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
  id: 'festival-livre-paris',
  announceDays: 3,
  url: 'https://www.festivaldulivredeparis.fr/',
  events,
  message(ev, phase) {
    if (phase === 'before') return '📚 Bientôt le Festival du Livre de Paris, au Grand Palais.';
    return '📚 C\'est le Festival du Livre de Paris — trois jours de rencontres et de dédicaces au Grand Palais.';
  },
});
