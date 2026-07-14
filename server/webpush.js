// Envoi de notifications push web (VAPID / web-push).
//
// Les clés VAPID viennent de l'environnement. Sans elles, le module devient un
// no-op silencieux (comme les sources sans clé) : le site fonctionne, seul le
// push est indisponible.

const webpush = require('web-push');
const { pool } = require('./db');

const PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || '').trim();
const PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();
const SUBJECT = (process.env.VAPID_SUBJECT || 'mailto:contact@labonnealerte.fr').trim();

const enabled = Boolean(PUBLIC_KEY && PRIVATE_KEY);
if (enabled) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
} else {
  console.warn('[webpush] VAPID absent : notifications push désactivées.');
}

function isEnabled() {
  return enabled;
}

function publicKey() {
  return PUBLIC_KEY;
}

/**
 * Envoie une notification push à tous les appareils des abonnés d'une source.
 * @param {string} sourceId
 * @param {{name, message, url, statusUrl}} info
 * @returns {Promise<{sent:number, failed:number, removed:number}>}
 */
async function sendToSource(sourceId, info = {}) {
  if (!enabled) return { sent: 0, failed: 0, removed: 0 };

  const { rows } = await pool.query(
    `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps
       JOIN subscriptions sub ON sub.subscriber_id = ps.subscriber_id
      WHERE sub.source_id = $1`,
    [sourceId]
  );
  if (rows.length === 0) return { sent: 0, failed: 0, removed: 0 };

  const payload = JSON.stringify({
    title: info.name || 'La Bonne Alerte',
    body: info.message || 'Une alerte que vous suivez vient de se déclencher.',
    url: info.url || info.statusUrl || 'https://www.labonnealerte.fr',
  });

  let sent = 0;
  let failed = 0;
  const dead = [];

  await Promise.all(
    rows.map(async (r) => {
      const subscription = { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } };
      try {
        await webpush.sendNotification(subscription, payload);
        sent += 1;
      } catch (err) {
        // 404/410 : l'abonnement n'existe plus côté navigateur → on le supprime.
        if (err.statusCode === 404 || err.statusCode === 410) {
          dead.push(r.id);
        } else {
          failed += 1;
          console.error(`[webpush] échec envoi (endpoint #${r.id}) :`, err.statusCode || err.message);
        }
      }
    })
  );

  if (dead.length) {
    try {
      await pool.query('DELETE FROM push_subscriptions WHERE id = ANY($1)', [dead]);
    } catch (err) {
      console.error('[webpush] purge subscriptions mortes :', err.message);
    }
  }

  return { sent, failed, removed: dead.length };
}

/**
 * Variante paramétrée (OpenAlert v2) : push aux seuls appareils des abonnés
 * de la combinaison { source_id, params } donnée. Même logique d'envoi/purge.
 * @param {string} sourceId
 * @param {object} params      combinaison souscrite, ex { departement: '05' }
 * @param {{name, message, url, statusUrl}} info
 */
async function sendToSourceParams(sourceId, params, info = {}) {
  if (!enabled) return { sent: 0, failed: 0, removed: 0 };

  const { rows } = await pool.query(
    `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps
       JOIN subscriptions sub ON sub.subscriber_id = ps.subscriber_id
      WHERE sub.source_id = $1 AND sub.params = $2::jsonb`,
    [sourceId, JSON.stringify(params || {})]
  );
  if (rows.length === 0) return { sent: 0, failed: 0, removed: 0 };

  const payload = JSON.stringify({
    title: info.name || 'La Bonne Alerte',
    body: info.message || 'Une alerte que vous suivez vient de se déclencher.',
    url: info.url || info.statusUrl || 'https://www.labonnealerte.fr',
  });

  let sent = 0;
  let failed = 0;
  const dead = [];

  await Promise.all(
    rows.map(async (r) => {
      const subscription = { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } };
      try {
        await webpush.sendNotification(subscription, payload);
        sent += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          dead.push(r.id);
        } else {
          failed += 1;
          console.error(`[webpush] échec envoi (endpoint #${r.id}) :`, err.statusCode || err.message);
        }
      }
    })
  );

  if (dead.length) {
    try {
      await pool.query('DELETE FROM push_subscriptions WHERE id = ANY($1)', [dead]);
    } catch (err) {
      console.error('[webpush] purge subscriptions mortes :', err.message);
    }
  }

  return { sent, failed, removed: dead.length };
}

module.exports = { isEnabled, publicKey, sendToSource, sendToSourceParams };
