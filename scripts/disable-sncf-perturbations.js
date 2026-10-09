// scripts/disable-sncf-perturbations.js — désactivation PROPRE de la source sncf-perturbations.
// Motif : clé SNCF_API_KEY absente de l'environnement → surveillance en incident permanent, et
// 0 abonnement actif (vérifié en lecture seule le 2026-10-09 : SUBS=0, DISTINCT=0, FAV=0).
//
//   node scripts/disable-sncf-perturbations.js           → DRY-RUN (défaut, AUCUNE écriture)
//   node scripts/disable-sncf-perturbations.js --write    → ÉCRITURE réelle (transaction)
//
// LIVRÉ NON EXÉCUTÉ. Garde-fous (mêmes règles que les autres scripts du dépôt) :
//   - bannière de mode ; DRY-RUN par défaut, écriture seulement sur --write explicite ;
//   - champ d'ACTIVATION uniquement (sources.enabled = false) ; JAMAIS de DELETE ;
//   - WHERE ciblé sur l'id exact + enabled = true (pas d'UPDATE nu, idempotent) ;
//   - transaction + ROLLBACK sur erreur + auto-vérification post-commit + code de sortie.
// Réversible à tout moment : UPDATE sources SET enabled = true WHERE id = 'sncf-perturbations'
// (ou poser SNCF_API_KEY et réactiver). Rien n'est supprimé, les éventuels abonnements survivent.
require('dotenv').config();
const { pool } = require('../server/db');

const WRITE = process.argv.includes('--write');
const SOURCE_ID = 'sncf-perturbations';

(async () => {
  console.log('====================================================');
  console.log(WRITE ? 'MODE : ÉCRITURE (écrit en base, transaction)' : 'MODE : DRY-RUN (--write absent, AUCUNE écriture)');
  console.log('DÉSACTIVATION PROPRE :', SOURCE_ID);
  console.log('====================================================');

  let client;
  try {
    const cur = await pool.query('SELECT id, enabled FROM sources WHERE id = $1', [SOURCE_ID]);
    if (cur.rows.length === 0) { console.log('Source absente de la table — rien à faire.'); return; }
    console.log('État actuel : enabled =', cur.rows[0].enabled);
    const subs = await pool.query('SELECT COUNT(*)::int AS n FROM subscriptions WHERE source_id = $1', [SOURCE_ID]);
    console.log('Abonnements actifs :', subs.rows[0].n, subs.rows[0].n === 0 ? '(aucun impact utilisateur)' : '(⚠️ des abonnés seront affectés)');

    if (cur.rows[0].enabled === false) { console.log('Déjà désactivée — idempotent, rien à écrire.'); return; }

    if (!WRITE) {
      console.log('\n>>> DRY-RUN : passerait enabled=false pour', SOURCE_ID, '. Relance avec --write pour écrire. <<<');
      return;
    }

    client = await pool.connect();
    await client.query('BEGIN');
    const upd = await client.query(
      'UPDATE sources SET enabled = false WHERE id = $1 AND enabled = true', [SOURCE_ID]);
    await client.query('COMMIT');
    console.log('✅ COMMIT OK :', upd.rowCount, 'ligne(s) désactivée(s).');

    const chk = await client.query('SELECT enabled FROM sources WHERE id = $1', [SOURCE_ID]);
    console.log('🔎 Vérif en base : enabled =', chk.rows[0].enabled, chk.rows[0].enabled === false ? 'OK' : '⚠️ INATTENDU');
  } catch (e) {
    if (client && WRITE) { try { await client.query('ROLLBACK'); console.error('ROLLBACK (aucune écriture conservée).'); } catch (_) {} }
    console.error('❌ ÉCHEC :', e.stack || e.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
    console.log('Terminé — code de sortie :', process.exitCode || 0);
  }
})();
