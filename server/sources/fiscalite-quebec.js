// Source calculée : échéances fiscales & administratives ANNUELLES du Québec
// (distinctes du fédéral et de la France ; distinctes de echeances-fiscales FR).
// Dates récurrentes structurelles vérifiées le 2026-07-19 sur source officielle.
// Aucun montant deviné : le taux/montant exact est fixé chaque année (config par
// année, à compléter à publication). Angle « hausse tarifaire Hydro » distinct de
// pannes-hydro-quebec (pannes réseau).
//
// Sources consultées (2026-07-19) :
//   REER 1er mars .......... canada.ca (règle des 60 jours ARC)
//   Hydro tarif 1er avril .. regie-energie.qc.ca (décision pluriannuelle : +3 % en 2027)
//   Déclaration 30 avril ... revenuquebec.ca (date limite habituelle)
//   Salaire min 1er mai .... cnesst.gouv.qc.ca (revalorisation annuelle ; 16,60 $ depuis 2026)
//
// TODO datés (2026-07-19) :
//   - Montant du salaire minimum au 1er mai 2027 : non annoncé (ne pas deviner).
//   - Date limite exacte déclaration 2027 : non publiée (règle 30 avril structurelle).
//   - Budget provincial 2027-2028 : date non annoncée (dernier dépôt 18 mars 2026).
//   - Ajouter le % de hausse Hydro à chaque année une fois la décision Régie publiée.
const { createCalendarSource } = require('./lib/calendar-factory');

// Hausse tarifaire Hydro confirmée par année (décision Régie de l'énergie). Absente
// = message générique sans chiffre. Vérifié 2026-07-19 : 2027 = +3 %.
const HAUSSE_HYDRO = { 2027: '+3 %' };

function events(now) {
  const y = now.getFullYear();
  const list = [];

  for (const year of [y, y + 1]) {
    // Cotisation REER — 60 premiers jours : échéance au 1er mars (année civile suivante).
    list.push({
      name: 'Date limite REER',
      start: new Date(year, 2, 1),
      end: new Date(year, 2, 1, 23, 59),
      message: '📈 Dernier jour pour cotiser à votre REER pour l\'année d\'imposition précédente.',
      url: 'https://www.revenuquebec.ca/fr/citoyens/credits-dimpot/regime-enregistre-depargne-retraite-reer/',
    });
    // Ajustement tarifaire Hydro-Québec — entrée en vigueur au 1er avril.
    const pct = HAUSSE_HYDRO[year];
    list.push({
      name: 'Hausse des tarifs Hydro-Québec',
      start: new Date(year, 3, 1),
      end: new Date(year, 3, 1, 23, 59),
      message: pct
        ? `⚡ Les tarifs d'électricité d'Hydro-Québec augmentent (${pct}) au 1er avril.`
        : '⚡ Ajustement annuel des tarifs d\'électricité d\'Hydro-Québec au 1er avril.',
      url: 'https://www.hydroquebec.com/residentiel/espace-clients/tarifs/',
    });
    // Déclaration de revenus du Québec — date limite habituelle : 30 avril.
    list.push({
      name: 'Date limite déclaration de revenus',
      start: new Date(year, 3, 30),
      end: new Date(year, 3, 30, 23, 59),
      message: '🧾 Dernier jour pour produire votre déclaration de revenus du Québec (Revenu Québec).',
      url: 'https://www.revenuquebec.ca/fr/citoyens/declaration-de-revenus/',
    });
    // Salaire minimum — revalorisation annuelle au 1er mai (montant fixé par décret).
    list.push({
      name: 'Hausse du salaire minimum',
      start: new Date(year, 4, 1),
      end: new Date(year, 4, 1, 23, 59),
      message: '💵 Le salaire minimum du Québec est revalorisé au 1er mai (nouveau taux général).',
      url: 'https://www.cnesst.gouv.qc.ca/fr/conditions-travail/salaire-paie/salaire/salaire-minimum',
    });
  }

  return list
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'fiscalite-quebec',
  announceDays: 5,
  url: 'https://www.revenuquebec.ca/',
  events,
  message(ev) {
    return ev.message;
  },
});
