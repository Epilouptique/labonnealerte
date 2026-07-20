// Source calculée : grands anniversaires historiques à chiffre rond (50/100/150 ans),
// curée à la main pour 2026-2027 UNIQUEMENT. Mémoire CULTURELLE et SCIENTIFIQUE — pas
// un calendrier du malheur : les tragédies (guerres, attentats) sont exclues ; les
// décès de grandes figures sont des commémorations dignes de leur héritage. L'émoji et
// le ton s'adaptent au registre (célébration joyeuse vs commémoration grave).
//
// TOUTES les dates vérifiées (jamais de mémoire : voir rapport de vague). Fenêtre :
// veille + jour J (announceDays 1). URL de référence par entrée (encyclopédie/institution).
//
// ⚠️ TODO ANNUEL : recurer chaque année (retirer les passés, ajouter l'année suivante).
// Prochaine recuration à faire avant fin 2027 pour couvrir 2028.
const { createCalendarSource } = require('./lib/calendar-factory');

// { y, m(0-based), d, emoji, msg, url }. msg = phrase complète (sobre, date incluse).
const ENTRIES = [
  // — 2026 (second semestre) —
  { y: 2026, m: 7, d: 13, emoji: '🎼',
    msg: 'Il y a 150 ans, le premier Festival de Bayreuth créait l\'intégrale de « L\'Anneau du Nibelung » de Wagner (13 août 1876).',
    url: 'https://fr.wikipedia.org/wiki/L%27Anneau_du_Nibelung' },
  { y: 2026, m: 8, d: 3, emoji: '🛰️',
    msg: 'Il y a 50 ans, la sonde Viking 2 se posait sur Mars (3 septembre 1976).',
    url: 'https://science.nasa.gov/mission/viking-2/' },
  { y: 2026, m: 9, d: 18, emoji: '🎸',
    msg: 'Il y a 100 ans naissait Chuck Berry, pionnier du rock\'n\'roll (18 octobre 1926).',
    url: 'https://fr.wikipedia.org/wiki/Chuck_Berry' },
  { y: 2026, m: 9, d: 25, emoji: '🕯️',
    msg: 'Il y a 50 ans disparaissait Raymond Queneau, écrivain et cofondateur de l\'Oulipo (25 octobre 1976).',
    url: 'https://fr.wikipedia.org/wiki/Raymond_Queneau' },
  { y: 2026, m: 10, d: 15, emoji: '🕯️',
    msg: 'Il y a 50 ans disparaissait Jean Gabin, grande figure du cinéma français (15 novembre 1976).',
    url: 'https://fr.wikipedia.org/wiki/Jean_Gabin' },
  { y: 2026, m: 11, d: 5, emoji: '🕯️',
    msg: 'Il y a 100 ans disparaissait Claude Monet, à Giverny (5 décembre 1926).',
    url: 'https://fr.wikipedia.org/wiki/Claude_Monet' },
  // Mary Cassatt, centenaire de la mort (14 juin 2026) : VÉRIFIÉ mais déjà passé au
  // moment de l'ajout (19/07/2026) → volontairement non inséré (n'aurait jamais pu
  // s'activer). Conservé ici pour trace de la vérification.
  // — 2027 —
  { y: 2027, m: 0, d: 10, emoji: '🎬',
    msg: 'Il y a 100 ans, « Metropolis » de Fritz Lang sortait en salles (10 janvier 1927).',
    url: 'https://fr.wikipedia.org/wiki/Metropolis_(film,_1927)' },
  { y: 2027, m: 4, d: 11, emoji: '🕯️',
    msg: 'Il y a 100 ans disparaissait Juan Gris, peintre cubiste espagnol actif en France (11 mai 1927).',
    url: 'https://fr.wikipedia.org/wiki/Juan_Gris' },
  { y: 2027, m: 6, d: 22, emoji: '📖',
    msg: 'Il y a 30 ans paraissait le premier chapitre de « One Piece » dans le Weekly Shōnen Jump (22 juillet 1997).',
    url: 'https://fr.wikipedia.org/wiki/One_Piece' },
  { y: 2027, m: 4, d: 21, emoji: '✈️',
    msg: 'Il y a 100 ans, Charles Lindbergh réussissait la première traversée de l\'Atlantique en solitaire et se posait au Bourget (21 mai 1927).',
    url: 'https://fr.wikipedia.org/wiki/Charles_Lindbergh' },
  { y: 2027, m: 8, d: 7, emoji: '📺',
    msg: 'Il y a 100 ans était transmise la première image de télévision entièrement électronique, par Philo Farnsworth (7 septembre 1927).',
    url: 'https://fr.wikipedia.org/wiki/Philo_Farnsworth' },
  { y: 2027, m: 8, d: 14, emoji: '🕯️',
    msg: 'Il y a 100 ans disparaissait la danseuse Isadora Duncan, à Nice (14 septembre 1927).',
    url: 'https://fr.wikipedia.org/wiki/Isadora_Duncan' },
  { y: 2027, m: 9, d: 6, emoji: '🎬',
    msg: 'Il y a 100 ans, « Le Chanteur de jazz » inaugurait le cinéma parlant (6 octobre 1927).',
    url: 'https://fr.wikipedia.org/wiki/Le_Chanteur_de_jazz' },
  { y: 2027, m: 10, d: 28, emoji: '🎮',
    msg: 'Il y a 30 ans sortait le tout premier « Grand Theft Auto » (28 novembre 1997).',
    url: 'https://fr.wikipedia.org/wiki/Grand_Theft_Auto_(jeu_vid%C3%A9o)' },
  { y: 2027, m: 11, d: 18, emoji: '🎮',
    msg: 'Il y a 40 ans sortait le premier « Final Fantasy » sur Famicom, au Japon (18 décembre 1987).',
    url: 'https://fr.wikipedia.org/wiki/Final_Fantasy_(jeu_vid%C3%A9o)' },
];

