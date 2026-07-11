// « Mes alertes » : accès sans compte via lien magique par email.
// L'email EST le compte. Deux routers, comme subscribe.js :
//  - apiRouter (monté sous /api) : endpoints JSON
//  - pagesRouter (monté à la racine) : page HTML /mes-alertes

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../db');
const { sendMagicLink } = require('../mailer');

const apiRouter = express.Router();
const pagesRouter = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ------------------------------------------------------------------ */
/* Rate-limiting mémoire : 5 requêtes / minute / IP sur /request.      */
/* ------------------------------------------------------------------ */
const RATE_MAX = 5;
const RATE_WINDOW_MS = 60_000;
const hits = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    return res.status(429).json({ error: 'Trop de demandes, réessayez dans une minute.' });
  }
  recent.push(now);
  hits.set(ip, recent);
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of hits) {
    const recent = arr.filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length === 0) hits.delete(ip);
    else hits.set(ip, recent);
  }
}, RATE_WINDOW_MS).unref();

// Résout un magic_token valide (existant + non expiré) vers son subscriber.
async function subscriberForToken(token) {
  if (!token || typeof token !== 'string') return null;
  const { rows } = await pool.query(
    `SELECT id, email FROM subscribers
      WHERE magic_token = $1 AND magic_token_expires_at > NOW()`,
    [token]
  );
  return rows[0] || null;
}

/* ------------------------------------------------------------------ */
/* POST /api/my-alerts/request — envoie un lien magique.               */
/* Réponse identique dans tous les cas (anti-énumération).             */
/* ------------------------------------------------------------------ */
const NEUTRAL = { message: "Si cet email est inscrit, un lien d'accès vient de lui être envoyé." };

apiRouter.post('/my-alerts/request', rateLimit, async (req, res) => {
  const { email } = req.body || {};

  if (email && typeof email === 'string' && EMAIL_RE.test(email)) {
    const normalized = email.toLowerCase();
    try {
      const { rows } = await pool.query(
        'SELECT id FROM subscribers WHERE email = $1 AND confirmed = true',
        [normalized]
      );
      if (rows.length > 0) {
        const token = crypto.randomBytes(32).toString('hex');
        await pool.query(
          `UPDATE subscribers
              SET magic_token = $1, magic_token_expires_at = NOW() + INTERVAL '24 hours'
            WHERE id = $2`,
          [token, rows[0].id]
        );
        try {
          await sendMagicLink(normalized, token);
        } catch (err) {
          console.error('[my-alerts] Échec envoi lien magique :', err.message);
        }
      }
    } catch (err) {
      console.error('[my-alerts] Erreur POST /request :', err.message);
      // On répond quand même de façon neutre (pas de fuite d'état).
    }
  }

  // Toujours la même réponse, quel que soit le cas.
  return res.status(200).json(NEUTRAL);
});

/* ------------------------------------------------------------------ */
/* GET /api/my-alerts?token=xxx — liste des sources + état d'abonnement */
/* ------------------------------------------------------------------ */
apiRouter.get('/my-alerts', async (req, res) => {
  try {
    const sub = await subscriberForToken(req.query.token);
    if (!sub) return res.status(401).json({ error: 'Lien invalide ou expiré' });

    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.description, s.badge,
              COALESCE(st.state, 'inactive') AS state,
              (sub.subscriber_id IS NOT NULL) AS subscribed
         FROM sources s
         LEFT JOIN source_states st ON st.source_id = s.id
         LEFT JOIN subscriptions sub
                ON sub.source_id = s.id AND sub.subscriber_id = $1
        WHERE s.enabled = true AND s.type <> 'linked'
        ORDER BY s.id`,
      [sub.id]
    );

    return res.status(200).json({ email: sub.email, sources: rows });
  } catch (err) {
    console.error('[my-alerts] Erreur GET /my-alerts :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/my-alerts/toggle — abonne / désabonne une source.         */
/* ------------------------------------------------------------------ */
apiRouter.post('/my-alerts/toggle', async (req, res) => {
  const { token, source_id, subscribed } = req.body || {};
  if (!source_id || typeof subscribed !== 'boolean') {
    return res.status(400).json({ error: 'Paramètres invalides' });
  }

  try {
    const sub = await subscriberForToken(token);
    if (!sub) return res.status(401).json({ error: 'Lien invalide ou expiré' });

    // La source doit exister, être active et abonnable (pas 'linked').
    const src = await pool.query(
      "SELECT 1 FROM sources WHERE id = $1 AND enabled = true AND type <> 'linked'",
      [source_id]
    );
    if (src.rows.length === 0) {
      return res.status(404).json({ error: 'Source inconnue' });
    }

    if (subscribed) {
      await pool.query(
        `INSERT INTO subscriptions (subscriber_id, source_id)
         VALUES ($1, $2) ON CONFLICT (subscriber_id, source_id) DO NOTHING`,
        [sub.id, source_id]
      );
    } else {
      await pool.query(
        'DELETE FROM subscriptions WHERE subscriber_id = $1 AND source_id = $2',
        [sub.id, source_id]
      );
    }

    return res.status(200).json({ source_id, subscribed });
  } catch (err) {
    console.error('[my-alerts] Erreur POST /toggle :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ------------------------------------------------------------------ */
/* GET /mes-alertes — page HTML.                                        */
/* ------------------------------------------------------------------ */
pagesRouter.get('/mes-alertes', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'mes-alertes.html'));
});

module.exports = { apiRouter, pagesRouter };
