// Source calculée : Cotisation Foncière des Entreprises (CFE) — zéro API.
//
// PUBLIC CIBLÉ : indépendants, auto-entrepreneurs et TPE soumis à la CFE — PAS le
// grand public généraliste (préciser dans le descriptif d'abonnement).
// L'avis de CFE n'est pas envoyé par courrier : il est mis en ligne dans l'espace
// professionnel impots.gouv.fr (mi-novembre). Pas de flux exploitable → date
// limite officielle codée par année, comme echeances-fiscales.js.
//
// Échéance 2026 confirmée : date limite de paiement = 15 décembre 2026
// (majoration de 5 % au-delà). Avis disponible en ligne mi-novembre 2026.
// Annonce J-3 avant le 15 décembre.
//
// ⚠️ TODO daté : échéance 2027 à confirmer (schéma stable au 15 décembre, mais
//    ne jamais présumer) → ajouter ECHEANCES[2027] dès publication impots.gouv.fr.

const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// [année, moisIdx(0=janv), jour] — date limite de paiement en ligne.
const ECHEANCES = {
  2026: [
    [2026, 11, 15], // 15 décembre 2026
  ],
  // ⚠️ TODO : ECHEANCES[2027] dès publication.
};

function events(now) {
  const list = ECHEANCES[now.getFullYear()] || [];
  return list
    .map(function (t) {
      const start = new Date(t[0], t[1], t[2]);
      return { start: start, end: new Date(start.getTime() + DAY_MS) };
    })
    .filter(function (e) { return e.end.getTime() >= now.getTime(); })
    .sort(function (a, b) { return a.start - b.start; });
}

module.exports = createCalendarSource({
  id: 'cfe-entreprises',
  announceDays: 3,
  url: 'https://www.impots.gouv.fr/professionnel/cotisation-fonciere-des-entreprises-cfe',
  events: events,
  message: function (ev) {
    return '💼 Cotisation Foncière des Entreprises (CFE) : date limite de paiement le ' +
      formatAvecJour(ev.start) + ' (majoration de 5 % au-delà). Avis à consulter dans votre espace professionnel.';
  },
});
