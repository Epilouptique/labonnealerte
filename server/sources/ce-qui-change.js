// Source calculée : « Ce qui change au 1er du mois ». service-public.gouv.fr publie chaque
// fin de mois un récapitulatif officiel (SMIC, tarifs, démarches, barèmes…). Digest
// utile et opt-in : 12 alertes/an assumées. Fenêtre J-1 → J+1 du 1er du mois.
// Récurrent, calculable, ZÉRO API (on renvoie vers la rubrique officielle).
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function events(now) {
  const list = [];
  // Le 1er du mois courant et des 3 prochains mois (fenêtre courte, jamais tout le mois).
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let k = 0; k <= 3; k++) {
    const first = new Date(base.getFullYear(), base.getMonth() + k, 1);
    list.push({
      start: first,
      end: new Date(first.getTime() + 2 * DAY_MS), // actif jusqu'à J+1 inclus
      mois: MOIS[first.getMonth()],
    });
  }
  return list
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'ce-qui-change',
  announceDays: 1, // veille du 1er
  url: 'https://www.service-public.gouv.fr/particuliers/actualites',
  events,
  message(ev, phase) {
    if (phase === 'before') {
      return `📋 Demain : ce qui change au 1er ${ev.mois} (SMIC, tarifs, démarches, barèmes…). Le récap officiel sur service-public.gouv.fr.`;
    }
    return `📋 Ce qui change au 1er ${ev.mois} : le récapitulatif officiel des nouveautés (tarifs, aides, démarches) sur service-public.gouv.fr.`;
  },
});
