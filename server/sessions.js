// Sessions durables (90 jours, expiration glissante) partagées par les routes
// authentifiées et par l'OAuth. Le lien magique (email) est à usage unique et
// s'échange en session lors de sa première validation.

const crypto = require('crypto');
const { pool } = require('./db');

async function createSession(subscriberId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO sessions (token, subscriber_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '90 days')`,
    [token, subscriberId]
  );
  return token;
}

// Valide un token : session existante (avec expiration glissante) OU magic_token
// à échanger en session. Retourne { id, email, sessionToken } ou null.
async function authenticate(token) {
  if (!token || typeof token !== 'string') return null;

  // 1) Session valide → prolonge si < 60 jours restants, met à jour last_seen_at.
  const s = await pool.query(
    `SELECT s.subscriber_id, subr.email
       FROM sessions s JOIN subscribers subr ON subr.id = s.subscriber_id
      WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  if (s.rows.length) {
    await pool.query(
      `UPDATE sessions
          SET last_seen_at = NOW(),
              expires_at = CASE WHEN expires_at < NOW() + INTERVAL '60 days'
                                THEN NOW() + INTERVAL '90 days' ELSE expires_at END
        WHERE token = $1`,
      [token]
    );
    return { id: s.rows[0].subscriber_id, email: s.rows[0].email, sessionToken: token };
  }

  // 2) magic_token valide → crée une session, invalide le magic_token (usage unique).
  const m = await pool.query(
    `SELECT id, email FROM subscribers
      WHERE magic_token = $1 AND magic_token_expires_at > NOW()`,
    [token]
  );
  if (m.rows.length) {
    const sub = m.rows[0];
    const sessionToken = await createSession(sub.id);
    await pool.query(
      `UPDATE subscribers SET magic_token = NULL, magic_token_expires_at = NULL WHERE id = $1`,
      [sub.id]
    );
    return { id: sub.id, email: sub.email, sessionToken };
  }

  return null;
}

async function deleteSession(token) {
  if (!token || typeof token !== 'string') return;
  await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
}

async function cleanupExpired() {
  try {
    const r = await pool.query('DELETE FROM sessions WHERE expires_at < NOW()');
    if (r.rowCount) console.log(`[sessions] ${r.rowCount} session(s) expirée(s) purgée(s).`);
  } catch (err) {
    console.error('[sessions] cleanup :', err.message);
  }
}

module.exports = { createSession, authenticate, deleteSession, cleanupExpired };
