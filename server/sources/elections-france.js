// Source calculée : échéances électorales nationales (zéro API). Messages 🗳️
// strictement factuels (inscription, J-7, veille de scrutin) — aucun contenu
// d'opinion.
//
// ── APPROCHE HONNÊTE : SOURCE EN SOMMEIL ──────────────────────────────────────
// Au 15 juillet 2026, AUCUN décret de convocation n'a fixé les dates de la
// présidentielle 2027. Les municipales de mars 2026 sont passées. Annoncer une
// date non décrétée serait faux → la liste d'événements est VOLONTAIREMENT VIDE.
// La source charge, reste inactive, et se « réveillera » dès qu'on remplira
// ELECTIONS avec les dates officielles.
//
// ⚠️ TODO (dès parution du décret de convocation de la présidentielle 2027) :
//   Ajouter, avec les dates OFFICIELLES uniquement :
//     • Date limite d'inscription sur les listes électorales (~6 semaines avant
//       le 1er tour) → { start: <date limite>, kind: 'inscription' }
//     • 1er tour (avril 2027, à confirmer) → { start: <date>, kind: 'scrutin', tour: 1 }
//     • 2nd tour (deux semaines après) → { start: <date>, kind: 'scrutin', tour: 2 }
//     • Listes électorales CONSULAIRES (Français de l'étranger, cf. vague
//       francophonie/expatriés) : date-butoir légale = 6e VENDREDI précédant le
//       1er tour (art. L. 30). Non arrêtée tant que le décret ne fixe pas la date
//       du scrutin → { start: <6e vendredi avant T1>, kind: 'inscription-consulaire' }.
//   NE RIEN inscrire tant que le décret n'est pas publié (une date fausse est
//   inacceptable ; une source qui dort est acceptable).
//
// ── MÉCANIQUE VÉRIFIÉE À CONSIGNER (présidentielle 2027) ─────────────────────
// (Consignée ici pour la suite — NE RIEN ACTIVER par anticipation, voir ci-dessous.)
//   • Depuis le décret du 12 juin 2026, le délai d'inscription sur les listes
//     électorales est UNIFIÉ : 6e vendredi précédant le scrutin, en mairie ET en
//     ligne (auparavant : mairie = 6e vendredi, en ligne = 6e mercredi ; désormais
//     alignés). Adapter le TODO ci-dessus en conséquence (plus de distinction
//     mairie/en ligne pour la date-butoir métropolitaine).
//   • Dates arrêtées par le Conseil des ministres du 1er juillet 2026 :
//     1er tour = 18 avril 2027, 2nd tour = 2 mai 2027.
//     → date limite d'inscription calculée À TITRE INDICATIF ≈ 6 mars 2027
//       (6e vendredi avant le 18 avril 2027). NON figée ici.
//   • MAIS le décret de CONVOCATION n'est PAS encore publié (attendu ~février 2027).
//     C'est précisément la raison pour laquelle ELECTIONS reste VIDE : on n'active
//     qu'après publication du décret de convocation. Ne pas casser cette règle,
//     ne pas préinscrire les dates 2027 tant que le décret n'est pas paru.

const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

// Liste vide tant qu'aucune date n'est officiellement décrétée. Format attendu :
//   { start:Date, kind:'inscription'|'scrutin', tour?:1|2, label:string }
const ELECTIONS = [];

function events() {
  return ELECTIONS.slice();
}

module.exports = createCalendarSource({
  id: 'elections-france',
  announceDays: 7,
  url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F1961',
  events: events,
  message: function (ev, phase) {
    if (ev.kind === 'inscription') {
      return '🗳️ ' + (ev.label || 'Élection') + ' : dernier jour pour s’inscrire sur les listes électorales, le ' + formatAvecJour(ev.start);
    }
    var quand = phase === 'during' ? "c’est aujourd’hui" : 'le ' + formatAvecJour(ev.start);
    return '🗳️ ' + (ev.label || 'Élection') + (ev.tour ? ' — ' + ev.tour + (ev.tour === 1 ? 'er' : 'e') + ' tour' : '') + ' : ' + quand;
  },
});
