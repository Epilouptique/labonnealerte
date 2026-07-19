// Source calculée : grands festivals québécois — dates officielles annoncées.
// Dates EXPLICITES vérifiées le 2026-07-19 sur le site officiel de chaque festival
// (jamais de mémoire ; voir rapport de vague). Fenêtre d'annonce : 3 jours avant
// l'ouverture. Aucune donnée météo/panne ici → pas de doublon avec meteo-quebec /
// pannes-hydro-quebec / feries-quebec.
//
// TODO (vérifié 2026-07-19, éditions non annoncées) :
//   - Igloofest (Montréal) 2027 : site n'affiche que l'édition 2026 passée.
//   - Fête des Neiges de Montréal : dormante (dernière donnée 2020).
//   - Juste pour Rire (Montréal) 2027 : à confirmer (survie financière fragile).
//   - Éditions ultérieures de chaque festival, à ajouter à publication.
const { createCalendarSource } = require('./lib/calendar-factory');

// { name, ville, start, end (dernier jour 23:59), url, emoji }.
// Sources officielles consultées le 2026-07-19 :
//   Osheaga        osheaga.com/fr                31 juil–2 août 2026
//   Mutek          montreal.mutek.org            25–30 août 2026
//   Western St-Tite festivalwestern.com          11–20 sept 2026
//   Carnaval Qc    carnaval.qc.ca                5–14 févr 2027
//   Francos Mtl    francosmontreal.com           11–19 juin 2027
//   Jazz Mtl       montrealjazzfest.com          25 juin–4 juil 2027
//   FEQ Québec     feq.ca                        8–18 juil 2027
//   Juste pour Rire quebec.hahaha.com            15–26 juil 2026
function events(now) {
  return [
    { name: 'Juste pour Rire', ville: 'Montréal', emoji: '😂',
      start: new Date(2026, 6, 15), end: new Date(2026, 6, 26, 23, 59),
      url: 'https://quebec.hahaha.com/' },
    { name: 'Osheaga', ville: 'Montréal', emoji: '🎸',
      start: new Date(2026, 6, 31), end: new Date(2026, 7, 2, 23, 59),
      url: 'https://osheaga.com/fr' },
    { name: 'Mutek', ville: 'Montréal', emoji: '🎛️',
      start: new Date(2026, 7, 25), end: new Date(2026, 7, 30, 23, 59),
      url: 'https://montreal.mutek.org/' },
    { name: 'Festival Western de Saint-Tite', ville: 'Saint-Tite', emoji: '🤠',
      start: new Date(2026, 8, 11), end: new Date(2026, 8, 20, 23, 59),
      url: 'https://www.festivalwestern.com/fr/' },
    { name: 'Carnaval de Québec', ville: 'Québec', emoji: '⛄',
      start: new Date(2027, 1, 5), end: new Date(2027, 1, 14, 23, 59),
      url: 'https://carnaval.qc.ca/' },
    { name: 'Francos de Montréal', ville: 'Montréal', emoji: '🎤',
      start: new Date(2027, 5, 11), end: new Date(2027, 5, 19, 23, 59),
      url: 'https://francosmontreal.com/' },
    { name: 'Festival International de Jazz de Montréal', ville: 'Montréal', emoji: '🎷',
      start: new Date(2027, 5, 25), end: new Date(2027, 6, 4, 23, 59),
      url: 'https://montrealjazzfest.com/fr' },
    { name: "Festival d'été de Québec", ville: 'Québec', emoji: '🎪',
      start: new Date(2027, 6, 8), end: new Date(2027, 6, 18, 23, 59),
      url: 'https://www.feq.ca/fr' },
  ]
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'festivals-quebec',
  announceDays: 3,
  url: 'https://www.quebec.ca/',
  events,
  message(ev, phase) {
    const quand = phase === 'during' ? "C'est parti" : 'Bientôt';
    return `${ev.emoji} ${quand} : ${ev.name} (${ev.ville}).`;
  },
});
