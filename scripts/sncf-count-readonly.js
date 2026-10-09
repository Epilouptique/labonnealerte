// scripts/sncf-count-readonly.js — LECTURE SEULE. Compte les abonnements à sncf-perturbations.
// Aucun UPDATE/DELETE. Connexion via process.env.DATABASE_URL (passer l'URL publique du service
// Postgres en préfixe, sans l'afficher). Exemple :
//   DATABASE_URL="$(railway variables --service 'Postgres-la bonne alerte' --kv | grep '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)" node scripts/sncf-count-readonly.js
const { Pool } = require('pg');

(async () => {
  const cs = process.env.DATABASE_URL;
  if (!cs) { console.error('DATABASE_URL manquant'); process.exit(2); }
  // Proxy TCP Railway : SSL non requis ; on désactive la vérification stricte au cas où.
  const pool = new Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  try {
    const q = (sql) => pool.query(sql).then((r) => r.rows[0].n);
    const subs = await q("SELECT COUNT(*)::int AS n FROM subscriptions WHERE source_id = 'sncf-perturbations'");
    const distinct = await q("SELECT COUNT(DISTINCT subscriber_id)::int AS n FROM subscriptions WHERE source_id = 'sncf-perturbations'");
    const fav = await q("SELECT COUNT(*)::int AS n FROM favorites WHERE source_id = 'sncf-perturbations'");
    console.log('SUBS=' + subs, 'DISTINCT=' + distinct, 'FAV=' + fav);
  } catch (e) {
    console.error('ERR', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
