// TODO Foire de Paris 2027 (non reconfirmée), éditions suivantes.
// Source calculée : grands salons grand public (dates fermes vérifiées).
const { createCalendarSource } = require('./lib/calendar-factory');

function evenements(now) {
  const list = [
    // Salon de l'Agriculture 2027 : 27 février au 7 mars 2027.
    { start: new Date(2027, 1, 27), end: new Date(2027, 2, 8), msg: "🚜 Le Salon de l'Agriculture ouvre à Paris (Porte de Versailles)" },
    // Mondial de l'Auto 2026 : 12 au 18 octobre 2026.
    { start: new Date(2026, 9, 12), end: new Date(2026, 9, 19), msg: "🚗 Le Mondial de l'Auto ouvre à Paris" },
    // VivaTech 2027 : 16 au 19 juin 2027.
    { start: new Date(2027, 5, 16), end: new Date(2027, 5, 20), msg: '🤖 VivaTech, le grand salon tech européen, ouvre à Paris' },
  ];
  return list
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'grands-salons',
  announceDays: 2,
  url: 'https://www.viparis.com/',
  events: evenements,
  message(ev) {
    return ev.msg;
  },
});
