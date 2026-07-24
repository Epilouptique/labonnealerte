// Carte curée (vague L) — INFOS LOCALES · CC Chabris — Pays de Bazelle (36) — filtre null.
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "local-chabris-bazelle",
  url: "https://app.panneaupocket.com/ville/37455078-cc-chabris-pays-de-bazelle-36210",
  label: "CC du Pays de Bazelle",
  emoji: "📣",
});
