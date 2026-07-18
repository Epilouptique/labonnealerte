// Source calculée : les grands prix littéraires d'automne (LE rendez-vous francophone).
// Fenêtre : veille + jour J (announceDays 1). Message 📚 sobre.
//
// DATES 2026 VÉRIFIÉES (jamais de mémoire) :
//   - Grand Prix du roman de l'Académie française : jeudi 29 octobre 2026
//     → OFFICIEL academie-francaise.fr/actualites/grand-prix-du-roman-2026
//   - Médicis (2 nov), Goncourt (3 nov), Renaudot (3 nov, même jour), Femina (4 nov)
//     → calendrier professionnel de référence Livres Hebdo (« calendrier des grands
//       prix littéraires d'automne 2026 »). Ces quatre dates peuvent être décalées
//       d'un jour par les jurys ; source non institutionnelle par prix (voir rapport).
//   - Goncourt des lycéens : proclamation fin novembre 2026, JOUR EXACT NON FIXÉ
//     (sources divergentes 26/27 nov) → TODO, pas d'entrée tant que non officialisé.
//
// ⚠️ TODO ANNUEL : recurer chaque automne (nouvelles dates), et ajouter le Goncourt
// des lycéens dès que l'Académie publie le jour exact 2026.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { nom court, y, m(0-based), d, url }.
const PRIX = [
  { nom: 'Grand Prix du roman de l\'Académie française', y: 2026, m: 9, d: 29,
    url: 'https://www.academie-francaise.fr/actualites/grand-prix-du-roman-2026' },
  { nom: 'prix Médicis', y: 2026, m: 10, d: 2, url: 'https://www.livreshebdo.fr/' },
  { nom: 'prix Goncourt', y: 2026, m: 10, d: 3, url: 'https://www.academiegoncourt.com/' },
  { nom: 'prix Renaudot', y: 2026, m: 10, d: 3, url: 'https://www.livreshebdo.fr/' },
  { nom: 'prix Femina', y: 2026, m: 10, d: 4, url: 'https://www.livreshebdo.fr/' },
];

function events(now) {
  return PRIX
    .map((p) => ({
      start: new Date(p.y, p.m, p.d),
      end: new Date(new Date(p.y, p.m, p.d).getTime() + DAY_MS),
      nom: p.nom, annee: p.y, url: p.url,
    }))
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'prix-litteraires',
  announceDays: 1, // veille + jour J
  url: 'https://www.livreshebdo.fr/',
  events,
  message(ev, phase) {
    if (phase === 'before') {
      return `📚 Demain : le ${ev.nom} ${ev.annee} est décerné.`;
    }
    return `📚 Aujourd'hui : le ${ev.nom} ${ev.annee} est décerné.`;
  },
});
