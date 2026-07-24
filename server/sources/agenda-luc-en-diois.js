// Carte curée (vague L) — AGENDA · Événements et manifestations de Luc-en-Diois (26) — filtre null.
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "agenda-luc-en-diois",
  url: "https://app.panneaupocket.com/ville/794123592-luc-en-diois-evenements-manifestations-26310",
  label: "Luc-en-Diois",
  emoji: "🎭",
});
