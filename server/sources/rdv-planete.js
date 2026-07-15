// TODO SERD 2027 : dates de la Semaine européenne de réduction des déchets à confirmer.
// Source calculée : rendez-vous écolo (Heure de la Terre, World Cleanup Day, SERD).
const { createCalendarSource, lastWeekday, nthWeekday } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

function evenements(now) {
  const y = now.getFullYear();
  const out = [];
  for (const year of [y, y + 1]) {
    // Heure de la Terre : dernier samedi de mars.
    const earthHour = lastWeekday(year, 2, 6);
    out.push({ kind: 'earth-hour', start: earthHour, end: new Date(earthHour.getTime() + DAY_MS) });
    // World Cleanup Day : 3e samedi de septembre.
    const cleanup = nthWeekday(year, 8, 6, 3);
    out.push({ kind: 'cleanup', start: cleanup, end: new Date(cleanup.getTime() + DAY_MS) });
  }
  // SERD 2026 : 21 au 29 novembre 2026 (daté).
  out.push({ kind: 'serd', start: new Date(2026, 10, 21), end: new Date(2026, 10, 30) });

  return out
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'rdv-planete',
  announceDays: 2,
  url: 'https://www.ademe.fr/',
  events: evenements,
  message(ev) {
    if (ev.kind === 'earth-hour') return "🌍 Ce soir, l'Heure de la Terre : on éteint les lumières de 20h30 à 21h30";
    if (ev.kind === 'cleanup') return '🌍 World Cleanup Day ce samedi — grand nettoyage citoyen de la planète';
    return '🌍 Semaine de la réduction des déchets — gestes et ateliers partout en France';
  },
});
