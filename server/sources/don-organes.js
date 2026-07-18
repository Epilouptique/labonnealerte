// Source calculée : Journée nationale de réflexion sur le don d'organes et la greffe
// (et de reconnaissance aux donneurs). Date FIXE : le 22 juin, chaque année
// (Agence de la biomédecine — VÉRIFIÉ). Journée FRANÇAISE, distincte des journées
// mondiales ONU (cf. grandes-journees-mondiales). Active le jour J.
const { createCalendarSource } = require('./lib/calendar-factory');

// 22 juin de l'année en cours et de la suivante (les années passent, la source suit).
function events(now) {
  const y = now.getFullYear();
  return [y, y + 1]
    .map((year) => ({ start: new Date(year, 5, 22), end: new Date(year, 5, 23) }))
    .filter((e) => e.end.getTime() >= now.getTime());
}

module.exports = createCalendarSource({
  id: 'don-organes',
  announceDays: 0,
  url: 'https://www.dondorganes.fr/',
  events,
  message() {
    return '🫀 Aujourd\'hui, Journée nationale de réflexion sur le don d\'organes : l\'occasion de faire connaître sa position à ses proches';
  },
});
