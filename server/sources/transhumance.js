// Source calculée (calendar-factory) : fêtes de la transhumance, par massif. Zéro API.
// Fenêtre d'annonce J-3 → dernier jour de l'événement. Messages 🐑 factuels.
//
// DATES VÉRIFIÉES sur sources officielles/institutionnelles au 21/07/2026 (jamais de mémoire) :
//   • L'Aubrac en Transhumance (Aubrac, Occitanie/Aveyron-Lozère) : 21-26 mai 2026,
//     grande montée des troupeaux le dimanche 24 mai — transhumance-aubrac.fr (relayé Région
//     Occitanie, laregion.fr).
//   • Transhumances en Couserans, vallée du Haut-Salat à Seix (Ariège, Occitanie) :
//     13-14 juin 2026 — tourisme-couserans-pyrenees.com.
//   • Fête de la transhumance de Lourdios-Ichère (Béarn, Pyrénées-Atlantiques,
//     Nouvelle-Aquitaine) : 7 juin 2026 — pyrenees-bearnaises.com.
//
// ⚠️ TODO annuel : ces événements sont RÉ-ANNUELS mais leurs dates changent chaque année.
//   Revérifier et remplacer dès publication des éditions 2027 sur les sites officiels.
//   Ne rien inscrire de non confirmé (Die/Drôme écartée cette année, pas de date fiable).

const { createCalendarSource, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { nom, lieu, y, m (0-based), d1 (1er jour), d2 (dernier jour, = d1 si mono-jour), url }.
const FETES = [
  { nom: "L'Aubrac en Transhumance", lieu: "l'Aubrac", y: 2026, m: 4, d1: 21, d2: 26, url: 'https://www.transhumance-aubrac.fr/' },
  { nom: 'Transhumances en Couserans', lieu: 'Seix (Ariège)', y: 2026, m: 5, d1: 13, d2: 14, url: 'https://www.tourisme-couserans-pyrenees.com/' },
  { nom: 'la Fête de la transhumance', lieu: 'Lourdios-Ichère (Béarn)', y: 2026, m: 5, d1: 7, d2: 7, url: 'https://www.pyrenees-bearnaises.com/' },
];

function events() {
  return FETES.map((f) => ({
    start: new Date(f.y, f.m, f.d1),
    end: new Date(new Date(f.y, f.m, f.d2).getTime() + DAY_MS),
    nom: f.nom, lieu: f.lieu, url: f.url,
  }));
}

module.exports = createCalendarSource({
  id: 'transhumance',
  announceDays: 3,
  url: 'https://www.transhumance-aubrac.fr/',
  events,
  message(ev, phase) {
    if (phase === 'before') return `🐑 Bientôt ${ev.nom} à ${ev.lieu} (${formatJourMois(ev.start)}).`;
    return `🐑 C'est parti : ${ev.nom} à ${ev.lieu}.`;
  },
});
