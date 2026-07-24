// Carte curée (vague L) — CANTINE · menus et infos scolaires du SIVOM A2M2V (60) — filtre null.
// Broadcast v1 pré-rempli par-dessus le moteur PanneauPocket : URL en dur,
// attribution « via PanneauPocket ». Détails moteur + garde-fou de vitalité tiers :
// lib/panneaupocket-veille.js (makeCurated).

const { makeCurated } = require("./lib/panneaupocket-veille");

module.exports = makeCurated({
  id: "cantine-a2m2v",
  url: "https://app.panneaupocket.com/ville/1264983010-sivom-a2m2v-60162",
  label: "SIVOM A2M2V",
  emoji: "🍽️",
});
