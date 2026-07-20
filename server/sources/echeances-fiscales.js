// Source calculée : grandes échéances fiscales des particuliers (zéro API).
//
// Les dates de paiement changent chaque année et ne sont pas exposées en flux
// exploitable : impots.gouv.fr/particulier/calendrier-fiscal est une page dynamique
// (elle n'affiche que les échéances proches). On code donc les dates officielles
// par année, comme bison-fute.js. Fenêtre d'annonce J-7 → date limite en ligne.
//
// Dates 2026 (schéma statutaire stable, à confirmer sur la page officielle quand les
// avis 2026 seront publiés) :
//   • Taxe foncière : 15 octobre (papier/non mensualisé) / 20 octobre (en ligne)
//   • Taxe d'habitation sur les résidences secondaires : 15 décembre / 20 décembre
// On vise le grand public : PAS d'IFI, logements vacants, acomptes indépendants…
//
// ⚠️ TODO début 2027 : ajouter l'entrée 2027 dans ECHEANCES.

const { createCalendarSource, formatJourMois } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// Config par année. paper = date limite papier/non mensualisé ; online = paiement
// en ligne (délai supplémentaire) — c'est online qui borne la fenêtre d'activation.
const ECHEANCES = {
  2026: [
    { label: 'Taxe foncière', paper: '2026-10-15', online: '2026-10-20' },
    { label: 'Taxe d\'habitation', paper: '2026-12-15', online: '2026-12-20', secondaires: true },
  ],
};

function ymd(str) { const p = str.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }

function events(now) {
  const out = [];

  // (1) Échéances datées par année (kind 'deadline').
  const list = ECHEANCES[now.getFullYear()] || [];
  for (const e of list) {
    const online = ymd(e.online);
    out.push({
      kind: 'deadline',
      start: online,
      end: new Date(online.getTime() + DAY_MS), // actif jusqu'à la fin du jour limite
      paper: ymd(e.paper),
      label: e.label,
      secondaires: !!e.secondaires,
    });
  }

  // (2) Nouveau taux de prélèvement à la source (kind 'pas') : le taux issu de la
  //     déclaration de printemps s'applique dès le 1er septembre, chaque année.
  //     Récurrent, calculable — on couvre l'année en cours et la suivante.
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const d = new Date(year, 8, 1); // 1er septembre
    out.push({ kind: 'pas', start: d, end: new Date(d.getTime() + DAY_MS) });
  }

  // (3) Remboursement d'impôt (été) : virements DGFiP. Dates officielles par année
  //     (jamais de mémoire). ⚠️ TODO 2027 : ajouter les dates dès publication DGFiP.
  const REMBOURSEMENTS = { 2026: ['2026-07-24', '2026-07-31'] };
  for (const iso of REMBOURSEMENTS[now.getFullYear()] || []) {
    const d = ymd(iso);
    out.push({ kind: 'refund', start: d, end: new Date(d.getTime() + DAY_MS) });
  }

  // (4) Ouverture de la déclaration de revenus en ligne (kind 'declaration'),
  //     distincte des dates LIMITES ci-dessus. La date d'ouverture varie chaque
  //     année (mi-avril : 9 avril en 2026, 10 avril en 2025) — JAMAIS présumée.
  //     ⚠️ TODO : date 2027 NON annoncée à l'exploration → ajouter l'ISO dans
  //     OUVERTURE_DECLARATION dès l'annonce officielle impots.gouv.fr. Tant que la
  //     table est vide pour l'année, aucune entrée active (pas de fausse alerte).
  const OUVERTURE_DECLARATION = {
    // 2027: '2027-04-XX', // ⚠️ à confirmer sur impots.gouv.fr avant activation
  };
  const declIso = OUVERTURE_DECLARATION[now.getFullYear()];
  if (declIso) {
    const d = ymd(declIso);
    out.push({ kind: 'declaration', start: d, end: new Date(d.getTime() + DAY_MS) });
  }

  return out
    .filter(function (e) { return e.end.getTime() >= now.getTime(); })
    .sort(function (a, b) { return a.start - b.start; });
}

module.exports = createCalendarSource({
  id: 'echeances-fiscales',
  announceDays: 7,
  url: 'https://www.impots.gouv.fr/particulier/calendrier-fiscal',
  events: events,
  message: function (ev) {
    if (ev.kind === 'pas') {
      return '💶 Nouveau taux de prélèvement à la source : votre taux issu de la déclaration s\'applique dès ce mois-ci.';
    }
    if (ev.kind === 'refund') {
      return '💶 Le remboursement d\'impôt arrive sur votre compte cette semaine, si vous avez un trop-perçu.';
    }
    if (ev.kind === 'declaration') {
      return '💶 Ouverture de la déclaration de revenus en ligne : le service est accessible sur impots.gouv.fr.';
    }
    const precision = ev.secondaires ? ' (résidences secondaires uniquement)' : '';
    return '💶 ' + ev.label + precision + ' : jusqu\'au ' + formatJourMois(ev.paper) +
      ' (' + formatJourMois(ev.start) + ' en ligne)';
  },
});
