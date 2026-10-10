// scripts/source-lifecycle-admin.js — transitions RÉSERVÉES À HUGO (acteur admin).
// Valide : review → published, review → refused (= retour 'draft' + motif),
//          published → suspended, suspended → published. Interdit tout le reste.
// dry-run par défaut ; --write pour exécuter. DATABASE_URL jamais affichée.
//
//   node scripts/source-lifecycle-admin.js --id=ma-veille --to=published
//   node scripts/source-lifecycle-admin.js --id=ma-veille --to=refused --reason="URL instable" --write
//   node scripts/source-lifecycle-admin.js --id=ma-veille --to=suspended --reason="Contenu signalé" --write
'use strict';
require('dotenv').config();
const lc = require('../server/sources/lib/source-lifecycle');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] === '' ? true : m[2]] : [a, true];
}));
const WRITE = args.write === true;
const id = typeof args.id === 'string' ? args.id.trim() : '';
const to = typeof args.to === 'string' ? args.to.trim() : '';
const reason = typeof args.reason === 'string' ? args.reason.slice(0, 280) : null;

// 'refused' est une commande admin : techniquement review → 'draft' avec motif.
const target = to === 'refused' ? 'draft' : to;

(async () => {
  if (!id || !to) { console.error('Usage : --id=<source> --to=published|refused|suspended [--reason="…"] [--write]'); process.exit(2); }
  const { pool } = require('../server/db');
  try {
    const { rows } = await pool.query('SELECT id, name, status, badge, author_subscriber_id FROM sources WHERE id = $1', [id]);
    if (!rows.length) { console.error(`Source introuvable : ${id}`); process.exit(2); }
    const s = rows[0];
    console.log(`MODE : ${WRITE ? 'ÉCRITURE' : 'SIMULATION'} — ${s.id} « ${s.name} » : ${s.status} → ${to}${to === 'refused' ? ' (draft+motif)' : ''}`);

    if (!lc.canTransition(s.status, target, 'admin')) {
      console.error(`Transition interdite : ${s.status} → ${target} (admin).`);
      process.exit(1);
    }
    if ((to === 'refused' || to === 'suspended') && !reason) {
      console.error('Un motif (--reason) est requis pour un refus ou une suspension.');
      process.exit(2);
    }
    if (!WRITE) { console.log('SIMULATION : aucune écriture. Ajoutez --write pour appliquer.'); return; }

    await pool.query(
      'UPDATE sources SET status = $2, status_reason = $3 WHERE id = $1 AND status = $4',
      [id, target, (to === 'published') ? null : reason, s.status]);
    const after = await pool.query('SELECT status, enabled, status_reason FROM sources WHERE id = $1', [id]);
    console.log('✅ Appliqué :', JSON.stringify(after.rows[0]));
  } catch (e) {
    console.error('Erreur :', e.message); process.exitCode = 1;
  } finally { await pool.end(); }
})();
