// Source calculée : Nuits de la lecture — dates officielles.
// TODO 2028.
const { createCalendarSource } = require('./lib/calendar-factory');

function events(now) {
  return [
    // Nuits de la lecture 2027 : 20 au 24 janvier 2027, thème « L'enfance ».
    { start: new Date(2027, 0, 20), end: new Date(2027, 0, 25) },
  ]
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'nuits-de-la-lecture',
  announceDays: 5,
  url: 'https://www.nuitsdelalecture.fr/',
  events,
  message(ev, phase) {
    return phase === 'during'
      ? '📚 Les Nuits de la lecture, c\'est en ce moment (thème « L\'enfance ») — lectures et animations partout en France'
      : '📚 Les Nuits de la lecture du 20 au 24 janvier (thème « L\'enfance ») — lectures et animations partout en France';
  },
});
