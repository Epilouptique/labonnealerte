// scripts/purge-veille-artiste-spotify.js — JETABLE.
// Purge propre de la source orpheline 'veille-artiste-spotify' (remplacee par
// veille-artiste-deezer ; module supprime, ligne DB residuelle, absente d'init.sql).
// Transaction unique avec GARDE-FOUS : refuse de purger si des references "vivantes"
// existent (abonnements actifs, points, instances parametrees, presence dans un deck,
// favoris) -> on prefere s'arreter et rapporter plutot que casser/cascader en silence.
// Supprime : la ligne source_states (FK sans ON DELETE CASCADE = bloqueur) puis la ligne
// sources. Les tables a ON DELETE CASCADE (subscriptions/source_events/collection_items/
// favorites) seraient purgees par cascade, mais on exige qu'elles soient DEJA vides.
//   node scripts/purge-veille-artiste-spotify.js           (applique)
//   node scripts/purge-veille-artiste-spotify.js --check    (verifs seules, rien supprime)

require('dotenv').config();
const { pool } = require('../server/db');

const ID = 'veille-artiste-spotify';

async function count(client, sql, params) {
  const r = await client.query(sql, params);
  return r.rows[0].n;
}

async function main() {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const exists = await count(client, 'SELECT count(*)::int n FROM sources WHERE id=$1', [ID]);
    if (exists === 0) { await client.query('ROLLBACK'); console.log('Rien a faire : la source n\'existe pas (deja purgee ?).'); return; }

    // GARDE-FOUS : aucune reference "vivante" ne doit exister.
    const guards = {
      subscriptions: await count(client, 'SELECT count(*)::int n FROM subscriptions WHERE source_id=$1', [ID]),
      source_param_states: await count(client, 'SELECT count(*)::int n FROM source_param_states WHERE source_id=$1', [ID]),
      collection_items: await count(client, 'SELECT count(*)::int n FROM collection_items WHERE source_id=$1', [ID]),
      favorites: await count(client, 'SELECT count(*)::int n FROM favorites WHERE source_id=$1', [ID]),
      points_ledger: await count(client, 'SELECT count(*)::int n FROM points_ledger WHERE ref_id=$1', [ID]),
    };
    const blocking = Object.entries(guards).filter(([, n]) => n > 0);
    if (blocking.length) {
      await client.query('ROLLBACK');
      console.error('ARRET : references vivantes detectees (a gerer a la main avant purge) :');
      blocking.forEach(([t, n]) => console.error('  ' + t + ' = ' + n));
      process.exitCode = 1;
      return;
    }
    console.log('Garde-fous OK : aucune reference vivante (subscriptions/param_states/collection_items/favorites/points_ledger = 0).');

    if (process.argv.includes('--check')) { await client.query('ROLLBACK'); console.log('--check : verifs seules, aucune suppression.'); return; }

    // Suppressions explicites (les tables CASCADE sont deja vides ; on nettoie les
    // no-cascade + source_events par prudence, puis la ligne sources).
    const rEvents = await client.query('DELETE FROM source_events WHERE source_id=$1', [ID]);
    const rParam = await client.query('DELETE FROM source_param_states WHERE source_id=$1', [ID]);
    const rStates = await client.query('DELETE FROM source_states WHERE source_id=$1', [ID]);
    const rSrc = await client.query('DELETE FROM sources WHERE id=$1', [ID]);
    await client.query('COMMIT');

    console.log('PURGE OK (commit) :');
    console.log('  source_events supprimes : ' + rEvents.rowCount);
    console.log('  source_param_states supprimes : ' + rParam.rowCount);
    console.log('  source_states supprimes : ' + rStates.rowCount);
    console.log('  sources supprimes : ' + rSrc.rowCount + ' (1 attendu)');
  } catch (e) {
    if (client) { try { await client.query('ROLLBACK'); console.error('ROLLBACK effectue.'); } catch (_) {} }
    console.error('ECHEC :', e.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

if (require.main === module) main();
module.exports = { main };
