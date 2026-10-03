// scripts/iplocate-quota-readonly.js
// ─────────────────────────────────────────────────────────────────────────────
// QUOTA IPLOCATE — LECTURE SEULE.
//
// N'exécute QUE des SELECT (aucun INSERT / UPDATE / DELETE), comme
// scripts/veille-readonly.js : le .env local pointe la base de PRODUCTION.
//
// Affiche les appels IPLocate par jour (compteurs `iplocate_YYYYMMDD` écrits par
// server/iplocate-quota.js), avec le budget de 1000/jour et le seuil d'alerte à 80 %.
//
// Usage : node scripts/iplocate-quota-readonly.js [nombre_de_jours]   (défaut : 14)
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config({ quiet: true });
const { Pool } = require('pg');

const DAILY_BUDGET = 1000;
const WARN_AT = Math.floor(DAILY_BUDGET * 0.8);
const DAYS = Math.max(1, Math.min(365, parseInt(process.argv[2], 10) || 14));

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

function fmtDay(key) {
  const d = key.replace('iplocate_', '');
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

(async () => {
  const { rows } = await pool.query(
    "SELECT key, value FROM counters WHERE key LIKE 'iplocate\\_%' ORDER BY key DESC LIMIT $1",
    [DAYS]
  );
  console.log(`Quota IPLocate — budget ${DAILY_BUDGET} appels/jour, alerte à ${WARN_AT} (80 %)`);
  if (rows.length === 0) {
    console.log('(aucun appel compté — compteur en place depuis le fil #9bis, rien avant)');
  }
  let depassements = 0;
  for (const r of rows) {
    const n = Number(r.value);
    const etat = n >= DAILY_BUDGET ? 'BUDGET ATTEINT' : (n >= WARN_AT ? 'ALERTE 80 %' : 'ok');
    if (n >= WARN_AT) depassements++;
    const barre = '#'.repeat(Math.min(40, Math.round((n / DAILY_BUDGET) * 40)));
    console.log(`${fmtDay(r.key)}  ${String(n).padStart(5)} / ${DAILY_BUDGET}  ${barre.padEnd(40)} ${etat}`);
  }
  console.log(depassements
    ? `\n${depassements} jour(s) au-dessus du seuil d'alerte sur les ${rows.length} relevés.`
    : `\nAucun jour au-dessus du seuil d'alerte sur les ${rows.length} relevés.`);
  await pool.end();
})().catch((err) => { console.error('Erreur :', err.message); process.exit(1); });
