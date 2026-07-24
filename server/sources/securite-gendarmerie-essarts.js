// Carte curée (vague L) — SÉCURITÉ · Communauté de brigades d’Essarts-en-Bocage (85) — mono-thème, filtre null.
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "securite-gendarmerie-essarts",
  url: "https://app.panneaupocket.com/ville/2073133263-communaute-de-brigades-dessarts-en-bocage-85140",
  label: "Gendarmerie — Essarts-en-Bocage",
  emoji: "🚓",
});
