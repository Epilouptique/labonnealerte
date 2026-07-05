const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /api/status — renvoie l'état courant de la promo depuis la DB.
router.get('/status', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT active, pending, date_debut, date_fin, updated_at FROM promo_status ORDER BY id DESC LIMIT 1'
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Aucun statut en base' });
    }

    const row = rows[0];
    res.json({
      active: row.active,
      pending: row.pending,
      date_debut: row.date_debut ? row.date_debut.toISOString() : null,
      date_fin: row.date_fin ? row.date_fin.toISOString() : null,
      checked_at: row.updated_at ? row.updated_at.toISOString() : null,
    });
  } catch (err) {
    console.error('[api] Erreur lecture promo_status :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

module.exports = router;
