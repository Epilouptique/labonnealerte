// Source calculée : Semaine Bleue (semaine nationale des retraités et des personnes
// âgées). Fenêtre J-3 → 1er jour. Dates VÉRIFIÉES sur semaine-bleue.org.
//   2026 : du 5 au 11 octobre (CONFIRMÉ, semaine-bleue.org).
// ⚠️ La règle « avant-dernier lundi d'octobre » parfois citée est INEXACTE : dans
// les faits, la 1re semaine complète d'octobre. Ne PAS extrapoler.
// TODO 2027 : ajouter les dates officielles à leur annonce sur semaine-bleue.org
// (non annoncées au 18/07/2026 → aucune date inventée).
const { createCalendarSource, formatJourMois } = require('./lib/calendar-factory');

// { start, end } : end = dernier jour (pour l'affichage dans le message).
const EDITIONS = [
  { start: new Date(2026, 9, 5), fin: new Date(2026, 9, 11) },
];

function events(now) {
  // Fenêtre J-3 → 1er jour : la factory active de (start - announceDays) à `end`.
  // Ici on borne l'état au 1er jour (end = start) ; `fin` ne sert qu'au message.
  return EDITIONS
    .map((e) => ({ start: e.start, end: e.start, fin: e.fin }))
    .filter((e) => e.end.getTime() >= now.getTime());
}

module.exports = createCalendarSource({
  id: 'semaine-bleue',
  announceDays: 3,
  url: 'https://semaine-bleue.org/',
  events,
  message(ev) {
    // « du 5 au 11 octobre » si même mois, sinon « du 5 octobre au 2 novembre ».
    const sameMonth = ev.start.getMonth() === ev.fin.getMonth();
    const debut = sameMonth ? String(ev.start.getDate()) : formatJourMois(ev.start);
    return `👴 Semaine Bleue du ${debut} au ${formatJourMois(ev.fin)} : une semaine d'animations avec et pour les personnes âgées partout en France`;
  },
});
