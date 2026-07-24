// Carte curée (vague L) — INFOS LOCALES · CC Chablis Villages et Terroirs (89) — filtre null.
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "local-chablis",
  url: "https://app.panneaupocket.com/ville/129649504-cc-chablis-villages-et-terroirs-89800",
  label: "CC Chablis Villages et Terroirs",
  emoji: "📣",
});
