// Source calculée (calendar-factory) : marées vertes / algues vertes en Bretagne. Zéro API.
// Rappel MENSUEL pendant la saison des échouages (avril→octobre) invitant à consulter le
// bulletin de surveillance. Message factuel 🌿, jamais de donnée chiffrée sortie de mémoire.
//
// CONTEXTE OFFICIEL (vérifié au 21/07/2026) : le suivi des proliférations d'algues vertes en
// Bretagne est assuré par le CEVA (Centre d'Étude et de Valorisation des Algues), opérateur
// mandaté dans le cadre du PLAV (Plan de Lutte contre les Algues Vertes, État + Région).
// Survols aériens MENSUELS d'avril à octobre → bulletin mensuel « État des proliférations
// d'algues vertes ». Données consolidées : Observatoire de l'Environnement en Bretagne (OEB).
// Phénomène strictement breton (baies du PLAV, Côtes-d'Armor + Finistère) → non généralisable.
//
// ⚠️ TODO daté — URL À CONFIRMER : l'exemplaire de bulletin mensuel vérifié en exploration
//   transitait par un relais associatif (Eau & Rivières de Bretagne), PAS par une URL de dépôt
//   institutionnelle directe CEVA de la saison en cours. Avant de pointer un lien profond, ou
//   de passer à une récupération réelle du bulletin, CONFIRMER l'URL officielle CEVA/OEB de la
//   saison en cours. En attendant, on pointe la page institutionnelle stable (OEB / CEVA).
//   Ce rappel mensuel est une VEILLE (pas une lecture du contenu du bulletin).

const { createCalendarSource, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const PUBLIC_URL = 'https://bretagne-environnement.fr/tableau-de-bord/les-echouages-dalgues-vertes-sur-le-littoral-breton';

// Mois de la saison de surveillance (0-based) : avril(3) → octobre(9).
const MOIS_SAISON = [3, 4, 5, 6, 7, 8, 9];

// Un rappel bref au début de chaque mois de saison, année en cours et suivante.
function events(now) {
  const out = [];
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    for (const m of MOIS_SAISON) {
      const start = new Date(year, m, 1);
      out.push({ start, end: new Date(start.getTime() + 2 * DAY_MS) });
    }
  }
  return out;
}

module.exports = createCalendarSource({
  id: 'algues-vertes-bretagne',
  announceDays: 0,
  url: PUBLIC_URL,
  events,
  message(ev, phase) {
    return `🌿 Algues vertes en Bretagne : surveillance des échouages du mois (bulletin CEVA / PLAV). Consultez le suivi officiel avant balade sur les plages concernées.`;
  },
});
