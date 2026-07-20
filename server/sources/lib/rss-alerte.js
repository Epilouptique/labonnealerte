// Brique partagée : source « alerte RSS » broadcast (zéro paramètre, zéro
// dépendance XML). Surveille un ou plusieurs flux RSS 2.0 et devient active tant
// que le dernier item RETENU (après filtre optionnel) reste « frais » (freshDays).
// Modèle identique à cert-fr-alertes.js, généralisé au multi-flux + filtre :
//   since = date de l'item le plus récent → un nouvel item (≥ 24 h après) re-notifie
//   (logique d'épisode du poller). until = null.
// Parsing par regex (le projet n'embarque pas de parseur XML).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TITLE = 140;

function decode(str) {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decode(m[1]) : null;
}

function shorten(title, max = MAX_TITLE) {
  const t = String(title || '');
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

// Parse un flux RSS 2.0 → [{ title, link, date, description, guid, categories:[] }].
function parseItems(xml) {
  const blocks = String(xml || '').match(/<item[\s\S]*?<\/item>/gi) || [];
  const out = [];
  for (const b of blocks) {
    const pub = tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'date');
    const d = pub ? new Date(pub) : null;
    const categories = [...b.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => decode(m[1]));
    out.push({
      title: tag(b, 'title') || '',
      link: tag(b, 'link') || '',
      date: d && !Number.isNaN(d.getTime()) ? d : null,
      description: tag(b, 'description') || '',
      guid: tag(b, 'guid') || '',
      categories,
    });
  }
  return out;
}

async function fetchFeed(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(url, {
      headers: { Accept: 'application/rss+xml, application/xml', 'User-Agent': 'LaBonneAlerte/1.0' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{ id:string, urls:string[], url:string, freshDays?:number,
 *           filter?:(item)=>boolean, format:(item)=>string }} cfg
 *   urls   : flux à surveiller (fusionnés) ; url : lien portail de repli.
 *   filter : garde l'item si true (défaut : tout garder).
 *   format : construit le message à partir de l'item le plus récent retenu.
 */
function createRssAlerteSource(cfg) {
  const { id, urls, url, freshDays = 3, filter, format } = cfg;

  async function check() {
    // Best-effort : un flux en erreur ne bloque pas les autres.
    const all = [];
    for (const u of urls) {
      let xml = null;
      try { xml = await fetchFeed(u); }
      catch (err) { console.warn(`[${id}] flux ${u} : ${err.message}`); continue; }
      for (const it of parseItems(xml)) all.push(it);
    }

    const kept = all.filter((it) => it.date && (typeof filter === 'function' ? filter(it) : true));
    if (!kept.length) return { state: 'inactive', since: null, until: null, message: null, url };

    let latest = kept[0];
    for (const it of kept) if (it.date > latest.date) latest = it;

    const fresh = Date.now() - latest.date.getTime() <= freshDays * DAY_MS;
    if (!fresh) return { state: 'inactive', since: null, until: null, message: null, url: latest.link || url };

    return {
      state: 'active',
      since: latest.date, // épisode : nouvel item ≥ 24 h re-notifie
      until: null,
      message: format(latest),
      url: latest.link || url,
    };
  }

  return { id, check };
}

module.exports = { createRssAlerteSource, parseItems, decode, shorten };
