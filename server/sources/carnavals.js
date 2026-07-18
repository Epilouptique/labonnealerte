// Source calculée : grands carnavals français. Fenêtre : J-3 → dernier jour.
//
// DATES VÉRIFIÉES (jamais de mémoire) :
//   - Carnaval de NICE 2027 : du 9 au 28 février 2027 (thème « Vive l'Amour »).
//     Source : Office de Tourisme Métropolitain Nice Côte d'Azur (relayé par
//     explorenicecotedazur.com). ⚠️ Pas encore affiché sur nicecarnaval.com au
//     moment de la vérification → à reconfirmer sur le site officiel avant la saison.
//   - Carnaval de DUNKERQUE 2027 (Trois Joyeuses / bandes) : NON PUBLIÉ. Le Comité du
//     Carnaval publie son calendrier ~3 mois avant. Mardi Gras 2027 = 2 mars, mais les
//     dates exactes des bandes ne sont pas officielles → TODO (aucune date inventée).
//
// ⚠️ TODO : ajouter Dunkerque 2027 dès le calendrier officiel du Comité ; recurer Nice
// chaque année ; reconfirmer Nice 2027 sur nicecarnaval.com.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { ville, annee, début m/d, fin m/d (dernier jour inclus) }.
const CARNAVALS = [
  { ville: 'Nice', annee: 2027, m1: 1, d1: 9, m2: 1, d2: 28 },
];

function events(now) {
  return CARNAVALS
    .map((c) => ({
      start: new Date(c.annee, c.m1, c.d1),
      end: new Date(new Date(c.annee, c.m2, c.d2).getTime() + DAY_MS),
      ville: c.ville,
    }))
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'carnavals',
  announceDays: 3,
  url: 'https://www.nicecarnaval.com/',
  events,
  message(ev, phase) {
    if (phase === 'before') {
      return `🎭 Bientôt le Carnaval de ${ev.ville} — chars, batailles de fleurs et défilés.`;
    }
    return `🎭 C'est le Carnaval de ${ev.ville} — la grande fête populaire est lancée.`;
  },
});
