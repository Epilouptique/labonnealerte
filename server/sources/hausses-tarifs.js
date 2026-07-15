// Source calculée : hausses de tarifs récurrentes datées.
// Révision annuelle des péages autoroutiers au 1er février (calculable).
// TODO : prix du timbre au 1er janvier (montant à ajouter quand La Poste
//   l'annonce chaque été — actuellement non publié pour 2027) ;
//   ajouter d'autres hausses récurrentes datées ultérieurement.
const { createCalendarSource } = require('./lib/calendar-factory');

function events(now) {
  const y = now.getFullYear();
  return [y, y + 1]
    .map((year) => ({
      // Péages autoroutiers : révision au 1er février.
      start: new Date(year, 1, 1),
      end: new Date(year, 1, 3),
    }))
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'hausses-tarifs',
  announceDays: 3,
  url: 'https://www.service-public.fr/',
  events,
  message() {
    return '💶 Les péages autoroutiers augmentent au 1er février (révision annuelle)';
  },
});
