// Carte curée (vague L) — INFOS LOCALES · CC Agly-Fenouillèdes (66) — filtre null.
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "local-agly-fenouilledes",
  url: "https://app.panneaupocket.com/ville/288326684-cc-agly-fenouilledes-66220",
  label: "CC Agly-Fenouillèdes",
  emoji: "📣",
});
