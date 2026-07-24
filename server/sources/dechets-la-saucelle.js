// Carte curée (vague L) — DÉCHETS · page dédiée « Déchets » de La Saucelle (28) — mono-thème, filtre null.
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "dechets-la-saucelle",
  url: "https://app.panneaupocket.com/ville/219021750-04-dechets-la-saucelle-28250",
  label: "Déchets — La Saucelle",
  emoji: "♻️",
});
