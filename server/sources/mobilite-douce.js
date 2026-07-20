// Source calculée : rendez-vous de la mobilité douce. Fenêtre J-2 → fin.
//   • Semaine européenne de la mobilité : 16-22 septembre (fixe)
//   • Journée mondiale sans voiture : 22 septembre (fixe, clôt la semaine)
//   • Mai à vélo : mois de mai — on n'annonce QUE les premiers jours (anti-spam).
// NB : la Journée mondiale du vélo (3 juin, ONU) est VOLONTAIREMENT exclue (décision
// actée, doublon thématique évité).
const { createCalendarSource, formatAvecJour, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const EMO = '🚲';

function events(now) {
  const y = now.getFullYear();
  const out = [];
  for (const year of [y, y + 1]) {
    out.push({ nom: 'Semaine européenne de la mobilité', week: true, start: new Date(year, 8, 16), end: new Date(year, 8, 23) });
    out.push({ nom: 'Journée mondiale sans voiture', start: new Date(year, 8, 22), end: new Date(year, 8, 23) });
    // Mai à vélo : 1er au 5 mai (fenêtre courte pour le lancement du mois).
    out.push({ nom: 'Mai à vélo', maiavelo: true, start: new Date(year, 4, 1), end: new Date(year, 4, 6) });
  }
  return out.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'mobilite-douce',
  announceDays: 2,
  url: 'https://www.ecologie.gouv.fr/semaine-europeenne-mobilite',
  events,
  message(ev, phase) {
    if (ev.maiavelo) {
      if (phase === 'during') return `${EMO} C'est Mai à vélo : tout le mois, le rendez-vous national du vélo.`;
      return `${EMO} Bientôt Mai à vélo, le rendez-vous national du vélo tout le mois de mai.`;
    }
    if (ev.week) {
      const fin = new Date(ev.end.getTime() - DAY_MS);
      if (phase === 'during') return `${EMO} ${ev.nom} : c'est en cours (jusqu'au ${formatJourMois(fin)}).`;
      return `${EMO} Bientôt : ${ev.nom}, du ${formatJourMois(ev.start)} au ${formatJourMois(fin)}.`;
    }
    if (phase === 'during') return `${EMO} Aujourd'hui : ${ev.nom}.`;
    return `${EMO} ${ev.nom} : ${formatAvecJour(ev.start)}.`;
  },
});
