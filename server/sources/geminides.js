// Source calculée : pic des Géminides (le grand essaim d'étoiles filantes d'hiver).
// Pic annuel stable : nuit du 13 au 14 décembre. Modèle des Perséides, fenêtre
// J-2 → J+1.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

function pics(now) {
  const y = now.getFullYear();
  // start = 13 décembre 22h (nuit du 13 au 14) ; actif jusqu'à J+1.
  return [y, y + 1]
    .map((year) => {
      const start = new Date(year, 11, 13, 22);
      return { start, end: new Date(start.getTime() + 2 * DAY_MS) }; // couvre la nuit + le lendemain (J+1)
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'geminides',
  announceDays: 2,
  url: 'https://www.timeanddate.com/astronomy/meteor-shower/geminids.html',
  events: pics,
  message() {
    return '🌠 Pic des Géminides dans la nuit du 13 au 14 décembre — l\'un des plus beaux essaims de l\'année, jusqu\'à 120 étoiles filantes par heure. Couvrez-vous et trouvez un coin sombre !';
  },
});
