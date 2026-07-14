// Source calculée : grandes fêtes musulmanes (zéro API). Ton informatif et
// respectueux. Fenêtre d'annonce J-7 → jour J.
//
// ⚠️ Les dates dépendent de l'OBSERVATION LUNAIRE et sont confirmées chaque année
// par la Grande Mosquée de Paris / le CFCM : elles peuvent varier d'un jour.
// Dates 2027 PRÉVISIONNELLES (Ramadan 2026 → 11 jours plus tôt en 2027) :
//   • Début du Ramadan 2027 : ~8 février · Aïd el-Fitr : ~10 mars
//   • Aïd el-Adha (Aïd el-Kébir) : ~16 mai · Nouvel an hégirien (1er Mouharram) : ~6 juin
// (Les fêtes 2026 — Aïd el-Fitr 20/3, Aïd el-Adha 27/5 — sont passées.)
//
// ⚠️ TODO début 2027 : confirmer ces dates sur grandemosqueedeparis.fr, puis
// ajouter les dates 2028.

const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

const FETES = [
  { date: '2027-02-08', name: 'Début du Ramadan' },
  { date: '2027-03-10', name: 'Aïd el-Fitr' },
  { date: '2027-05-16', name: 'Aïd el-Adha' },
  { date: '2027-06-06', name: 'Nouvel an hégirien' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
function ymd(str) { const p = str.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }

function events(now) {
  return FETES
    .map(function (f) {
      const start = ymd(f.date);
      return { start: start, end: new Date(start.getTime() + DAY_MS), name: f.name }; // actif tout le jour J
    })
    .filter(function (e) { return e.end.getTime() >= now.getTime(); });
}

module.exports = createCalendarSource({
  id: 'fetes-musulmanes',
  announceDays: 7,
  url: 'https://www.grandemosqueedeparis.fr/fetes-religieuses',
  events: events,
  message: function (ev) {
    return '☪️ ' + ev.name + ' : aux alentours du ' + formatAvecJour(ev.start) +
      ' (date confirmée par l’observation lunaire)';
  },
});
