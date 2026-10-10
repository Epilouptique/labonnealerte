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
  const { pool } = require('../server/db');
  try {
    // --- Modes LISTE (lecture seule) -----------------------------------------
    if (args['list-review']) {
      const { rows } = await pool.query(
        `SELECT id, name, engine, endpoint_url, status_changed_at,
                engine_config->>'last_extract' AS last_extract,
                engine_config->>'last_extract_at' AS last_extract_at
           FROM sources WHERE status = 'review' ORDER BY status_changed_at ASC`);
      console.log(`Sources en REVUE (${rows.length}) :`);
      rows.forEach((r) => {
        console.log(`\n• ${r.id} — « ${r.name} » [${r.engine}] ${r.endpoint_url || ''}`);
        console.log(`  dernier extrait (${r.last_extract_at || 'jamais'}) : ${r.last_extract ? '«' + r.last_extract + '»' : '(aucun aperçu lancé)'}`);
      });
      return;
    }
    if (args['list-reports']) {
      const where = id ? 'WHERE sr.source_id = $1' : '';
      const { rows } = await pool.query(
        `SELECT s.id, s.name, s.badge, s.status,
                COUNT(DISTINCT sr.reporter_subscriber_id)::int AS distinct_reports,
                array_agg(DISTINCT sr.reason) AS reasons
           FROM source_reports sr JOIN sources s ON s.id = sr.source_id
           ${where}
          GROUP BY s.id, s.name, s.badge, s.status
          ORDER BY distinct_reports DESC`, id ? [id] : []);
      console.log(`Signalements par source (${rows.length}) — seuil auto-suspension = ${lc.REPORT_SUSPEND_THRESHOLD} :`);
      rows.forEach((r) => {
        const tag = (r.distinct_reports >= lc.REPORT_SUSPEND_THRESHOLD && r.badge === 'community') ? ' ⚠️ SEUIL ATTEINT' : '';
        console.log(`  ${r.id} [${r.badge}/${r.status}] : ${r.distinct_reports} compte(s) — ${(r.reasons || []).join(', ')}${tag}`);
      });
      return;
    }

    if (!id || !to) {
      console.error('Usage :\n  --id=<source> --to=published|refused|suspended [--reason="…"] [--write]   (refused/suspended : --reason obligatoire)\n  --list-review\n  --list-reports [--id=<source>]');
      process.exit(2);
    }
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
