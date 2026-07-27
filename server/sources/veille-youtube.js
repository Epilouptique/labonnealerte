// Source PARAMÉTRÉE (OpenAlert v2) : veille sur une CHAÎNE YouTube au choix de
// l'abonné. Actif si une nouvelle vidéo a été publiée < 72h. Calqué sur
// veille-rss.js (même structure : safeFetchText, cache TTL, parseFeed partagé,
// plafond de fetchs/cycle) avec UNE étape en plus : la résolution du pseudo
// saisi par l'abonné vers l'identifiant interne de la chaîne.
//
// ⚠️ CHANTIER SENSIBLE : la saisie vient de l'utilisateur → safeFetchText
// OBLIGATOIRE sur les deux appels, ET restriction d'hôte à youtube.com (le
// premier appel est le seul piloté par l'entrée libre ; le second est construit
// à partir d'un identifiant déjà validé par regex, donc sans surface SSRF).
//
// ── Résolution pseudo → identifiant de chaîne (exploré en conditions réelles) ──
// Le flux public officiel n'accepte QUE l'identifiant interne (UC + 22 car.),
// jamais le pseudo. Cet identifiant est présent dans le code source de la page
// publique de la chaîne, sous deux formes redondantes : le lien canonique
// (<link rel="canonical" href=".../channel/UC…">) et le champ "externalId".
// On lit les deux, on garde la première trouvée.
//
// DEUX PIÈGES CONSTATÉS EN TEST (ne pas « simplifier » sans relire ceci) :
//  1. Depuis une IP de l'UE, youtube.com renvoie une redirection 302 vers son
//     mur de consentement. safeFetchText interdit le suivi de redirection
//     (anti-SSRF) → sans rien faire, TOUTE résolution échouerait en prod (le
//     serveur est en UE). Le cookie SOCS=CAI (choix de consentement par défaut,
//     tel que posé par le mur lui-même) rend la page directement en 200.
//  2. Le paramètre `?user=` du flux et les URL /user/… désignent les ANCIENS
//     noms d'utilisateur, qui NE SONT PAS les pseudos actuels : « user=arte »
//     renvoie une chaîne DIFFÉRENTE de « @arte ». On ne s'en sert donc jamais
//     comme raccourci de résolution — on passe toujours par la page publique.
//
// La page pèse ~2,3 Mo : la résolution est chère, donc mise en cache 30 jours
// (un pseudo ne change quasiment jamais d'identifiant). Les échecs sont mis en
// cache 6h seulement (une chaîne créée récemment doit finir par se résoudre).
// Si YouTube change son HTML, les deux motifs échouent ensemble → `inactive`
// silencieux + un log, jamais de crash.

const { safeFetchText } = require('../safe-fetch');
const { parseFeed } = require('./lib/feed-parser');

const TIMEOUT_MS = 8_000;
const MAX_BYTES_PAGE = 4 * 1024 * 1024; // page de chaîne ~2,3 Mo constatés
const MAX_BYTES_FEED = 512 * 1024;      // flux ~50 Ko constatés (15 vidéos)
const RESOLVE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 j (succès)
const RESOLVE_FAIL_TTL_MS = 6 * 60 * 60 * 1000;  // 6 h (échec)
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const FRESH_MS = 72 * 60 * 60 * 1000;
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

// Cookie de consentement par défaut : indispensable depuis l'UE (cf. piège 1).
const YT_HEADERS = {
  Cookie: 'SOCS=CAI',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
};

const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

// Saisies acceptées : @pseudo · URL /channel/UC… · URL /@pseudo · URL /c/… ·
// URL /user/… · identifiant UC… collé tel quel. Large à dessein : les pseudos
// acceptent points, tirets, underscores et caractères non latins.
const INPUT_RE = new RegExp(
  '^(?:'
  + 'UC[A-Za-z0-9_-]{22}'
  + '|@[^\\s/?#]{1,60}'
  + '|https://(?:www\\.|m\\.)?youtube\\.com/(?:@[^\\s/?#]{1,60}|channel/UC[A-Za-z0-9_-]{22}'
  + '|c/[^\\s/?#]{1,60}|user/[^\\s/?#]{1,60})/?'
  + ')$',
);

const paramsSchema = [
  {
    key: 'chaine',
    label: 'Chaîne YouTube',
    type: 'string',
    placeholder: '@nomdelachaine',
    pattern: INPUT_RE.source,
    lowercase: false, // les identifiants de chaîne sont sensibles à la casse
    multiple: true,
    required: true,
    default: null,
    hint: 'Le pseudo de la chaîne (il commence par @, visible sous son nom sur YouTube) '
      + 'ou l\'adresse complète de sa page.',
  },
];

