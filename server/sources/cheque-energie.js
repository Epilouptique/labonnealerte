// TODO 2027 : campagne chèque énergie non annoncée (dates au printemps à confirmer).
// Source calculée : date limite de demande du chèque énergie.
const { createCalendarSource } = require('./lib/calendar-factory');

function evenements(now) {
  // Entrée confirmée : date limite de réclamation/demande 2026 = 31 décembre 2026.
  const list = [
    { start: new Date(2026, 11, 31), end: new Date(2027, 0, 1) },
  ];
  return list
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'cheque-energie',
  announceDays: 5,
  url: 'https://chequeenergie.gouv.fr/',
  events: evenements,
  message() {
    return '💶 Chèque énergie : dernier jour pour faire votre demande en ligne (31 décembre)';
  },
});
