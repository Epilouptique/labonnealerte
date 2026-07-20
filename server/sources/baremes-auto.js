// Source calculée : barèmes automobiles à date fixe annuelle (zéro API). Même
// principe que smic-revalorisation / revalorisation-retraite (date fixe, SANS
// chiffre : le barème exact n'est jamais présumé avant l'arrêté officiel).
//
//   • Barème du malus écologique (CO₂ / masse) : révisé au 1er janvier chaque
//     année par la loi de finances. On annonce l'échéance, pas les montants.
//
// ⚠️ TODO : ajouter d'autres barèmes auto à date fixe s'ils se confirment (ex.
//   barème kilométrique, revalorisations de taxes) — uniquement avec une date
//   d'entrée en vigueur nette.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

function events(now) {
  const out = [];
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const janvier = new Date(year, 0, 1); // 1er janvier
    out.push({ start: janvier, end: new Date(janvier.getTime() + DAY_MS) });
  }
  return out
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'baremes-auto',
  announceDays: 3,
  url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F35049',
  events,
  message() {
    return '🚗 Nouveau barème du malus écologique au 1er janvier : le barème CO₂/masse applicable aux véhicules neufs est mis à jour (montants publiés par la loi de finances).';
  },
});
