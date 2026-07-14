// Source calculée : pic des Perséides (étoiles filantes).
// Pic annuel stable : nuit du 12 au 13 août.
const { createCalendarSource } = require('./lib/calendar-factory');

function pics(now) {
  const y = now.getFullYear();
  // start = 12 août 22h ; on garde l'occurrence courante et la suivante.
  return [y, y + 1]
    .map((year) => ({ start: new Date(year, 7, 12, 22) }))
    .filter((e) => e.start.getTime() >= now.getTime() - 24 * 3600 * 1000)
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'perseides',
  announceDays: 4,
  url: 'https://www.timeanddate.com/astronomy/meteor-shower/perseids.html',
  events: pics,
  message() {
    return '🌠 Pic des Perséides dans la nuit du 12 au 13 août — jusqu\'à 100 étoiles filantes par heure. Trouvez un coin sans lumière !';
  },
});
