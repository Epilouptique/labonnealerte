// Source calculée : grandes marées (coefficient ≥ 100) sur les côtes françaises,
// réf. Brest/SHOM via maree.info.
// TODO 2027 : transcrire les périodes de coeff ≥ 100 depuis maree.info / SHOM.
// Sans mise à jour, la source reste dormante après octobre 2026.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// Périodes 2026 vérifiées sur maree.info (coeff max indiqué).
function events(now) {
  return [
    { start: new Date(2026, 7, 13), end: new Date(2026, 7, 16), coeff: 102 }, // 13→15 août
    { start: new Date(2026, 8, 11), end: new Date(2026, 8, 14), coeff: 102 }, // 11→13 sept.
    { start: new Date(2026, 9, 27), end: new Date(2026, 9, 28), coeff: 100 }, // 27 oct. (journée)
  ].filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'grandes-marees',
  announceDays: 3,
  url: 'https://maree.info/',
  events(now) { return events(now); },
  message(ev, phase) {
    const quand = phase === 'during' ? 'en cours' : 'à venir';
    return `🌊 Grandes marées ${quand} sur le littoral (coefficient jusqu'à ${ev.coeff}) — prudence près de l'eau, belle pêche à pied`;
  },
});
