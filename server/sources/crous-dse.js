// Source calculée : Dossier Social Étudiant (DSE) du CROUS (zéro API).
//
// Le DSE (demande unique de bourse sur critères sociaux + logement Crous) s'ouvre
// chaque année au printemps. Le Crous ne publie pas de flux exploitable → dates
// officielles codées par campagne, comme echeances-fiscales.js. Convention Bison
// Futé : dates issues de lescrous.fr/dse (déjà vérifiées).
//
// Campagne 2026-2027 confirmée : ouverture 2 mars 2026, date limite recommandée
// 31 mai 2026 (le dossier reste modifiable ensuite, mais déposer avant fin mai
// sécurise le traitement pour la rentrée).
//
// ⚠️ TODO daté : campagne 2027-2028 non publiée → vérifier lescrous.fr/dse
//    (sortie habituelle en début d'année civile) et ajouter CAMPAGNES[2027].

const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// [année, moisIdx(0=janv), jour, kind]
const CAMPAGNES = {
  2026: [
    [2026, 2, 2, 'ouverture'],   // 2 mars 2026
    [2026, 4, 31, 'limite'],     // 31 mai 2026 (date limite recommandée)
  ],
  // ⚠️ TODO : CAMPAGNES[2027] (campagne 2027-2028) dès parution.
};

function events(now) {
  const list = CAMPAGNES[now.getFullYear()] || [];
  return list
    .map(function (t) {
      const start = new Date(t[0], t[1], t[2]);
      return { start: start, end: new Date(start.getTime() + DAY_MS), kind: t[3] };
    })
    .filter(function (e) { return e.end.getTime() >= now.getTime(); })
    .sort(function (a, b) { return a.start - b.start; });
}

module.exports = createCalendarSource({
  id: 'crous-dse',
  announceDays: 7,
  url: 'https://www.lescrous.fr/dse',
  events: events,
  message: function (ev, phase) {
    if (ev.kind === 'ouverture') {
      var quand = phase === 'during' ? "c'est ouvert aujourd'hui" : 'ouvre le ' + formatAvecJour(ev.start);
      return '🎓 Dossier Social Étudiant (bourse + logement Crous) : la campagne ' + quand + '.';
    }
    return '🎓 Dossier Social Étudiant : date limite recommandée pour déposer sa demande, le ' +
      formatAvecJour(ev.start) + '.';
  },
});
