// Source calculée : revalorisations annuelles des retraites (zéro API). Même principe
// que revalorisation-prestations-sociales (dates fixes, SANS chiffre), mais audience
// et catégories distinctes (retraités) → source séparée.
//
// DEUX rendez-vous récurrents, réunis dans UNE seule source :
//   • 1er janvier  : revalorisation de la retraite de BASE (régime général, CNAV).
//     Le taux est annoncé en décembre précédent.
//   • 1er novembre : revalorisation de la retraite complémentaire AGIRC-ARRCO.
//     Le taux est décidé en octobre précédent.
// AUCUN taux/montant affiché : jamais présumé avant l'annonce officielle.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

function events(now) {
  const out = [];
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const janvier = new Date(year, 0, 1);  // 1er janvier (base CNAV)
    out.push({ kind: 'base', start: janvier, end: new Date(janvier.getTime() + DAY_MS) });
    const novembre = new Date(year, 10, 1); // 1er novembre (Agirc-Arrco)
    out.push({ kind: 'complementaire', start: novembre, end: new Date(novembre.getTime() + DAY_MS) });
  }
  return out
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'revalorisation-retraite',
  announceDays: 7,
  url: 'https://www.lassuranceretraite.fr/',
  events,
  message(ev) {
    if (ev.kind === 'complementaire') {
      return '👵 Revalorisation de la retraite complémentaire Agirc-Arrco au 1er novembre (le taux est fixé chaque année en octobre).';
    }
    return '👵 Revalorisation de la retraite de base (régime général) au 1er janvier (le taux est annoncé en décembre).';
  },
});
