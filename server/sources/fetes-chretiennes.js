// Source calculée : grandes fêtes chrétiennes (zéro API). Ton informatif et
// respectueux. Fenêtre d'annonce J-7 → jour J (ou dernier jour si période).
//
// Dates mobiles CODÉES EN DUR (pas d'algorithme de comput — trop de risque
// d'erreur d'un jour), vérifiées pour 2026-2027 :
//   • Pâques 2027 : dimanche 28 mars (lundi de Pâques 29) — source : jours fériés France.
//   • Ascension 2027 : jeudi 6 mai ; Pentecôte 2027 : dimanche 16 mai.
//   (Pâques/Ascension/Pentecôte 2026 sont passées.)
// Fêtes fixes : Assomption 15/8, Toussaint 1/11, Noël 25/12, Épiphanie 6/1.
//
// ⚠️ TODO début 2028 : ajouter les dates mobiles 2028 (Pâques 16 avril 2028).

const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

// { date:'YYYY-MM-DD', name, end? } — triées, une entrée par occurrence.
const FETES = [
  { date: '2026-08-15', name: 'Assomption' },
  { date: '2026-11-01', name: 'Toussaint' },
  { date: '2026-12-25', name: 'Noël' },
  { date: '2027-01-06', name: 'Épiphanie' },
  { date: '2027-03-28', name: 'Pâques' },
  { date: '2027-05-06', name: 'Ascension' },
  { date: '2027-05-16', name: 'Pentecôte' },
  { date: '2027-08-15', name: 'Assomption' },
  { date: '2027-11-01', name: 'Toussaint' },
  { date: '2027-12-25', name: 'Noël' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
function ymd(str) { const p = str.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }

function events(now) {
  return FETES
    .map(function (f) {
      const start = ymd(f.date);
      const last = f.end ? ymd(f.end) : start;               // dernier jour célébré
      return { start: start, end: new Date(last.getTime() + DAY_MS), name: f.name }; // actif tout le jour J
    })
    .filter(function (e) { return e.end.getTime() >= now.getTime(); });
}

module.exports = createCalendarSource({
  id: 'fetes-chretiennes',
  announceDays: 7,
  url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2405',
  events: events,
  message: function (ev) {
    return '✝️ ' + ev.name + ' : ' + formatAvecJour(ev.start);
  },
});
