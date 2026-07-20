// Source calculée : grandes journées civiques mondiales (dates FIXES/calculables).
// DISCIPLINE ANTI-SPAM IDENTIQUE à grandes-journees-mondiales : liste FERMÉE,
// announceDays:0 (le jour J uniquement), sélection courte et digne. NE JAMAIS y
// ajouter d'entrée après coup sans décision explicite.
const { createCalendarSource, formatJourMois, nthWeekday } = require('./lib/calendar-factory');

// Journées à date fixe : { nom, m(0-based), d }.
const FIXES = [
  { nom: 'Journée mondiale de la liberté de la presse', m: 4, d: 3 },
  { nom: 'Journée internationale de la démocratie', m: 8, d: 15 },
  { nom: 'Journée internationale de la paix', m: 8, d: 21 },
  { nom: "Journée des droits de l'homme", m: 11, d: 10 },
];

function events(now) {
  const y = now.getFullYear();
  const list = [];
  for (const year of [y, y + 1]) {
    for (const j of FIXES) {
      list.push({ nom: j.nom, start: new Date(year, j.m, j.d, 0, 0), end: new Date(year, j.m, j.d, 23, 59) });
    }
    // Journée mondiale de la philosophie : 3e jeudi de novembre (calculable).
    const philo = nthWeekday(year, 10, 4, 3);
    list.push({ nom: 'Journée mondiale de la philosophie', start: philo, end: new Date(year, 10, philo.getDate(), 23, 59) });
  }
  return list.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'journees-civiques-mondiales',
  announceDays: 0, // le jour J uniquement
  url: 'https://www.un.org/fr/observances/list-days-weeks',
  events,
  message(ev) {
    return `⚖️ Aujourd'hui : ${ev.nom}.`;
  },
});
