// Carte curée (vague L) — DÉCHETS · Service Déchets Ménagers de la CC de Saulieu (21) — mono-thème, filtre null.
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "dechets-saulieu",
  url: "https://app.panneaupocket.com/ville/382272133-service-dechets-menagers-cc-de-saulieu-21210",
  label: "Service déchets — Pays de Saulieu",
  emoji: "♻️",
});
