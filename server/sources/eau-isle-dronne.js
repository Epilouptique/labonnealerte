// Carte curée (vague L) — COUPURES D’EAU · SIAEPA des Vallées de l’Isle et de la Dronne (33) — mono-thème, filtre null.
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "eau-isle-dronne",
  url: "https://app.panneaupocket.com/ville/1588534718-regie-des-eaux-du-siaepa-des-vallees-de-lisle-et-de-la-dronne-33230",
  label: "SIAEPA Isle & Dronne",
  emoji: "💧",
});
