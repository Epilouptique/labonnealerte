// scripts/migrate-organisations.js — chantier « mairies », LOT A : crée les tables
// organizations et organization_members. STRICTEMENT ADDITIF (CREATE TABLE/INDEX IF NOT
// EXISTS), IDEMPOTENT. dry-run par défaut ; --write pour exécuter. DATABASE_URL jamais
// affichée. N'exécute QUE le bloc « ORGANISATIONS LOT A » d'init.sql (tenu en phase ici).
//
//   node scripts/migrate-organisations.js            (simulation)
//   node scripts/migrate-organisations.js --write     (exécution)
'use strict';
require('dotenv').config();
const WRITE = process.argv.includes('--write');

// ⚠️ Copie EXACTE du bloc « ORGANISATIONS LOT A » de server/db/init.sql (tout additif).
const DDL = `
CREATE TABLE IF NOT EXISTS organizations (
  id                       BIGSERIAL PRIMARY KEY,
  name                     TEXT NOT NULL,
  type                     TEXT NOT NULL DEFAULT 'commune' CHECK (type IN ('commune','epci','autre')),
  commune_insee            TEXT,
  siren                    TEXT,
  email                    TEXT,
  justification            TEXT,
  status                   TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','suspended')),
  status_reason            TEXT,
  requester_subscriber_id  INTEGER NOT NULL REFERENCES subscribers(id),
  verified_by              TEXT,
  verified_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_insee_active
  ON organizations (commune_insee)
  WHERE commune_insee IS NOT NULL AND status IN ('pending','verified');
CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_siren_active
  ON organizations (siren)
  WHERE siren IS NOT NULL AND status IN ('pending','verified');
CREATE INDEX IF NOT EXISTS idx_org_requester ON organizations (requester_subscriber_id);
CREATE INDEX IF NOT EXISTS idx_org_status ON organizations (status);

CREATE TABLE IF NOT EXISTS organization_members (
  org_id         BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscriber_id  INTEGER NOT NULL REFERENCES subscribers(id),
  role           TEXT NOT NULL DEFAULT 'editeur' CHECK (role IN ('admin','editeur')),
  status         TEXT NOT NULL DEFAULT 'invite' CHECK (status IN ('invite','actif')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, subscriber_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_sub ON organization_members (subscriber_id);
`;

// Contrôle final (lecture seule) : tables + index présents, et COUNT des deux tables.
async function report(pool) {
  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_name IN ('organizations','organization_members') ORDER BY table_name");
  console.log('Tables présentes :', tables.rows.map((r) => r.table_name).join(', ') || '(aucune)');
  const idx = await pool.query(
    "SELECT indexname FROM pg_indexes WHERE tablename IN ('organizations','organization_members') ORDER BY indexname");
  console.log('Index présents :', idx.rows.map((r) => r.indexname).join(', ') || '(aucun)');
  const present = new Set(tables.rows.map((r) => r.table_name));
  if (present.has('organizations')) {
    const c1 = await pool.query('SELECT COUNT(*)::int n FROM organizations');
    console.log('COUNT organizations        :', c1.rows[0].n);
  }
  if (present.has('organization_members')) {
    const c2 = await pool.query('SELECT COUNT(*)::int n FROM organization_members');
    console.log('COUNT organization_members :', c2.rows[0].n);
  }
}

(async () => {
  const { pool } = require('../server/db');
  try {
    console.log(`MODE : ${WRITE ? 'ÉCRITURE (--write)' : 'SIMULATION (dry-run)'}`);
    console.log('\n── État AVANT ──');
    await report(pool);

    if (!WRITE) {
      console.log('\nSIMULATION : aucune écriture. Le DDL est strictement additif (CREATE … IF NOT EXISTS).');
      console.log('Relancez avec --write pour appliquer.');
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
