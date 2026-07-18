// Source calculée : grandes courses à pied mythiques (Marathon de Paris, Semi de
// Paris, Paris-Versailles). Fenêtre veille + jour J. Message 🏃.
//
// ÉTAT AU 18/07/2026 : CONFIG VIDE — aucune date 2027 CONFIRMÉE sur une page
// officielle de l'organisateur (discipline : non annoncé = pas de date inventée).
// Dates seulement PRESSENTIES via la presse spécialisée, À CONFIRMER à l'ouverture
// des inscriptions (~septembre 2026) :
//   • Marathon de Paris 2027 : pressenti dim. 11 avril 2027 (organisation reprise par
//     le consortium Cadence ; site officiel en transition) — À CONFIRMER.
//   • Semi de Paris (HOKA) 2027 : pressenti dim. 7 mars 2027 — À CONFIRMER.
//   • Paris-Versailles 2027 : NON annoncé (2026 = dim. 27 septembre, dernier
//     dimanche de septembre, non reconfirmé sur page officielle) — À CONFIRMER.
// ⚠️ TODO septembre 2026 : transcrire les dates officielles ci-dessous (name, start).
// L'ouverture des INSCRIPTIONS, si datée séparément, fera un TODO distinct (ne pas
// inventer).
const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

// { name, emoji, start:Date, url? } — VIDE tant que les dates ne sont pas officielles.
const COURSES = [];

function events(now) {
  return COURSES
    .filter((e) => e && e.start instanceof Date)
    .map((e) => ({ ...e, end: e.start }))
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'courses-mythiques',
  announceDays: 1,
  url: 'https://www.parismarathon.com/',
  events,
  message(ev, phase) {
    const quand = phase === 'during' ? "aujourd'hui" : `le ${formatAvecJour(ev.start)}`;
    return `🏃 ${ev.name} : c'est ${quand} !`;
  },
});
