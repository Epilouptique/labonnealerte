// Carte curée (vague L) — COUPURES D’EAU · Régie de l’Eau de l’Eurométropole de Metz (57).
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur, filtre thématique « eau »,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "eau-regie-metz",
  url: "https://app.panneaupocket.com/ville/48302614-regie-de-leau-de-leurometropole-de-metz-57950",
  label: "Régie de l’eau de Metz",
  emoji: "💧",
  filter: "eau",
});
