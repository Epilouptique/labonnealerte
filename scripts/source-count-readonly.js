// scripts/source-count-readonly.js — LECTURE SEULE. Compte abonnements/abonnés/favoris d'une
// source donnée. Aucun UPDATE/DELETE. Connexion via process.env.DATABASE_URL (passer l'URL
// publique du service Postgres en préfixe, sans l'afficher). Exemple :
//   DATABASE_URL="$(railway variables --service 'Postgres-la bonne alerte' --kv | grep '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)" node scripts/source-count-readonly.js eruption-volcanique
const { Pool } = require('pg');

(async () => {
  const id = process.argv[2];
  const cs = process.env.DATABASE_URL;
  if (!id) { console.error('Usage: node scripts/source-count-readonly.js <source_id>'); process.exit(2); }
  if (!cs) { console.error('DATABASE_URL manquant'); process.exit(2); }
  const pool = new Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  try {
    const q = (sql) => pool.query(sql, [id]).then((r) => r.rows[0].n);
    const subs = await q("SELECT COUNT(*)::int AS n FROM subscriptions WHERE source_id = $1");
    const distinct = await q("SELECT COUNT(DISTINCT subscriber_id)::int AS n FROM subscriptions WHERE source_id = $1");
    const fav = await q("SELECT COUNT(*)::int AS n FROM favorites WHERE source_id = $1");
    console.log(id + ' => SUBS=' + subs, 'DISTINCT=' + distinct, 'FAV=' + fav);
  } catch (e) {
    console.error('ERR', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
