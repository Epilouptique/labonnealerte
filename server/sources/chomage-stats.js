// Source INSEE (broadcast) : taux de chômage au sens du BIT, trimestriel.
// Série BDM idbank 001688527 (ensemble, France hors Mayotte, données CVS). Actif à
// chaque publication trimestrielle (~mi-février / mi-mai / début août / mi-novembre).
// Message factuel.
const { createInseeSource } = require('./lib/insee-bdm');

module.exports = createInseeSource({
  id: 'chomage-stats',
  idbank: '001688527',
  url: 'https://www.insee.fr/fr/statistiques/serie/001688527',
  message(ctx) {
    return `📈 Chômage : ${ctx.valueLabel} % de la population active au ${ctx.periodeLabel} (au sens du BIT)`;
  },
});
