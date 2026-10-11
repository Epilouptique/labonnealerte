// scripts/migrate-org-contact.js — chantier « mairies », LOT B-bis : ajoute les colonnes
// contact_function et contact_phone à organizations. STRICTEMENT ADDITIF (ALTER … ADD
// COLUMN IF NOT EXISTS), IDEMPOTENT. dry-run par défaut ; --write. DATABASE_URL jamais affichée.
//   node scripts/migrate-org-contact.js            (simulation)
//   node scripts/migrate-org-contact.js --write     (exécution)
'use strict';
require('dotenv').config();
const WRITE = process.argv.includes('--write');
const DDL = `
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_function TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_phone TEXT;
`;
async function report(pool) {
  const c = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='organizations' AND column_name IN ('contact_function','contact_phone') ORDER BY column_name");
  console.log('Colonnes contact :', c.rows.map((r) => r.column_name).join(', ') || '(aucune)');
}
(async () => {
  const { pool } = require('../server/db');
  try {
    console.log(`MODE : ${WRITE ? 'ÉCRITURE (--write)' : 'SIMULATION (dry-run)'}`);
    console.log('\n── AVANT ──'); await report(pool);
    if (!WRITE) { console.log('\nSIMULATION : additif. Relancez avec --write.'); return; }
    await pool.query('BEGIN'); await pool.query(DDL); await pool.query('COMMIT');
    console.log('\n✅ Appliqué (idempotent).'); console.log('\n── APRÈS ──'); await report(pool);
  } catch (e) { try { await pool.query('ROLLBACK'); } catch {} console.error('Erreur :', e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
