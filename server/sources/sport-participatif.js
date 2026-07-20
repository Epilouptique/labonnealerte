// Source calculée : sport participatif / pour tous. Fenêtre J-2 → fin. Distincte de
// grands-rendez-vous-sportifs (qui couvre le sport d'élite).
//   • Journée olympique : 23 juin (fixe)
//   • Semaine olympique et paralympique (SOP) : 30 mars-4 avril 2026 (daté).
//     ⚠️ TODO : SOP 2027 à confirmer sur generation.paris2024 / sport.gouv.fr avant mars 2027.
const { createCalendarSource, formatAvecJour, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const EMO = '🏅';

function events(now) {
  const y = now.getFullYear();
  const out = [];
  for (const year of [y, y + 1]) {
    out.push({ nom: 'Journée olympique', start: new Date(year, 5, 23), end: new Date(year, 5, 24) });
  }
  // Semaine datée 2026 (TODO 2027 en tête de fichier).
  out.push({ nom: 'Semaine olympique et paralympique (SOP)', week: true, start: new Date(2026, 2, 30), end: new Date(2026, 3, 5) });

  return out.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'sport-participatif',
  announceDays: 2,
  url: 'https://olympics.com/cio/journee-olympique',
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
