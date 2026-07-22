// Gestion du token OAuth2 PISTE / Légifrance (flux client_credentials). 4e usage du pattern
// éprouvé du projet (rte-auth, francetravail-auth, twitch-auth) : token en cache mémoire,
// renouvelé 5 min avant expiration, jamais ré-authentifié par appel.
//
// Identifiants dans le CORPS (grant_type/client_id/client_secret/scope), comme Twitch/France
// Travail. Endpoint token PISTE vérifié VIVANT le 22/07/2026 (400 invalid_client sur faux creds).
//
// ⚠️ PIÈGE CGU (FAQ officielle Légifrance) : même avec des identifiants VALIDES, les appels à
// l'API échouent si les CGU n'ont pas été acceptées pour l'ENVIRONNEMENT utilisé (Sandbox vs
// Production). Ici on cible la PRODUCTION (api.piste.gouv.fr). Si un appel réel échoue de façon
// inattendue (401/403), vérifier D'ABORD l'acceptation des CGU côté portail PISTE.
//
// Sans identifiants ou en cas de 400/401/403 → throw (l'appelant dégrade en inactive).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TOKEN_URL = 'https://oauth.piste.gouv.fr/api/oauth/token';
const DEFAULT_SCOPE = 'openid'; // scope Légifrance via PISTE — surchargeable si le portail en exige un autre
const TIMEOUT_MS = 10_000;
const RENEW_MARGIN_MS = 5 * 60 * 1000;

let cached = { token: null, expiresAt: 0 };

function isConfigured() {
  return !!((process.env.LEGIFRANCE_CLIENT_ID || '').trim() && (process.env.LEGIFRANCE_CLIENT_SECRET || '').trim());
}

/**
 * Retourne un access_token PISTE valide (depuis le cache si possible).
 * @returns {Promise<string>}
 */
async function getToken() {
  if (cached.token && Date.now() < cached.expiresAt - RENEW_MARGIN_MS) {
    return cached.token;
  }

  const id = (process.env.LEGIFRANCE_CLIENT_ID || '').trim();
  const secret = (process.env.LEGIFRANCE_CLIENT_SECRET || '').trim();
  if (!id || !secret) {
    throw new Error('LEGIFRANCE_CLIENT_ID / LEGIFRANCE_CLIENT_SECRET absents de l\'environnement');
  }
  const scope = (process.env.LEGIFRANCE_SCOPE || DEFAULT_SCOPE).trim();

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: id,
    client_secret: secret,
    scope,
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
    if (err.name === 'AbortError') throw new Error('Timeout auth PISTE (>10s)');
    throw new Error(`Appel auth PISTE échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new Error(`Identifiants PISTE invalides (HTTP ${res.status}) — vérifier LEGIFRANCE_CLIENT_ID / SECRET / SCOPE`);
  }
  if (!res.ok) throw new Error(`Réponse auth PISTE inattendue : ${res.status} ${res.statusText}`);

  let data;
  try { data = await res.json(); } catch (err) { throw new Error(`Réponse auth PISTE illisible : ${err.message}`); }
  if (!data.access_token) throw new Error('Réponse auth PISTE sans access_token');

  const ttlMs = (Number(data.expires_in) || 3600) * 1000;
  cached = { token: data.access_token, expiresAt: Date.now() + ttlMs };
  return cached.token;
}

function _resetCache() { cached = { token: null, expiresAt: 0 }; }

module.exports = { getToken, isConfigured, _resetCache };
