// Carte curée (vague L) — SÉCURITÉ · Brigade de proximité d’Albi (81) — mono-thème, filtre null.
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "securite-gendarmerie-albi",
  url: "https://app.panneaupocket.com/ville/117131141-brigade-de-proximite-dalbi-81000",
  label: "Gendarmerie d’Albi",
  emoji: "🚓",
});
