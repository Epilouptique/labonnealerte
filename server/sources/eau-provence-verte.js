// Carte curée (vague L) — COUPURES D’EAU · Régie des Eaux de la Provence Verte (83, Brignoles).
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur, filtre thématique « eau »,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "eau-provence-verte",
  url: "https://app.panneaupocket.com/ville/669361338-regie-des-eaux-de-la-provence-verte-83170",
  label: "Régie des Eaux de la Provence Verte",
  emoji: "💧",
  filter: "eau",
});
