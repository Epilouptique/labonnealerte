// Source calculée : fêtes familiales (mères, pères, grands-mères). Règles de date
// officielles françaises, entièrement CALCULABLES — aucune date en dur.
//   • Fête des mères  : dernier dimanche de mai, SAUF si ce jour coïncide avec la
//     Pentecôte → reportée au 1er dimanche de juin (règle légale française).
//   • Fête des pères  : 3e dimanche de juin.
//   • Fête des grands-mères : 1er dimanche de mars.
// Fenêtre d'annonce : 3 jours avant (le rappel utile « pensez au cadeau »).

const { createCalendarSource, nthWeekday, lastWeekday, formatAvecJour } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// Dimanche de Pâques (algorithme du comput / Gauss-Butcher, grégorien).
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=mars, 4=avril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Fête des mères de l'année : dernier dimanche de mai, reporté d'une semaine si
// c'est le jour de Pentecôte (Pâques + 49 jours).
function feteDesMeres(year) {
  const dernierDimancheMai = lastWeekday(year, 4, 0); // mai (index 4), dimanche
  const pentecote = new Date(easterSunday(year).getTime() + 49 * DAY_MS);
  if (sameDay(dernierDimancheMai, pentecote)) {
    return nthWeekday(year, 5, 0, 1); // 1er dimanche de juin
  }
  return dernierDimancheMai;
}

function eventsFor(year) {
  return [
    { name: 'La fête des grands-mères', emoji: '💐', start: nthWeekday(year, 2, 0, 1) }, // 1er dim. mars
    { name: 'La fête des mères', emoji: '💐', start: feteDesMeres(year) },
    { name: 'La fête des pères', emoji: '👔', start: nthWeekday(year, 5, 0, 3) },        // 3e dim. juin
  ];
}

function events(now) {
  const y = now.getFullYear();
  return [...eventsFor(y), ...eventsFor(y + 1)]
    .map((e) => ({ ...e, end: new Date(e.start.getTime() + DAY_MS) }))
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'fetes-familiales',
  announceDays: 3,
  url: 'https://www.service-public.fr/particuliers/vosdroits/F21382',
  events,
  message(ev, phase) {
    const d = formatAvecJour(ev.start);
    if (phase === 'during') return `${ev.emoji} Aujourd'hui, c'est ${ev.name.toLowerCase()} — pensez à votre petit geste !`;
    return `${ev.emoji} ${ev.name} approche (${d}) — pensez au cadeau ou au coup de fil.`;
  },
});
