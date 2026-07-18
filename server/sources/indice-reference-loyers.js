// Source INSEE (broadcast) : Indice de Référence des Loyers (IRL), trimestriel.
// Série BDM idbank 001515333 (base 100 = T4 1998). Actif à chaque publication
// trimestrielle (mi-janvier / avril / juillet / octobre, en même temps que l'IPC
// définitif du dernier mois du trimestre). Utile à tout locataire ou propriétaire
// pour la révision annuelle du loyer.
const { createInseeSource } = require('./lib/insee-bdm');

module.exports = createInseeSource({
  id: 'indice-reference-loyers',
  idbank: '001515333',
  url: 'https://www.insee.fr/fr/statistiques/serie/001515333',
  message(ctx) {
    const yoy = ctx.yoy == null ? '' :
      ` (${ctx.yoy >= 0 ? '+' : '−'}${ctx.formatNombre(Math.abs(ctx.yoy), 1)} % sur un an)`;
    return `💶 Indice de référence des loyers : ${ctx.valueLabel} au ${ctx.periodeLabel}${yoy} — référence pour la révision des loyers`;
  },
});
