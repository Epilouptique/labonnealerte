// Source calculée : évolutions du tarif réglementé de vente d'électricité (TRV,
// « Tarif Bleu »). La CRE fait évoluer le TRV élec deux fois par an, à dates
// RÉGLEMENTAIRES sûres : 1er février et 1er août. On annonce l'échéance (fenêtre
// J-3 → jour J) en renvoyant à la décision CRE.
//
// ⚠️ On n'inscrit AUCUN pourcentage : le sens/l'ampleur ne sont pas publiés à
// l'avance de façon machine-fiable (grille définitive ~mi-juillet / mi-janvier).
// TODO daté : coder en réserve le prix repère gaz mensuel CRE (variation notable
// via l'open data data.gouv CSV) pour un signal « sens réel » — voir rapport.
const { createCalendarSource, formatJourMois } = require('./lib/calendar-factory');

// Échéances réglementaires : 1er février et 1er août.
function events(now) {
  const y = now.getFullYear();
  const list = [];
  for (const year of [y, y + 1]) {
    list.push({ start: new Date(year, 1, 1, 0, 0), end: new Date(year, 1, 1, 23, 59) }); // 1er février
    list.push({ start: new Date(year, 7, 1, 0, 0), end: new Date(year, 7, 1, 23, 59) }); // 1er août
  }
  return list.filter((e) => e.end.getTime() >= now.getTime()).sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'energie-tarifs',
  announceDays: 3,
  url: 'https://www.cre.fr/consommateurs/comprendre-les-tarifs-reglementes-de-vente-delectricite-trve.html',
  events,
  message(ev, phase) {
    if (phase === 'during') {
      return "⚡ Aujourd'hui : le tarif réglementé de l'électricité évolue (décision CRE) — vérifiez votre offre.";
    }
    return `⚡ Le tarif réglementé de l'électricité évolue le ${formatJourMois(ev.start)} (décision CRE).`;
  },
});
