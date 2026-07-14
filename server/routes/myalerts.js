// « Mes alertes » : accès sans compte via lien magique par email.
// L'email EST le compte. Deux routers, comme subscribe.js :
//  - apiRouter (monté sous /api) : endpoints JSON
//  - pagesRouter (monté à la racine) : page HTML /mes-alertes

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../db');
const { sendMagicLink } = require('../mailer');
const { authenticate, deleteSession } = require('../sessions');

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
              SET magic_token = $1, magic_token_expires_at = NOW() + INTERVAL '30 minutes'
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
    const auth = await authenticate(req.query.token);
    if (!auth) return res.status(401).json({ error: 'Lien invalide ou expiré' });

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
      [auth.id]
    );

    // Préférences de notification : email activé + nombre d'appareils push.
    const prefs = await pool.query(
      `SELECT s.email_enabled,
              (SELECT COUNT(*)::int FROM push_subscriptions p WHERE p.subscriber_id = s.id) AS push_endpoints_count
         FROM subscribers s WHERE s.id = $1`,
      [auth.id]
    );
    const emailEnabled = prefs.rows[0] ? prefs.rows[0].email_enabled : true;
    const pushCount = prefs.rows[0] ? prefs.rows[0].push_endpoints_count : 0;

    // On renvoie le token de session (potentiellement issu de l'échange du magic
    // token) pour que le client mette à jour son localStorage.
    return res.status(200).json({
      email: auth.email,
      sources: rows,
      token: auth.sessionToken,
      email_enabled: emailEnabled,
      push_endpoints_count: pushCount,
    });
  } catch (err) {
    console.error('[my-alerts] Erreur GET /my-alerts :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ------------------------------------------------------------------ */
/* GET /api/my-alerts/sources?token=xxx — sources soumises par ce compte */
/* (toutes : enabled ou en cours d'examen). Espace développeur.         */
/* ------------------------------------------------------------------ */
apiRouter.get('/my-alerts/sources', async (req, res) => {
  try {
    const auth = await authenticate(req.query.token);
    if (!auth) return res.status(401).json({ error: 'Lien invalide ou expiré' });

    const { rows } = await pool.query(
      `SELECT id, name, badge, enabled, endpoint_url, created_at
         FROM sources
        WHERE submitted_by_email = $1
        ORDER BY created_at DESC NULLS LAST, id`,
      [auth.email]
    );

    const sources = rows.map((r) => ({
      id: r.id,
      name: r.name,
      badge: r.badge,
      enabled: r.enabled,
      endpoint_url: r.endpoint_url,
      created_at: r.created_at ? r.created_at.toISOString() : null,
    }));
    return res.status(200).json({ sources });
  } catch (err) {
    console.error('[my-alerts] Erreur GET /my-alerts/sources :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/my-alerts/preferences — met à jour email_enabled.         */
/* ------------------------------------------------------------------ */
apiRouter.post('/my-alerts/preferences', async (req, res) => {
  const { token, email_enabled } = req.body || {};
  if (typeof email_enabled !== 'boolean') {
    return res.status(400).json({ error: 'email_enabled invalide' });
  }
  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });
    await pool.query('UPDATE subscribers SET email_enabled = $1 WHERE id = $2', [email_enabled, auth.id]);
    return res.status(200).json({ email_enabled });
  } catch (err) {
    console.error('[my-alerts] Erreur POST /preferences :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/logout — supprime la session courante.                    */
/* ------------------------------------------------------------------ */
apiRouter.post('/logout', async (req, res) => {
  try {
    await deleteSession((req.body || {}).token);
  } catch (err) {
    console.error('[my-alerts] Erreur POST /logout :', err.message);
  }
  return res.status(200).json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* DELETE /api/my-alerts/account — droit à l'effacement (RGPD).        */
/* Supprime le compte : abonnements et sessions partent en CASCADE.    */
/* ------------------------------------------------------------------ */
apiRouter.delete('/my-alerts/account', async (req, res) => {
  try {
    const auth = await authenticate((req.body || {}).token);
    if (!auth) return res.status(401).json({ error: 'Lien invalide ou expiré' });

    await pool.query('DELETE FROM subscribers WHERE id = $1', [auth.id]);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[my-alerts] Erreur DELETE /account :', err.message);
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
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Lien invalide ou expiré' });

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
        [auth.id, source_id]
      );
    } else {
      await pool.query(
        'DELETE FROM subscriptions WHERE subscriber_id = $1 AND source_id = $2',
        [auth.id, source_id]
      );
    }

    return res.status(200).json({ source_id, subscribed });
  } catch (err) {
    console.error('[my-alerts] Erreur POST /toggle :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ------------------------------------------------------------------ */
/* GET /api/my-alerts/history?token=xxx — events des sources abonnées.  */
/* ------------------------------------------------------------------ */
apiRouter.get('/my-alerts/history', async (req, res) => {
  try {
    const auth = await authenticate(req.query.token);
    if (!auth) return res.status(401).json({ error: 'Lien invalide ou expiré' });

    const { rows } = await pool.query(
      `SELECT ev.event, ev.message, ev.created_at, s.id AS source_id, s.name AS source_name
         FROM source_events ev
         JOIN subscriptions sub ON sub.source_id = ev.source_id
         JOIN sources s ON s.id = ev.source_id
        WHERE sub.subscriber_id = $1
        ORDER BY ev.created_at DESC
        LIMIT 20`,
      [auth.id]
    );

    const events = rows.map((r) => ({
      event: r.event,
      message: r.message,
      created_at: r.created_at.toISOString(),
      source_id: r.source_id,
      source_name: r.source_name,
    }));
    return res.status(200).json({ events });
  } catch (err) {
    console.error('[my-alerts] Erreur GET /my-alerts/history :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ------------------------------------------------------------------ */
/* GET /connexion — page HTML de connexion (lien magique).             */
/* ------------------------------------------------------------------ */
pagesRouter.get('/connexion', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'connexion.html'));
});

// Ancienne URL /mes-alertes : redirection permanente vers /connexion,
// en préservant la query string (les anciens emails ont des liens ?token=...).
pagesRouter.get('/mes-alertes', (req, res) => {
  const idx = req.originalUrl.indexOf('?');
  const qs = idx >= 0 ? req.originalUrl.slice(idx) : '';
  res.redirect(301, '/connexion' + qs);
});

module.exports = { apiRouter, pagesRouter };
