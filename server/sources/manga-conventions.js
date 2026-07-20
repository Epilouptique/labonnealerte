// Source calculée : grandes conventions manga / anime / pop-culture asiatique.
// Fenêtre J-3 → 1er jour. Dates officielles vérifiées (jamais de mémoire).
// DISTINCTE de japan-expo.js (Japan Expo 2027, 8-11 juillet) — non dupliquée ici.
//
// ⚠️ Polymanga 2027 : dates 26-29 mars 2027 retenues telles quelles ; à re-confirmer
//   sur la billetterie officielle avant la saison (léger doute signalé à l'exploration).
// ⚠️ AnimeJapan 2027 : l'édition DÉMÉNAGE à Osaka (26-28 mars 2027) — noté pour éviter
//   toute confusion avec les éditions historiques de Tokyo.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { nom, lieu, y, m(0-based), d1 (1er jour), d2 (dernier jour), url }.
const CONVENTIONS = [
  { nom: 'Otakuthon', lieu: 'Montréal', y: 2026, m: 7, d1: 7, d2: 9, url: 'https://www.otakuthon.com/' },
  { nom: 'Paris Manga & Sci-Fi Show', lieu: 'Villepinte', y: 2026, m: 9, d1: 3, d2: 4, url: 'https://www.parismanga.fr/' },
  { nom: 'Made in Asia (Fall)', lieu: 'Bruxelles', y: 2026, m: 9, d1: 17, d2: 18, url: 'https://www.madeinasia.be/' },
  { nom: 'Toulouse Game Show', lieu: 'Toulouse', y: 2026, m: 10, d1: 28, d2: 29, url: 'https://www.toulousegameshow.fr/' },
  { nom: 'Japan Touch', lieu: 'Lyon (Eurexpo)', y: 2026, m: 10, d1: 28, d2: 29, url: 'https://www.japan-touch.com/' },
  { nom: 'Comiket C109', lieu: 'Tokyo', y: 2026, m: 11, d1: 29, d2: 31, url: 'https://www.comiket.co.jp/' },
  { nom: 'AnimeJapan', lieu: 'Osaka', y: 2027, m: 2, d1: 26, d2: 28, url: 'https://www.anime-japan.jp/' },
  { nom: 'Polymanga', lieu: 'Montreux (Suisse)', y: 2027, m: 2, d1: 26, d2: 29, url: 'https://www.polymanga.com/' },
];

function events(now) {
  return CONVENTIONS
    .map((c) => {
      const start = new Date(c.y, c.m, c.d1);
      const fin = new Date(c.y, c.m, c.d2);
      return { start, fin, end: new Date(fin.getTime() + DAY_MS), nom: c.nom, lieu: c.lieu, url: c.url };
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'manga-conventions',
  announceDays: 3,
  url: 'https://www.japan-touch.com/',
  events,
  message(ev, phase) {
    if (phase === 'before') return `🎌 Bientôt la convention ${ev.nom} à ${ev.lieu}.`;
    return `🎌 Ça commence : ${ev.nom} ouvre à ${ev.lieu}.`;
  },
});
