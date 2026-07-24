// Carte curée (vague L) — INFOS LOCALES · CC Buëch-Dévoluy (05) — filtre null.
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "local-buech-devoluy",
  url: "https://app.panneaupocket.com/ville/2048964179-cc-buech-devoluy-05400",
  label: "CC Buëch-Dévoluy",
  emoji: "📣",
});
