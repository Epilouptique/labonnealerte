// TODO trimestriel : ajouter les sorties ciné fermement datées.
// Source calculée : sorties cinéma majeures (dates de sortie France confirmées).
const { createCalendarSource } = require('./lib/calendar-factory');

function evenements(now) {
  const list = [
    // Avengers: Doomsday : 16 décembre 2026 en France.
    { start: new Date(2026, 11, 16), end: new Date(2026, 11, 17), msg: '🍿 Aujourd\'hui au cinéma : Avengers: Doomsday' },
  ];
  return list
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'sorties-cinema-majeures',
  announceDays: 1,
  url: 'https://www.allocine.fr/',
  events: evenements,
  message(ev) {
    return ev.msg;
  },
});
