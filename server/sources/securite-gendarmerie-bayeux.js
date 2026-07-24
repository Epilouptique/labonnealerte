// Carte curée (vague L) — SÉCURITÉ · Brigade de gendarmerie de Bayeux (14) — mono-thème, filtre null.
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "securite-gendarmerie-bayeux",
  url: "https://app.panneaupocket.com/ville/340053572-brigade-de-gendarmerie-de-bayeux-14400",
  label: "Gendarmerie de Bayeux",
  emoji: "🚓",
});
