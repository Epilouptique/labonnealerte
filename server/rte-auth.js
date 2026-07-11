// Gestion du token OAuth2 RTE (client_credentials via Basic Auth).
// Le token est mis en cache mémoire et régénéré 5 min avant expiration.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TOKEN_URL = 'https://digital.iservices.rte-france.com/token/oauth/';
const TIMEOUT_MS = 10_000;
const RENEW_MARGIN_MS = 5 * 60 * 1000; // renouvelle 5 min avant expiration

let cached = { token: null, expiresAt: 0 };

/**
 * Retourne un access_token RTE valide (depuis le cache si possible).
 * @returns {Promise<string>}
 */
async function getToken() {
  if (cached.token && Date.now() < cached.expiresAt - RENEW_MARGIN_MS) {
    return cached.token;
  }

  const id = process.env.RTE_CLIENT_ID;
  const secret = process.env.RTE_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('RTE_CLIENT_ID / RTE_CLIENT_SECRET absents de l\'environnement');
  }
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timeout auth RTE (>10s)');
    throw new Error(`Appel auth RTE échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Identifiants RTE invalides (HTTP ${res.status}) — vérifier RTE_CLIENT_ID / RTE_CLIENT_SECRET`);
  }
  if (!res.ok) {
    throw new Error(`Réponse auth RTE inattendue : ${res.status} ${res.statusText}`);
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error(`Réponse auth RTE illisible : ${err.message}`);
  }
  if (!data.access_token) {
    throw new Error('Réponse auth RTE sans access_token');
  }

  const ttlMs = (Number(data.expires_in) || 3600) * 1000;
  cached = { token: data.access_token, expiresAt: Date.now() + ttlMs };
  return cached.token;
}

module.exports = { getToken };
