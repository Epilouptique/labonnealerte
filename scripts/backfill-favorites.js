// scripts/backfill-favorites.js — JETABLE (one-off).
// Ajoute à `favorites` un cœur pour CHAQUE source déjà abonnée en base qui n'y figure pas
// encore (les abonnements antérieurs à la bascule « tout abonnement ajoute aussi à Ma
// collection »). Idempotent, non destructif : n'insère que le manquant, ne retire jamais
// rien. Le favori est par-SOURCE (DISTINCT subscriber_id, source_id — une seule ligne même
// pour une source paramétrée à plusieurs instances).
//
// SÉCURITÉ : par défaut DRY-RUN (aucune écriture). L'écriture réelle exige --apply.
//   node scripts/backfill-favorites.js            → DRY-RUN (compte le manquant, n'écrit rien)
//   node scripts/backfill-favorites.js --check    → idem (alias explicite)
//   node scripts/backfill-favorites.js --apply    → ÉCRIT (transaction) puis auto-vérifie (0 manquant attendu)
//
// NB : les nouveaux abonnements posent déjà le favori en direct (routes/myalerts.js
// toggle + toggle-param, routes/collections.js adopt). Ce script ne sert qu'au rattrapage.

require('dotenv').config();
const { pool } = require('../server/db');

const WRITE = process.argv.includes('--apply');

// Abonnements (par-source, dédupliqués) sans favori correspondant.
const MISSING_SQL = `
  SELECT COUNT(*)::int AS n
    FROM (SELECT DISTINCT subscriber_id, source_id FROM subscriptions) s
   WHERE NOT EXISTS (
     SELECT 1 FROM favorites f
      WHERE f.subscriber_id = s.subscriber_id AND f.source_id = s.source_id)`;

(async () => {
  let client;
  console.log('====================================================');
  console.log(WRITE ? 'MODE : ÉCRITURE (--apply, écrit en base)' : 'MODE : DRY-RUN (aucune écriture ; --apply pour écrire)');
  console.log('FAVORIS auto depuis les abonnements existants');
  console.log('====================================================');
  try {
    const before = await pool.query(MISSING_SQL);
    const missing = before.rows[0].n;
    console.log('Abonnements (par-source) sans favori : ' + missing);

    if (!WRITE) {
      console.log('\n>>> DRY-RUN : AUCUNE écriture. Relance avec --apply pour insérer ' + missing + ' favori(s). <<<');
      return;
    }

    if (missing === 0) {
      console.log('Rien à rattraper — déjà à jour. Aucune écriture.');
      return;
    }

    console.log('\n>>> ÉCRITURE en cours (transaction)… <<<');
    client = await pool.connect();
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO favorites (subscriber_id, source_id)
       SELECT DISTINCT subscriber_id, source_id FROM subscriptions
       ON CONFLICT (subscriber_id, source_id) DO NOTHING`);
    await client.query('COMMIT');
    console.log('✅ COMMIT OK : ' + ins.rowCount + ' favori(s) inséré(s).');

    // Auto-vérification post-commit : plus aucun abonnement sans favori.
    const after = await client.query(MISSING_SQL);
    const remaining = after.rows[0].n;
    console.log('🔎 Vérif en base : ' + remaining + ' abonnement(s) encore sans favori (attendu : 0).');
    if (remaining !== 0) {
      console.warn('⚠️  ATTENTION : ' + remaining + ' restant(s) — anomalie, inspecter avant de conclure.');
      process.exitCode = 1;
    }
  } catch (e) {
    if (client) { try { await client.query('ROLLBACK'); console.error('ROLLBACK effectué (aucune écriture conservée).'); } catch (_) {} }
    console.error('❌ ÉCHEC :', e.stack || e.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
    console.log('Terminé — code de sortie : ' + (process.exitCode || 0));
  }
})();
