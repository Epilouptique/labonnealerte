// scripts/migrate-notify-channel.js — LOT D : ajoute la colonne notify_channel aux abonnés
// (préférence de canal : 'push' | 'email' | 'both'). STRICTEMENT ADDITIF (ALTER … ADD COLUMN
// IF NOT EXISTS), IDEMPOTENT ; DEFAULT 'both' = comportement historique EXACT (opt-in email +
// push). Pas de contrainte CHECK (la valeur est validée côté route). Colonne nullable : NULL
// est traité comme 'both' par deliverToSubscribers. dry-run par défaut ; --write.
// DATABASE_URL jamais affichée.
//   node scripts/migrate-notify-channel.js            (simulation)
//   node scripts/migrate-notify-channel.js --write     (exécution)
'use strict';
require('dotenv').config();
const WRITE = process.argv.includes('--write');
const DDL = `
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS notify_channel TEXT DEFAULT 'both';
`;
async function report(pool) {
  const c = await pool.query("SELECT column_name, column_default FROM information_schema.columns WHERE table_name='subscribers' AND column_name='notify_channel'");
  if (!c.rows.length) { console.log('notify_channel : (absente)'); return; }
  console.log('notify_channel : présente, défaut =', c.rows[0].column_default);
  const d = await pool.query("SELECT COALESCE(notify_channel,'(null)') v, COUNT(*)::int n FROM subscribers GROUP BY 1 ORDER BY 1");
  console.log('répartition :', d.rows.map((r) => `${r.v}=${r.n}`).join(', ') || '(aucun abonné)');
}
(async () => {
  const { pool } = require('../server/db');
  try {
    console.log(`MODE : ${WRITE ? 'ÉCRITURE (--write)' : 'SIMULATION (dry-run)'}`);
    console.log('\n── AVANT ──'); await report(pool);
    if (!WRITE) { console.log('\nSIMULATION : additif (ADD COLUMN IF NOT EXISTS, DEFAULT both). Relancez avec --write.'); return; }
    await pool.query('BEGIN'); await pool.query(DDL); await pool.query('COMMIT');
    console.log('\n✅ Appliqué (idempotent).'); console.log('\n── APRÈS ──'); await report(pool);
  } catch (e) { try { await pool.query('ROLLBACK'); } catch {} console.error('Erreur :', e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
