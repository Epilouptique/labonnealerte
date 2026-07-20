// Source calculée : patrimoine & nature (fusion). Fenêtre J-2 → fin.
// DISTINCTE de journees-environnement (Earth Day 22/4, biodiversité 22/5,
// environnement 5/6, océans 8/6, Fête de la Nature) : AUCUNE date commune (vérifié).
//   • Journée mondiale de la faune sauvage : 3 mars (fixe)
//   • Journée internationale des forêts : 21 mars (fixe)
//   • Journée internationale des monuments et des sites : 18 avril (fixe)
//   • Jour de la Nuit : 10 octobre 2026 (daté) — TODO 2027
//   • Nuit internationale de la chauve-souris : 29-30 août 2026 (daté) — TODO 2027
//   • Journées Européennes des Métiers d'Art (JEMA) : 30 mars-4 avril 2027 (confirmé)
//   • Salon International du Patrimoine Culturel : 29 octobre-1er novembre 2026 (annuel) — TODO 2027
const { createCalendarSource, formatAvecJour, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const EMO = '🏛️';

function events(now) {
  const y = now.getFullYear();
  const out = [];
  for (const year of [y, y + 1]) {
    out.push({ nom: 'Journée mondiale de la faune sauvage', start: new Date(year, 2, 3), end: new Date(year, 2, 4) });
    out.push({ nom: 'Journée internationale des forêts', start: new Date(year, 2, 21), end: new Date(year, 2, 22) });
    out.push({ nom: 'Journée internationale des monuments et des sites', start: new Date(year, 3, 18), end: new Date(year, 3, 19) });
  }
  // Rendez-vous datés (TODO éditions suivantes en tête de fichier).
  out.push({ nom: 'Nuit internationale de la chauve-souris', week: true, start: new Date(2026, 7, 29), end: new Date(2026, 7, 31) });
  out.push({ nom: 'Jour de la Nuit', start: new Date(2026, 9, 10), end: new Date(2026, 9, 11) });
  out.push({ nom: 'Salon International du Patrimoine Culturel (Paris)', week: true, start: new Date(2026, 9, 29), end: new Date(2026, 10, 2) });
  out.push({ nom: "Journées Européennes des Métiers d'Art (JEMA)", week: true, start: new Date(2027, 2, 30), end: new Date(2027, 3, 5) });

  return out.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'patrimoine-nature',
  announceDays: 2,
  url: 'https://www.culture.gouv.fr/',
  events,
  message(ev, phase) {
    if (ev.week) {
      const fin = new Date(ev.end.getTime() - DAY_MS);
      if (phase === 'during') return `${EMO} ${ev.nom} : c'est en cours (jusqu'au ${formatJourMois(fin)}).`;
      return `${EMO} Bientôt : ${ev.nom}, du ${formatJourMois(ev.start)} au ${formatJourMois(fin)}.`;
    }
    if (phase === 'during') return `${EMO} Aujourd'hui : ${ev.nom}.`;
    return `${EMO} ${ev.nom} : ${formatAvecJour(ev.start)}.`;
  },
});
