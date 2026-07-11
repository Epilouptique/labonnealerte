const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /api/sources — liste des sources avec leur état courant.
router.get('/sources', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.description, s.badge, s.type, s.link_url,
              CASE WHEN s.type = 'linked' THEN NULL
                   ELSE COALESCE(st.state, 'inactive') END AS state
         FROM sources s
         LEFT JOIN source_states st ON st.source_id = s.id
        WHERE s.enabled = true
        ORDER BY s.id`
    );
    res.json(rows);
  } catch (err) {
    console.error('[api] Erreur GET /sources :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// GET /api/sources/:id/alert.json — manifeste OpenAlert d'une source.
router.get('/sources/:id/alert.json', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.type,
              COALESCE(st.state, 'inactive') AS state,
              st.since, st.until_date, st.message, st.url, st.checked_at
         FROM sources s
         LEFT JOIN source_states st ON st.source_id = s.id
        WHERE s.id = $1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Source inconnue' });
    }

    // Les sources liées (services partenaires) n'ont pas de manifeste OpenAlert.
    if (rows[0].type === 'linked') {
      return res.status(404).json({
        error: 'Cette source est un service externe lié, sans manifeste OpenAlert',
      });
    }

    const r = rows[0];
    res.json({
      id: r.id,
      name: r.name,
      state: r.state,
      since: r.since ? r.since.toISOString() : null,
      until: r.until_date ? r.until_date.toISOString() : null,
      message: r.message ?? null,
      url: r.url ?? null,
      checked_at: r.checked_at ? r.checked_at.toISOString() : null,
    });
  } catch (err) {
    console.error('[api] Erreur GET /sources/:id/alert.json :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// GET /api/status — compat : état de leboncoin-livraison au format historique.
router.get('/status', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT state, since, until_date, checked_at
         FROM source_states
        WHERE source_id = 'leboncoin-livraison'`
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Aucun statut en base' });
    }

    const r = rows[0];
    res.json({
      active: r.state === 'active',
      pending: r.state === 'pending',
      date_debut: r.since ? r.since.toISOString() : null,
      date_fin: r.until_date ? r.until_date.toISOString() : null,
      checked_at: r.checked_at ? r.checked_at.toISOString() : null,
    });
  } catch (err) {
    console.error('[api] Erreur GET /status :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

module.exports = router;
