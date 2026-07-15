// Source calculée : journées geek & insolites (dates fixes + une calculable).
// Ton complice (dans la lignée de vendredi-13 / premier-avril). Le rappel le plus
// utile de la liste : la Journée mondiale de la sauvegarde (31 mars).
//   • Pi Day : 14 mars   • Star Wars Day : 4 mai   • Towel Day : 25 mai
//   • Journée du programmeur : 256e jour de l'année (13 sept ; 12 sept en bissextile)
//   • Journée mondiale de la sauvegarde : 31 mars
// Fenêtre : veille + jour J (announceDays 1).

const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

function eventsFor(year) {
  const programmeur = new Date(year, 0, 256); // 256e jour de l'année (auto bissextile)
  return [
    { name: 'Pi Day', emoji: '🥧', start: new Date(year, 2, 14), msg: 'Pi Day (3,14) — une part de tarte pour fêter π ?' },
    { name: 'la Journée mondiale de la sauvegarde', emoji: '💾', start: new Date(year, 2, 31), msg: 'Journée mondiale de la sauvegarde — le bon jour pour vérifier vos backups' },
    { name: 'Star Wars Day', emoji: '🚀', start: new Date(year, 4, 4), msg: 'Star Wars Day — May the 4th be with you' },
    { name: 'Towel Day', emoji: '🧺', start: new Date(year, 4, 25), msg: 'Towel Day — n\'oubliez pas votre serviette (Douglas Adams)' },
    { name: 'la Journée du programmeur', emoji: '👨‍💻', start: programmeur, msg: 'Journée du programmeur (256e jour de l\'année) — respect à celles et ceux qui codent' },
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
  id: 'journees-geek',
  announceDays: 1,
  url: 'https://www.journee-mondiale.com/',
  events,
  message(ev, phase) {
    if (phase === 'during') return `${ev.emoji} Aujourd'hui : ${ev.msg}`;
    return `${ev.emoji} Demain : ${ev.msg}`;
  },
});
