// Source calculée : têtes d'affiche en concert en France (zéro API). Fenêtre
// d'annonce J-7 → jour du concert.
//
// FILTRE STRICT : 2027 uniquement, France, dates PRÉCISES confirmées sur la
// billetterie/salle officielle (jamais de mémoire, jamais de date inventée). Les
// tournées annoncées seulement par « villes » ou « fourchette de mois » SANS jour
// exact ne sont PAS incluses (voir TODO ci-dessous) — la factory calendar exige une
// date. Convention Bison Futé respectée.
//
// ⚠️ NON INCLUS faute de dates précises publiques (à compléter dès parution) :
//   • Ninho (Quattro Tour) — Lyon LDLC, Marseille Dôme, Nantes, Bordeaux, Pau
//     (janv-mars 2027, jours non confirmés).
//   • Vianney — tournée mars-mai 2027 (Reims, Nancy, Paris, Lyon, Lille, Nantes,
//     Aix, Floirac), jours non confirmés.
//   • Céline Dion — « 10 dates mai 2027 » à Paris La Défense Arena, jours non
//     détaillés → ne rien fabriquer.
//   • Grand Corps Malade — tournée ~26 dates : seules les 4 dates à jour exact
//     ci-dessous sont retenues.
// ⚠️ NON INCLUS (non confirmé) : Zazie — Olympia 9 juin 2027 (non vérifiable sur
//   source officielle à l'exploration). Christine and the Queens — Zénith Dijon
//   29 avril 2027 (écartée : programmation officielle ne la liste pas).
const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { artiste, y, m (0-based), d, lieu }. Une entrée = un concert (tournées dépliées).
const CONCERTS = [
  // Florent Pagny — Accor Arena Paris + Nantes + Lyon.
  { artiste: 'Florent Pagny', y: 2027, m: 0, d: 6, lieu: 'Paris (Accor Arena)' },
  { artiste: 'Florent Pagny', y: 2027, m: 0, d: 7, lieu: 'Paris (Accor Arena)' },
  { artiste: 'Florent Pagny', y: 2027, m: 0, d: 11, lieu: 'Nantes' },
  { artiste: 'Florent Pagny', y: 2027, m: 0, d: 12, lieu: 'Nantes' },
  { artiste: 'Florent Pagny', y: 2027, m: 0, d: 15, lieu: 'Lyon' },
  // Grand Corps Malade (dates à jour exact confirmé uniquement).
  { artiste: 'Grand Corps Malade', y: 2027, m: 0, d: 23, lieu: 'Orléans (Zénith)' },
  { artiste: 'Grand Corps Malade', y: 2027, m: 1, d: 5, lieu: 'Futuroscope (Arena Futuroscope)' },
  { artiste: 'Grand Corps Malade', y: 2027, m: 2, d: 12, lieu: 'Paris (Adidas Arena)' },
  { artiste: 'Grand Corps Malade', y: 2027, m: 2, d: 13, lieu: 'Paris (Adidas Arena)' },
  { artiste: 'Grand Corps Malade', y: 2027, m: 3, d: 2, lieu: 'Amnéville' },
  // Bigflo & Oli (Karma Tour).
  { artiste: 'Bigflo & Oli', y: 2027, m: 0, d: 29, lieu: "Clermont-Ferrand (Zénith d'Auvergne)" },
  // Rush.
  { artiste: 'Rush', y: 2027, m: 1, d: 19, lieu: 'Paris La Défense Arena' },
  // ENHYPEN.
  { artiste: 'ENHYPEN', y: 2027, m: 1, d: 27, lieu: 'Paris La Défense Arena' },
  // Niska — Stade de France.
  { artiste: 'Niska', y: 2027, m: 3, d: 9, lieu: 'Paris (Stade de France)' },
  { artiste: 'Niska', y: 2027, m: 3, d: 10, lieu: 'Paris (Stade de France)' },
  { artiste: 'Niska', y: 2027, m: 3, d: 11, lieu: 'Paris (Stade de France)' },
  // Sofiane Pamart.
  { artiste: 'Sofiane Pamart', y: 2027, m: 3, d: 17, lieu: 'Paris (Stade de France)' },
  // SCH.
  { artiste: 'SCH', y: 2027, m: 3, d: 24, lieu: 'Paris (Stade de France)' },
  // Olivia Rodrigo.
  { artiste: 'Olivia Rodrigo', y: 2027, m: 3, d: 23, lieu: 'Paris La Défense Arena' },
  { artiste: 'Olivia Rodrigo', y: 2027, m: 3, d: 24, lieu: 'Paris La Défense Arena' },
  // Blink-182.
  { artiste: 'Blink-182', y: 2027, m: 5, d: 15, lieu: 'Paris La Défense Arena' },
  // Gims (Carpe Diem Tour).
  { artiste: 'Gims', y: 2027, m: 5, d: 19, lieu: 'Marseille' },
  { artiste: 'Gims', y: 2027, m: 6, d: 3, lieu: 'Nice' },
  // Karol G.
  { artiste: 'Karol G', y: 2027, m: 6, d: 1, lieu: 'Paris' },
  { artiste: 'Karol G', y: 2027, m: 6, d: 21, lieu: 'Lyon' },
];

function events(now) {
  return CONCERTS
    .map((c) => {
      const start = new Date(c.y, c.m, c.d);
      return { start, end: new Date(start.getTime() + DAY_MS), artiste: c.artiste, lieu: c.lieu };
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'grands-concerts',
  announceDays: 7,
  url: 'https://www.francebillet.com/',
  events,
  message(ev, phase) {
    if (phase === 'during') {
      return `🎤 ${ev.artiste} en concert ce soir à ${ev.lieu}.`;
    }
    return `🎤 ${ev.artiste} en concert à ${ev.lieu} : ${formatAvecJour(ev.start)}.`;
  },
});
