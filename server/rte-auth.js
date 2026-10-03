// Gestion du token OAuth2 RTE (client_credentials via Basic Auth).
// Le token est mis en cache mémoire et régénéré 5 min avant expiration.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { safeErrorCode, markAuthFailure, logAuthRejection, logAuthMissing } = require('./auth-failure');

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

  const id = (process.env.RTE_CLIENT_ID || '').trim();
  const secret = (process.env.RTE_CLIENT_SECRET || '').trim();
  if (!id || !secret) {
    // Variable vidée par une rotation ratée : même traitement qu'un rejet (incident visible).
    logAuthMissing('rte', ['RTE_CLIENT_ID', 'RTE_CLIENT_SECRET']);
    throw markAuthFailure(new Error('RTE_CLIENT_ID / RTE_CLIENT_SECRET absents de l\'environnement'), 'rte');
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

  // ROTATION D'IDENTIFIANTS (fil #9bis) : un rejet du endpoint token est journalisé
  // EXPLICITEMENT (ligne `[auth][rte] IDENTIFIANTS REJETÉS`) et l'erreur est marquée
  // `authFailure` — les sources la PROPAGENT au lieu de dégrader en « inactive », ce qui
  // fait apparaître un « incident de surveillance » au lieu de « rien à signaler ».
  // Seul le CODE d'erreur normalisé du fournisseur est journalisé, jamais le corps brut
  // ni `error_description` (qui peut contenir l'identifiant), jamais une valeur de secret.
  // 400 INCLUS : vérifié en réel le 04/10/2026 avec des identifiants factices, le portail
  // RTE répond « 400 Bad Request » (et non 401) à un couple client_id/secret invalide. Sans
  // ce cas, une rotation RTE ratée serait retombée dans « Réponse auth RTE inattendue »,
  // donc sans marquage `authFailure` ni ligne [auth] explicite.
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    let code = null;
    try { code = safeErrorCode(await res.text()); } catch (err) { /* corps illisible : statut seul */ }
    logAuthRejection('rte', res.status, code, ['RTE_CLIENT_ID', 'RTE_CLIENT_SECRET']);
    throw markAuthFailure(
      new Error(`Identifiants RTE rejetés (HTTP ${res.status}${code ? `, ${code}` : ''}) — vérifier RTE_CLIENT_ID / RTE_CLIENT_SECRET`),
      'rte'
    );
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
