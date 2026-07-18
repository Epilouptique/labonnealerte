// Source calculée : Japan Expo (Paris-Nord Villepinte). Public geek/manga.
// DATE VÉRIFIÉE : 8-11 juillet 2027 (26e éd.) — expo.paris (CONFIRMÉ, à recroiser sur
// paris.japan-expo.com). Fenêtre J-3 → dernier jour.
// ⚠️ TODO ANNUEL.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const EDITIONS = [{ y: 2027, m: 6, d1: 8, d2: 11 }];

function events(now) {
  return EDITIONS
    .map((e) => ({
      start: new Date(e.y, e.m, e.d1),
      end: new Date(new Date(e.y, e.m, e.d2).getTime() + DAY_MS),
    }))
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'japan-expo',
  announceDays: 3,
  url: 'https://www.japan-expo-paris.com/',
  events,
  message(ev, phase) {
    if (phase === 'before') return '🎌 Bientôt Japan Expo, à Paris-Nord Villepinte — mangas, culture et pop japonaise.';
    return '🎌 C\'est Japan Expo — quatre jours de culture japonaise à Paris-Nord Villepinte.';
  },
});
