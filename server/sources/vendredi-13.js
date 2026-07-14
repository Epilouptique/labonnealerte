// Source calculée : les vendredis 13 (zéro API). Calendrier grégorien pur → se
// calcule sans aucun risque d'erreur. Fenêtre veille + jour J (annonce J-1).
// Ton décalé bienvenu (superstition, clin d'œil loterie).

const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

// Renvoie les vendredis 13 des 14 prochains mois (large : le factory ne garde
// que celui dont la fenêtre veille/jour englobe « maintenant »).
function events(now) {
  const list = [];
  const DAY_MS = 24 * 60 * 60 * 1000;
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = 0; i < 15; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 13);
    if (d.getDay() === 5) list.push({ start: d, end: new Date(d.getTime() + DAY_MS) }); // actif tout le jour J
  }
  return list;
}

module.exports = createCalendarSource({
  id: 'vendredi-13',
  announceDays: 1,
  url: 'https://www.fdj.fr',
  events: events,
  message: function (ev, phase) {
    if (phase === 'during') {
      return '🖤 Vendredi 13 aujourd’hui : chat noir ou grille de loto, à vous de voir. Vos alertes, elles, ne croient pas à la malchance.';
    }
    return '🖤 Vendredi 13 demain (' + formatAvecJour(ev.start) + ') : jour de (mal)chance selon les superstitions.';
  },
});
