// scripts/migrate-municipal-events.js — chantier « mairies », LOT B : crée la table
// municipal_events. STRICTEMENT ADDITIF (CREATE TABLE/INDEX IF NOT EXISTS), IDEMPOTENT.
// dry-run par défaut ; --write pour exécuter. DATABASE_URL jamais affichée. N'exécute QUE
// le bloc « ÉVÉNEMENTS MUNICIPAUX LOT B » d'init.sql (tenu en phase ici).
//
//   node scripts/migrate-municipal-events.js            (simulation)
//   node scripts/migrate-municipal-events.js --write     (exécution)
'use strict';
require('dotenv').config();
const WRITE = process.argv.includes('--write');

// ⚠️ Copie EXACTE du bloc « ÉVÉNEMENTS MUNICIPAUX LOT B » de server/db/init.sql.
const DDL = `
CREATE TABLE IF NOT EXISTS municipal_events (
  id                    BIGSERIAL PRIMARY KEY,
  org_id                BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  author_subscriber_id  INTEGER NOT NULL REFERENCES subscribers(id),
  template              TEXT NOT NULL DEFAULT 'libre' CHECK (template IN ('coupure-eau','travaux','evenement','fermeture','libre')),
  title                 TEXT NOT NULL,
  body                  TEXT NOT NULL,
  category              TEXT,
  commune_insee         TEXT NOT NULL,
  commune_nom           TEXT,
  starts_at             TIMESTAMPTZ,
  ends_at               TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published','cancelled')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_munevt_org ON municipal_events (org_id, status);
CREATE INDEX IF NOT EXISTS idx_munevt_commune_pub
  ON municipal_events (commune_insee, status) WHERE status = 'published';
`;

async function report(pool) {
  const t = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'municipal_events'");
  console.log('Table municipal_events :', t.rows.length ? 'présente' : '(absente)');
  const idx = await pool.query("SELECT indexname FROM pg_indexes WHERE tablename = 'municipal_events' ORDER BY indexname");
  console.log('Index présents :', idx.rows.map((r) => r.indexname).join(', ') || '(aucun)');
  if (t.rows.length) {
    const c = await pool.query('SELECT COUNT(*)::int n FROM municipal_events');
    console.log('COUNT municipal_events :', c.rows[0].n);
  }
}

(async () => {
  const { pool } = require('../server/db');
  try {
    console.log(`MODE : ${WRITE ? 'ÉCRITURE (--write)' : 'SIMULATION (dry-run)'}`);
    console.log('\n── État AVANT ──');
    await report(pool);
    if (!WRITE) {
      console.log('\nSIMULATION : aucune écriture. DDL strictement additif. Relancez avec --write.');
      return;
    }
    await pool.query('BEGIN');
    await pool.query(DDL);
    await pool.query('COMMIT');
    console.log('\n✅ Appliqué (idempotent).');
    console.log('\n── État APRÈS ──');
    await report(pool);
  } catch (e) {
    try { await pool.query('ROLLBACK'); } catch {}
    console.error('Erreur :', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
