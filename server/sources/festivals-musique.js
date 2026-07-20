// Source calculée : grands festivals de musique. Fenêtre J-3 → 1er jour (announceDays 3).
//
// DATES VÉRIFIÉES sur le site officiel de chaque festival (jamais de mémoire) :
//   - Hellfest 2027 (Clisson) : 17-20 juin 2027 — hellfest.fr (CONFIRMÉ).
//   - Rock en Seine 2026 (Saint-Cloud) : 26-30 août 2026 — paris.fr (CONFIRMÉ).
// TODO (non annoncés au 18/07/2026) : Vieilles Charrues 2027, Solidays 2027 (édition
//   2026 annulée) → à ajouter dès publication.
const { createCalendarSource, formatAvecJour } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

// { nom, lieu, y, m(0-based), d (1er jour), url }.
const FESTIVALS = [
  { nom: 'Rock en Seine', lieu: 'Saint-Cloud', y: 2026, m: 7, d: 26, url: 'https://www.rockenseine.com/' },
  { nom: 'Hellfest', lieu: 'Clisson', y: 2027, m: 5, d: 17, url: 'https://www.hellfest.fr/' },
  // — Ajouts vague festivals (dates officielles confirmées) —
  { nom: 'Festival Interceltique de Lorient', lieu: 'Lorient', y: 2026, m: 6, d: 31, url: 'https://www.festival-interceltique.bzh/' },
  { nom: 'Paléo Festival', lieu: 'Nyon (Suisse)', y: 2026, m: 6, d: 21, url: 'https://yeah.paleo.ch/' },
  // Tomorrowland 2026 : deux week-ends (17-19 et 24-26 juillet) — on annonce le 1er.
  { nom: 'Tomorrowland', lieu: 'Boom (Belgique)', y: 2026, m: 6, d: 17, url: 'https://www.tomorrowland.com/' },
  { nom: 'Sziget Festival', lieu: 'Budapest (Hongrie)', y: 2026, m: 7, d: 11, url: 'https://szigetfestival.com/' },
  { nom: 'FrancoFolies de Montréal', lieu: 'Montréal', y: 2027, m: 5, d: 11, url: 'https://www.francosmontreal.com/' },
  { nom: 'Rock Werchter', lieu: 'Werchter (Belgique)', y: 2027, m: 6, d: 1, url: 'https://www.rockwerchter.be/' },
];

// Journées récurrentes (date fixe annuelle, sans lieu) : { nom, m, d, url }.
const JOURNEES = [
  { nom: 'Journée internationale du jazz', m: 3, d: 30, url: 'https://www.unesco.org/fr/days/jazz' }, // 30 avril (UNESCO)
];

function events(now) {
  const out = FESTIVALS.map((f) => {
    const start = new Date(f.y, f.m, f.d);
    return { start, end: new Date(start.getTime() + DAY_MS), nom: f.nom, lieu: f.lieu, url: f.url };
  });
  // Journées fixes : année en cours et suivante.
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    for (const j of JOURNEES) {
      const start = new Date(year, j.m, j.d);
      out.push({ start, end: new Date(start.getTime() + DAY_MS), nom: j.nom, journee: true, url: j.url });
    }
  }
  return out
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'festivals-musique',
  announceDays: 3,
  url: 'https://www.service-public.fr/',
  events,
  message(ev, phase) {
    if (ev.journee) {
      if (phase === 'during') return `🎷 Aujourd'hui : ${ev.nom}.`;
      return `🎷 ${ev.nom} : ${formatAvecJour(ev.start)}.`;
    }
    if (phase === 'before') return `🎸 Bientôt le festival ${ev.nom} à ${ev.lieu}.`;
    return `🎸 Ça commence : le festival ${ev.nom} ouvre à ${ev.lieu}.`;
  },
});