// Anniversaires manga/anime RÉCURRENTS (1re parution/diffusion en France) : date fixe
// annuelle (jour+mois), l'âge se recalcule chaque année (pas de recuration à faire).
// DISTINCTS des anniversaires ronds ci-dessus : ex. l'entrée « One Piece 30 ans »
// (22 juillet 2027, 1re parution JAPONAISE) coexiste avec la parution FR du 20 septembre.
// { m(0-based), d, base (année de 1re parution/diffusion FR), emoji, nom, editeur, type }.
const RECURRENTS_MANGA = [
  { m: 0, d: 19, base: 2007, emoji: '📖', nom: 'Death Note', editeur: 'Kana', type: 'parution', url: 'https://fr.wikipedia.org/wiki/Death_Note' },
  { m: 2, d: 9, base: 2002, emoji: '📖', nom: 'Naruto', editeur: 'Kana', type: 'parution', url: 'https://fr.wikipedia.org/wiki/Naruto' },
  { m: 4, d: 17, base: 1993, emoji: '📖', nom: 'Dragon Ball', editeur: 'Glénat', type: 'parution', url: 'https://fr.wikipedia.org/wiki/Dragon_Ball' },
  // ⚠️ One Piece : jour de 1re parution FR (20 sept.) à re-vérifier sur Nautiljon.
  { m: 8, d: 20, base: 2000, emoji: '📖', nom: 'One Piece', editeur: 'Glénat', type: 'parution', url: 'https://fr.wikipedia.org/wiki/One_Piece' },
  { m: 11, d: 23, base: 1993, emoji: '📺', nom: 'Sailor Moon', editeur: 'Club Dorothée, TF1', type: 'diffusion', url: 'https://fr.wikipedia.org/wiki/Sailor_Moon' },
];

function recurrentMsg(r, year) {
  // NB : l'emoji est ajouté par message() (comme pour ENTRIES) — ne pas le remettre ici.
  const age = year - r.base;
  if (r.type === 'diffusion') {
    return `Il y a ${age} ans, ${r.nom} était diffusé pour la première fois en France (${r.editeur}, ${r.base}).`;
  }
  return `Il y a ${age} ans, ${r.nom} paraissait pour la première fois en France (${r.editeur}, ${r.base}).`;
}

function events(now) {
  const list = ENTRIES.map((e) => ({
    start: new Date(e.y, e.m, e.d, 0, 0),
    end: new Date(e.y, e.m, e.d, 23, 59),
    emoji: e.emoji, msg: e.msg, url: e.url,
  }));
  // Anniversaires manga récurrents : année en cours et suivante.
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    for (const r of RECURRENTS_MANGA) {
      list.push({
        start: new Date(year, r.m, r.d, 0, 0),
        end: new Date(year, r.m, r.d, 23, 59),
        emoji: r.emoji, msg: recurrentMsg(r, year), url: r.url,
      });
    }
  }
  return list
    .filter((ev) => ev.end.getTime() >= now.getTime())
    .sort((a, b) => a.start - b.start);
}

module.exports = createCalendarSource({
  id: 'grands-anniversaires',
  announceDays: 1, // veille + jour J
  url: 'https://fr.wikipedia.org/wiki/Anniversaire',
  events,
  message(ev) {
    return `${ev.emoji} ${ev.msg}`;
  },
});
