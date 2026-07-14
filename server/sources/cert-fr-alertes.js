// Source : alertes de sécurité du CERT-FR (ANSSI).
//
// Le CERT-FR publie plusieurs flux RSS publics par type de publication. On NE
// s'abonne PAS au flux des « avis » (CERTFR-*-AVI-*, quotidiens et bruyants),
// mais au flux des ALERTES (CERTFR-*-ALE-*) : rare, réservé aux menaces
// critiques activement exploitées — quelques-unes par mois au maximum.
//   Flux : https://www.cert.ssi.gouv.fr/alerte/feed/  (RSS 2.0)
//   Item : <title> (souvent préfixé [MàJ]), <link>, <pubDate>, <guid>.
//
// Actif si une alerte a été publiée dans les dernières 72 h. since = date de la
// dernière alerte → une nouvelle alerte (≥ 24 h après) re-notifie (épisode).
// Parsing RSS par regex (zéro dépendance : pas de parseur XML dans le projet).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const FEED_URL = 'https://www.cert.ssi.gouv.fr/alerte/feed/';
const TIMEOUT_MS = 10_000;
const WINDOW_MS = 72 * 60 * 60 * 1000; // fraîcheur : 72 h
const MAX_TITLE = 140;                  // titre raccourci si trop long

function decode(str) {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decode(m[1]) : null;
}

function shorten(title) {
  if (title.length <= MAX_TITLE) return title;
  return title.slice(0, MAX_TITLE - 1).replace(/\s+\S*$/, '') + '…';
}

async function fetchFeed() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(FEED_URL, { headers: { Accept: 'application/rss+xml, application/xml' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout CERT-FR (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel CERT-FR échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue CERT-FR : ${res.status} ${res.statusText}`);
  return res.text();
}

async function check() {
  const xml = await fetchFeed();
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  if (items.length === 0) {
    // Flux vide/illisible : on ne bloque pas le cycle, simplement inactif.
    return { state: 'inactive', since: null, until: null, message: null, url: 'https://www.cert.ssi.gouv.fr/alerte/' };
  }

  // L'ordre du flux n'est pas garanti : on prend l'alerte à la pubDate la plus récente.
  let latest = null;
  for (const block of items) {
    const pub = tag(block, 'pubDate');
    const d = pub ? new Date(pub) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    if (!latest || d > latest.date) {
      latest = { date: d, title: tag(block, 'title') || 'Alerte de sécurité', link: tag(block, 'link') };
    }
  }

  const fallbackUrl = 'https://www.cert.ssi.gouv.fr/alerte/';
  if (!latest) {
    return { state: 'inactive', since: null, until: null, message: null, url: fallbackUrl };
  }

  const fresh = Date.now() - latest.date.getTime() <= WINDOW_MS;
  if (!fresh) {
    return { state: 'inactive', since: null, until: null, message: null, url: latest.link || fallbackUrl };
  }

  return {
    state: 'active',
    since: latest.date,   // épisode : nouvelle alerte ≥ 24 h re-notifie
    until: null,
    message: `🛡️ CERT-FR : ${shorten(latest.title)}`,
    url: latest.link || fallbackUrl,
  };
}

module.exports = { id: 'cert-fr-alertes', check };
