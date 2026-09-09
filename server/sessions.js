// Sessions durables (90 jours, expiration glissante) partagées par les routes
// authentifiées et par l'OAuth. Le lien magique (email) est à usage unique et
// s'échange en session lors de sa première validation.

const crypto = require('crypto');
const { pool } = require('./db');
const { tokenFrom } = require('./auth-transport');

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
//
// ACCEPTE DEUX FORMES :
//   authenticate(req)      -> lit Authorization: Bearer, puis (repli temporaire) le
//                             token en query/corps. C'est la forme à préférer.
//   authenticate('<token>') -> forme historique, conservée : les 37 appels existants
//                             passent une chaîne déjà extraite par la route. Le
//                             middleware authTransport recopie l'en-tête Bearer là où
//                             ces routes le cherchent, donc elles n'ont pas à changer.
// Cf. auth-transport.js pour l'ordre de lecture et la fin de la transition.
async function authenticate(tokenOrReq) {
  const token = tokenFrom(tokenOrReq);
  if (!token || typeof token !== 'string') return null;

  // 1) Session valide → prolonge si < 60 jours restants, met à jour last_seen_at.
  //
  // needs_touch est calculé ICI, dans le SELECT qui lit déjà la ligne : il ne coûte pas
  // un aller-retour de plus. Il est évalué côté base pour ne dépendre d'aucune horloge
  // applicative. Voir plus bas pourquoi l'UPDATE n'est plus attendu.
  const s = await pool.query(
    `SELECT s.subscriber_id, subr.email,
            (s.last_seen_at IS NULL OR s.last_seen_at < NOW() - INTERVAL '1 hour') AS needs_touch
       FROM sessions s JOIN subscribers subr ON subr.id = s.subscriber_id
      WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  if (s.rows.length) {
    // EXPIRATION GLISSANTE, DÉSORMAIS HORS DU CHEMIN DE RÉPONSE.
    //
    // Cet UPDATE était `await`é avant de répondre, sur les 37 routes authentifiées du
    // site : ~145 ms ajoutés à chaque requête pour une écriture dont l'utilisateur ne
    // voit RIEN avant plusieurs jours (expires_at ne bouge qu'à 60 jours du terme sur
    // une fenêtre de 90).
    //
    // Deux détentes, cumulées :
    //   1. On ne l'émet plus du tout si la session a été vue il y a moins d'une heure.
    //      C'est le gros du gain : à l'usage réel (navigation par salves), la grande
    //      majorité des requêtes n'écrit plus rien — ni charge d'écriture, ni WAL, ni
    //      connexion mobilisée. Une granularité d'une heure est sans effet sur une
    //      fenêtre de 90 jours déclenchée à J-60.
    //   2. Quand il est émis, il ne bloque plus la réponse.
    //
    // Le .catch() n'est PAS décoratif : une promesse rejetée et non traitée fait tomber
    // le processus (unhandledRejection). L'échec est journalisé et absorbé — rater une
    // prolongation est sans gravité, la session reste valide jusqu'à son terme.
    if (s.rows[0].needs_touch) {
      pool.query(
        `UPDATE sessions
            SET last_seen_at = NOW(),
                expires_at = CASE WHEN expires_at < NOW() + INTERVAL '60 days'
                                  THEN NOW() + INTERVAL '90 days' ELSE expires_at END
          WHERE token = $1`,
        [token]
      ).catch((err) => {
        console.error('[sessions] expiration glissante (non bloquant) :', err.message);
      });
    }
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
