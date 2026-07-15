// TODO 2027 : Earth Overshoot Day 2027 non publié.
// Source calculée : Jour du dépassement (Earth Overshoot Day).
const { createCalendarSource } = require('./lib/calendar-factory');

function evenements(now) {
  // Entrée confirmée : Earth Overshoot Day 2026 = 30 juillet 2026.
  const list = [
    { start: new Date(2026, 6, 30), end: new Date(2026, 6, 31) },
  ];
  return list
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'jour-depassement',
  announceDays: 2,
  url: 'https://overshoot.footprintnetwork.org/',
  events: evenements,
  message() {
    return "🌍 Jour du dépassement : depuis aujourd'hui, l'humanité vit à crédit sur les ressources de la planète";
  },
});
