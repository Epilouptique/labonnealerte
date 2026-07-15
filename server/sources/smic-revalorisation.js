// Source calculée : revalorisations annuelles automatiques (SMIC, prestations sociales).
// Aucun montant affiché : il est fixé chaque année par décret.
const { createCalendarSource } = require('./lib/calendar-factory');

// TODO : ajouter le montant à chaque annonce (config par année, une fois le décret publié).
function events(now) {
  const y = now.getFullYear();
  const list = [];

  // Récurrents annuels : année courante + suivante (le filtre écarte le passé).
  for (const year of [y, y + 1]) {
    // SMIC — revalorisation au 1er janvier (fenêtre 1er au 2 janvier, fin 3 janvier minuit).
    list.push({
      name: 'Revalorisation du SMIC',
      start: new Date(year, 0, 1),
      end: new Date(year, 0, 3),
      message: '💶 Le SMIC est revalorisé au 1er janvier',
    });
    // Prestations sociales / retraites — revalorisation au 1er avril.
    list.push({
      name: 'Revalorisation des prestations sociales',
      start: new Date(year, 3, 1),
      end: new Date(year, 3, 3),
      message: '💶 Revalorisation annuelle de plusieurs prestations sociales au 1er avril',
    });
  }

  return list
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'smic-revalorisation',
  announceDays: 3,
  url: 'https://www.service-public.gouv.fr/',
  events,
  message(ev) {
    return ev.message;
  },
});
