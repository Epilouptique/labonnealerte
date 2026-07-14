// Source calculée : grandes fêtes juives (zéro API). Ton informatif et
// respectueux. Fenêtre d'annonce J-7 → jour J (ou dernier jour si période).
//
// Les dates du calendrier hébraïque sont FIXES et fiables longtemps à l'avance
// (elles débutent la veille au soir ; on retient le premier jour pleinement
// célébré). Vérifiées via hebcal (année hébraïque 5787/5788) :
//   • Roch Hachana 2026 : 12 sept · Yom Kippour 2026 : 21 sept
//   • Hanoucca 2026 : du 5 au 12 déc
//   • Pourim 2027 : 14 mars · Pessah 2027 : du 28 mars au 3 avril
//
// ⚠️ TODO automne 2027 : ajouter Roch Hachana / Yom Kippour / Hanoucca 2027 (5788).

const { createCalendarSource, formatAvecJour, formatJourMois } = require('./lib/calendar-factory');

const FETES = [
  { date: '2026-09-12', name: 'Roch Hachana' },
  { date: '2026-09-21', name: 'Yom Kippour' },
  { date: '2026-12-05', name: 'Hanoucca', end: '2026-12-12' },
  { date: '2027-03-14', name: 'Pourim' },
  { date: '2027-03-28', name: 'Pessah', end: '2027-04-03' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
function ymd(str) { const p = str.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }

function events(now) {
  return FETES
    .map(function (f) {
      const start = ymd(f.date);
      const last = f.end ? ymd(f.end) : start;
      return { start: start, end: new Date(last.getTime() + DAY_MS), name: f.name, period: !!f.end };
    })
    .filter(function (e) { return e.end.getTime() >= now.getTime(); });
}

module.exports = createCalendarSource({
  id: 'fetes-juives',
  announceDays: 7,
  url: 'https://www.hebcal.com/holidays/',
  events: events,
  message: function (ev) {
    if (ev.period) {
      var last = new Date(ev.end.getTime() - DAY_MS); // dernier jour célébré
      return '✡️ ' + ev.name + ' : du ' + formatJourMois(ev.start) + ' au ' + formatJourMois(last);
    }
    return '✡️ ' + ev.name + ' : ' + formatAvecJour(ev.start);
  },
});
