// scripts/soumissions-readonly.js
// ─────────────────────────────────────────────────────────────────────────────
// TRIEUR DE SOUMISSIONS DEV — LECTURE SEULE (support du Robot 3).
//
// LIGNE ROUGE STRUCTURELLE (pas une simple convention) :
//   Ce script ne contient QUE des SELECT. Il n'y a — et il ne doit jamais y
//   avoir — AUCUN UPDATE / INSERT / DELETE ici, et EN PARTICULIER aucune
//   écriture de la colonne `sources.enabled`. La bascule enabled=true d'une
//   soumission est une décision HUMAINE (Hugo), jamais automatisée. Le Robot 3
//   RAPPORTE, il ne DÉCIDE pas.
//
// Le .env local pointe la DB de PROD : toute écriture serait une écriture en
// prod. Ce fichier imprime un unique objet JSON sur stdout, rien d'autre.
//
// Usage : node scripts/soumissions-readonly.js
// ─────────────────────────────────────────────────────────────────────────────

// quiet:true — dotenv v17+ imprime sinon un bandeau de démarrage sur stdout,
// ce qui casserait le contrat « un seul objet JSON sur stdout » (un consommateur
// qui fait JSON.parse échouerait sur cette ligne).
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');

// Même configuration de connexion que server/db.js (SSL Railway, cert auto-signé).
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

// 1. pending_submissions — soumissions dev en attente : enabled = false ET
//    badge = 'community' (exactement ce qu'insère POST /api/dev/submit-source,
//    voir server/routes/dev.js : type 'external', badge 'community',
//    enabled false). Les plus anciennes d'abord (ordre de traitement du plafond
//    de sondes côté agent).
const Q_PENDING = `
  SELECT id, name, description, endpoint_url,
         submitted_by_github, submitted_by_email,
         categories, params_schema, created_at
    FROM sources
   WHERE enabled = false
     AND badge = 'community'
   ORDER BY created_at ASC NULLS FIRST, id ASC`;

// 2. existing_sources — TOUTES les sources (tous badges, enabled true OU false)
//    en liste brute : référentiel anti-doublon. La comparaison est faite par
//    l'agent, PAS par le script.
const Q_EXISTING = `
  SELECT id, name, description, endpoint_url, categories
    FROM sources
   ORDER BY id ASC`;

// 3. meta — nombre de soumissions en attente + date d'exécution.
const Q_META = `
  SELECT COUNT(*) AS pending_count
    FROM sources
   WHERE enabled = false AND badge = 'community'`;

async function main() {
  const [pending, existing, meta] = await Promise.all([
    pool.query(Q_PENDING),
    pool.query(Q_EXISTING),
    pool.query(Q_META),
  ]);

  const out = {
    meta: {
      generated_at: new Date().toISOString(),
      pending_count: Number(meta.rows[0].pending_count),
    },
    pending_submissions: pending.rows,
    existing_sources: existing.rows,
  };

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[soumissions-readonly] ERREUR :', err.message);
    try { await pool.end(); } catch (_) { /* ignore */ }
    process.exit(1);
  });
