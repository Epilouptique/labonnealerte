// Parseur RSS 2.0 / Atom minimal, par regex (zéro dépendance — pas de parseur XML
// dans le projet, cohérent avec cert-fr-alertes.js). Extrait le titre du flux et
// les items { title, link, date }. Suffisant pour détecter « nouvel item récent ».

// Décodage des entités XML/HTML courantes (+ &#nn; / &#xNN;).
function decode(s) {
  return String(s == null ? '' : s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : null;
}

// Lien : RSS <link>url</link> ; Atom <link rel="alternate" href="url"/> (ou 1er href).
function extractLink(block) {
  const rss = block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
  if (rss && rss[1] && rss[1].trim() && !/href=/i.test(rss[0])) return decode(rss[1]);
  const alt = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
  if (alt) return decode(alt[1]);
  const any = block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
  if (any) return decode(any[1]);
  return null;
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// xml → { feedTitle, items: [{ title, link, date }] } (items dans l'ordre du flux).
function parseFeed(xml) {
  const text = String(xml || '');
  const isAtom = /<feed[\s>]/i.test(text) && /<entry[\s>]/i.test(text);
  const feedTitleRaw = isAtom
    ? (text.match(/<feed[\s\S]*?<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1]
    : (text.match(/<channel[\s\S]*?<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const feedTitle = decode(feedTitleRaw || '');

  const blocks = isAtom
    ? (text.match(/<entry\b[\s\S]*?<\/entry>/gi) || [])
    : (text.match(/<item\b[\s\S]*?<\/item>/gi) || []);

  const items = blocks.map((b) => {
    const title = decode(tag(b, 'title') || '');
    const link = extractLink(b);
    const dateStr = isAtom
      ? (tag(b, 'published') || tag(b, 'updated'))
      : (tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'date'));
    return { title, link, date: parseDate(dateStr), raw: b };
  });

  return { feedTitle, items };
}

module.exports = { parseFeed, decode, tag };
