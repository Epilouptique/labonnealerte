// Source calculée : Fête de la science (métropole).
// Édition 2026 VÉRIFIÉE en direct sur fetedelascience.fr le 23/07/2026 : du 2 au 12 octobre
// 2026, thème « Saveurs savantes » (inchangée vs valeur précédente).
// ⚠️ TODO (à faire avant le 30/09/2027) : l'édition 2027 n'était PAS encore annoncée sur
// fetedelascience.fr au 23/07/2026 (ni dates ni thème). Dès parution, ajouter l'entrée 2027
// ci-dessous (start/end + thème dans message) et vérifier la nouvelle URL officielle.
const { createCalendarSource } = require('./lib/calendar-factory');

function events(now) {
  // 2026 métropole : du 2 au 12 octobre inclus → end = 13 oct 00h.
  return [
    { start: new Date(2026, 9, 2), end: new Date(2026, 9, 13) },
    // TODO 2027 : { start: new Date(2027, ?, ?), end: new Date(2027, ?, ?) } — dates officielles à confirmer.
  ].filter((e) => e.end.getTime() >= now.getTime());
}

module.exports = createCalendarSource({
  id: 'fete-science',
  announceDays: 7,
  url: 'https://www.fetedelascience.fr/',
  events,
  message(ev, phase) {
    return phase === 'during'
      ? '🔬 La Fête de la science bat son plein — ateliers, visites et rencontres gratuits partout en France (thème « Saveurs savantes »)'
      : '🔬 La Fête de la science approche (du 2 au 12 octobre) — ateliers et visites gratuits partout en France, thème « Saveurs savantes »';
  },
});
