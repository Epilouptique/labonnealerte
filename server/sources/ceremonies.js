// Source calculée : cérémonies cinéma — dates officielles annoncées.
// TODO 2028.
const { createCalendarSource } = require('./lib/calendar-factory');

function events(now) {
  return [
    // Césars 2027 (52e) : jeudi 25 février 2027.
    { start: new Date(2027, 1, 25), end: new Date(2027, 1, 26), msg: '🏆 Ce soir : la 52e cérémonie des Césars' },
    // Oscars 2027 (99e) : dimanche 14 mars 2027.
    { start: new Date(2027, 2, 14), end: new Date(2027, 2, 15), msg: '🏆 Ce soir : la 99e cérémonie des Oscars' },
  ]
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'ceremonies',
  announceDays: 2,
  url: 'https://www.academie-cinema.org/',
  events,
  message(ev) {
    return ev.msg;
  },
});
