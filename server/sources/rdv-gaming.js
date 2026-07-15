// Source calculée : rendez-vous du jeu vidéo — dates officielles annoncées.
// TODO 2027.
const { createCalendarSource } = require('./lib/calendar-factory');

function events(now) {
  return [
    // gamescom 2026 : 26 au 30 août 2026, Cologne.
    { start: new Date(2026, 7, 26), end: new Date(2026, 7, 31), msg: '🎮 gamescom, le grand salon du jeu vidéo, ouvre à Cologne' },
    // Paris Games Week 2026 : 22 au 25 octobre 2026, porte de Versailles.
    { start: new Date(2026, 9, 22), end: new Date(2026, 9, 26), msg: '🎮 La Paris Games Week ouvre porte de Versailles' },
    // The Game Awards 2026 : jeudi 10 décembre 2026.
    { start: new Date(2026, 11, 10), end: new Date(2026, 11, 11), msg: '🎮 Ce soir : The Game Awards, les récompenses du jeu vidéo' },
  ]
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'rdv-gaming',
  announceDays: 2,
  url: 'https://www.parisgamesweek.com/',
  events,
  message(ev) {
    return ev.msg;
  },
});
