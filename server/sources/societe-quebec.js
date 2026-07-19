// Source calculée : rendez-vous d'identité, société & institutions du Québec.
// Anti-doublon : la Fête nationale (24 juin) et la Journée des Patriotes sont déjà
// couvertes par feries-quebec (jours fériés CNESST) → volontairement ABSENTES ici.
// Dates vérifiées le 2026-07-19 (jamais de mémoire).
//
// Sources consultées (2026-07-19) :
//   Jour du déménagement 1er juil . tal.gouv.qc.ca (échéance des baux au 30 juin)
//   Peuples autochtones 21 juin ... justice.gc.ca (proclamation fédérale 1996)
//   Élections provinciales ........ electionsquebec.qc.ca (date fixe : 5 oct 2026)
//
// Notes :
//   - Jour du déménagement : conséquence sociale de l'échéance des baux au 30 juin,
//     PAS une obligation légale d'un jour précis (article du Code civil non confirmé).
// TODO daté (2026-07-19) :
//   - Prochaines élections générales après 2026 : loi à date fixe (1er lundi
//     d'octobre, cycle de 4 ans) → vers oct. 2030, à confirmer officiellement.
//   - Rentrée parlementaire de l'Assemblée nationale : date de reprise post-élection
//     (automne 2026 / hiver 2027) non confirmée (année électorale) → à ajouter.
const { createCalendarSource } = require('./lib/calendar-factory');

function events(now) {
  const y = now.getFullYear();
  const list = [];

  // Récurrents annuels à date fixe (année courante + suivante).
  for (const year of [y, y + 1]) {
    // Journée nationale des peuples autochtones — 21 juin (solstice).
    list.push({
      name: 'Journée nationale des peuples autochtones',
      start: new Date(year, 5, 21), end: new Date(year, 5, 21, 23, 59),
      message: '🪶 Aujourd\'hui : Journée nationale des peuples autochtones.',
      url: 'https://www.rcaanc-cirnac.gc.ca/fra/1100100013718/1708446948967',
    });
    // Jour du déménagement — 1er juillet (fin des baux résidentiels au 30 juin).
    list.push({
      name: 'Jour du déménagement',
      start: new Date(year, 6, 1), end: new Date(year, 6, 1, 23, 59),
      message: '📦 C\'est le 1er juillet, jour du déménagement au Québec (fin des baux au 30 juin).',
      url: 'https://www.tal.gouv.qc.ca/fr/actualites/demenagement-du-1-er-juillet',
    });
  }

  // Événements ponctuels à date fixe confirmée.
  list.push({
    name: 'Élections générales provinciales',
    start: new Date(2026, 9, 5), end: new Date(2026, 9, 5, 23, 59),
    message: '🗳️ Aujourd\'hui : élections générales provinciales au Québec.',
    url: 'https://www.electionsquebec.qc.ca/',
  });

  return list
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'societe-quebec',
  announceDays: 3,
  url: 'https://www.quebec.ca/',
  events,
  message(ev) {
    return ev.message;
  },
});
