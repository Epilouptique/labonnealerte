// Source calculée : grandes semaines de la mode et salons pro (calendrier
// professionnel). Zéro API. Fenêtre d'annonce J-3 → dernier jour de l'édition.
//
// DISTINCTE de fashion-week.js, qui couvre UNIQUEMENT le prêt-à-porter FEMME de
// Paris (défilés PAP femme) — aucune édition n'est dupliquée ici (Haute Couture,
// Homme, Milan et salons pro sont des rendez-vous différents).
//
// DATES 2027 VÉRIFIÉES (jamais de mémoire), source officielle citée par entrée :
//   • Milan Moda Donna AH 2027-28 : 23 fév - 1er mars 2027 (cameramoda.it)
//   • Milan Moda Uomo PE 2028     : 18-22 juin 2027 (cameramoda.it)
//   • Who's Next (Paris)          : 16-18 janvier 2027 (wsn-events.com)
//   • Maison & Objet (Paris)      : 14-18 janvier 2027 (maison-objet.com)
//   • PFW Haute Couture PE 2027   : 25-28 janvier 2027 (fhcm.paris)
//   • PFW Haute Couture AH 2027-28: 5-8 juillet 2027 (fhcm.paris)
//   • PFW Homme AH 2027-28        : 19-24 janvier 2027 (fhcm.paris)
//   • PFW Homme PE 2028           : 22-27 juin 2027 (fhcm.paris)
// ⚠️ TODO ANNUEL : ajouter les saisons suivantes dès publication des calendriers.
const { createCalendarSource, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { nom, lieu, y, m (0-based) / d = 1er jour, fm / fd = dernier jour inclus }.
const EDITIONS = [
  { nom: 'Maison & Objet', lieu: 'Paris', y: 2027, m: 0, d: 14, fm: 0, fd: 18 },
  { nom: "Who's Next", lieu: 'Paris', y: 2027, m: 0, d: 16, fm: 0, fd: 18 },
  { nom: 'Paris Fashion Week — Homme (automne-hiver 2027-28)', lieu: 'Paris', y: 2027, m: 0, d: 19, fm: 0, fd: 24 },
  { nom: 'Paris Fashion Week — Haute Couture (printemps-été 2027)', lieu: 'Paris', y: 2027, m: 0, d: 25, fm: 0, fd: 28 },
  { nom: 'Milan Fashion Week — Moda Donna (automne-hiver 2027-28)', lieu: 'Milan', y: 2027, m: 1, d: 23, fm: 2, fd: 1 },
  { nom: 'Milan Fashion Week — Moda Uomo (printemps-été 2028)', lieu: 'Milan', y: 2027, m: 5, d: 18, fm: 5, fd: 22 },
  { nom: 'Paris Fashion Week — Homme (printemps-été 2028)', lieu: 'Paris', y: 2027, m: 5, d: 22, fm: 5, fd: 27 },
  { nom: 'Paris Fashion Week — Haute Couture (automne-hiver 2027-28)', lieu: 'Paris', y: 2027, m: 6, d: 5, fm: 6, fd: 8 },
];

function events(now) {
  return EDITIONS
    .map((e) => {
      const start = new Date(e.y, e.m, e.d);
      const fin = new Date(e.y, e.fm, e.fd); // dernier jour inclus (affichage)
      return { start, fin, end: new Date(fin.getTime() + DAY_MS), nom: e.nom, lieu: e.lieu };
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'semaines-mode',
  announceDays: 3,
  url: 'https://www.fhcm.paris/',
  events,
  message(ev, phase) {
    const quand = `du ${formatJourMois(ev.start)} au ${formatJourMois(ev.fin)}`;
    if (phase === 'before') {
      return `👗 Bientôt : ${ev.nom}, ${quand} à ${ev.lieu}.`;
    }
    return `👗 ${ev.nom} : c'est en cours à ${ev.lieu}, ${quand}.`;
  },
});
