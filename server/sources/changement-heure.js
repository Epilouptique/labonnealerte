// Source calculée : changement d'heure (été / hiver).
// Règle UE (calculée, valable toutes années) :
//   heure d'été   = dernier dimanche de mars, 2h → 3h  (on PERD une heure)
//   heure d'hiver = dernier dimanche d'octobre, 3h → 2h (on GAGNE une heure)
const { createCalendarSource, lastWeekday } = require('./lib/calendar-factory');

function transitions(now) {
  const y = now.getFullYear();
  const list = [];
  for (const year of [y, y + 1]) {
    list.push({ saison: 'été', start: lastWeekday(year, 2, 0, 2) });  // mars, dim, 2h
    list.push({ saison: 'hiver', start: lastWeekday(year, 9, 0, 3) }); // octobre, dim, 3h
  }
  return list.filter((e) => e.start.getTime() >= now.getTime() - 2 * 24 * 3600 * 1000)
             .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'changement-heure',
  announceDays: 3,
  url: 'https://www.service-public.fr/particuliers/vosdroits/F1743',
  events: transitions,
  message(ev) {
    return ev.saison === 'été'
      ? '🕑 Passage à l\'heure d\'été dans la nuit de samedi à dimanche : à 2h, il sera 3h. On perd une heure de sommeil.'
      : '🕑 Passage à l\'heure d\'hiver dans la nuit de samedi à dimanche : à 3h, il sera 2h. On gagne une heure de sommeil.';
  },
});
