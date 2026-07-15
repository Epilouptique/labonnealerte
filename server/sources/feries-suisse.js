// Source calculée : fêtes fédérales / quasi-générales de Suisse.
// La Suisse n'a PAS de liste fédérale unique (souveraineté cantonale) : on retient
// les jours reconnus dans (quasi) tous les cantons — Nouvel An, Fête nationale,
// Noël, Ascension. Les spécificités cantonales (Jeûne genevois, Saint-Joseph VS/FR,
// 1er mars NE, etc.) sont volontairement EXCLUES (anti-complexité). Dates vérifiées.
const { createCalendarSource } = require('./lib/calendar-factory');

const FIXES = [
  { nom: "jour de l'An", m: 0, d: 1 },
  { nom: 'la Fête nationale suisse', m: 7, d: 1 },
  { nom: 'Noël', m: 11, d: 25 },
];

const MOBILES = {
  2026: [{ nom: "l'Ascension", m: 4, d: 14 }],
  2027: [{ nom: "l'Ascension", m: 4, d: 6 }],
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
  id: 'feries-suisse',
  announceDays: 1,
  url: 'https://www.ch.ch/fr/jours-feries-en-suisse/',
  events,
  message(ev, phase) {
    const quand = phase === 'during' ? "Aujourd'hui" : 'Demain';
    return `🇨🇭 ${quand} : ${ev.nom} — jour férié en Suisse.`;
  },
});
