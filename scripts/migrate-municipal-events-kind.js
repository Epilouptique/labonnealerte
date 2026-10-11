// scripts/migrate-municipal-events-kind.js — chantier « mairies », LOT C (complément) :
// ajoute municipal_events.kind (« alerte » | « info », défaut « info »). STRICTEMENT
// ADDITIF (ALTER … ADD COLUMN IF NOT EXISTS), IDEMPOTENT. dry-run par défaut ; --write.
// DATABASE_URL jamais affichée.
//   node scripts/migrate-municipal-events-kind.js            (simulation)
//   node scripts/migrate-municipal-events-kind.js --write     (exécution)
'use strict';
require('dotenv').config();
const WRITE = process.argv.includes('--write');
const DDL = `
ALTER TABLE municipal_events ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'info'
  CHECK (kind IN ('alerte','info'));
`;
async function report(pool) {
  const c = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='municipal_events' AND column_name='kind'");
  console.log('Colonne kind :', c.rows.length ? 'présente' : '(absente)');
  if (c.rows.length) {
    const d = await pool.query("SELECT kind, COUNT(*)::int n FROM municipal_events GROUP BY kind ORDER BY kind");
    console.log('Répartition kind :', JSON.stringify(Object.fromEntries(d.rows.map((r) => [r.kind, r.n]))));
  }
}
(async () => {
  const { pool } = require('../server/db');
  try {
    console.log(`MODE : ${WRITE ? 'ÉCRITURE (--write)' : 'SIMULATION (dry-run)'}`);
    console.log('\n── AVANT ──'); await report(pool);
    if (!WRITE) { console.log('\nSIMULATION : aucune écriture. Additif. Relancez avec --write.'); return; }
    await pool.query('BEGIN'); await pool.query(DDL); await pool.query('COMMIT');
    console.log('\n✅ Appliqué (idempotent).'); console.log('\n── APRÈS ──'); await report(pool);
  } catch (e) { try { await pool.query('ROLLBACK'); } catch {} console.error('Erreur :', e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
