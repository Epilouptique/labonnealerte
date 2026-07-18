// Source calculée : ACM A.M. Turing Award — le « prix Nobel de l'informatique ».
// L'ACM l'annonce chaque année au PRINTEMPS (généralement en mars, parfois début
// avril) pour récompenser des travaux marquants. Le lauréat n'est pas connu à
// l'avance et la date exacte n'est pas fixe → fenêtre « courant mars-début avril ».
// Repères VÉRIFIÉS : prix 2024 annoncé le 5 mars 2025 (Barto & Sutton, apprentissage
// par renforcement) ; prix 2025 : Bennett & Brassard (source acm.org).
// TODO chaque année : caler la date exacte / le lauréat à l'annonce sur acm.org.
const { createCalendarSource } = require('./lib/calendar-factory');

// Fenêtre annuelle 1er mars → 15 avril (l'annonce y tombe). Active dès le 1er mars.
function events(now) {
  const y = now.getFullYear();
  return [y, y + 1]
    .map((year) => ({ start: new Date(year, 2, 1), end: new Date(year, 3, 15) }))
    .filter((e) => e.end.getTime() >= now.getTime());
}

module.exports = createCalendarSource({
  id: 'prix-turing',
  announceDays: 0,
  url: 'https://amturing.acm.org/',
  events,
  message() {
    return '🏆 C\'est la saison du prix Turing, le « Nobel de l\'informatique » : l\'ACM dévoile son ou ses lauréats pour des contributions majeures à la discipline';
  },
});
