// Source : décision de politique monétaire de la BCE (taux directeurs).
//
// Flux officiel : https://www.ecb.europa.eu/rss/press.html (RSS 2.0, ~15 items, en
// anglais). On ne retient QUE le communiqué « Monetary policy decisions » publié le
// jour de chaque réunion (8 par an) ; discours, interviews et « Account of the
// monetary policy meeting » sont ignorés. Message rédigé en français.
// robots.txt (lu le 12/10/2026) : flux non interdit, Crawl-delay 5 → un seul appel
// par cycle de 30 min. Mentions légales BCE : reproduction autorisée, BCE citée.

const { createOfficialFeedSource } = require('./lib/official-feed');

const TITLE_RE = /^\s*monetary policy decisions\s*$/i;

module.exports = createOfficialFeedSource({
  id: 'bce-taux-directeurs',
  feedUrl: 'https://www.ecb.europa.eu/rss/press.html',
  url: 'https://www.ecb.europa.eu/press/pr/html/index.fr.html',
  filter: (it) => TITLE_RE.test(it.title || ''),
  format: () => '🏦 La BCE vient d\'annoncer sa décision sur les taux directeurs. Source : Banque centrale européenne.',
});
module.exports.TITLE_RE = TITLE_RE;
