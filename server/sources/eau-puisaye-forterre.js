// Carte curée (vague L) — COUPURES D’EAU · Régie des Eaux Puisaye-Forterre (89).
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur, filtre thématique « eau »,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "eau-puisaye-forterre",
  url: "https://app.panneaupocket.com/ville/59012431-regie-eaux-puisaye-forterre-89130",
  label: "Régie des Eaux Puisaye-Forterre",
  emoji: "💧",
  filter: "eau",
});
