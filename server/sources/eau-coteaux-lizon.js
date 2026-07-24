// Carte curée (vague L) — RESTRICTIONS D’EAU · commune des Coteaux du Lizon (39) — page multi-thème, filtre eau.
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur, filtre thématique « eau »,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "eau-coteaux-lizon",
  url: "https://app.panneaupocket.com/ville/354250958-coteaux-du-lizon-39170",
  label: "Coteaux du Lizon",
  emoji: "💧",
  filter: "eau",
});
