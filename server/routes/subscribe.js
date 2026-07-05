const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { sendConfirmation } = require('../mailer');

const router = express.Router();

const DEFAULT_SOURCE = 'leboncoin-livraison';

// POST /subscribe — inscrit une adresse à une source et envoie le mail de confirmation.
// Corps : { email, source_id? } (source_id par défaut : 'leboncoin-livraison').
router.post('/subscribe', async (req, res) => {
  const { email, source_id } = req.body || {};
  const sourceId = source_id || DEFAULT_SOURCE;

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  const normalized = email.toLowerCase();

  try {
    // La source doit exister (sinon la FK échouerait).
    const src = await pool.query('SELECT 1 FROM sources WHERE id = $1', [sourceId]);
    if (src.rows.length === 0) {
      return res.status(404).json({ error: 'Source inconnue' });
    }

    // Trouve ou crée le subscriber (unique par email).
    const token = crypto.randomBytes(32).toString('hex'); // 64 caractères hex
    const inserted = await pool.query(
      `INSERT INTO subscribers (email, confirmed, token)
       VALUES ($1, false, $2)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, token, confirmed`,
      [normalized, token]
    );

    let subscriber;
    if (inserted.rows.length > 0) {
      subscriber = inserted.rows[0];
    } else {
      const existing = await pool.query(
        'SELECT id, token, confirmed FROM subscribers WHERE email = $1',
        [normalized]
      );
      subscriber = existing.rows[0];
    }

    // Lie le subscriber à la source ; rows vide si l'abonnement existe déjà.
    const link = await pool.query(
      `INSERT INTO subscriptions (subscriber_id, source_id)
       VALUES ($1, $2)
       ON CONFLICT (subscriber_id, source_id) DO NOTHING
       RETURNING subscriber_id`,
      [subscriber.id, sourceId]
    );

    if (link.rows.length === 0) {
      return res.status(409).json({ error: 'Déjà inscrit à cette source' });
    }

    // Mail de confirmation seulement si l'adresse n'est pas encore confirmée.
    if (!subscriber.confirmed) {
      await sendConfirmation(email, subscriber.token);
    }

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
