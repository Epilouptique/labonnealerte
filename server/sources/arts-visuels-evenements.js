// Source calculée : arts visuels (peinture, art contemporain, dessin, illustration).
// Fenêtre J-3 → dernier jour (announceDays 3).
//
// DATES VÉRIFIÉES le 19/07/2026 sur le site officiel de chaque organisateur (jamais de
// mémoire) :
//   - Art Basel Paris (5e) : 23-25 oct. 2026, Grand Palais — artbasel.com (CONFIRMÉ ;
//     ex-« Paris+ par Art Basel », appellation abandonnée).
//   - Prix Marcel Duchamp : remise du prix jeudi 22 oct. 2026, Musée d'Art Moderne de
//     Paris — centrepompidou.fr (CONFIRMÉ ; expo des 4 nommés 2 oct. 2026 → 7 févr. 2027).
//   - Rendez-vous International du Carnet de Voyage (26e) : 13-15 nov. 2026,
//     Clermont-Ferrand — rendezvous-carnetdevoyage.com (CONFIRMÉ, annuel).
//   - Biennale Arte de Venise (61e) : 9 mai → 22 nov. 2026, Venise — labiennale.org.
//     Ouverture (9 mai) déjà passée : on alerte sur la CLÔTURE (« derniers jours »).
//     Prochaine édition ART en 2028 (non datée) → TODO.
//   - Salon du livre et de la presse jeunesse (42e) : 25-30 nov. 2026, Montreuil —
//     slpj.fr (CONFIRMÉ ; forte composante illustration jeunesse).
//   - Drawing Now Paris (20e, foire du dessin contemporain) : 18-21 mars 2027,
//     Carreau du Temple — drawingnowparis.com (CONFIRMÉ).
//   - Salon du Dessin : 7-12 avril 2027, Palais Brongniart — salondudessin.com (CONFIRMÉ).
// TODO (non annoncés au 19/07/2026) : Nuit européenne des musées 2027
//   (nuitdesmusees.culture.gouv.fr) ; Biennale Arte 2028.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { start, end (exclusif, = dernier jour + 1), msg, url }.
const ENTRIES = [
  { s: [2026, 9, 23], e: [2026, 9, 25],
    msg: '🎨 Art Basel Paris ouvre au Grand Palais — foire internationale d\'art (23-25 octobre).',
    url: 'https://www.artbasel.com/paris' },
  { s: [2026, 9, 22], e: [2026, 9, 22],
    msg: '🖼️ Ce soir, la remise du Prix Marcel Duchamp au Musée d\'Art Moderne de Paris.',
    url: 'https://www.adiaf.com/le-prix-marcel-duchamp/' },
  { s: [2026, 10, 13], e: [2026, 10, 15],
    msg: '🖊️ Le Rendez-vous International du Carnet de Voyage ouvre à Clermont-Ferrand (13-15 novembre).',
    url: 'https://rendezvous-carnetdevoyage.com/' },
  { s: [2026, 10, 22], e: [2026, 10, 22],
    msg: '🎨 Derniers jours pour voir la Biennale d\'art de Venise, qui ferme le 22 novembre.',
    url: 'https://www.labiennale.org/en/art/2026' },
  { s: [2026, 10, 25], e: [2026, 10, 30],
    msg: '📚 Le Salon du livre et de la presse jeunesse ouvre à Montreuil (25-30 novembre).',
    url: 'https://slpj.fr/salon/' },
  { s: [2027, 2, 18], e: [2027, 2, 21],
    msg: '✏️ Drawing Now Paris, la foire du dessin contemporain, ouvre au Carreau du Temple (18-21 mars).',
    url: 'https://www.drawingnowparis.com/' },
  { s: [2027, 3, 7], e: [2027, 3, 12],
    msg: '✏️ Le Salon du Dessin ouvre au Palais Brongniart, à Paris (7-12 avril).',
    url: 'https://www.salondudessin.com/' },
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
  id: 'arts-visuels-evenements',
  announceDays: 3,
  url: 'https://www.grandpalais.fr/',
  events,
  message(ev) {
    return ev.msg;
  },
});
