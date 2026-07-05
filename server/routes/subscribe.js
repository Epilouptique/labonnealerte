const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { sendConfirmation } = require('../mailer');

const router = express.Router();

// POST /subscribe — inscrit une adresse (non confirmée) et envoie le mail de confirmation.
router.post('/subscribe', async (req, res) => {
  const { email } = req.body || {};

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  const token = crypto.randomBytes(32).toString('hex'); // 64 caractères hex

  try {
    // ON CONFLICT DO NOTHING : rows vide si l'email existe déjà.
    const { rows } = await pool.query(
      `INSERT INTO subscribers (email, confirmed, token)
       VALUES ($1, false, $2)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email.toLowerCase(), token]
    );

    if (rows.length === 0) {
      return res.status(409).json({ error: 'Déjà inscrit' });
    }

    await sendConfirmation(email, token);
    return res.status(200).json({ message: 'Inscription enregistrée, vérifie tes emails' });
  } catch (err) {
    console.error('[subscribe] Erreur POST /subscribe :', err.message);
    return res.status(503).json({ error: 'DB unavailable' });
  }
});

// GET /confirm/:token — valide l'inscription.
router.get('/confirm/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const { rows } = await pool.query(
      `UPDATE subscribers SET confirmed = true WHERE token = $1 RETURNING id`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Token inconnu' });
    }

    return res.status(200).json({ message: 'Inscription confirmée ✅' });
  } catch (err) {
    console.error('[subscribe] Erreur GET /confirm :', err.message);
    return res.status(503).json({ error: 'DB unavailable' });
  }
});

// GET /unsubscribe/:token — supprime l'abonné.
router.get('/unsubscribe/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const { rows } = await pool.query(
      `DELETE FROM subscribers WHERE token = $1 RETURNING id`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Token inconnu' });
    }

    return res.status(200).json({ message: 'Désinscription effectuée' });
  } catch (err) {
    console.error('[subscribe] Erreur GET /unsubscribe :', err.message);
    return res.status(503).json({ error: 'DB unavailable' });
  }
});

module.exports = router;
