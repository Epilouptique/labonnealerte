// Source calculée (calendar-factory) : Fête de la Bretagne / Gouel Breizh. Zéro API.
// Fenêtre d'annonce J-7 → dernier jour. Message factuel 🔵⚫ (Gwenn ha Du).
//
// RECONNAISSANCE INSTITUTIONNELLE réelle : manifestation créée et portée par la RÉGION
// BRETAGNE depuis 2009, autour de la Saint-Yves (patron des Bretons, ~19 mai). Festival
// diffus (~200 événements dans toute la Bretagne), pas un jour férié.
//
// DATE VÉRIFIÉE au 21/07/2026 (jamais de mémoire) : édition 2026 du 14 au 24 mai 2026 —
//   bretagne.bzh (page officielle Région Bretagne) / fetedelabretagne.bzh.
// ⚠️ TODO : l'édition 2027 n'est PAS encore annoncée → à ajouter dès publication officielle
//   par la Région Bretagne (ne rien inscrire de non confirmé).

const { createCalendarSource, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { y, m (0-based), d1, d2, url }.
const EDITIONS = [
  { y: 2026, m: 4, d1: 14, d2: 24, url: 'https://www.fetedelabretagne.bzh/' },
];

function events() {
  return EDITIONS.map((e) => ({
    start: new Date(e.y, e.m, e.d1),
    end: new Date(new Date(e.y, e.m, e.d2).getTime() + DAY_MS),
    url: e.url,
  }));
}

module.exports = createCalendarSource({
  id: 'fete-bretagne',
  announceDays: 7,
  url: 'https://www.fetedelabretagne.bzh/',
  events,
  message(ev, phase) {
    if (phase === 'before') return `🔵 Bientôt la Fête de la Bretagne / Gouel Breizh, à partir du ${formatJourMois(ev.start)} partout en Bretagne.`;
    return '🔵 La Fête de la Bretagne / Gouel Breizh a commencé — événements dans toute la région.';
  },
});