// Cache résolution : saisie normalisée → { at, id, ttl }. id = null si échec.
const resolveCache = new Map();
// Cache résultat : identifiant de chaîne → { at, result }.
const cache = new Map();

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: 'https://labonnealerte.fr' };
}

// Saisie libre → { id } si déjà un identifiant, { pageUrl } s'il faut résoudre,
// ou null si la saisie est inexploitable.
function planResolution(raw) {
  const input = String(raw || '').trim();
  if (!INPUT_RE.test(input)) return null;

  if (CHANNEL_ID_RE.test(input)) return { id: input };
  if (input.startsWith('@')) return { pageUrl: `https://www.youtube.com/${input}` };

  let url;
  try { url = new URL(input); } catch { return null; }
  // Ceinture + bretelles : l'hôte est déjà contraint par INPUT_RE, on revérifie
  // après parsing (une URL peut tromper une regex, pas le parseur d'URL).
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname)) return null;

  const direct = url.pathname.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})\/?$/);
  if (direct) return { id: direct[1] };
  return { pageUrl: `https://www.youtube.com${url.pathname.replace(/\/$/, '')}` };
}

// Page publique de la chaîne → identifiant, ou null (jamais de throw).
async function fetchChannelId(pageUrl) {
  let html;
  try {
    html = await safeFetchText(pageUrl, {
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_BYTES_PAGE,
      accept: 'text/html',
      headers: YT_HEADERS,
    });
  } catch (err) {
    // Chaîne inexistante (404), pseudo mal formé, réseau, SSRF, mur de
    // consentement (302 = redirection refusée) → échec silencieux.
    return null;
  }
  const canonical = html.match(/rel="canonical"\s+href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/);
  if (canonical) return canonical[1];
  const external = html.match(/"externalId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/);
  if (external) return external[1];
  // Les deux motifs ont échoué alors que la page a bien été servie : signal
  // probable d'un changement de HTML côté YouTube → à surveiller.
  console.warn(`[veille-youtube] identifiant de chaîne introuvable dans la page (${pageUrl}) — format YouTube modifié ?`);
  return null;
}

async function resolveChannelId(raw) {
  const plan = planResolution(raw);
  if (!plan) return null;
  if (plan.id) return plan.id;

  const key = plan.pageUrl.toLowerCase();
  const hit = resolveCache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.id;

  const id = await fetchChannelId(plan.pageUrl);
  resolveCache.set(key, { at: Date.now(), id, ttl: id ? RESOLVE_TTL_MS : RESOLVE_FAIL_TTL_MS });
  return id;
}

// Identifiant validé → état de la chaîne. URL construite par nous, pas de SSRF.
async function fetchChaine(channelId) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  let xml;
  try {
    xml = await safeFetchText(feedUrl, {
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_BYTES_FEED,
      accept: 'application/atom+xml, application/xml, text/xml',
      headers: YT_HEADERS,
    });
  } catch (err) {
    return inactive();
  }
  const { items } = parseFeed(xml);
  if (!items.length) return inactive();

  // Vidéo la plus récente (le flux est trié, mais on ne s'y fie pas).
  let newest = null;
  for (const it of items) {
    if (it.date && (!newest || it.date > newest.date)) newest = it;
  }
  if (!newest || !newest.date) return inactive();
  if (Date.now() - newest.date.getTime() >= FRESH_MS) return inactive();

  const titre = newest.title || 'nouvelle vidéo';
  return {
    state: 'active',
    since: newest.date,
    until: null,
    message: `📺 Nouvelle vidéo : ${titre}`,
    url: newest.link || `https://www.youtube.com/channel/${channelId}`,
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  let fetches = 0;
  const out = [];

  for (const params of combos) {
    const raw = String((params && params.chaine) || '');
    const channelId = await resolveChannelId(raw);
    if (!channelId) { out.push(Object.assign({ params }, inactive())); continue; }

    const cached = cache.get(channelId);
    if (cached && now - cached.at < CACHE_TTL_MS) {
      out.push(Object.assign({ params }, cached.result));
      continue;
    }
    if (fetches >= MAX_FETCH) {
      out.push(Object.assign({ params }, cached ? cached.result : inactive()));
      continue;
    }
    fetches += 1;
    const result = await fetchChaine(channelId);
    cache.set(channelId, { at: Date.now(), result });
    out.push(Object.assign({ params }, result));
  }
  if (combos.length > MAX_FETCH) {
    console.warn(`[veille-youtube] ${combos.length} chaînes souscrites, ${MAX_FETCH} rafraîchies ce cycle.`);
  }
  return out;
}

module.exports = { id: 'veille-youtube', paramsSchema, checkWithParams };
