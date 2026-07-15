// Source calculée : cérémonie du Guide Michelin France (révélation du palmarès).
// Événement annuel (généralement en mars), ANNONCÉ à l'avance. Vit par sa config :
// on n'inscrit une date QUE lorsqu'elle est officiellement annoncée.
//
// TODO daté : l'édition 2027 n'est PAS annoncée au 15/07/2026 (seule 2026 =
// 16/03/2026, passée). Revérifier à l'automne 2026 sur guide.michelin.com, puis
// ajouter { start } ci-dessous. Fenêtre d'annonce J-3 → jour J.
const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

// Chaque entrée : { start: new Date(2027, 2, 15) }. VIDE tant que non annoncé.
const CEREMONIES = [];

function events(now) {
  return CEREMONIES
    .map((c) => ({ start: c.start, end: new Date(c.start.getTime()) }))
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'guide-michelin',
  announceDays: 3,
  url: 'https://guide.michelin.com/fr/fr',
  events,
  message(ev, phase) {
    if (phase === 'during') {
      return '⭐ Aujourd\'hui : le Guide Michelin France dévoile son palmarès.';
    }
    return `⭐ Le Guide Michelin France dévoile son palmarès ${formatAvecJour(ev.start)}.`;
  },
});
