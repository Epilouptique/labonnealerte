// Source calculée : grandes journées mondiales majeures (ONU, dates FIXES).
// Sélection courte et digne (anti-spam : 5 entrées, pas une de plus) — pas le
// marronnier quotidien. Fenêtre : le jour J uniquement. URL vers l'institution.
const { createCalendarSource } = require('./lib/calendar-factory');

// mois(0-based), jour, nom, url de référence.
const JOURNEES = [
  { nom: 'Journée internationale des droits des femmes', m: 2, d: 8, url: 'https://www.un.org/fr/observances/womens-day' },
  { nom: "Journée mondiale de l'enfance (droits de l'enfant)", m: 10, d: 20, url: 'https://www.un.org/fr/observances/world-childrens-day' },
  { nom: "Journée internationale pour l'élimination de la violence à l'égard des femmes", m: 10, d: 25, url: 'https://www.un.org/fr/observances/ending-violence-against-women-day' },
  { nom: 'Journée mondiale de lutte contre le sida', m: 11, d: 1, url: 'https://www.un.org/fr/observances/world-aids-day' },
  { nom: 'Journée internationale des personnes handicapées', m: 11, d: 3, url: 'https://www.un.org/fr/observances/day-of-persons-with-disabilities' },
];

function events(now) {
  const y = now.getFullYear();
  const list = [];
  for (const year of [y, y + 1]) {
    for (const j of JOURNEES) {
      list.push({ nom: j.nom, refUrl: j.url, start: new Date(year, j.m, j.d, 0, 0), end: new Date(year, j.m, j.d, 23, 59) });
    }
  }
  return list.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'grandes-journees-mondiales',
  announceDays: 0, // le jour J uniquement
  url: 'https://www.un.org/fr/observances/list-days-weeks',
  events,
  message(ev) {
    return `🕊️ Aujourd'hui : ${ev.nom}.`;
  },
});
