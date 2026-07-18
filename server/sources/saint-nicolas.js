// Source calculée : Saint-Nicolas (6 décembre). Grande fête traditionnelle de l'Est
// de la France (Alsace, Lorraine, Nord), de la Belgique et de la Suisse — public
// pleinement dans la cible du kiosque. Date FIXE, récurrente, ZÉRO API, ZÉRO TODO.
//
// ANTI-DOUBLON : absente de fetes-chretiennes / fetes-laiques / fetes-gourmandes.
// Fenêtre : J-2 → jour J (announceDays 2). Ton chaleureux et grand public.
const { createCalendarSource } = require('./lib/calendar-factory');

const DAY_MS = 24 * 60 * 60 * 1000;

function events(now) {
  const y = now.getFullYear();
  return [y, y + 1]
    .map((year) => {
      const start = new Date(year, 11, 6); // 6 décembre
      return { start, end: new Date(start.getTime() + DAY_MS) };
    })
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'saint-nicolas',
  announceDays: 2,
  url: 'https://www.service-public.fr/',
  events,
  message(ev, phase) {
    if (phase === 'before') {
      return '🎁 Bientôt la Saint-Nicolas (6 décembre) — la grande fête de l\'Est, de la Belgique et de la Suisse : pensez au pain d\'épices et aux mandarines !';
    }
    return '🎁 C\'est la Saint-Nicolas ! Fête traditionnelle de l\'Est de la France, de la Belgique et de la Suisse — friandises et pain d\'épices pour les enfants sages.';
  },
});
