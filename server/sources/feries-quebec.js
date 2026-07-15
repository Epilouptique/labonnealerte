// Source calculée : jours fériés du Québec (calendrier CNESST).
// Dates EXPLICITES vérifiées 2026-2027 (jamais de mémoire : voir rapport de vague).
// Pas de logique « pont » (concept non transposable au Québec). Fenêtre d'annonce
// courte : « Demain : … » la veille, « Aujourd'hui : … » le jour même.
const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

// [année] → liste { nom, mois(0-based), jour }. Dates vérifiées (CNESST / gouv.qc.ca).
const FERIES = {
  2026: [
    { nom: "jour de l'An", m: 0, d: 1 },
    { nom: 'Vendredi saint', m: 3, d: 3 },
    { nom: 'la Journée nationale des patriotes', m: 4, d: 18 },
    { nom: 'la Fête nationale du Québec', m: 5, d: 24 },
    { nom: 'la fête du Canada', m: 6, d: 1 },
    { nom: 'la fête du Travail', m: 8, d: 7 },
    { nom: "l'Action de grâce", m: 9, d: 12 },
    { nom: 'Noël', m: 11, d: 25 },
  ],
  2027: [
    { nom: "jour de l'An", m: 0, d: 1 },
    { nom: 'Vendredi saint', m: 2, d: 26 },
    { nom: 'la Journée nationale des patriotes', m: 4, d: 24 },
    { nom: 'la Fête nationale du Québec', m: 5, d: 24 },
    { nom: 'la fête du Canada', m: 6, d: 1 },
    { nom: 'la fête du Travail', m: 8, d: 6 },
    { nom: "l'Action de grâce", m: 9, d: 11 },
    { nom: 'Noël', m: 11, d: 25 },
  ],
};

function events(now) {
  const y = now.getFullYear();
  const list = [];
  for (const year of [y, y + 1]) {
    for (const f of FERIES[year] || []) {
      list.push({
        nom: f.nom,
        start: new Date(year, f.m, f.d, 0, 0),
        end: new Date(year, f.m, f.d, 23, 59),
      });
    }
  }
  return list.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'feries-quebec',
  announceDays: 1,
  url: 'https://www.cnesst.gouv.qc.ca/fr/conditions-travail/conges/jours-feries',
  events,
  message(ev, phase) {
    const quand = phase === 'during' ? "Aujourd'hui" : 'Demain';
    return `🍁 ${quand} : ${ev.nom} — jour férié au Québec.`;
  },
});
