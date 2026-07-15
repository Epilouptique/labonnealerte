// Source calculée : jours fériés légaux de Belgique (10 fériés, loi de 1974).
// Dates EXPLICITES vérifiées 2026-2027 (fixes + mobiles basées sur Pâques).
const { createCalendarSource } = require('./lib/calendar-factory');

// Fixes (valables chaque année) : mois(0-based), jour, nom.
const FIXES = [
  { nom: "jour de l'An", m: 0, d: 1 },
  { nom: 'la fête du Travail', m: 4, d: 1 },
  { nom: 'la fête nationale belge', m: 6, d: 21 },
  { nom: "l'Assomption", m: 7, d: 15 },
  { nom: 'la Toussaint', m: 10, d: 1 },
  { nom: "l'Armistice", m: 10, d: 11 },
  { nom: 'Noël', m: 11, d: 25 },
];

// Mobiles (basées sur Pâques) vérifiées par année.
const MOBILES = {
  2026: [
    { nom: 'le lundi de Pâques', m: 3, d: 6 },
    { nom: "l'Ascension", m: 4, d: 14 },
    { nom: 'le lundi de Pentecôte', m: 4, d: 25 },
  ],
  2027: [
    { nom: 'le lundi de Pâques', m: 2, d: 29 },
    { nom: "l'Ascension", m: 4, d: 6 },
    { nom: 'le lundi de Pentecôte', m: 4, d: 17 },
  ],
};

function events(now) {
  const y = now.getFullYear();
  const list = [];
  for (const year of [y, y + 1]) {
    for (const f of FIXES.concat(MOBILES[year] || [])) {
      list.push({ nom: f.nom, start: new Date(year, f.m, f.d, 0, 0), end: new Date(year, f.m, f.d, 23, 59) });
    }
  }
  return list.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'feries-belgique',
  announceDays: 1,
  url: 'https://www.belgium.be/fr/la_belgique/connaitre_le_pays/la_belgique_en_bref/jours_feries',
  events,
  message(ev, phase) {
    const quand = phase === 'during' ? "Aujourd'hui" : 'Demain';
    return `🇧🇪 ${quand} : ${ev.nom} — jour férié en Belgique.`;
  },
});
