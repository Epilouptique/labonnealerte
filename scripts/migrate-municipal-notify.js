// scripts/migrate-municipal-notify.js — chantier « mairies », LOT C : colonnes de
// diffusion sur municipal_events + journal municipal_event_notifications. STRICTEMENT
// ADDITIF (ALTER … ADD COLUMN IF NOT EXISTS, CREATE … IF NOT EXISTS), IDEMPOTENT.
// dry-run par défaut ; --write pour exécuter. DATABASE_URL jamais affichée.
//
//   node scripts/migrate-municipal-notify.js            (simulation)
//   node scripts/migrate-municipal-notify.js --write     (exécution)
'use strict';
require('dotenv').config();
const WRITE = process.argv.includes('--write');

// ⚠️ Copie EXACTE du bloc « DIFFUSION DES ÉVÉNEMENTS MUNICIPAUX LOT C » de init.sql.
const DDL = `
ALTER TABLE municipal_events ADD COLUMN IF NOT EXISTS notify_status TEXT NOT NULL DEFAULT 'none'
  CHECK (notify_status IN ('none','scheduled','sent','cancelled'));
ALTER TABLE municipal_events ADD COLUMN IF NOT EXISTS notify_scheduled_at TIMESTAMPTZ;
ALTER TABLE municipal_events ADD COLUMN IF NOT EXISTS notify_sent_at TIMESTAMPTZ;
ALTER TABLE municipal_events ADD COLUMN IF NOT EXISTS notify_count INTEGER;
ALTER TABLE municipal_events ADD COLUMN IF NOT EXISTS notify_resends SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE municipal_events ADD COLUMN IF NOT EXISTS notify_requested_by INTEGER REFERENCES subscribers(id);
CREATE INDEX IF NOT EXISTS idx_munevt_notify_due
  ON municipal_events (notify_scheduled_at) WHERE notify_status = 'scheduled';
CREATE TABLE IF NOT EXISTS municipal_event_notifications (
  id                  BIGSERIAL PRIMARY KEY,
  event_id            BIGINT NOT NULL REFERENCES municipal_events(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN ('scheduled','sent','cancelled','test','skipped')),
  actor_subscriber_id INTEGER REFERENCES subscribers(id),
  recipients_count    INTEGER,
  result              TEXT,
  detail              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_munevt_notif_event ON municipal_event_notifications (event_id, created_at DESC);
`;

async function report(pool) {
  const cols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='municipal_events' AND column_name LIKE 'notify%' ORDER BY column_name");
  console.log('Colonnes notify municipal_events :', cols.rows.map((r) => r.column_name).join(', ') || '(aucune)');
  const t = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'municipal_event_notifications'");
  console.log('Table municipal_event_notifications :', t.rows.length ? 'présente' : '(absente)');
  if (t.rows.length) {
    const c = await pool.query('SELECT COUNT(*)::int n FROM municipal_event_notifications');
    console.log('COUNT journal :', c.rows[0].n);
  }
}

(async () => {
  const { pool } = require('../server/db');
  try {
    console.log(`MODE : ${WRITE ? 'ÉCRITURE (--write)' : 'SIMULATION (dry-run)'}`);
    console.log('\n── État AVANT ──');
    await report(pool);
    if (!WRITE) { console.log('\nSIMULATION : aucune écriture. DDL strictement additif. Relancez avec --write.'); return; }
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
  } finally { await pool.end(); }
})();
