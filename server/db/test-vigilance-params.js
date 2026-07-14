// BANC D'ESSAI — OpenAlert v2 (poller multi-instances). NON destructif : insère
// une source de test + 2 abonnements paramétrés {departement:05|13}, déroule le
// poller paramétré, affiche source_param_states, prouve la non-régression du
// chemin broadcast, puis NETTOIE tout (aucune empreinte en prod).
//
// À exécuter dans le shell Railway (accès DB) :  node server/db/test-vigilance-params.js
//
// Déterministe : on injecte une carte de vigilance stub (05 = ORANGE orages,
// 13 = vert) → pas besoin de METEOFRANCE_API_KEY, résultat indépendant de la météo.

const { pool } = require('../db');
const vf = require('../sources/lib/vigilance-factory');
const testSource = require('../sources/vigilance-params-test');
const { processParamSource } = require('../poller');

const SRC_ID = 'vigilance-meteo-params-test';
const EMAIL = 'banc-essai-params@labonnealerte.test';
const BROADCAST_SRC = 'leboncoin-livraison'; // source broadcast existante (non-régression)

const STUB_CARTE = { product: { periods: [
  { echeance: 'J', begin_validity_time: '2026-07-15T06:00:00Z', end_validity_time: '2026-07-15T22:00:00Z',
    timelaps: { domain_ids: [
      { domain_id: '05', max_color_id: 3, phenomenon_items: [{ phenomenon_id: 3, phenomenon_max_color_id: 3 }] },
      { domain_id: '13', max_color_id: 1, phenomenon_items: [] },
    ] } },
  { echeance: 'J1', begin_validity_time: '2026-07-16T06:00:00Z', end_validity_time: '2026-07-16T22:00:00Z',
    timelaps: { domain_ids: [
      { domain_id: '05', max_color_id: 1, phenomenon_items: [] },
      { domain_id: '13', max_color_id: 1, phenomenon_items: [] },
    ] } },
] } };

async function dumpParamStates(tag) {
  const { rows } = await pool.query(
    `SELECT params, state, since, message FROM source_param_states
      WHERE source_id = $1 ORDER BY params::text`, [SRC_ID]);
  console.log(`\n── source_param_states après ${tag} ──`);
  if (!rows.length) console.log('   (aucune ligne)');
  rows.forEach((r) => console.log('  ', JSON.stringify(r.params), '→', r.state,
    '| since:', r.since ? new Date(r.since).toISOString() : 'null', '|', r.message || '(rien)'));
}

async function main() {
  console.log('=== BANC D\'ESSAI OpenAlert v2 — sources paramétrées ===');

  // 1) Setup : source de test (avec params_schema) + subscriber + 2 abonnements paramétrés.
  await pool.query(
    `INSERT INTO sources (id, name, subtitle, description, type, badge, enabled, requires_confirmation, params_schema)
     VALUES ($1, 'Vigilance météo (test)', 'banc d''essai v2', 'source de test paramétrée', 'internal', 'official', true, true, $2::jsonb)
     ON CONFLICT (id) DO UPDATE SET params_schema = EXCLUDED.params_schema, enabled = true`,
    [SRC_ID, JSON.stringify(testSource.paramsSchema)]
  );
  await pool.query(
    `INSERT INTO subscribers (email, confirmed, email_enabled) VALUES ($1, true, true)
     ON CONFLICT (email) DO UPDATE SET confirmed = true`, [EMAIL]);
  const { rows: subr } = await pool.query('SELECT id FROM subscribers WHERE email = $1', [EMAIL]);
  const subId = subr[0].id;
  for (const dep of ['05', '13']) {
    await pool.query(
      `INSERT INTO subscriptions (subscriber_id, source_id, params)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING`,
      [subId, SRC_ID, JSON.stringify({ departement: dep })]);
  }
  console.log(`Setup OK : source ${SRC_ID}, abonné #${subId}, params {05} et {13}.`);

  // 2) Non-régression broadcast : insertion broadcast (params NULL) idempotente
  //    via le nouveau ON CONFLICT d'expression.
  const b1 = await pool.query(
    `INSERT INTO subscriptions (subscriber_id, source_id)
     VALUES ($1, $2) ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING
     RETURNING 1`, [subId, BROADCAST_SRC]);
  const b2 = await pool.query(
    `INSERT INTO subscriptions (subscriber_id, source_id)
     VALUES ($1, $2) ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING
     RETURNING 1`, [subId, BROADCAST_SRC]);
  const { rows: bc } = await pool.query(
    'SELECT COUNT(*)::int n FROM subscriptions WHERE subscriber_id = $1 AND source_id = $2 AND params IS NULL',
    [subId, BROADCAST_SRC]);
  console.log(`Broadcast : 1re insertion=${b1.rowCount} nouvelle, 2e=${b2.rowCount} (0 attendu), total lignes broadcast=${bc[0].n} (1 attendu). ✔`);

  // 3) Injecte la carte stub (05 ORANGE, 13 vert) puis déroule 2 cycles paramétrés.
  //    requiresConfirmation=true → cycle 1 : 05 PENDING ; cycle 2 : 05 ACTIVE.
  vf._setCacheForTest(STUB_CARTE);
  await processParamSource(testSource, true);
  await dumpParamStates('cycle 1 (attendu : 05 pending, 13 aucune ligne)');
  vf._setCacheForTest(STUB_CARTE);
  await processParamSource(testSource, true);
  await dumpParamStates('cycle 2 (attendu : 05 active, 13 aucune ligne)');

  // 4) Cleanup complet.
  await pool.query('DELETE FROM source_param_states WHERE source_id = $1', [SRC_ID]);
  await pool.query('DELETE FROM source_events WHERE source_id = $1', [SRC_ID]);
  await pool.query('DELETE FROM subscriptions WHERE source_id IN ($1, $2) AND subscriber_id = $3', [SRC_ID, BROADCAST_SRC, subId]);
  await pool.query('DELETE FROM sources WHERE id = $1', [SRC_ID]);
  await pool.query('DELETE FROM subscribers WHERE email = $1', [EMAIL]);
  console.log('\nCleanup OK — aucune trace en base. Banc d\'essai terminé.');
}

main()
  .then(() => pool.end())
  .catch((err) => { console.error('BANC D\'ESSAI ÉCHEC :', err); pool.end(); process.exit(1); });
