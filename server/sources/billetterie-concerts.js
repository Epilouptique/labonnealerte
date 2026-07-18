// Source calculée : mises en vente de billets des tournées ÉVÉNEMENTS en France
// (stades/arénas majeurs). Même esprit viral qu'ouverture-ventes-sncf : la source vit
// par sa CONFIG. On n'inscrit une date QUE lorsque la mise en vente est officiellement
// annoncée (producteur/salle) — jamais de mémoire. VIDE au départ, à remplir au fil des
// annonces (c'est SA nature). Fenêtre : J-3 → jour J.
//
// TODO : ajouter chaque ouverture de billetterie officiellement datée sous forme
//   { artiste, lieu, start:new Date(AAAA, M-1, J, H) }. Revérifier régulièrement.
const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

// VIDE tant qu'aucune mise en vente n'est officiellement datée (source inactive).
const VENTES = [];

function events(now) {
  return VENTES
    .map((v) => ({ artiste: v.artiste, lieu: v.lieu, start: v.start, end: new Date(v.start.getTime()) }))
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'billetterie-concerts',
  announceDays: 3,
  url: 'https://www.francebillet.com/',
  events,
  message(ev, phase) {
    const lieu = ev.lieu ? ` à ${ev.lieu}` : '';
    if (phase === 'during') {
      return `🎫 Aujourd'hui : ouverture de la billetterie de ${ev.artiste}${lieu} — les places partent vite.`;
    }
    return `🎫 Ouverture de la billetterie de ${ev.artiste}${lieu} ${formatAvecJour(ev.start)}.`;
  },
});
