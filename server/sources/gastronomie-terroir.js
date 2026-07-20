// Source calculée : gastronomie & agriculture/terroir (fusion). Fenêtre J-2 → fin.
//   • Salon du Chocolat Paris : 28 octobre-1er novembre 2026 (annuel) — TODO 2027
//   • Concours Général Agricole : 27 février-7 mars 2027 (calé sur le SIA) — TODO 2028
//   • Sommet de l'Élevage (Clermont-Ferrand) : 6-9 octobre 2026 (annuel) — TODO 2027
//   • Foire de Châlons : 28 août-7 septembre 2026 (annuel) — TODO 2027
//   • Journée mondiale de l'alimentation : 16 octobre (fixe)
//   • Journée mondiale des abeilles : 20 mai (fixe)
const { createCalendarSource, formatAvecJour, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const EMO = '🍽️';

function events(now) {
  const y = now.getFullYear();
  const out = [];
  // Journées fixes récurrentes.
  for (const year of [y, y + 1]) {
    out.push({ nom: "Journée mondiale de l'alimentation", start: new Date(year, 9, 16), end: new Date(year, 9, 17) });
    out.push({ nom: 'Journée mondiale des abeilles', start: new Date(year, 4, 20), end: new Date(year, 4, 21) });
  }
  // Salons/foires datés (TODO éditions suivantes en tête de fichier).
  out.push({ nom: 'Foire de Châlons', week: true, start: new Date(2026, 7, 28), end: new Date(2026, 8, 8) });
  out.push({ nom: "Sommet de l'Élevage (Clermont-Ferrand)", week: true, start: new Date(2026, 9, 6), end: new Date(2026, 9, 10) });
  out.push({ nom: 'Salon du Chocolat (Paris)', week: true, start: new Date(2026, 9, 28), end: new Date(2026, 10, 2) });
  out.push({ nom: 'Concours Général Agricole (Paris)', week: true, start: new Date(2027, 1, 27), end: new Date(2027, 2, 8) });

  return out.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'gastronomie-terroir',
  announceDays: 2,
  url: 'https://www.salon-du-chocolat.com/',
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
