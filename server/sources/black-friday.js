// Source calculée : Black Friday — le vendredi suivant le 4e jeudi de novembre.
const { createCalendarSource, nthWeekday, formatAvecJour } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

function blackFridays(now) {
  const y = now.getFullYear();
  return [y, y + 1]
    .map((year) => {
      const jeudi4 = nthWeekday(year, 10, 4, 4); // novembre, jeudi, 4e (Thanksgiving)
      const vendredi = new Date(jeudi4.getTime() + DAY_MS); // vendredi suivant
      return { start: vendredi, end: new Date(vendredi.getTime() + DAY_MS) }; // actif tout le vendredi
    })
    .filter((e) => e.start.getTime() >= now.getTime() - DAY_MS)
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'black-friday',
  announceDays: 5,
  url: 'https://www.economie.gouv.fr/particuliers/black-friday-conseils',
  events: blackFridays,
  message(ev) {
    return `🛒 Black Friday ${formatAvecJour(ev.start)} — gare aux fausses promos, comparez les prix !`;
  },
});
