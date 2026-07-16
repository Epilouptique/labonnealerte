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
const { isValidCountry, isValidDepartement } = require('../geo');
const { VALID_SLUGS } = require('../categories');
const { validateParams, resolveLabel } = require('../params');
const { trackDomain } = require('../doomname');

// État « le pire » d'un ensemble d'instances (pour l'affichage de la carte).
const STATE_RANK = { active: 3, pending: 2, inactive: 1 };
function worstState(states) {
  let worst = 'inactive';
  for (const s of states) if ((STATE_RANK[s] || 0) > (STATE_RANK[worst] || 0)) worst = s;
  return worst;
}

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
                ON sub.source_id = s.id AND sub.subscriber_id = $1 AND sub.params IS NULL
        WHERE s.enabled = true AND s.type <> 'linked'
        ORDER BY s.id`,
      [auth.id]
    );

    // Instances paramétrées (OpenAlert v2) : une entrée par combinaison souscrite,
    // avec libellé résolu et état de source_param_states. On enrichit la carte
    // correspondante (subscribed = a des instances ; state = le pire des instances).
    const paramSubs = await pool.query(
      `SELECT sub.source_id, sub.params, s.params_schema,
              COALESCE(sps.state, 'inactive') AS state
         FROM subscriptions sub
         JOIN sources s ON s.id = sub.source_id
         LEFT JOIN source_param_states sps
                ON sps.source_id = sub.source_id AND sps.params = sub.params
        WHERE sub.subscriber_id = $1 AND sub.params IS NOT NULL AND s.enabled = true`,
      [auth.id]
    );
    const byId = {};
    rows.forEach((r) => { byId[r.id] = r; r.params_schema = null; r.instances = []; });
    // Réexpose le schéma pour les sources paramétrées (le SELECT principal ne le renvoie pas).
    const schemaRows = await pool.query(
      "SELECT id, params_schema FROM sources WHERE params_schema IS NOT NULL AND enabled = true AND type <> 'linked'"
    );
    schemaRows.rows.forEach((sr) => { if (byId[sr.id]) byId[sr.id].params_schema = sr.params_schema; });

    paramSubs.rows.forEach((ps) => {
      const row = byId[ps.source_id];
      if (!row) return;
      row.instances.push({ params: ps.params, label: resolveLabel(ps.params_schema, ps.params), state: ps.state });
    });
    // Pour chaque source paramétrée abonnée : subscribed=true, state = pire instance.
    Object.values(byId).forEach((r) => {
      if (r.instances.length) {
        r.subscribed = true;
        r.state = worstState(r.instances.map((i) => i.state));
      }
    });

    // Préférences : email activé, appareils push, et personnalisation d'affichage.
    const prefs = await pool.query(
      `SELECT s.email_enabled, s.country, s.departement, s.interests, s.display_name,
              s.quiet_start, s.quiet_end, s.quiet_disabled,
              (SELECT COUNT(*)::int FROM push_subscriptions p WHERE p.subscriber_id = s.id) AS push_endpoints_count
         FROM subscribers s WHERE s.id = $1`,
      [auth.id]
    );
    const pr = prefs.rows[0] || {};
    const emailEnabled = pr.email_enabled !== undefined ? pr.email_enabled : true;
    const pushCount = pr.push_endpoints_count || 0;

    // On renvoie le token de session (potentiellement issu de l'échange du magic
    // token) pour que le client mette à jour son localStorage.
    return res.status(200).json({
      email: auth.email,
      sources: rows,
      token: auth.sessionToken,
      email_enabled: emailEnabled,
      push_endpoints_count: pushCount,
      country: pr.country || null,
      departement: pr.departement || null,
      interests: pr.interests || [],
      display_name: pr.display_name || null,
      // Heures de veille (défaut 23/8 appliqué en code si NULL).
      quiet_start: pr.quiet_start == null ? 23 : pr.quiet_start,
      quiet_end: pr.quiet_end == null ? 8 : pr.quiet_end,
      quiet_disabled: pr.quiet_disabled === true,
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
/* POST /api/my-alerts/profile — personnalisation d'affichage.          */
/* Tout est optionnel ; validation stricte. NULL = non renseigné.       */
/* ------------------------------------------------------------------ */
apiRouter.post('/my-alerts/profile', async (req, res) => {
  const body = req.body || {};
  const { token } = body;

  // country : null ou code autorisé.
  let country = body.country == null || body.country === '' ? null : body.country;
  if (country !== null && !isValidCountry(country)) {
    return res.status(400).json({ error: 'Pays invalide' });
  }

  // departement : uniquement si France ET code valide, sinon forcé à null.
  let departement = body.departement == null || body.departement === '' ? null : body.departement;
  if (country !== 'FR') departement = null;
  if (departement !== null && !isValidDepartement(departement)) {
    return res.status(400).json({ error: 'Département invalide' });
  }

  // interests : sous-ensemble des slugs de catégories existants (dédupliqué).
  let interests = Array.isArray(body.interests) ? body.interests : [];
  interests = interests
    .filter((s) => typeof s === 'string' && VALID_SLUGS.includes(s))
    .filter((s, i, a) => a.indexOf(s) === i);

  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });
    await pool.query(
      'UPDATE subscribers SET country = $1, departement = $2, interests = $3 WHERE id = $4',
      [country, departement, interests.length ? interests : null, auth.id]
    );
    return res.status(200).json({ country, departement, interests });
  } catch (err) {
    console.error('[my-alerts] Erreur POST /profile :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/my-alerts/quiet-hours — plage silencieuse des notifications.*/
/* Corps : { token, disabled?, start?, end? } (heures 0-23).            */
/* ------------------------------------------------------------------ */
apiRouter.post('/my-alerts/quiet-hours', async (req, res) => {
  const body = req.body || {};
  const { token } = body;

  const disabled = body.disabled === true;
  function validHour(h) { return Number.isInteger(h) && h >= 0 && h <= 23; }
  // start/end optionnels : par défaut 23/8. Rejet si fournis mais invalides.
  let start = body.start == null ? 23 : body.start;
  let end = body.end == null ? 8 : body.end;
  if (!validHour(start) || !validHour(end)) {
    return res.status(400).json({ error: 'Heures invalides (0-23)' });
  }
  if (start === end) {
    return res.status(400).json({ error: 'Le début et la fin ne peuvent pas être identiques' });
  }

  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });
    await pool.query(
      'UPDATE subscribers SET quiet_start = $1, quiet_end = $2, quiet_disabled = $3 WHERE id = $4',
      [start, end, disabled, auth.id]
    );
    return res.status(200).json({ quiet_start: start, quiet_end: end, quiet_disabled: disabled });
  } catch (err) {
    console.error('[my-alerts] Erreur POST /quiet-hours :', err.message);
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
        // Broadcast (params NULL) : ON CONFLICT cible l'index d'expression v2.
        `INSERT INTO subscriptions (subscriber_id, source_id)
         VALUES ($1, $2) ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING`,
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
/* POST /api/my-alerts/toggle-param — abonne/désabonne UNE instance     */
/* paramétrée (OpenAlert v2). Corps : { token, source_id, params,       */
/* subscribed }. params validé contre le schéma déclaré de la source.   */
/* ------------------------------------------------------------------ */
apiRouter.post('/my-alerts/toggle-param', async (req, res) => {
  const { token, source_id, params, subscribed } = req.body || {};
  if (!source_id || typeof subscribed !== 'boolean') {
    return res.status(400).json({ error: 'Paramètres invalides' });
  }
  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Lien invalide ou expiré' });

    const src = await pool.query(
      "SELECT params_schema FROM sources WHERE id = $1 AND enabled = true AND type <> 'linked'",
      [source_id]
    );
    if (src.rows.length === 0 || src.rows[0].params_schema == null) {
      return res.status(404).json({ error: 'Source paramétrée inconnue' });
    }
    const check = validateParams(src.rows[0].params_schema, params);
    if (!check.ok) return res.status(400).json({ error: check.error });
    const canonical = check.params;

    if (subscribed) {
      await pool.query(
        `INSERT INTO subscriptions (subscriber_id, source_id, params)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING`,
        [auth.id, source_id, JSON.stringify(canonical)]
      );
      // DoomName : enregistre le domaine pour surveillance (best-effort, non bloquant ;
      // le poller réessaie à chaque cycle si l'appel échoue).
      if (source_id === 'doomname' && canonical.domaine) trackDomain(canonical.domaine);
    } else {
      await pool.query(
        'DELETE FROM subscriptions WHERE subscriber_id = $1 AND source_id = $2 AND params = $3::jsonb',
        [auth.id, source_id, JSON.stringify(canonical)]
      );
    }
    return res.status(200).json({
      source_id, subscribed, params: canonical,
      label: resolveLabel(src.rows[0].params_schema, canonical),
    });
  } catch (err) {
    console.error('[my-alerts] Erreur POST /toggle-param :', err.message);
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

    // EXISTS (et non JOIN) : un événement apparaît UNE fois même si l'utilisateur
    // suit plusieurs instances. On exclut les sources désactivées (anciennes
    // vigilances broadcast conservées) et on remonte params + schéma pour le libellé.
    const { rows } = await pool.query(
      `SELECT ev.event, ev.message, ev.created_at, ev.params,
              s.id AS source_id, s.name AS source_name, s.params_schema
         FROM source_events ev
         JOIN sources s ON s.id = ev.source_id
        WHERE s.enabled = true
          AND EXISTS (SELECT 1 FROM subscriptions sub
                       WHERE sub.source_id = ev.source_id AND sub.subscriber_id = $1
                         AND (sub.params IS NOT DISTINCT FROM ev.params OR ev.params IS NULL))
        ORDER BY ev.created_at DESC
        LIMIT 20`,
      [auth.id]
    );

    const events = rows.map((r) => {
      // Libellé résolu (« Vigilance météo — Hautes-Alpes »), jamais le JSON brut.
      const label = r.params ? resolveLabel(r.params_schema, r.params) : '';
      return {
        event: r.event,
        message: r.message,
        created_at: r.created_at.toISOString(),
        source_id: r.source_id,
        source_name: label ? `${r.source_name} — ${label}` : r.source_name,
      };
    });
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
