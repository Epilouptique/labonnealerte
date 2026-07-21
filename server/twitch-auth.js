// Gestion de l'App Access Token OAuth2 Twitch (flux client_credentials).
// 3e usage du même pattern éprouvé dans le projet (rte-auth.js, francetravail-auth.js) :
// token en cache mémoire, renouvelé 5 min avant expiration, jamais ré-authentifié par appel.
//
// ⚠️ SPÉCIFICITÉ TWITCH : toute requête à l'API Helix exige DEUX en-têtes — le Bearer token
// ET le Client-Id (le même client_id que celui de l'authentification). On expose donc
// clientId() en plus de getToken(). Endpoint token vérifié VIVANT le 21/07/2026 (400
// « invalid client » sur faux creds). Sans identifiants → throw (l'appelant no-op inactive).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const TIMEOUT_MS = 10_000;
const RENEW_MARGIN_MS = 5 * 60 * 1000;

let cached = { token: null, expiresAt: 0 };

function clientId() { return (process.env.TWITCH_CLIENT_ID || '').trim(); }
function isConfigured() { return !!(clientId() && (process.env.TWITCH_CLIENT_SECRET || '').trim()); }

/**
 * Retourne un App Access Token Twitch valide (depuis le cache si possible).
 * @returns {Promise<string>}
 */
async function getToken() {
  if (cached.token && Date.now() < cached.expiresAt - RENEW_MARGIN_MS) {
    return cached.token;
  }

  const id = clientId();
  const secret = (process.env.TWITCH_CLIENT_SECRET || '').trim();
  if (!id || !secret) {
    throw new Error('TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET absents de l\'environnement');
  }

  const body = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    grant_type: 'client_credentials',
  }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timeout auth Twitch (>10s)');
    throw new Error(`Appel auth Twitch échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new Error(`Identifiants Twitch invalides (HTTP ${res.status}) — vérifier TWITCH_CLIENT_ID / SECRET`);
  }
  if (!res.ok) throw new Error(`Réponse auth Twitch inattendue : ${res.status} ${res.statusText}`);

  let data;
  try { data = await res.json(); } catch (err) { throw new Error(`Réponse auth Twitch illisible : ${err.message}`); }
  if (!data.access_token) throw new Error('Réponse auth Twitch sans access_token');

  const ttlMs = (Number(data.expires_in) || 3600) * 1000;
  cached = { token: data.access_token, expiresAt: Date.now() + ttlMs };
  return cached.token;
}

function _resetCache() { cached = { token: null, expiresAt: 0 }; }

module.exports = { getToken, clientId, isConfigured, _resetCache };
