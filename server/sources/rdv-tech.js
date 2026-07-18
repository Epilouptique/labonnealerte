// Source calculée : grands rendez-vous tech datés (keynotes, sorties d'OS majeures).
// Fenêtre : veille + jour J (announceDays 1). N'entre QUE du daté officiellement.
//
// DATES VÉRIFIÉES :
//   - Ubuntu 26.10 « Stonking Stingray » : 15 octobre 2026 — calendrier officiel
//     Canonical (documentation.ubuntu.com/release-notes) (CONFIRMÉ).
// TODO (non annoncés au 18/07/2026, aucune date inventée) :
//   - Google I/O 2027, Apple WWDC 2027, keynote Apple de septembre 2026 → à ajouter dès
//     annonce officielle (Apple n'annonce qu'~2 semaines avant : probablement tard).
//   - Android 17 : DÉJÀ sorti (stable le 16 juin 2026) → pas d'entrée.
// (Renommée depuis la proposition « keynotes-tech » : regroupe keynotes ET sorties d'OS.)
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { nom, y, m(0-based), d, emoji, url }.
const RDV = [
  { nom: 'Ubuntu 26.10', y: 2026, m: 9, d: 15, emoji: '🐧', url: 'https://ubuntu.com/download' },
];

function events(now) {
  return RDV
    .map((r) => {
      const start = new Date(r.y, r.m, r.d);
      return { start, end: new Date(start.getTime() + DAY_MS), nom: r.nom, emoji: r.emoji, url: r.url };
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'rdv-tech',
  announceDays: 1,
  url: 'https://ubuntu.com/',
  events,
  message(ev, phase) {
    if (phase === 'before') return `${ev.emoji} Demain : sortie de ${ev.nom}.`;
    return `${ev.emoji} Aujourd'hui : ${ev.nom} est disponible.`;
  },
});
