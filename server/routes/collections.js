// Collections (phase 1) : packs de cartes officiels, abonnables en un clic.
// - GET  /api/collections            → liste des collections officielles (+ nb cartes, total ❤)
// - GET  /api/collections/:slug       → détail : méta + cartes enrichies (même forme que /api/sources)
// - POST /api/collections/:slug/adopt → abonne (auth) à tout le pack, idempotent & non destructif
//
// Résolution des params à l'adoption (par carte) :
//   broadcast (pas de params_schema)      → abonnement NULL
//   param avec default_params (objet)      → cette instance
//   param avec default_params (tableau)    → plusieurs instances
//   param clé 'departement'                → PROFIL d'abord (si valide), sinon default_params, sinon à compléter
//   sinon (aucune valeur résoluble)        → non abonnée, remontée dans needs_params (carte à compléter à la main)

const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../sessions');
const { validateParams } = require('../params');

const router = express.Router();

// GET /api/collections — collections officielles, ordonnées, avec nb de cartes
// abonnables et somme des ❤ des cartes (réutilise sources.likes_count).
router.get('/collections', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.description, c.emoji, c.tint, c.display_order,
              COUNT(s.id)::int AS card_count,
              COALESCE(SUM(s.likes_count), 0)::int AS total_likes,
              -- Apercu du deck (chantier deck-stack) : ID des 3 dernieres cartes ajoutees
              -- (position DESC). Le client resout ces IDs en objets source complets depuis
              -- son catalogue deja charge (/api/sources) et les rend via LBACards.cardHTML.
              (SELECT COALESCE(json_agg(p.id), '[]'::json) FROM (
                 SELECT s3.id FROM collection_items ci3
                   JOIN sources s3 ON s3.id = ci3.source_id AND s3.enabled = true
                  WHERE ci3.collection_id = c.id
                  ORDER BY ci3.position DESC LIMIT 3) p) AS preview
         FROM collections c
         LEFT JOIN collection_items ci ON ci.collection_id = c.id
         LEFT JOIN sources s ON s.id = ci.source_id AND s.enabled = true
        WHERE c.visibility = 'official' AND c.owner_subscriber_id IS NULL
        GROUP BY c.id
        ORDER BY c.display_order ASC, c.name ASC`
    );
    res.json({ collections: rows });
  } catch (err) {
    console.error('[collections] Erreur GET /collections :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// GET /api/collections/:slug — méta + cartes enrichies (forme /api/sources) + default_params.
router.get('/collections/:slug', async (req, res) => {
  try {
    const meta = await pool.query(
      `SELECT id, name, description, emoji, tint FROM collections
        WHERE id = $1 AND visibility = 'official' AND owner_subscriber_id IS NULL`,
      [req.params.slug]
    );
    if (meta.rows.length === 0) return res.status(404).json({ error: 'Collection inconnue' });

    // Cartes du pack, enrichies exactement comme GET /api/sources (pour réutiliser
    // le rendu de carte côté client), + default_params + position.
    const items = await pool.query(
      `SELECT s.id, s.name, s.subtitle, s.description, s.badge, s.type, s.link_url,
              s.categories, s.submitted_by_github, s.params_schema,
              s.likes_count, s.created_at,
              CASE WHEN s.type = 'linked' THEN NULL
                   ELSE COALESCE(st.state, 'inactive') END AS state,
              (SELECT COUNT(*) FROM subscriptions sub
                 JOIN subscribers subr ON subr.id = sub.subscriber_id
                WHERE sub.source_id = s.id AND subr.confirmed = true)::int AS subscriber_count,
              (SELECT MAX(created_at) FROM source_events e
                WHERE e.source_id = s.id AND e.event = 'activated') AS last_activated_at,
              ci.default_params, ci.position
         FROM collection_items ci
         JOIN sources s ON s.id = ci.source_id AND s.enabled = true
         LEFT JOIN source_states st ON st.source_id = s.id
        WHERE ci.collection_id = $1
        ORDER BY ci.position ASC, s.name ASC`,
      [req.params.slug]
    );

    res.json({ collection: meta.rows[0], sources: items.rows });
  } catch (err) {
    console.error('[collections] Erreur GET /collections/:slug :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// Résout la liste des jeux de params à abonner pour une carte donnée.
// Renvoie { instances: [null | paramsObj, ...], unresolved: bool }.
function resolveInstances(schema, defaultParams, profileDept) {
  if (!schema) return { instances: [null], unresolved: false }; // broadcast

  const key = Array.isArray(schema) && schema[0] ? schema[0].key : null;
  const values = Array.isArray(schema) && schema[0] && Array.isArray(schema[0].values)
    ? schema[0].values.map((v) => v.value) : null;

  // Sources départementales : profil d'abord (s'il est dans les valeurs offertes).
  if (key === 'departement' && profileDept && (!values || values.includes(profileDept))) {
    return { instances: [{ departement: profileDept }], unresolved: false };
  }
  if (Array.isArray(defaultParams)) return { instances: defaultParams, unresolved: false };
  if (defaultParams && typeof defaultParams === 'object') return { instances: [defaultParams], unresolved: false };
  return { instances: [], unresolved: true }; // rien à résoudre → à compléter à la main
}

// POST /api/collections/:slug/adopt — abonne à tout le pack. Idempotent (ON CONFLICT
// DO NOTHING) et non destructif (ne supprime jamais un abonnement existant).
router.post('/collections/:slug/adopt', async (req, res) => {
  const { token } = req.body || {};
  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });

    const exists = await pool.query(
      `SELECT 1 FROM collections WHERE id = $1 AND visibility = 'official' AND owner_subscriber_id IS NULL`,
      [req.params.slug]
    );
    if (exists.rows.length === 0) return res.status(404).json({ error: 'Collection inconnue' });

    const prof = await pool.query('SELECT departement FROM subscribers WHERE id = $1', [auth.id]);
    const profileDept = (prof.rows[0] && prof.rows[0].departement) || null;

    const items = await pool.query(
      `SELECT s.id AS source_id, s.name, s.params_schema, ci.default_params
         FROM collection_items ci
         JOIN sources s ON s.id = ci.source_id AND s.enabled = true AND s.type <> 'linked'
        WHERE ci.collection_id = $1
        ORDER BY ci.position ASC`,
      [req.params.slug]
    );

    let added = 0;
    let already = 0;
    const needsParams = [];

    for (const it of items.rows) {
      const { instances, unresolved } = resolveInstances(it.params_schema, it.default_params, profileDept);
      if (unresolved) { needsParams.push({ source_id: it.source_id, name: it.name }); continue; }

      for (const inst of instances) {
        if (inst === null) {
          // Broadcast.
          const r = await pool.query(
            `INSERT INTO subscriptions (subscriber_id, source_id)
             VALUES ($1, $2)
             ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING
             RETURNING subscriber_id`,
            [auth.id, it.source_id]
          );
          if (r.rowCount > 0) added++; else already++;
        } else {
          // Instance paramétrée : validée contre le schéma déclaré (défensif).
          const check = validateParams(it.params_schema, inst);
          if (!check.ok) { needsParams.push({ source_id: it.source_id, name: it.name }); continue; }
          const r = await pool.query(
            `INSERT INTO subscriptions (subscriber_id, source_id, params)
             VALUES ($1, $2, $3::jsonb)
             ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING
             RETURNING subscriber_id`,
            [auth.id, it.source_id, JSON.stringify(check.params)]
          );
          if (r.rowCount > 0) added++; else already++;
        }
      }
    }

    return res.status(200).json({ added, already, needs_params: needsParams, total: added + already });
  } catch (err) {
    console.error('[collections] Erreur POST /adopt :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

// DELETE /api/collections/:slug/adopt — desabonne (auth) de TOUTES les sources du pack.
// Inverse de POST /adopt : supprime les abonnements de l'utilisateur aux sources de la
// collection (toutes leurs instances/params). Idempotent (0 supprime si deja desabonne).
router.delete('/collections/:slug/adopt', async (req, res) => {
  const { token } = req.body || {};
  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });

    const exists = await pool.query(
      `SELECT 1 FROM collections WHERE id = $1 AND visibility = 'official' AND owner_subscriber_id IS NULL`,
      [req.params.slug]
    );
    if (exists.rows.length === 0) return res.status(404).json({ error: 'Collection inconnue' });

    const r = await pool.query(
      `DELETE FROM subscriptions
        WHERE subscriber_id = $1
          AND source_id IN (SELECT source_id FROM collection_items WHERE collection_id = $2)`,
      [auth.id, req.params.slug]
    );
    return res.status(200).json({ removed: r.rowCount });
  } catch (err) {
    console.error('[collections] Erreur DELETE /adopt :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

module.exports = router;
module.exports.resolveInstances = resolveInstances; // exposé pour tests
