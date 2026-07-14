// Source interne : lancements spatiaux EUROPÉENS (Launch Library 2, sans clé).
//
// API : ll.thespacedevs.com/2.2.0/launch/upcoming (rate limit ~15 req/h ; notre
// cycle 30 min = 2 req/h, large marge). On utilise mode=list (payload allégé).
// STRUCTURE list constatée : results[] = { name, net (ISO), status.abbrev
// ('Go'|'TBC'|'TBD'…), lsp_name (fournisseur), pad (string), location (string,
// ex. « Guiana Space Centre, French Guiana » / « Esrange Space Center ») }.
//
// ANTI-SPAM : il y a des lancements quasi quotidiens (Starlink…). On filtre
// STRICTEMENT les lancements européens/français : provider Arianespace / ESA / CNES
// / Avio (Vega) OU pad au Centre spatial guyanais (Kourou) — quelques-uns par an.
//
// Actif quand un lancement filtré, confirmé (status 'Go'), décolle dans les 24h :
// fenêtre [net-24h, net+2h[. until = net+2h (extinction seule, comme les séismes).
// Un nouveau lancement (net différent, ≥24h d'écart) est re-notifié par le poller.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_URL = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=40&mode=list';
const TIMEOUT_MS = 10_000;
const WINDOW_BEFORE_MS = 24 * 60 * 60 * 1000;
const WINDOW_AFTER_MS = 2 * 60 * 60 * 1000;

const PROVIDER_RE = /arianespace|european space agency|cnes|avio/i;
const PAD_RE = /guiana|kourou|french guiana|guyane/i;
const ARIANE_LIVE = 'https://www.arianespace.com/';
const ESA_LIVE = 'https://www.esa.int/';

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Lancement européen ? (fournisseur OU lieu au Centre spatial guyanais)
function isEuropean(l) {
  const prov = l.lsp_name || '';
  const loc = l.location || '';
  return PROVIDER_RE.test(prov) || PAD_RE.test(loc);
}

function heureParis(date) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit',
  }).format(date).replace(':', 'h');
}

async function check() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API Launch Library (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API Launch Library échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new Error('Quota API Launch Library dépassé (HTTP 429)');
  if (!res.ok) throw new Error(`Réponse HTTP inattendue Launch Library : ${res.status} ${res.statusText}`);

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error(`Réponse Launch Library illisible (JSON invalide) : ${err.message}`);
  }
  const results = Array.isArray(payload && payload.results) ? payload.results : [];

  const now = Date.now();
  let best = null; // lancement européen confirmé, le plus proche, dans la fenêtre
  for (const l of results) {
    if (!isEuropean(l)) continue;
    const abbrev = (l.status && (l.status.abbrev || l.status.name)) || '';
    if (!/^go$/i.test(abbrev)) continue; // uniquement confirmé « Go »
    const net = parseDate(l.net);
    if (!net) continue;
    const ms = net.getTime();
    if (now < ms - WINDOW_BEFORE_MS || now >= ms + WINDOW_AFTER_MS) continue;
    if (!best || ms < best.netMs) {
      const prov = l.lsp_name || '';
      const pad = l.location || 'un site européen';
      best = { name: l.name, net, netMs: ms, prov, pad };
    }
  }

  if (!best) {
    return { state: 'inactive', since: null, until: null, message: null, url: ARIANE_LIVE };
  }

  const nom = String(best.name).replace(/\s*\|\s*/, ' – ');
  const url = /european space agency/i.test(best.prov) ? ESA_LIVE : ARIANE_LIVE;
  return {
    state: 'active',
    since: best.net,
    until: new Date(best.netMs + WINDOW_AFTER_MS),
    message: `🚀 Lancement ${nom} aujourd'hui à ${heureParis(best.net)} depuis ${best.pad} — suivez le direct`,
    url,
  };
}

module.exports = { id: 'lancement-spatial', check };
