// TODO trimestriel : ajouter les sorties jeux fermement datées (config par entrées).
// Source calculée : sorties de jeux vidéo majeures (dates éditeur confirmées).
const { createCalendarSource } = require('./lib/calendar-factory');

function evenements(now) {
  const list = [
    // GTA VI : 19 novembre 2026 (Rockstar confirmé).
    { start: new Date(2026, 10, 19), end: new Date(2026, 10, 20), msg: '🎮 Aujourd\'hui : sortie de GTA VI' },
  ];
  return list
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'sorties-jeux-majeures',
  announceDays: 2,
  url: 'https://www.rockstargames.com/',
  events: evenements,
  message(ev) {
    return ev.msg;
  },
});
