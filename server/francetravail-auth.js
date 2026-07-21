// Gestion du token OAuth2 France Travail (flux client_credentials, machine-to-machine).
// Calqué sur rte-auth.js : token en cache mémoire, régénéré 5 min avant expiration, jamais
// ré-authentifié à chaque appel. Spécificités France Travail (vs RTE) :
//   • identifiants dans le CORPS (grant_type/client_id/client_secret/scope), pas en Basic Auth ;
//   • query `realm=/partenaire` sur l'endpoint token ;
//   • scope à confirmer côté portail (api_offresdemploiv2 o2dsoffre) → surchargeable par env.
//
// Endpoint token vérifié VIVANT le 21/07/2026 (400 invalid_client sur faux creds). Sans
// identifiants ou en cas de 401/403 → throw (l'appelant dégrade silencieusement en inactive).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TOKEN_URL = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const DEFAULT_SCOPE = 'api_offresdemploiv2 o2dsoffre';
const TIMEOUT_MS = 10_000;
const RENEW_MARGIN_MS = 5 * 60 * 1000; // renouvelle 5 min avant expiration

let cached = { token: null, expiresAt: 0 };

// true si les identifiants sont configurés (permet aux sources de no-op proprement).
function isConfigured() {
  return !!((process.env.FRANCETRAVAIL_CLIENT_ID || '').trim() && (process.env.FRANCETRAVAIL_CLIENT_SECRET || '').trim());
}

/**
 * Retourne un access_token France Travail valide (depuis le cache si possible).
 * @returns {Promise<string>}
 */
async function getToken() {
  if (cached.token && Date.now() < cached.expiresAt - RENEW_MARGIN_MS) {
    return cached.token;
  }

  const id = (process.env.FRANCETRAVAIL_CLIENT_ID || '').trim();
  const secret = (process.env.FRANCETRAVAIL_CLIENT_SECRET || '').trim();
  if (!id || !secret) {
    throw new Error('FRANCETRAVAIL_CLIENT_ID / FRANCETRAVAIL_CLIENT_SECRET absents de l\'environnement');
  }
  const scope = (process.env.FRANCETRAVAIL_SCOPE || DEFAULT_SCOPE).trim();

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
    if (err.name === 'AbortError') throw new Error('Timeout auth France Travail (>10s)');
    throw new Error(`Appel auth France Travail échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new Error(`Identifiants France Travail invalides (HTTP ${res.status}) — vérifier FRANCETRAVAIL_CLIENT_ID / SECRET / SCOPE`);
  }
  if (!res.ok) throw new Error(`Réponse auth France Travail inattendue : ${res.status} ${res.statusText}`);

  let data;
  try { data = await res.json(); } catch (err) { throw new Error(`Réponse auth France Travail illisible : ${err.message}`); }
  if (!data.access_token) throw new Error('Réponse auth France Travail sans access_token');

  const ttlMs = (Number(data.expires_in) || 1500) * 1000;
  cached = { token: data.access_token, expiresAt: Date.now() + ttlMs };
  return cached.token;
}

// Réinitialise le cache (tests / rotation forcée).
function _resetCache() { cached = { token: null, expiresAt: 0 }; }

module.exports = { getToken, isConfigured, _resetCache };
