// scripts/hygiene-readonly.js — LECTURE SEULE (SELECT uniquement, aucun INSERT/UPDATE/
// DELETE, jamais runCycle). Patron de veille-readonly.js. Le .env local pointe la PROD.
//
//   node scripts/hygiene-readonly.js
//
// Sort : fiche de brouillon-dahu-concept-fr, collisions de display_order, combos orphelins.
'use strict';
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: (process.env.DATABASE_URL || '').trim(), ssl: { rejectUnauthorized: false } });

const SRC = 'brouillon-dahu-concept-fr';

(async () => {
  const out = {};

  // 1) Fiche complète de la source de test.
  const src = await pool.query(
    `SELECT id, name, enabled, type, badge, display_order, created_at,
            submitted_by_github, submitted_by_email, categories
       FROM sources WHERE id = $1`, [SRC]);
  out.source = src.rows[0] || null;

  if (out.source) {
    const q = async (sql) => (await pool.query(sql, [SRC])).rows[0];
    out.abonnements_actifs = (await q(`SELECT COUNT(*)::int AS n FROM subscriptions WHERE source_id = $1`)).n;
    out.favoris            = (await q(`SELECT COUNT(*)::int AS n FROM favorites     WHERE source_id = $1`)).n;
    out.likes_table        = (await q(`SELECT COUNT(*)::int AS n FROM source_likes  WHERE source_id = $1`)).n;
    out.likes_count_colonne= (await q(`SELECT COALESCE(likes_count,0)::int AS n FROM sources WHERE id = $1`)).n;
    out.instances_param    = (await q(`SELECT COUNT(*)::int AS n FROM source_param_states WHERE source_id = $1`)).n;
    out.points_attribues   = (await q(`SELECT COUNT(*)::int AS n FROM points_ledger WHERE ref_id = $1`)).n;
    out.decks_collections  = (await pool.query(
      `SELECT ci.collection_id, c.name, c.visibility
         FROM collection_items ci LEFT JOIN collections c ON c.id = ci.collection_id
        WHERE ci.source_id = $1`, [SRC])).rows;
    out.etat_source_states = (await q(`SELECT state FROM source_states WHERE source_id = $1`)) || null;
  }

  // 2) Collisions de display_order (sources enabled).
  out.collisions_display_order = (await pool.query(
    `SELECT display_order, COUNT(*)::int AS n, array_agg(id ORDER BY id) AS ids
       FROM sources WHERE enabled = true
      GROUP BY display_order HAVING COUNT(*) > 1
      ORDER BY display_order`)).rows;

  // 3) Combos orphelins : lignes de source_param_states sans abonnement correspondant.
  out.combos_orphelins = (await pool.query(
    `SELECT sps.source_id, COUNT(*)::int AS orphelins
       FROM source_param_states sps
      WHERE NOT EXISTS (
            SELECT 1 FROM subscriptions sub
             WHERE sub.source_id = sps.source_id AND sub.params = sps.params)
      GROUP BY sps.source_id ORDER BY orphelins DESC, sps.source_id`)).rows;
  out.combos_orphelins_total = out.combos_orphelins.reduce((a, r) => a + r.orphelins, 0);

  console.log(JSON.stringify(out, null, 2));
  await pool.end();
})().catch((e) => { console.error('ERREUR:', e.message); process.exit(1); });
