// Carte curée (vague L) — RESTRICTIONS D’EAU · SIAEP Charles Chaigneau (58, secteur de Tannay).
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur, filtre thématique « eau »,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "eau-charles-chaigneau",
  url: "https://app.panneaupocket.com/ville/1957204903-siaep-charles-chaigneau-58190",
  label: "SIAEP Charles Chaigneau",
  emoji: "💧",
  filter: "eau",
});
