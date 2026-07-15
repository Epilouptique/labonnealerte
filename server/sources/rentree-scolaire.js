// Source calculée : rentrée scolaire des élèves — dates de l'arrêté officiel.
// TODO 2027 (arrêté calendrier scolaire à paraître).
const { createCalendarSource } = require('./lib/calendar-factory');

function events(now) {
  return [
    // Rentrée des élèves : mardi 1er septembre 2026.
    { start: new Date(2026, 8, 1), end: new Date(2026, 8, 2) },
  ]
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'rentree-scolaire',
  announceDays: 7,
  url: 'https://www.education.gouv.fr/calendrier-scolaire',
  events,
  message() {
    return '🎒 C\'est la rentrée mardi 1er septembre — préparez cartables et emplois du temps';
  },
});
