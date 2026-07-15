// Source calculée : ouverture des ventes de billets SNCF (grandes lignes / TGV).
// Les ouvertures (billets des fêtes, de l'été…) sont ANNONCÉES par la SNCF, mais
// souvent « connues un mois à l'avance ». Cette source vit par sa CONFIG : on
// n'inscrit une date QUE lorsqu'elle est officiellement annoncée (jamais de mémoire).
//
// TODO daté : la prochaine ouverture (fêtes/hiver 2026-2027) n'est PAS annoncée au
// 15/07/2026 (SNCF Connect : « connu ~1 mois avant »). Revérifier début septembre
// 2026 sur sncf-connect.com/aide/calendrier-des-ouvertures-des-ventes, puis ajouter
// une entrée { label, start } ci-dessous. Fenêtre d'annonce J-3 → jour J.
const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

// Chaque entrée : { label:'billets des fêtes de fin d\'année', start:new Date(2026, 9, 8) }.
// VIDE tant qu'aucune ouverture n'est officiellement datée (source inactive).
const OUVERTURES = [];

function events(now) {
  return OUVERTURES
    .map((o) => ({ label: o.label, start: o.start, end: new Date(o.start.getTime()) }))
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'ouverture-ventes-sncf',
  announceDays: 3,
  url: 'https://www.sncf-connect.com/aide/calendrier-des-ouvertures-des-ventes',
  events,
  message(ev, phase) {
    if (phase === 'during') {
      return `🚄 Aujourd'hui : ouverture des ventes SNCF pour ${ev.label} — les meilleurs prix partent vite.`;
    }
    return `🚄 Ouverture des ventes SNCF pour ${ev.label} ${formatAvecJour(ev.start)}.`;
  },
});
