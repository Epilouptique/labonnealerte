// Source calculée : ouverture / fermeture OFFICIELLE de la saison cyclonique par
// bassin (zéro API). Ce sont les BORNES ADMINISTRATIVES de la saison, PAS des
// vigilances météo en temps réel (celles-ci relèvent de Météo-France / vigilance).
// Message factuel et informatif, jamais alarmiste.
//
// Bornes officielles (Météo-France) vérifiées le 19/07/2026 :
//   • Bassin Atlantique (Antilles, Guyane)   : 1er juin → 30 novembre
//   • Bassin Océan Indien (La Réunion, Mayotte) : 15 novembre → 30 avril
// 4 événements fixes annuels (ouverture + fermeture de chaque bassin). Fenêtre
// d'annonce J-3 (simple repère de calendrier).

const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// bassin, zones, type ('ouverture'|'fermeture'), mois (1-based), jour.
const BORNES = [
  { bassin: 'Atlantique', zones: 'Antilles et Guyane', type: 'ouverture', m: 6, d: 1 },
  { bassin: 'Atlantique', zones: 'Antilles et Guyane', type: 'fermeture', m: 11, d: 30 },
  { bassin: 'Océan Indien', zones: 'La Réunion et Mayotte', type: 'ouverture', m: 11, d: 15 },
  { bassin: 'Océan Indien', zones: 'La Réunion et Mayotte', type: 'fermeture', m: 4, d: 30 },
];

function events(now) {
  const y = now.getFullYear();
  const out = [];
  for (const year of [y, y + 1]) {
    for (const b of BORNES) {
      const start = new Date(year, b.m - 1, b.d);
      out.push({ start: start, end: new Date(start.getTime() + DAY_MS), bassin: b.bassin, zones: b.zones, type: b.type });
    }
  }
  return out
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'saison-cyclonique',
  announceDays: 3,
  url: 'https://meteofrance.re/fr/cyclone',
  events: events,
  message: function (ev) {
    if (ev.type === 'ouverture') {
      return '🌀 Ouverture de la saison cyclonique — bassin ' + ev.bassin + ' (' + ev.zones + '), le ' +
        formatAvecJour(ev.start) + '. Période de vigilance renforcée jusqu\'à sa fermeture.';
    }
    return '🌀 Fermeture officielle de la saison cyclonique — bassin ' + ev.bassin + ' (' + ev.zones + '), le ' +
      formatAvecJour(ev.start) + '.';
  },
});
