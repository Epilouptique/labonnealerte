// Source calculée : fêtes et rendez-vous laïques (zéro API). Fenêtre J-7 → jour J.
//
// Le 14 juillet (Fête nationale) est VOLONTAIREMENT absent : déjà couvert par
// feries-ponts, on ne le duplique pas ici.
//
// Dates vérifiées 2026-2027 :
//   • Solstices/équinoxes (heure de Paris) — automne 2026 : 23 sept ; hiver 2026 : 21 déc ;
//     printemps 2027 : 20 mars ; été 2027 : 21 juin ; automne 2027 : 23 sept ; hiver 2027 : 22 déc.
//   • Nouvel An chinois 2027 : 6 février (2026, le 17 fév, est passé).
//   • Fête de la musique 21 juin, Halloween 31 oct, Saint-Valentin 14 février (fixes).
//
// ⚠️ TODO début 2028 : ajouter Nouvel An chinois 2028 (26 janvier) et les
// solstices/équinoxes 2028.

const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

// emoji propre à chaque rendez-vous (ton léger mais neutre).
const FETES = [
  { date: '2026-09-23', name: 'Équinoxe d’automne', emoji: '🍂' },
  { date: '2026-10-31', name: 'Halloween', emoji: '🎃' },
  { date: '2026-12-21', name: 'Solstice d’hiver', emoji: '❄️' },
  { date: '2027-02-06', name: 'Nouvel An chinois', emoji: '🧧' },
  { date: '2027-02-14', name: 'Saint-Valentin', emoji: '❤️' },
  { date: '2027-03-20', name: 'Équinoxe de printemps', emoji: '🌸' },
  // Journée NATIONALE des mémoires de la traite, de l'esclavage et de leurs abolitions
  // (10 mai, date fixe — décret n° 2006-388). Distincte, et complémentaire, des
  // commémorations LOCALES d'outre-mer (portées par commemorations-outremer.js).
  {
    date: '2027-05-10',
    name: 'Journée nationale des mémoires de la traite, de l’esclavage et de leurs abolitions',
    emoji: '🕊️',
    note: ' (commémoration nationale, distincte des dates locales d’outre-mer)',
  },
  { date: '2027-06-21', name: 'Fête de la musique', emoji: '🎵' },
  { date: '2027-09-23', name: 'Équinoxe d’automne', emoji: '🍂' },
  { date: '2027-10-31', name: 'Halloween', emoji: '🎃' },
  { date: '2027-12-22', name: 'Solstice d’hiver', emoji: '❄️' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
function ymd(str) { const p = str.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }

function events(now) {
  return FETES
    .map(function (f) {
      const start = ymd(f.date);
      return { start: start, end: new Date(start.getTime() + DAY_MS), name: f.name, emoji: f.emoji, note: f.note };
    })
    .filter(function (e) { return e.end.getTime() >= now.getTime(); });
}

module.exports = createCalendarSource({
  id: 'fetes-laiques',
  announceDays: 7,
  url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2405',
  events: events,
  message: function (ev) {
    return ev.emoji + ' ' + ev.name + ' : ' + formatAvecJour(ev.start) + (ev.note || '');
  },
});
