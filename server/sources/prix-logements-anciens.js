// Source INSEE (broadcast) : prix des logements anciens en France, glissement annuel.
// Série INSEE-Notaires idbank 010567118 (indice des prix des logements anciens,
// France hors Mayotte, ensemble, base 100 = moyenne 2015, série brute). Vérifiée
// live le 20/07/2026 : FREQ TRIMESTRIELLE, c'est un INDICE → glissement annuel (yoy)
// calculé via la factory (obs[4]).
//
// Publication trimestrielle. Actif à chaque publication DÉFINITIVE (anti-bruit
// OBS_QUAL=DEF : l'estimation provisoire du trimestre le plus récent est ignorée,
// on notifie quand le chiffre devient définitif). Message factuel, sans commentaire.
const { createInseeSource } = require('./lib/insee-bdm');

module.exports = createInseeSource({
  id: 'prix-logements-anciens',
  idbank: '010567118',
  url: 'https://www.insee.fr/fr/statistiques/serie/010567118',
  message(ctx) {
    if (ctx.yoy == null) {
      return `🏠 Prix des logements anciens : indice à ${ctx.valueLabel} (${ctx.periodeLabel})`;
    }
    const signe = ctx.yoy >= 0 ? '+' : '−';
    return `🏠 Prix des logements anciens : ${signe}${ctx.formatNombre(Math.abs(ctx.yoy), 1)} % sur un an (${ctx.periodeLabel})`;
  },
});
