// OAuth2 (code grant) écrit à la main, sans passport. Deux providers :
// Google et GitHub. L'email vérifié reste la clé d'identité (fusion de compte).
// Monté sur /auth.

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { createSession } = require('../sessions');
const { applyAutofill, deriveDisplayNameFromEmail, deriveDisplayNameFromGithub, clientIp } = require('../profile-autofill');

const router = express.Router();

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const GOOGLE_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const GITHUB_ID = (process.env.GITHUB_CLIENT_ID || '').trim();
const GITHUB_SECRET = (process.env.GITHUB_CLIENT_SECRET || '').trim();

/* ------------------------------------------------------------------ */
/* State anti-CSRF : en mémoire, TTL 10 min, usage unique.             */
/* ------------------------------------------------------------------ */
const states = new Map();
function makeState() {
  const s = crypto.randomBytes(16).toString('hex');
  states.set(s, Date.now() + 10 * 60 * 1000);
  return s;
}
function consumeState(s) {
  if (!s || typeof s !== 'string') return false;
  const exp = states.get(s);
  states.delete(s);
  return !!exp && exp > Date.now();
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of states) if (v < now) states.delete(k);
}, 10 * 60 * 1000).unref();

/* ------------------------------------------------------------------ */
/* Fusion de compte par email vérifié + rattachement d'identité.       */
/* ------------------------------------------------------------------ */
async function setProviderId(id, col, value) {
  // col est une valeur fixe ('google_id' | 'github_id') — jamais une entrée user.
  const r = await pool.query(`SELECT ${col} AS v FROM subscribers WHERE id = $1`, [id]);
  const cur = r.rows[0] && r.rows[0].v;
  if (cur && String(cur) !== String(value)) {
    console.warn(`[auth] ${col} différent pour subscriber ${id} (existant=${cur}) — conservé.`);
    return;
  }
  if (!cur) await pool.query(`UPDATE subscribers SET ${col} = $1 WHERE id = $2`, [value, id]);
}

async function findOrCreateByEmail(email, ids) {
  const normalized = String(email).toLowerCase();
  let id;
  const found = await pool.query('SELECT id FROM subscribers WHERE email = $1', [normalized]);
  if (found.rows.length) {
    id = found.rows[0].id;
    await pool.query('UPDATE subscribers SET confirmed = true WHERE id = $1 AND confirmed = false', [id]);
  } else {
    // Email vérifié par le provider → confirmed=true. token pour la désinscription 1-clic.
    const token = crypto.randomBytes(32).toString('hex');
    const ins = await pool.query(
      'INSERT INTO subscribers (email, confirmed, token) VALUES ($1, true, $2) RETURNING id',
      [normalized, token]
    );
    id = ins.rows[0].id;
  }
  if (ids.googleId) await setProviderId(id, 'google_id', ids.googleId);
  if (ids.githubId) await setProviderId(id, 'github_id', ids.githubId);
  if (ids.githubUsername) {
    await pool.query(
      'UPDATE subscribers SET github_username = $1 WHERE id = $2 AND github_username IS DISTINCT FROM $1',
      [ids.githubUsername, id]
    );
  }
  return id;
}

// Atterrissage : le token de session part dans le fragment (#) — jamais envoyé au serveur.
async function landSession(res, subscriberId) {
  const token = await createSession(subscriberId);
  res.redirect('/connexion#session=' + token);
}
function fail(res, code) {
  res.redirect('/connexion?erreur=' + (code || 'oauth'));
}

/* ------------------------------------------------------------------ */
/* Google                                                              */
/* ------------------------------------------------------------------ */
router.get('/google', (req, res) => {
  if (!GOOGLE_ID) return fail(res, 'oauth');
  const state = makeState();
  const params = new URLSearchParams({
    client_id: GOOGLE_ID,
    redirect_uri: `${BASE_URL}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});

router.get('/google/callback', async (req, res) => {
  try {
    if (req.query.error || !req.query.code) return fail(res, 'oauth');
    if (!consumeState(req.query.state)) return fail(res, 'oauth');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: GOOGLE_ID,
        client_secret: GOOGLE_SECRET,
        redirect_uri: `${BASE_URL}/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) return fail(res, 'oauth');
    const tok = await tokenRes.json();

    const uiRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: 'Bearer ' + tok.access_token },
    });
    if (!uiRes.ok) return fail(res, 'oauth');
    const ui = await uiRes.json();

    if (ui.email_verified !== true && ui.email_verified !== 'true') return fail(res, 'email_non_verifie');
    if (!ui.email) return fail(res, 'oauth');

    const id = await findOrCreateByEmail(ui.email, { googleId: ui.sub });
    // Auto-remplissage silencieux du profil à la 1re connexion (champs NULL seulement).
    await applyAutofill(pool, id, {
      nameHint: ui.given_name || ui.name || deriveDisplayNameFromEmail(ui.email),
      ip: clientIp(req),
    });
    return landSession(res, id);
  } catch (err) {
    console.error('[auth] Google callback :', err.message);
    return fail(res, 'oauth');
  }
});

/* ------------------------------------------------------------------ */
/* GitHub                                                             */
/* ------------------------------------------------------------------ */
router.get('/github', (req, res) => {
  if (!GITHUB_ID) return fail(res, 'oauth');
  const state = makeState();
  const params = new URLSearchParams({
    client_id: GITHUB_ID,
    redirect_uri: `${BASE_URL}/auth/github/callback`,
    scope: 'user:email',
    state,
  });
  res.redirect('https://github.com/login/oauth/authorize?' + params.toString());
});

router.get('/github/callback', async (req, res) => {
  try {
    if (req.query.error || !req.query.code) return fail(res, 'oauth');
    if (!consumeState(req.query.state)) return fail(res, 'oauth');

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: GITHUB_ID,
        client_secret: GITHUB_SECRET,
        code: req.query.code,
        redirect_uri: `${BASE_URL}/auth/github/callback`,
      }),
    });
    if (!tokenRes.ok) return fail(res, 'oauth');
    const tok = await tokenRes.json();
    if (!tok.access_token) return fail(res, 'oauth');

    const H = { Authorization: 'Bearer ' + tok.access_token, 'User-Agent': 'labonnealerte', Accept: 'application/vnd.github+json' };
    const userRes = await fetch('https://api.github.com/user', { headers: H });
    if (!userRes.ok) return fail(res, 'oauth');
    const user = await userRes.json();

    const emailsRes = await fetch('https://api.github.com/user/emails', { headers: H });
    if (!emailsRes.ok) return fail(res, 'oauth');
    const emails = await emailsRes.json();
    const primary = Array.isArray(emails)
      ? emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified)
      : null;
    if (!primary || !primary.email) return fail(res, 'email_non_verifie');

    const id = await findOrCreateByEmail(primary.email, {
      githubId: user.id, githubUsername: user.login,
    });
    await applyAutofill(pool, id, {
      nameHint: deriveDisplayNameFromGithub(user.name, user.login) || deriveDisplayNameFromEmail(primary.email),
      ip: clientIp(req),
    });
    return landSession(res, id);
  } catch (err) {
    console.error('[auth] GitHub callback :', err.message);
    return fail(res, 'oauth');
  }
});

module.exports = router;
