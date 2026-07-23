// Source BROADCAST (OpenAlert v2) : nouvelle activité éruptive signalée dans le Weekly Volcanic
// Activity Report du Smithsonian Global Volcanism Program (GVP) / USGS.
//
// Flux (SANS clé) : https://volcano.si.edu/news/WeeklyVolcanoRSS.xml (RSS 2.0).
//   <item> { <title> « Etna (Italy) - Report for 2 July-8 July 2026 - New Eruptive Activity »,
//            <link>, <pubDate>, <guid> }.
//
// ⚠️ CADENCE HEBDOMADAIRE : ce rapport est publié une fois par semaine (le mercredi). Ce n'est
// PAS du temps réel — le message le précise pour ne pas laisser croire à une alerte instantanée.
//
// ── FILTRE ───────────────────────────────────────────────────────────────────
// On n'alerte QUE sur les entrées « New Eruptive Activity » (nouvelle activité), pas
// « Continuing Eruptive Activity » (activité déjà en cours). Dédoublonnage par volcan+semaine.
//
// ── ANTI-RÉTROACTIF ──────────────────────────────────────────────────────────
// Au 1er passage, on mémorise les entrées « New » courantes SANS alerter (déjà publiées avant la
// souscription). Seule une entrée JAMAIS vue déclenche. Cache mémoire (réinit sûre).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const FEED_URL = 'https://volcano.si.edu/news/WeeklyVolcanoRSS.xml';
const PUBLIC_URL = 'https://volcano.si.edu/gvp_currenteruptions.cfm';
const TIMEOUT_MS = 12_000;
// Le WAF de GVP renvoie 403 sur un User-Agent par défaut OU sur l'en-tête Accept « application/
// rss+xml » → on présente un UA de navigateur standard et on N'ENVOIE PAS d'en-tête Accept.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// null = pas encore amorcé (anti-rétroactif) ; sinon Set des clés d'entrées « New » déjà vues.
let seen = null;

function inactive() { return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

function decode(str) {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decode(m[1]) : null;
}

// Extrait le nom « Volcan (Pays) » d'un titre GVP (avant « - Report »).
function volcanoName(title) {
  const m = String(title || '').match(/^(.*?)\s*-\s*Report/i);
  return (m ? m[1] : String(title || '')).trim();
}

async function fetchFeed() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(FEED_URL, { headers: { 'User-Agent': UA }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timeout GVP');
    throw new Error('Appel GVP échoué : ' + err.message);
  } finally { clearTimeout(timer); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

async function check() {
  let xml;
  try { xml = await fetchFeed(); }
  catch (err) { console.warn(`[eruption-volcanique] ${err.message} → inactive.`); return inactive(); }

  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const news = []; // entrées « New Eruptive Activity »
  for (const block of items) {
    const title = tag(block, 'title') || '';
    if (!/new eruptive activity/i.test(title)) continue; // on ignore « Continuing »
    const guid = tag(block, 'guid') || title; // clé de dédoublonnage (volcan+semaine)
    const pub = tag(block, 'pubDate');
    const d = pub ? new Date(pub) : null;
    news.push({
      key: guid,
      nom: volcanoName(title),
      date: d && !Number.isNaN(d.getTime()) ? d : new Date(),
      link: tag(block, 'link') || PUBLIC_URL,
    });
  }

  // 1er passage : amorçage de la référence, aucune alerte (anti-rétroactif).
  if (seen === null) {
    seen = new Set(news.map((n) => n.key));
    return inactive();
  }

  const nouveaux = news.filter((n) => !seen.has(n.key));
  news.forEach((n) => seen.add(n.key));
  if (!nouveaux.length) return inactive();

  // La plus récente des nouvelles entrées (since = sa date → nouvel épisode côté poller).
  nouveaux.sort((a, b) => b.date - a.date);
  const n = nouveaux[0];
  return {
    state: 'active',
    since: n.date,
    until: null,
    message: `🌋 Nouvelle activité éruptive signalée : ${n.nom} (rapport hebdomadaire Smithsonian/USGS, publié le mercredi — pas du temps réel).`,
    url: n.link,
  };
}

module.exports = { id: 'eruption-volcanique', check, _test: { peek: () => seen, poke: (k) => seen && seen.delete(k) } };
