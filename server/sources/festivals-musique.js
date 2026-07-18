// Source calculée : grands festivals de musique. Fenêtre J-3 → 1er jour (announceDays 3).
//
// DATES VÉRIFIÉES sur le site officiel de chaque festival (jamais de mémoire) :
//   - Hellfest 2027 (Clisson) : 17-20 juin 2027 — hellfest.fr (CONFIRMÉ).
//   - Rock en Seine 2026 (Saint-Cloud) : 26-30 août 2026 — paris.fr (CONFIRMÉ).
// TODO (non annoncés au 18/07/2026) : Vieilles Charrues 2027, Solidays 2027 (édition
//   2026 annulée), Festival Interceltique de Lorient 2027 → à ajouter dès publication.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { nom, lieu, y, m(0-based), d (1er jour), url }.
const FESTIVALS = [
  { nom: 'Rock en Seine', lieu: 'Saint-Cloud', y: 2026, m: 7, d: 26, url: 'https://www.rockenseine.com/' },
  { nom: 'Hellfest', lieu: 'Clisson', y: 2027, m: 5, d: 17, url: 'https://www.hellfest.fr/' },
];

function events(now) {
  return FESTIVALS
    .map((f) => {
      const start = new Date(f.y, f.m, f.d);
      return { start, end: new Date(start.getTime() + DAY_MS), nom: f.nom, lieu: f.lieu, url: f.url };
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'festivals-musique',
  announceDays: 3,
  url: 'https://www.service-public.fr/',
  events,
  message(ev, phase) {
    if (phase === 'before') return `🎸 Bientôt le festival ${ev.nom} à ${ev.lieu}.`;
    return `🎸 Ça commence : le festival ${ev.nom} ouvre à ${ev.lieu}.`;
  },
});
