// Source calculée : révisions du taux du Livret A (zéro API).
//
// Constat (vague 10) :
//   • Webstat Banque de France expose bien la série du taux, mais l'API exige
//     une clé (souscription, comme Atmo Data) → écartée pour rester sans secret.
//   • Pas de dataset data.gouv « taux réglementés » tenu à jour de façon fiable.
//   → REPLI retenu : config figée. Le taux ne bouge qu'aux 1er février et
//     1er août (annoncé mi-janvier / mi-juillet). Mise à jour = TODO semestriel
//     assumé (une ligne à ajouter dans REVISIONS à chaque annonce).
//
// Fenêtre d'alerte : J-7 → J+2 autour de chaque date d'entrée en vigueur.
// Message : « passe à X % » si le taux change, « reste à X % » sinon.
//
// ⚠️ TODO 1er février 2027 : ajouter l'entrée suivante dans REVISIONS.

const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Historique + prochaine révision. taux = chaîne FR (virgule décimale).
// - 2026-02-01 : 1,5 % — arrêté du 28 janvier 2026 (période 1er févr → 31 juil 2026).
// - 2026-08-01 : 1,8 % — hausse confirmée par le ministre de l'Économie le 30 juin
//   2026 (arrêté officiel mi-juillet). À reconfirmer sur service-public.gouv.fr.
const REVISIONS = [
  { date: '2026-02-01', taux: '1,5' },
  { date: '2026-08-01', taux: '1,8' },
];

function ymd(str) { const p = str.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function jour1er(d) { const n = d.getDate(); return (n === 1 ? '1er' : n) + ' ' + MOIS[d.getMonth()]; }

function events() {
  return REVISIONS.map(function (r, i) {
    const start = ymd(r.date);
    const prev = i > 0 ? REVISIONS[i - 1].taux : null;
    return {
      start: start,
      end: new Date(start.getTime() + 3 * DAY_MS), // actif jusqu'à la fin de J+2
      taux: r.taux,
      change: prev !== null && prev !== r.taux,
    };
  });
}

module.exports = createCalendarSource({
  id: 'taux-livret-a',
  announceDays: 7,
  url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2365',
  events: events,
  message: function (ev) {
    const verbe = ev.change ? 'passe' : 'reste';
    return '💰 Le taux du Livret A ' + verbe + ' à ' + ev.taux + ' % au ' + jour1er(ev.start);
  },
});
