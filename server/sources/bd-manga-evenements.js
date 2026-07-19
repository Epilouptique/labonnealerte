// Source calculée : BD & culture manga/geek (festivals, prix, conventions). Fenêtre
// J-3 → dernier jour (announceDays 3). Complète japan-expo (déjà en prod) sans le dupliquer.
//
// DATES VÉRIFIÉES le 19/07/2026 sur le site officiel de chaque organisateur (jamais de
// mémoire) :
//   - Otakuthon : 7-9 août 2026, Palais des congrès de Montréal — otakuthon.com (CONFIRMÉ).
//   - Paris Manga & Sci-Fi Show (40e) : 3-4 oct. 2026, Paris-Nord Villepinte —
//     parismanga.fr (CONFIRMÉ).
//   - Made in Asia (Fall) : 17-18 oct. 2026, Brussels Expo — madeinasia.be (CONFIRMÉ).
//   - Prix Töpffer : jeudi 26 nov. 2026, Le Cube / HEAD, Genève —
//     evenements.geneve.ch/prixtopffer (CONFIRMÉ).
// TODO (non annoncés / annulés au 19/07/2026) :
//   - FIBD Angoulême 2027 (édition 2026 annulée, 2027 sans date confirmée) + Fauve d'Or.
//   - Comic Con Paris 2027 (bdangouleme.com / comiccon.fr).
//   - Polymanga 2027, Montreux/Lausanne (polymanga.com).
//   - BD Comic Strip Festival de Bruxelles (édition 2026 annulée).
// (Anniversaires de lancement de mangas — ex. One Piece 30e le 22 juil. 2027 — placés
//  dans la source grands-anniversaires, pas ici.)
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { start, end (exclusif, = dernier jour + 1), msg, url }.
const ENTRIES = [
  { s: [2026, 7, 7], e: [2026, 7, 9],
    msg: '🎌 Otakuthon ouvre au Palais des congrès de Montréal — culture japonaise et pop asiatique (7-9 août).',
    url: 'https://www.otakuthon.com/' },
  { s: [2026, 9, 3], e: [2026, 9, 4],
    msg: '🎌 Le Paris Manga & Sci-Fi Show ouvre à Paris-Nord Villepinte (3-4 octobre).',
    url: 'https://www.parismanga.fr/' },
  { s: [2026, 9, 17], e: [2026, 9, 18],
    msg: '🎌 Made in Asia ouvre à Brussels Expo — manga, jeu vidéo et pop asiatique (17-18 octobre).',
    url: 'https://www.madeinasia.be/' },
  { s: [2026, 10, 26], e: [2026, 10, 26],
    msg: '📖 Ce soir à Genève, la remise du Prix Töpffer, grand prix de la bande dessinée.',
    url: 'https://evenements.geneve.ch/prixtopffer/' },
];

function events(now) {
  return ENTRIES
    .map((x) => ({
      start: new Date(x.s[0], x.s[1], x.s[2]),
      end: new Date(new Date(x.e[0], x.e[1], x.e[2]).getTime() + DAY_MS),
      msg: x.msg, url: x.url,
    }))
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'bd-manga-evenements',
  announceDays: 3,
  url: 'https://www.japan-expo-paris.com/',
  events,
  message(ev) {
    return ev.msg;
  },
});
