// Source calculée : rendez-vous du civisme et de la solidarité. Fenêtre J-2 → fin.
// PAS une extension de grandes-causes (thèmes et dates distincts).
//   • Journée nationale des aidants : 6 octobre (fixe)
//   • Semaine européenne pour l'emploi des personnes handicapées (SEEPH) :
//     16-22 novembre 2026 (daté). ⚠️ TODO : SEEPH 2027 à confirmer sur
//     semaine-emploi-handicap.com avant novembre 2027.
const { createCalendarSource, formatAvecJour, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const EMO = '🤝';

function events(now) {
  const y = now.getFullYear();
  const out = [];
  for (const year of [y, y + 1]) {
    out.push({ nom: 'Journée nationale des aidants', start: new Date(year, 9, 6), end: new Date(year, 9, 7) });
  }
  // Semaine datée 2026 (TODO 2027 en tête de fichier).
  out.push({ nom: "Semaine européenne pour l'emploi des personnes handicapées (SEEPH)", week: true, start: new Date(2026, 10, 16), end: new Date(2026, 10, 23) });

  return out.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'civisme-solidarite',
  announceDays: 2,
  url: 'https://www.service-public.gouv.fr/',
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
