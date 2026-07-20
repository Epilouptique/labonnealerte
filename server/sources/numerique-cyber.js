// Source calculée : rendez-vous du numérique et de la cybersécurité. Fenêtre J-2 → fin.
//   • Journée de la protection des données : 28 janvier (fixe)
//   • World Password Day : 1er jeudi de mai (calculable — 7 mai 2026, 6 mai 2027)
//   • Cybermois (Mois européen de la cybersécurité) : octobre — on n'annonce QUE les
//     premiers jours (anti-spam, pas tout le mois), comme grandes-causes.
const { createCalendarSource, formatAvecJour, formatJourMois, nthWeekday } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const EMO = '🔐';

function events(now) {
  const y = now.getFullYear();
  const out = [];
  for (const year of [y, y + 1]) {
    out.push({ nom: 'Journée de la protection des données', start: new Date(year, 0, 28), end: new Date(year, 0, 29) });
    // World Password Day : 1er jeudi de mai.
    const pwd = nthWeekday(year, 4, 4, 1);
    out.push({ nom: 'World Password Day', start: pwd, end: new Date(pwd.getTime() + DAY_MS) });
    // Cybermois : 1er au 5 octobre (fenêtre courte pour le lancement).
    out.push({ nom: 'Cybermois (mois européen de la cybersécurité)', cybermois: true, start: new Date(year, 9, 1), end: new Date(year, 9, 6) });
  }
  return out.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'numerique-cyber',
  announceDays: 2,
  url: 'https://www.cybermalveillance.gouv.fr/',
  events,
  message(ev, phase) {
    if (ev.cybermois) {
      if (phase === 'during') return `${EMO} C'est le Cybermois : tout octobre, sensibilisation à la cybersécurité.`;
      return `${EMO} Bientôt le Cybermois (mois européen de la cybersécurité), tout le mois d'octobre.`;
    }
    if (phase === 'during') return `${EMO} Aujourd'hui : ${ev.nom}.`;
    return `${EMO} ${ev.nom} : ${formatAvecJour(ev.start)}.`;
  },
});
