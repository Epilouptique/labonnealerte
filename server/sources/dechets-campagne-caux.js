// Carte curée (vague L) — DÉCHETS · Déchetterie & Collectes de la CC Campagne de Caux (76) — mono-thème, filtre null.
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "dechets-campagne-caux",
  url: "https://app.panneaupocket.com/ville/1534032776-dechetterie-collectes-campagne-de-caux-76110",
  label: "Déchets — Campagne de Caux",
  emoji: "♻️",
});
