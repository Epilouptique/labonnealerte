// Source calculée : Bison Futé — jours ROUGES et NOIRS au niveau national.
//
// EXPLORATION (juillet 2026) : bison-fute.gouv.fr n'expose AUCUN flux exploitable
// (les pages « demain » / « prévisions » / « calendrier » rendent la couleur du
// jour sous forme d'images, 0 JSON/XML, aucune mention couleur en texte) ; aucun
// dataset sur data.gouv ; le flux DATEX est lourd. → REPLI ASSUMÉ : le calendrier
// Bison Futé est une donnée annuelle officielle et stable, on la code en dur.
// Zéro appel réseau, robuste. Orange IGNORÉ (anti-spam) : seuls rouge/noir alertent.
//
// SOURCE : Calendrier officiel Bison Futé 2026 (PDF officiel), ligne « SITUATION
// GÉNÉRALE EN FRANCE » (= niveau NATIONAL). Dans ce PDF, une case colorée SANS
// numéro de zone = niveau national ; une case colorée AVEC numéro(s) = seulement
// ces zones régionales (donc IGNORÉE ici, on ne veut que le national). Transcris
// case par case depuis le PDF haute résolution (les 9 jours rouges/noirs nationaux
// 2026, sens départs/retours).
//
// ⚠️ TODO début 2027 : remplacer JOURS_2026 par le calendrier officiel 2027.

const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// Jours classés ROUGE ou NOIR au niveau NATIONAL en 2026 (hors orange, hors zonal).
// color : 'rouge' | 'noir' ; sens : 'départs' | 'retours' | 'départs et retours'.
const JOURS_2026 = [
  { date: '2026-05-07', color: 'rouge', sens: 'départs' },              // jeudi (pont du 8 mai)
  { date: '2026-05-17', color: 'rouge', sens: 'retours' },             // dimanche (retour Ascension)
  { date: '2026-05-22', color: 'rouge', sens: 'départs' },             // vendredi (pont de Pentecôte)
  { date: '2026-07-18', color: 'rouge', sens: 'départs' },             // samedi
  { date: '2026-07-25', color: 'rouge', sens: 'départs' },             // samedi
  { date: '2026-08-01', color: 'noir', sens: 'départs' },              // samedi (grand départ)
  { date: '2026-08-08', color: 'rouge', sens: 'départs et retours' },  // samedi (chassé-croisé)
  { date: '2026-08-15', color: 'rouge', sens: 'retours' },             // samedi (Assomption)
  { date: '2026-08-28', color: 'rouge', sens: 'retours' },             // vendredi
];

function jours(now) {
  return JOURS_2026
    .map((j) => {
      const [y, m, d] = j.date.split('-').map(Number);
      const start = new Date(y, m - 1, d); // minuit local du jour classé
      return { start, end: new Date(start.getTime() + DAY_MS), color: j.color, sens: j.sens };
    })
    // On garde les jours dont la fenêtre (J-1 → J) n'est pas passée.
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'bison-fute',
  announceDays: 1, // actif la veille (« Demain : ») et le jour même (« Aujourd'hui : »)
  url: 'https://www.bison-fute.gouv.fr/',
  events: jours,
  message(ev, phase) {
    const quand = phase === 'during' ? "Aujourd'hui" : 'Demain';
    if (ev.color === 'noir') {
      return `🚗 ${quand} : journée noire sur les routes dans le sens des ${ev.sens} — évitez de prendre la route`;
    }
    return `🚗 ${quand} : circulation très difficile (rouge) dans le sens des ${ev.sens}`;
  },
});
