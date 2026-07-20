// Source INSEE (broadcast) : prix de l'ALIMENTATION, glissement annuel mensuel.
// Série BDM idbank 011814676 (IPC, base 2025, ensemble des ménages, France,
// nomenclature Coicop 01.1 « Produits alimentaires »). Vérifiée live le 20/07/2026 :
// FREQ mensuelle, c'est un INDICE (pas un %) → on calcule le glissement annuel (yoy)
// via la factory (obs[12], d'où N_OBS porté à 14 dans insee-bdm.js).
//
// Distincte d'inflation-insee (inflation GÉNÉRALE) : ici l'angle « prix de l'alimentation »,
// public/usage différents. Actif à chaque publication mensuelle DÉFINITIVE (anti-bruit
// OBS_QUAL=DEF, fenêtre freshDays). Message factuel, sans commentaire.
const { createInseeSource } = require('./lib/insee-bdm');

module.exports = createInseeSource({
  id: 'ipc-alimentaire',
  idbank: '011814676',
  url: 'https://www.insee.fr/fr/statistiques/serie/011814676',
  message(ctx) {
    if (ctx.yoy == null) {
      // Repli défensif si la profondeur d'historique manque (ne devrait pas arriver).
      return `🍎 Prix de l'alimentation : indice à ${ctx.valueLabel} (${ctx.periodeLabel})`;
    }
    const signe = ctx.yoy >= 0 ? '+' : '−';
    return `🍎 Prix de l'alimentation : ${signe}${ctx.formatNombre(Math.abs(ctx.yoy), 1)} % sur un an (${ctx.periodeLabel})`;
  },
});
