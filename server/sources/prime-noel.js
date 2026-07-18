// Source calculée : versement de la prime de Noël. Fenêtre J-2 → jour J. Sans montant.
// DATE VÉRIFIÉE : versée à partir du 16 décembre 2026 (CAF) — caf.fr (CONFIRMÉ, date
// récurrente de mi-décembre confirmée chaque automne).
// ⚠️ TODO 2027 : ajouter la date dès confirmation CAF.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;
const VERSEMENTS = [{ annee: 2026, m: 11, d: 16 }];

function events(now) {
  return VERSEMENTS
    .map((v) => {
      const start = new Date(v.annee, v.m, v.d);
      return { start, end: new Date(start.getTime() + DAY_MS) };
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'prime-noel',
  announceDays: 2,
  url: 'https://www.service-public.fr/particuliers/vosdroits/F13483',
  events,
  message(ev, phase) {
    if (phase === 'before') return '💶 La prime de Noël est versée après-demain aux bénéficiaires concernés (RSA, ASS…).';
    return '💶 La prime de Noël est versée aujourd\'hui aux bénéficiaires concernés (RSA, ASS…), automatiquement.';
  },
});
