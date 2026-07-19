// Source calculée : calendrier scolaire du Québec — rentrée & semaine de relâche.
// IMPORTANT : au Québec, il n'existe AUCUNE date unique décrétée pour toute la
// province. Chaque centre de services scolaire (CSS) publie son propre calendrier.
// Les dates ci-dessous valent pour la RÉGION MÉTROPOLITAINE (Grand Montréal) et
// doivent être vérifiées localement. Vérifiées le 2026-07-19 sur le calendrier
// officiel du CSS de Montréal (CSSDM 2026-2027).
//
// Sources consultées (2026-07-19) :
//   Rentrée 27 août 2026 .. cssdm.gouv.qc.ca (calendrier FGJ 2026-2027)
//   Relâche 1–5 mars 2027 . cssdm.gouv.qc.ca ; corroboré Cégep de Sherbrooke
//
// TODO daté (2026-07-19) :
//   - Paramétrer par CSS/région (enum) : les dates varient de quelques jours d'un
//     centre de services à l'autre, surtout pour la relâche. Non uniforme province.
//   - Rentrée & relâche 2027-2028 : à ajouter à publication des calendriers CSS.
const { createCalendarSource } = require('./lib/calendar-factory');

function events(now) {
  return [
    // Rentrée scolaire des élèves — région métropolitaine (CSSDM).
    { name: 'Rentrée scolaire', emoji: '🎒',
      start: new Date(2026, 7, 27), end: new Date(2026, 7, 27, 23, 59),
      message: '🎒 Demain, la rentrée scolaire au Québec (région de Montréal — vérifiez votre centre de services).',
      url: 'https://www.cssdm.gouv.qc.ca/',
      during: '🎒 C\'est la rentrée scolaire au Québec (région de Montréal — vérifiez votre centre de services).' },
    // Semaine de relâche — région métropolitaine (CSSDM).
    { name: 'Semaine de relâche', emoji: '🏂',
      start: new Date(2027, 2, 1), end: new Date(2027, 2, 5, 23, 59),
      message: '🏂 Bientôt la semaine de relâche au Québec (région de Montréal — vérifiez votre centre de services).',
      during: '🏂 Semaine de relâche au Québec (région de Montréal — vérifiez votre centre de services).' },
  ]
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'education-quebec',
  announceDays: 1,
  url: 'https://www.quebec.ca/education/prescolaire-primaire-et-secondaire/calendrier-scolaire',
  events,
  message(ev, phase) {
    return phase === 'during' && ev.during ? ev.during : ev.message;
  },
});
