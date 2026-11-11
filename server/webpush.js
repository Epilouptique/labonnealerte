// Envoi des notifications push, deux transports dans la même table push_subscriptions :
//   - kind = 'web'  : Web Push VAPID (web-push) — site et app Android (UnifiedPush) ;
//   - kind = 'expo' : app iOS, via le service push d'Expo (POST exp.host, sans clé serveur).
//
// Les clés VAPID viennent de l'environnement. Sans elles, seul le transport WEB devient un
// no-op silencieux (le site fonctionne, le push web est indisponible) ; l'envoi Expo ne
// dépend PAS de VAPID et continue de fonctionner.

const webpush = require('web-push');
const { pool } = require('./db');

const PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || '').trim();
const PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();
const SUBJECT = (process.env.VAPID_SUBJECT || 'mailto:contact@labonnealerte.fr').trim();

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_TIMEOUT_MS = 10_000;

const enabled = Boolean(PUBLIC_KEY && PRIVATE_KEY);
if (enabled) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
} else {
  console.warn('[webpush] VAPID absent : notifications push web désactivées (push Expo non concerné).');
}

/** Push WEB disponible (clés VAPID présentes). Sert à la clé publique côté navigateur. */
function isEnabled() {
  return enabled;
}

function publicKey() {
  return PUBLIC_KEY;
}

/** Contenu commun aux deux transports (mêmes valeurs par défaut qu'avant). */
function buildPayload(info = {}) {
  return {
    title: info.name || 'La Bonne Alerte',
    body: info.message || 'Une alerte que vous suivez vient de se déclencher.',
    url: info.url || info.statusUrl || 'https://labonnealerte.fr',
  };
}

/**
 * Envoie UNE notification à UNE ligne de push_subscriptions.
 * Résultat : 'sent' | 'dead' (abonnement mort, à supprimer) | 'failed' | 'skipped'
 * ('skipped' : ligne web alors que VAPID est absent — ni envoyée ni comptée, comme avant).
 * Dépendances injectables (tests) : { webpush, fetch, webEnabled }. Aucun jeton en clair
 * dans les journaux : seule l'id de la ligne est citée.
 */
async function sendOne(row, payload, deps = {}) {
  const kind = row.kind || 'web';
  if (kind === 'expo') return sendExpo(row, payload, deps.fetch || globalThis.fetch);

  const webEnabled = deps.webEnabled !== undefined ? deps.webEnabled : enabled;
  if (!webEnabled) return 'skipped';
  const wp = deps.webpush || webpush;
  const subscription = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
  try {
    await wp.sendNotification(subscription, JSON.stringify(payload));
    return 'sent';
  } catch (err) {
    // 404/410 : l'abonnement n'existe plus côté navigateur → on le supprime.
    if (err.statusCode === 404 || err.statusCode === 410) return 'dead';
    console.error(`[webpush] échec envoi (endpoint #${row.id}) :`, err.statusCode || err.message);
    return 'failed';
  }
}

async function sendExpo(row, payload, fetchImpl) {
  let res;
  let json = null;
  try {
    res = await fetchImpl(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: row.endpoint, title: payload.title, body: payload.body, data: { url: payload.url } }),
      signal: AbortSignal.timeout(EXPO_TIMEOUT_MS),
    });
    json = await res.json().catch(() => null);
  } catch (err) {
    console.error(`[webpush] échec envoi Expo (endpoint #${row.id}) :`, err.name || 'erreur');
    return 'failed';
  }
  // Réponse documentée : { data: ticket } pour un message seul (tableau accepté aussi).
  const ticket = Array.isArray(json && json.data) ? json.data[0] : json && json.data;
  if (res.ok && ticket && ticket.status === 'ok') return 'sent';
  const code = (ticket && ticket.details && ticket.details.error)
    || (json && Array.isArray(json.errors) && json.errors[0] && json.errors[0].code)
    || `HTTP ${res.status}`;
  // DeviceNotRegistered : équivalent Expo d'un 404/410 → même suppression.
  if (code === 'DeviceNotRegistered') return 'dead';
  console.error(`[webpush] échec envoi Expo (endpoint #${row.id}) :`, code);
  return 'failed';
}

/** Envoie à une liste de lignes, purge les abonnements morts, renvoie les compteurs. */
async function deliverRows(rows, info, deps = {}) {
  if (rows.length === 0) return { sent: 0, failed: 0, removed: 0 };
  const payload = buildPayload(info);
  let sent = 0;
  let failed = 0;
  const dead = [];
  await Promise.all(rows.map(async (r) => {
    const outcome = await sendOne(r, payload, deps);
    if (outcome === 'sent') sent += 1;
    else if (outcome === 'dead') dead.push(r.id);
    else if (outcome === 'failed') failed += 1;
  }));
  if (dead.length) {
    try {
      await (deps.pool || pool).query('DELETE FROM push_subscriptions WHERE id = ANY($1)', [dead]);
    } catch (err) {
      console.error('[webpush] purge subscriptions mortes :', err.message);
    }
  }
  return { sent, failed, removed: dead.length };
}

/**
 * Envoie une notification push à tous les appareils des abonnés d'une source.
 * @param {string} sourceId
 * @param {{name, message, url, statusUrl}} info
 * @returns {Promise<{sent:number, failed:number, removed:number}>}
 */
async function sendToSource(sourceId, info = {}) {
  const { rows } = await pool.query(
    `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth, ps.kind
       FROM push_subscriptions ps
       JOIN subscriptions sub ON sub.subscriber_id = ps.subscriber_id
      WHERE sub.source_id = $1`,
    [sourceId]
  );
  return deliverRows(rows, info);
}

/**
 * Variante paramétrée (OpenAlert v2) : push aux seuls appareils des abonnés
 * de la combinaison { source_id, params } donnée. Même logique d'envoi/purge.
 * @param {string} sourceId
 * @param {object} params      combinaison souscrite, ex { departement: '05' }
 * @param {{name, message, url, statusUrl}} info
 */
async function sendToSourceParams(sourceId, params, info = {}) {
  const { rows } = await pool.query(
    `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth, ps.kind
       FROM push_subscriptions ps
       JOIN subscriptions sub ON sub.subscriber_id = ps.subscriber_id
      WHERE sub.source_id = $1 AND sub.params = $2::jsonb`,
    [sourceId, JSON.stringify(params || {})]
  );
  return deliverRows(rows, info);
}

/**
 * Envoie une notification push aux appareils d'UN abonné donné (heures de veille :
 * envoi immédiat ciblé, ou push individuel au moment du flush). Même logique de
 * purge des endpoints morts.
 * @param {number} subscriberId
 * @param {{name, message, url, statusUrl}} info
 */
async function sendToSubscriber(subscriberId, info = {}) {
  const { rows } = await pool.query(
    'SELECT id, endpoint, p256dh, auth, kind FROM push_subscriptions WHERE subscriber_id = $1',
    [subscriberId]
  );
  return deliverRows(rows, info);
}

module.exports = {
  isEnabled, publicKey, sendToSource, sendToSourceParams, sendToSubscriber,
  // Exposés pour les tests (dépendances injectées, aucun envoi réel).
  _sendOne: sendOne, _deliverRows: deliverRows, _buildPayload: buildPayload, EXPO_PUSH_URL,
};
