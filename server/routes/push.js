// Routes des notifications push web (session requise pour s'abonner).
//   GET  /api/push/vapid-key   → clé publique VAPID (pour PushManager.subscribe)
//   POST /api/push/subscribe   → enregistre l'abonnement push de l'appareil
//   POST /api/push/unsubscribe → supprime un abonnement (par endpoint)
//   POST /api/push/subscribe-expo   → enregistre le jeton Expo de l'app iOS (kind 'expo')
//   POST /api/push/unsubscribe-expo → supprime ce jeton (par endpoint + compte)

const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../sessions');
const { publicKey, isEnabled } = require('../webpush');

const router = express.Router();

// Clé publique VAPID (publique par nature ; vide si push non configuré).
router.get('/push/vapid-key', (req, res) => {
  res.status(200).json({ key: publicKey(), enabled: isEnabled() });
});

// Enregistre / met à jour l'abonnement push, rattaché au compte de la session.
router.post('/push/subscribe', async (req, res) => {
  const { token, subscription } = req.body || {};
  const endpoint = subscription && subscription.endpoint;
  const keys = (subscription && subscription.keys) || {};
  if (!endpoint || !keys.p256dh || !keys.auth) {
    return res.status(400).json({ error: 'Abonnement invalide' });
  }

  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });

    // Endpoint unique : upsert (un même appareil peut se réabonner / changer de compte).
    await pool.query(
      `INSERT INTO push_subscriptions (subscriber_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint)
       DO UPDATE SET subscriber_id = EXCLUDED.subscriber_id,
                     p256dh = EXCLUDED.p256dh,
                     auth = EXCLUDED.auth`,
      [auth.id, endpoint, keys.p256dh, keys.auth]
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[push] Erreur POST /subscribe :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

// Supprime un abonnement push (désactivation sur cet appareil).
router.post('/push/unsubscribe', async (req, res) => {
  const { token, endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'endpoint manquant' });

  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });

    await pool.query(
      'DELETE FROM push_subscriptions WHERE endpoint = $1 AND subscriber_id = $2',
      [endpoint, auth.id]
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[push] Erreur POST /unsubscribe :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

// ── App iOS : jeton du service push d'Expo (kind = 'expo', sans clés VAPID) ──────────
// Format accepté : ExponentPushToken[...] ou ExpoPushToken[...] (borné à 200 caractères).
const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,180}\]$/;

function isExpoToken(t) {
  return typeof t === 'string' && EXPO_TOKEN_RE.test(t);
}

// Enregistre / met à jour le jeton Expo de l'appareil, rattaché au compte de la session.
router.post('/push/subscribe-expo', async (req, res) => {
  const { token, expo_token: expoToken } = req.body || {};
  if (!isExpoToken(expoToken)) return res.status(400).json({ error: 'Jeton Expo invalide' });

  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });

    // Même upsert que la route web : le jeton (endpoint) est unique ; un appareil qui
    // change de compte est rattaché au nouveau.
    await pool.query(
      `INSERT INTO push_subscriptions (subscriber_id, endpoint, p256dh, auth, kind)
       VALUES ($1, $2, NULL, NULL, 'expo')
       ON CONFLICT (endpoint)
       DO UPDATE SET subscriber_id = EXCLUDED.subscriber_id,
                     p256dh = NULL,
                     auth = NULL,
                     kind = 'expo'`,
      [auth.id, expoToken]
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[push] Erreur POST /subscribe-expo :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

// Supprime le jeton Expo de cet appareil (déconnexion, notifications coupées).
router.post('/push/unsubscribe-expo', async (req, res) => {
  const { token, expo_token: expoToken } = req.body || {};
  if (!isExpoToken(expoToken)) return res.status(400).json({ error: 'Jeton Expo invalide' });

  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });

    await pool.query(
      'DELETE FROM push_subscriptions WHERE endpoint = $1 AND subscriber_id = $2',
      [expoToken, auth.id]
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[push] Erreur POST /unsubscribe-expo :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

module.exports = router;
module.exports._isExpoToken = isExpoToken;
