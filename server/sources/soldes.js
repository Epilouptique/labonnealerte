// Source calculée : soldes nationales (métropole).
// Dates de la règle générale (hors dérogations préfectorales locales) :
//   soldes d'hiver = 2e mercredi de janvier, 8h
//   soldes d'été   = dernier mercredi de juin, 8h
// Durée légale : 4 semaines (fin = début + 28 jours). La source reste active
// toute la période, avec un message « en cours » une fois commencée.
const { createCalendarSource, nthWeekday, lastWeekday, formatAvecJour, formatJourMois } =
  require('./lib/calendar-factory');

const DUREE_MS = 28 * 24 * 3600 * 1000;

function soldes(now) {
  const y = now.getFullYear();
  const list = [];
  for (const year of [y - 1, y, y + 1]) {
    const hiver = nthWeekday(year, 0, 3, 2, 8);   // janvier, mercredi, 2e, 8h
    const ete = lastWeekday(year, 5, 3, 8);       // juin, dernier mercredi, 8h
    list.push({ saison: 'hiver', start: hiver, end: new Date(hiver.getTime() + DUREE_MS) });
    list.push({ saison: 'été', start: ete, end: new Date(ete.getTime() + DUREE_MS) });
  }
  return list.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'soldes',
  announceDays: 5,
  url: 'https://www.economie.gouv.fr/particuliers/dates-soldes',
  events: soldes,
  message(ev, phase) {
    if (phase === 'during') {
      return `🛍️ Les soldes d'${ev.saison} sont en cours, fin le ${formatJourMois(ev.end)}.`;
    }
    return `🛍️ Les soldes d'${ev.saison} commencent ${formatAvecJour(ev.start)} à 8h.`;
  },
});
