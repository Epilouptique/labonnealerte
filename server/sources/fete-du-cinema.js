// Source : annonce de la Fête du Cinéma par le CNC.
//
// Flux officiel des actualités CNC (lien RSS de https://www.cnc.fr/cinema/actualites) :
// https://www.cnc.fr/rss/-/journal/rss/36995/942647. On ne retient que les titres
// mentionnant la « Fête du Cinéma » (1 édition par an, annoncée ~3 jours avant).
// robots.txt (lu le 12/10/2026) : /rss/ non interdit (seuls /documents/, /c/ et la
// recherche le sont). Mentions légales CNC : reproduction autorisée « sous réserve
// d'indication de la source » → le CNC est cité dans le message.

const { createOfficialFeedSource } = require('./lib/official-feed');

const TITLE_RE = /f[êe]te du cin[ée]ma/i;

module.exports = createOfficialFeedSource({
  id: 'fete-du-cinema',
  feedUrl: 'https://www.cnc.fr/rss/-/journal/rss/36995/942647',
  url: 'https://www.cnc.fr/cinema/actualites',
  filter: (it) => TITLE_RE.test(it.title || ''),
  format: () => '🎬 La Fête du Cinéma est annoncée : la séance à petit prix, dates officielles. Source : CNC.',
});
module.exports.TITLE_RE = TITLE_RE;
