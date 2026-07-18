// Source INSEE (broadcast) : indice des prix à la consommation, glissement annuel
// (« l'inflation »), mensuel. Série BDM idbank 011814133 (Base 2025, ensemble des
// ménages, France, CVS ; la valeur EST déjà le glissement annuel en %). Actif à
// chaque publication mensuelle DÉFINITIVE (~mi-mois) — l'estimation provisoire de
// fin de mois est ignorée (anti-bruit). Message factuel, sans commentaire.
const { createInseeSource } = require('./lib/insee-bdm');

module.exports = createInseeSource({
  id: 'inflation-insee',
  idbank: '011814133',
  url: 'https://www.insee.fr/fr/statistiques/serie/011814133',
  message(ctx) {
    const v = Number(ctx.latest.OBS_VALUE);
    const signe = v >= 0 ? '+' : '−';
    return `📊 Inflation : ${signe}${ctx.formatNombre(Math.abs(v), 1)} % sur un an (${ctx.periodeLabel})`;
  },
});
