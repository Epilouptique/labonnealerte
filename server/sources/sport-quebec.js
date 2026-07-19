// Source calculée : grands rendez-vous sportifs québécois/canadiens — dates
// officielles annoncées. Dates EXPLICITES vérifiées le 2026-07-19 (jamais de
// mémoire). Fenêtre d'annonce : 2 jours avant.
//
// Sources consultées (2026-07-19) :
//   Canadiens ouv. domicile . nhl.com/fr/canadiens/schedule (6 oct 2026, Centre Bell)
//   Coupe Grey (113e) ....... cfl.ca (15 nov 2026, Calgary)
//   Le Brier (100e) ......... curling.ca/2027brier (26 févr–7 mars 2027, Saskatoon)
//
// TODO datés (2026-07-19) :
//   - Éditions suivantes (saison LNH 2027-28, Coupe Grey 2027, Brier 2028) : à
//     ajouter à publication du calendrier officiel.
//   - Alerte « séries si les Canadiens qualifiés » : FAISABLE (effort moyen) via
//     l'API web LNH non officielle (api-web.nhle.com, clinchIndicator). Non codé :
//     dépendance à une API non contractuelle, à décider séparément.
const { createCalendarSource } = require('./lib/calendar-factory');

function events(now) {
  return [
    // Match d'ouverture à domicile des Canadiens (Centre Bell), soirée d'ouverture
    // de la saison régulière 2026-2027 côté Montréal.
    { name: 'Ouverture de la saison des Canadiens', emoji: '🏒',
      start: new Date(2026, 9, 6), end: new Date(2026, 9, 6, 23, 59),
      message: '🏒 Ce soir : les Canadiens de Montréal lancent leur saison à domicile (Centre Bell).',
      url: 'https://www.nhl.com/fr/canadiens/schedule' },
    // Coupe Grey (finale de la Ligue canadienne de football).
    { name: 'Coupe Grey', emoji: '🏈',
      start: new Date(2026, 10, 15), end: new Date(2026, 10, 15, 23, 59),
      message: '🏈 Aujourd\'hui : la finale de la Coupe Grey (football canadien), à Calgary.',
      url: 'https://www.cfl.ca/' },
    // Le Brier (championnat canadien masculin de curling), 100e édition à Saskatoon.
    { name: 'Le Brier (curling)', emoji: '🥌',
      start: new Date(2027, 1, 26), end: new Date(2027, 2, 7, 23, 59),
      message: '🥌 Le Brier, championnat canadien de curling, s\'ouvre (100e édition, Saskatoon).',
      url: 'https://www.curling.ca/2027brier/' },
  ]
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'sport-quebec',
  announceDays: 2,
  url: 'https://www.nhl.com/fr/canadiens/',
  events,
  message(ev) {
    return ev.message;
  },
});
