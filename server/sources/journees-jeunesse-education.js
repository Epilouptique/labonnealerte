// Source calculée : journées jeunesse & éducation (dates FIXES/calculables).
// DISCIPLINE ANTI-SPAM IDENTIQUE à grandes-journees-mondiales et
// journees-civiques-mondiales : liste FERMÉE, announceDays:0 (le jour J uniquement).
// NE JAMAIS y ajouter d'entrée après coup sans décision explicite.
//
// EXCLUES volontairement (doublons) : Journée mondiale de l'enfance (20 novembre,
// déjà dans grandes-journees-mondiales) ; Journée de la langue française (20 mars,
// déjà couverte par francophonie.js).
const { createCalendarSource, nthWeekday } = require('./lib/calendar-factory');

// Journées à date fixe : { nom, m(0-based), d }.
const FIXES = [
  { nom: "Journée internationale de l'éducation", m: 0, d: 24 },
  { nom: 'Journée mondiale des compétences des jeunes', m: 6, d: 15 },
  { nom: "Journée internationale de l'amitié", m: 6, d: 30 },
  { nom: 'Journée internationale de la jeunesse', m: 7, d: 12 },
  { nom: "Journée internationale de l'alphabétisation", m: 8, d: 8 },
  { nom: 'Journée mondiale des enseignants', m: 9, d: 5 },
];

function events(now) {
  const y = now.getFullYear();
  const list = [];
  for (const year of [y, y + 1]) {
    for (const j of FIXES) {
      list.push({ nom: j.nom, start: new Date(year, j.m, j.d, 0, 0), end: new Date(year, j.m, j.d, 23, 59) });
    }
    // Safer Internet Day : 2e mardi de février (calculable).
    const sid = nthWeekday(year, 1, 2, 2);
    list.push({ nom: 'Safer Internet Day', start: sid, end: new Date(year, 1, sid.getDate(), 23, 59) });
    // Girls in ICT Day : 4e jeudi d'avril (calculable).
    const gict = nthWeekday(year, 3, 4, 4);
    list.push({ nom: 'Girls in ICT Day', start: gict, end: new Date(year, 3, gict.getDate(), 23, 59) });
  }
  return list.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'journees-jeunesse-education',
  announceDays: 0, // le jour J uniquement
  url: 'https://www.un.org/fr/observances/list-days-weeks',
  events,
  message(ev) {
    return `🎓 Aujourd'hui : ${ev.nom}.`;
  },
});
