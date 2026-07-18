// Source calculée : versement de l'Allocation de rentrée scolaire (ARS). Très grand
// public. Fenêtre : J-2 → jour du versement (announceDays 2). Message factuel, sans
// montant inventé (les montants sont fixés chaque année par décret).
//
// DATES VÉRIFIÉES (caf.fr / service-public) :
//   - 2026 : versée le 19 août 2026 (métropole + Antilles/Guyane) ; le 5 août 2026 pour
//     La Réunion et Mayotte (rythme scolaire décalé). (CONFIRMÉ.)
// ⚠️ TODO 2027 : ajouter la date de versement dès publication CAF (mi-août).
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { annee, m(0-based), d, zone }. Deux entrées 2026 (métropole/Antilles vs Réunion/Mayotte).
const VERSEMENTS = [
  { annee: 2026, m: 7, d: 5, zone: 'La Réunion et Mayotte' },
  { annee: 2026, m: 7, d: 19, zone: 'métropole et Antilles-Guyane' },
];

function events(now) {
  return VERSEMENTS
    .map((v) => {
      const start = new Date(v.annee, v.m, v.d);
      return { start, end: new Date(start.getTime() + DAY_MS), zone: v.zone };
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'allocation-rentree-scolaire',
  announceDays: 2,
  url: 'https://www.service-public.fr/particuliers/vosdroits/F1878',
  events,
  message(ev, phase) {
    if (phase === 'before') return `💶 L'allocation de rentrée scolaire (ARS) est versée après-demain (${ev.zone}).`;
    return `💶 L'allocation de rentrée scolaire (ARS) est versée aujourd'hui (${ev.zone}), sous conditions de ressources.`;
  },
});
