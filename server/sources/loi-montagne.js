// Source calculée : Loi Montagne — obligation d'équipements hiver (zéro API).
//
// Du 1er novembre au 31 mars, pneus hiver/4 saisons 3PMSF ou chaînes/chaussettes
// à bord sont obligatoires dans les départements montagneux concernés (dont les
// Hautes-Alpes). On NE veut PAS une alerte permanente de 5 mois : on rappelle
// seulement l'ENTRÉE EN VIGUEUR — fenêtre J-7 avant le 1er novembre → 3 novembre
// inclus. Récurrent chaque année.

const { createCalendarSource } = require('./lib/calendar-factory');

function events(now) {
  const y = now.getFullYear();
  return [y, y + 1]
    .map(function (year) {
      return {
        start: new Date(year, 10, 1),  // 1er novembre (entrée en vigueur)
        end: new Date(year, 10, 4),    // actif jusqu'au 3 novembre inclus (fin = 4 nov 00h)
      };
    })
    .filter(function (e) { return e.end.getTime() >= now.getTime(); })
    .sort(function (a, b) { return a.start - b.start; });
}

module.exports = createCalendarSource({
  id: 'loi-montagne',
  announceDays: 7,
  url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F35057',
  events: events,
  message: function () {
    return '❄️🚗 Loi Montagne : équipements hiver obligatoires à partir du 1er novembre ' +
      'dans les départements concernés — pneus hiver, 4 saisons 3PMSF ou chaînes/chaussettes à bord.';
  },
});
