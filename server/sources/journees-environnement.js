// Source calculée : journées de l'environnement. Fenêtre J-2 → fin. Distincte de
// rdv-planete (Heure de la Terre, World Cleanup Day, SERD) et de jour-depassement
// (Earth Overshoot Day) : AUCUNE date commune.
//
// ⚠️ TODO daté : Fête de la Nature 2027 à confirmer sur fetedelanature.com avant mai 2027.
const { createCalendarSource, formatAvecJour, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const EMO = '🌱';

function events(now) {
  const y = now.getFullYear();
  const out = [];
  for (const year of [y, y + 1]) {
    out.push({ nom: 'Jour de la Terre (Earth Day)', start: new Date(year, 3, 22), end: new Date(year, 3, 23) });
    out.push({ nom: 'Journée internationale de la biodiversité', start: new Date(year, 4, 22), end: new Date(year, 4, 23) });
    out.push({ nom: "Journée mondiale de l'environnement", start: new Date(year, 5, 5), end: new Date(year, 5, 6) });
    out.push({ nom: 'Journée mondiale des océans', start: new Date(year, 5, 8), end: new Date(year, 5, 9) });
  }
  // Semaine datée 2026 (TODO 2027 en tête de fichier).
  out.push({ nom: 'Fête de la Nature', week: true, start: new Date(2026, 4, 20), end: new Date(2026, 4, 26) });

  return out.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'journees-environnement',
  announceDays: 2,
  url: 'https://www.un.org/fr/observances/environment-day',
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
