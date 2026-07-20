// TODO Foire de Paris 2028, éditions suivantes.
// TODO SIAL Paris 2028 (biennal, années paires) ; MIF Expo 2027 (annuel) ;
//      Salon du Bourget 2029 (SIAE, biennal, années impaires).
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
    // SIAL Paris 2026 (biennal, années paires) : 17 au 21 octobre 2026.
    { start: new Date(2026, 9, 17), end: new Date(2026, 9, 22), msg: '🥫 Le SIAL Paris, salon mondial de l\'alimentation, ouvre à Paris-Nord Villepinte' },
    // MIF Expo (Made in France) 2026 (annuel) : 12 au 15 novembre 2026.
    { start: new Date(2026, 10, 12), end: new Date(2026, 10, 16), msg: '🇫🇷 Le salon MIF Expo (Made in France) ouvre à Paris (Porte de Versailles)' },
    // Salon du Bourget / SIAE 2027 (biennal, années impaires) : 14 au 20 juin 2027.
    { start: new Date(2027, 5, 14), end: new Date(2027, 5, 21), msg: '✈️ Le Salon du Bourget (aéronautique et espace) ouvre au Bourget' },
    // Foire de Paris 2027 : 30 avril au 10 mai 2027 (foiredeparis.fr).
    { start: new Date(2027, 3, 30), end: new Date(2027, 4, 11), msg: '🎡 La Foire de Paris ouvre à la Porte de Versailles' },
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
