// Source calculée : journées et semaines de PRÉVENTION santé. Fenêtre J-2 → fin.
// Distincte de grandes-causes (Octobre Rose, Movember, Téléthon) : aucune date
// commune. Aucune source vaccination-grippe n'existe par ailleurs (vérifié 21/07/2026).
//
// ⚠️ TODO datés (semaines à reconfirmer chaque année, jamais présumées) :
//   • Semaine du cerveau 2027 : vérifier semaineducerveau.fr avant mars 2027.
//   • Semaine européenne de la vaccination 2027 : à confirmer (mesvaccins/ameli).
//   • Don de moelle osseuse : mobilisation le 3e samedi de septembre (calculé).
//   • Campagne de vaccination antigrippale (~mi-octobre) : NON datée → vérifier
//     ameli.fr avant octobre 2026 avant d'ajouter une entrée.
const { createCalendarSource, formatAvecJour, formatJourMois, nthWeekday } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const EMO = '🩺';

function events(now) {
  const y = now.getFullYear();
  const out = [];
  for (const year of [y, y + 1]) {
    // Journées fixes.
    out.push({ nom: 'Journée mondiale de la santé mentale', start: new Date(year, 9, 10), end: new Date(year, 9, 11) });
    out.push({ nom: 'Journée mondiale sans tabac', start: new Date(year, 4, 31), end: new Date(year, 4, 32) });
    // Don de moelle osseuse : mobilisation le 3e samedi de septembre (calculable).
    const moelle = nthWeekday(year, 8, 6, 3);
    out.push({ nom: 'Mobilisation pour le don de moelle osseuse', start: moelle, end: new Date(moelle.getTime() + DAY_MS) });
  }
  // Semaines datées 2026 (TODO 2027 en tête de fichier).
  out.push({ nom: 'Semaine du cerveau', week: true, start: new Date(2026, 2, 16), end: new Date(2026, 2, 23) });
  out.push({ nom: 'Semaine européenne de la vaccination', week: true, start: new Date(2026, 3, 27), end: new Date(2026, 4, 4) });

  return out.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'sante-prevention',
  announceDays: 2,
  url: 'https://www.santepubliquefrance.fr/',
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
