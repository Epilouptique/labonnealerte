// Source PARAMÉTRÉE (OpenAlert v2) : alerte quand une CHAÎNE TWITCH suivie passe EN DIRECT.
// Complément de youtube-chaine.js (nouvelle vidéo) côté Twitch — mais la « nouveauté » diffère :
// ici c'est la TRANSITION hors-ligne → en direct (un état, pas une publication).
//
// API Helix (api.twitch.tv), OAuth2 App Access Token via twitch-auth.js. ⚠️ Toute requête Helix
// exige DEUX en-têtes : Bearer token ET Client-Id. Endpoints vérifiés vivants le 21/07/2026.
// Sans identifiants (TWITCH_CLIENT_ID/SECRET) → no-op silencieux.
//   GET https://api.twitch.tv/helix/streams?user_login=<a>&user_login=<b>…&first=100
//   → { data:[ {user_login, user_name, title, game_name, started_at}, … ] }.
//   Une chaîne PRÉSENTE dans data[] = en direct ; ABSENTE = hors ligne.
//
// ── BATCH (essentiel pour le quota) ──────────────────────────────────────────
// L'endpoint accepte JUSQU'À 100 user_login par requête → on regroupe TOUS les combos du cycle
// en lots de 100 (pas une requête par chaîne). Rate limit Helix ~800 points/min largement tenu.
//
// ── ANTI-RÉTROACTIF ──────────────────────────────────────────────────────────
// Si une chaîne est DÉJÀ en direct au 1er passage (à la souscription), on mémorise l'état SANS
// alerter (le live est déjà en cours). Seule la transition hors-ligne → en direct APRÈS la
// souscription alerte. La transition en direct → hors-ligne ne notifie PAS (on n'annonce pas la
// fin d'un live). Cache mémoire court (3 min) : « être en direct » se périme vite.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { getToken, clientId, isConfigured } = require('../twitch-auth');

const HELIX = 'https://api.twitch.tv/helix/streams';
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 min (le direct se périme vite)
const BATCH = 100;                  // max user_login par requête Helix
const MAX_REQUESTS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);
const LOGIN_RE = /^[A-Za-z0-9_]{3,25}$/;

// Cache par login : { live:boolean, at, result }.
const cache = new Map();

function normLogin(v) { return String(v || '').trim().toLowerCase().replace(/^.*twitch\.tv\//, '').replace(/[/?#].*$/, ''); }

function inactive(login) {
  return { state: 'inactive', since: null, until: null, message: null, url: 'https://www.twitch.tv/' + login };
}

// Interroge Helix pour un lot de logins (≤100). Renvoie une Map login → { title, game, name }
// pour ceux EN DIRECT. Throw sur erreur réseau/HTTP.
async function fetchLive(logins, token) {
  const qs = logins.map((l) => 'user_login=' + encodeURIComponent(l)).join('&') + '&first=100';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(`${HELIX}?${qs}`, {
      headers: { Authorization: `Bearer ${token}`, 'Client-Id': clientId(), Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally { clearTimeout(timer); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const body = await res.json();
  const map = new Map();
  for (const s of (Array.isArray(body.data) ? body.data : [])) {
    if (s && s.user_login) {
      map.set(String(s.user_login).toLowerCase(), {
        title: String(s.title || '').trim(),
        game: String(s.game_name || '').trim(),
        name: String(s.user_name || s.user_login).trim(),
      });
    }
  }
  return map;
}

// Décide le résultat d'un login à partir de son état précédent et de son état en direct courant.
function decide(login, prev, nowLive, info) {
  if (!prev) return inactive(login); // 1er passage : référence mémorisée, AUCUNE alerte (anti-rétroactif)
  if (nowLive && !prev.live) {         // transition hors-ligne → en direct
    const i = info || {};
    const titre = i.title ? ` : ${i.title}` : '';
    const jeu = i.game ? ` — ${i.game}` : '';
    return {
      state: 'active', since: new Date(), until: null,
      message: `🔴 ${(i.name || login)} est en direct sur Twitch${titre}${jeu}`,
      url: 'https://www.twitch.tv/' + login,
    };
  }
  return inactive(login); // reste hors-ligne, reste en direct, ou en direct → hors-ligne
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];

  // Sans identifiants → no-op silencieux (prête-à-brancher).
  if (!isConfigured()) return combos.map((params) => Object.assign({ params }, inactive(normLogin(params && params.chaine))));

  let token;
  try { token = await getToken(); }
  catch (err) { console.warn(`[veille-twitch] auth échouée (${err.message}) → inactive.`); return combos.map((params) => Object.assign({ params }, inactive(normLogin(params && params.chaine)))); }

  const now = Date.now();

  // Logins DISTINCTS à rafraîchir (hors cache frais et format valide).
  const stale = [];
  const seenStale = new Set();
  for (const params of combos) {
    const login = normLogin(params && params.chaine);
    if (!LOGIN_RE.test(login)) continue;
    const hit = cache.get(login);
    if (hit && now - hit.at < CACHE_TTL_MS) continue; // frais → on rejouera son result
    if (!seenStale.has(login)) { seenStale.add(login); stale.push(login); }
  }

  // Lots de 100, plafonnés à MAX_REQUESTS requêtes/cycle (le reste rejoue son cache).
  const maxLogins = BATCH * MAX_REQUESTS;
  const toFetch = stale.slice(0, maxLogins);
  if (stale.length > maxLogins) console.warn(`[veille-twitch] ${stale.length} chaînes à rafraîchir — plafonné à ${maxLogins} ce cycle.`);

  for (let i = 0; i < toFetch.length; i += BATCH) {
    const chunk = toFetch.slice(i, i + BATCH);
    let liveMap;
    try { liveMap = await fetchLive(chunk, token); }
    catch (err) { console.warn(`[veille-twitch] lot ${1 + i / BATCH} : ${err.message} → inchangé.`); continue; }
    for (const login of chunk) {
      const prev = cache.get(login);
      const nowLive = liveMap.has(login);
      const result = decide(login, prev, nowLive, liveMap.get(login));
      cache.set(login, { live: nowLive, at: now, result });
    }
  }

  // Assemble la sortie pour chaque combo (depuis le cache, désormais à jour).
  return combos.map((params) => {
    const login = normLogin(params && params.chaine);
    if (!LOGIN_RE.test(login)) return Object.assign({ params }, inactive(login || 'twitch'));
    const hit = cache.get(login);
    return Object.assign({ params }, hit ? hit.result : inactive(login));
  });
}

module.exports = {
  id: 'veille-twitch',
  paramsSchema: [
    {
      key: 'chaine',
      label: 'Chaîne Twitch',
      type: 'string',
      placeholder: 'zerator',
      pattern: '^[A-Za-z0-9_]{3,25}$',
      lowercase: true,
      multiple: true,
      required: true,
      default: null,
      hint: 'Le nom de la chaîne Twitch (l\'identifiant, PAS l\'URL). Ex. pour twitch.tv/zerator, saisissez « zerator ». Alerte quand la chaîne passe en direct.',
    },
  ],
  checkWithParams,
};
