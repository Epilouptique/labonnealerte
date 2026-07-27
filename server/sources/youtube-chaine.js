// Source PARAMÉTRÉE (OpenAlert v2) : nouvelle vidéo d'une chaîne YouTube choisie
// par l'abonné.
//
// Flux Atom public SANS clé :
//   GET https://www.youtube.com/feeds/videos.xml?channel_id=<id>
// On réutilise le parseur maison (lib/feed-parser) et on prend l'item le plus
// récent. « Actif » si publiée il y a < 24h. Chaîne invalide → inactif.
//
// Honnêteté : opt-in par chaîne — à réserver à des chaînes qui publient PEU
// (sinon flux de notifs). Une seule alerte par nouvelle vidéo (épisode via since).
//
// Cache mémoire 1h/combinaison + plafond MAX_COMBOS de fetchs/cycle.
//
// ── SAISIE : pseudo @… accepté en plus de l'identifiant UC… ──────────────────
// Le flux n'accepte QUE l'identifiant interne (UC + 22 car.), qui n'est PAS
// visible dans l'interface YouTube (il faut aller le chercher dans un sous-menu).
// On accepte donc aussi le pseudo public (@nomdelachaine) et l'adresse de la
// page, résolus vers l'identifiant via la page publique de la chaîne, où il
// figure sous deux formes redondantes : le lien canonique
// (<link rel="canonical" href=".../channel/UC…">) et le champ "externalId".
// L'ancienne saisie UC… reste acceptée telle quelle : les abonnements existants
// continuent de fonctionner sans migration (la clé de paramètre ne change pas).
//
// ⚠️ La saisie étant libre, l'appel de résolution est piloté par l'utilisateur →
// safeFetchText OBLIGATOIRE (anti-SSRF), doublé d'une restriction d'hôte à
// youtube.com. Le fetch du flux, lui, est construit à partir d'un identifiant
// déjà validé par regex : aucune surface SSRF.
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

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { safeFetchText } = require('../safe-fetch');
const { parseFeed } = require('./lib/feed-parser');

const TIMEOUT_MS = 8_000;
const FRESH_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 1 * 60 * 60 * 1000;
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

const MAX_BYTES_PAGE = 4 * 1024 * 1024; // page de chaîne ~2,3 Mo constatés
const RESOLVE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 j (succès)
const RESOLVE_FAIL_TTL_MS = 6 * 60 * 60 * 1000;  // 6 h (échec)

// Cookie de consentement par défaut : indispensable depuis l'UE (cf. piège 1).
const YT_HEADERS = {
  Cookie: 'SOCS=CAI',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
};

const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

// Saisies acceptées : identifiant UC… (historique) · @pseudo · URL /channel/UC… ·
// URL /@pseudo · URL /c/… · URL /user/…. Large à dessein : les pseudos acceptent
// points, tirets, underscores et caractères non latins.
const INPUT_RE = new RegExp(
  '^(?:'
  + 'UC[A-Za-z0-9_-]{22}'
  + '|@[^\\s/?#]{1,60}'
  + '|https://(?:www\\.|m\\.)?youtube\\.com/(?:@[^\\s/?#]{1,60}|channel/UC[A-Za-z0-9_-]{22}'
  + '|c/[^\\s/?#]{1,60}|user/[^\\s/?#]{1,60})/?'
  + ')$',
);

// Cache résultat : clé de saisie → { at, result }.
const cache = new Map();
// Cache résolution : URL de page → { at, id, ttl }. id = null si échec.
const resolveCache = new Map();

const paramsSchema = [
  {
    key: 'channel_id', // clé INCHANGÉE : ne pas casser les abonnements existants
    label: 'Chaîne YouTube',
    type: 'string',
    placeholder: '@nomdelachaine',
    pattern: INPUT_RE.source,
    lowercase: false, // les identifiants de chaîne sont sensibles à la casse
    multiple: true,
    required: true,
    default: null,
    hint: 'Le pseudo de la chaîne (il commence par @, affiché sous son nom sur YouTube) '
      + 'ou l\'adresse complète de sa page.',
  },
];

function inactive(params, cid) {
  const url = cid ? `https://www.youtube.com/channel/${cid}` : 'https://www.youtube.com';
  return { params, state: 'inactive', since: null, until: null, message: null, url };
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
  console.warn(`[youtube-chaine] identifiant de chaîne introuvable dans la page (${pageUrl}) — format YouTube modifié ?`);
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

async function checkOne(params) {
  const cid = await resolveChannelId((params && params.channel_id) || '');
  // Saisie inexploitable ou chaîne introuvable → inactif, jamais d'erreur.
  if (!cid) return inactive(params, null);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(cid)}`, {
      headers: { Accept: 'application/atom+xml, application/xml, text/xml' }, signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout flux YouTube (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel flux YouTube échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) return inactive(params, cid);
  if (!res.ok) throw new Error(`Réponse HTTP inattendue YouTube : ${res.status} ${res.statusText}`);

  const xml = await res.text();
  const { feedTitle, items } = parseFeed(xml);
  if (!items || items.length === 0) return inactive(params, cid);

  // Vidéo la plus récente (le flux est trié, mais on ne s'y fie pas).
  let latest = null;
  for (const it of items) {
    if (it.date && (!latest || it.date > latest.date)) latest = it;
  }
  if (!latest || !latest.date) return inactive(params, cid);
  if (Date.now() - latest.date.getTime() >= FRESH_MS) return inactive(params, cid);

  const m = latest.raw && latest.raw.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i);
  const url = m ? `https://www.youtube.com/watch?v=${m[1]}` : (latest.link || `https://www.youtube.com/channel/${cid}`);

  return {
    params,
    state: 'active',
    since: latest.date,
    until: null,
    message: `▶️ Nouvelle vidéo de ${feedTitle} : ${latest.title}`,
    url,
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  const out = [];
  const toFetch = [];

  for (const params of combos) {
    const key = String((params && params.channel_id) || '').trim();
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) out.push({ ...hit.result, params });
    else toFetch.push({ key, params });
  }

  let batch = toFetch;
  if (batch.length > MAX_COMBOS) {
    console.warn(`[youtube-chaine] ${batch.length} chaînes à rafraîchir — plafonné à ${MAX_COMBOS} ce cycle.`);
    const deferred = batch.slice(MAX_COMBOS);
    batch = batch.slice(0, MAX_COMBOS);
    for (const { key, params } of deferred) {
      const hit = cache.get(key);
      if (hit) out.push({ ...hit.result, params });
    }
  }

  const settled = await Promise.allSettled(batch.map(({ params }) => checkOne(params)));
  settled.forEach((r, i) => {
    const { key, params } = batch[i];
    if (r.status === 'fulfilled') {
      cache.set(key, { at: Date.now(), result: r.value });
      out.push(r.value);
    } else {
      console.warn(`[youtube-chaine] ${JSON.stringify(params)} : ${r.reason && r.reason.message}`);
      const hit = cache.get(key);
      if (hit) out.push({ ...hit.result, params });
    }
  });

  return out;
}

module.exports = { id: 'youtube-chaine', paramsSchema, checkWithParams };
