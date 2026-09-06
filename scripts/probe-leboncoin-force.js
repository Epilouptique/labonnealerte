// scripts/probe-leboncoin-force.js
// ─────────────────────────────────────────────────────────────────────────────
// SONDE MANUELLE — déclenchement hors fenêtre de server/leboncoin-promo-probe.js.
//
// POURQUOI : la sonde d'observation ne tourne que le vendredi 13:58–15:00 (Europe/
// Paris), fenêtre calée sur l'horaire habituel de la promo. Quand la promo « livraison
// Mondial Relay 0,99 € » tombe en dehors (un dimanche, par exemple), la fenêtre nous
// fait rater le seul moment où l'on peut observer un VRAI positif. Ce script rejoue
// exactement le même code avec { force: true } — aucune logique de détection dupliquée.
//
//   node scripts/probe-leboncoin-force.js
//
// CE QU'IL FAIT EN BASE : uniquement les INSERT de promo_probe_log faits par la sonde
// elle-même (table append-only de diagnostic), plus un SELECT de relecture. Aucun
// UPDATE, aucun DELETE, et AUCUNE alerte n'est envoyée aux abonnés : la source
// leboncoin-livraison reste neutralisée pendant la phase d'observation.
//
// Le .env local pointe la DB de PROD — c'est voulu ici, on veut l'observation dans le
// même historique que les passages automatiques (jamais `railway run`).
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const { pool } = require('../server/db');
const { runProbe, inWindow } = require('../server/leboncoin-promo-probe');

(async () => {
  try {
    console.log('====================================================');
    console.log('SONDE MANUELLE — promo leboncoin « Mondial Relay 0,99 € »');
    console.log('Écrit en PROD dans promo_probe_log (append-only, sans risque).');
    console.log('Aucune alerte abonné : observation seule.');
    console.log('====================================================\n');

    console.log('Fenêtre automatique (vendredi 13:58–15:00) actuellement :',
      inWindow() ? 'OUVERTE' : 'FERMÉE → bypass via { force: true }');
    console.log('Heure locale :', new Date().toISOString(), '\n');

    const out = await runProbe(pool, { force: true });

    if (out.skipped) {
      // Ne devrait jamais arriver avec force:true — filet au cas où la signature change.
      console.error('\nSonde IGNORÉE (raison :', out.reason, ') — { force: true } sans effet ?');
      process.exitCode = 1;
      return;
    }

    console.log('\n─── RÉSULTATS DES DEUX PISTES ──────────────────────');
    for (const r of out.results) {
      console.log(`\n[${r.probe}]`);
      console.log('  detected   :', r.detected);
      console.log('  http_status:', r.http_status);
      console.log('  blocked    :', r.blocked);
      console.log('  latency_ms :', r.latency_ms);
      console.log('  detail     :', JSON.stringify(r.detail, null, 2).split('\n').join('\n  '));
    }
    if (out.results.length < 2) {
      console.warn('\n⚠ Moins de 2 résultats : une sonde a levé une exception (voir plus haut).');
    }

    // Relecture : confirme que les lignes sont bien arrivées en base (logProbe avale
    // silencieusement ses erreurs d'écriture, donc on vérifie plutôt que de supposer).
    console.log('\n─── 4 DERNIÈRES LIGNES DE promo_probe_log ──────────');
    const { rows } = await pool.query(
      `SELECT id, probed_at, probe, detected, http_status, blocked, latency_ms, detail
         FROM promo_probe_log
        ORDER BY id DESC
        LIMIT 4`
    );
    if (!rows.length) {
      console.log('  (table vide — aucune écriture n\'a abouti)');
    } else {
      for (const r of rows) {
        console.log(`  #${r.id} ${new Date(r.probed_at).toISOString()} ${r.probe}`
          + ` detected=${r.detected} http=${r.http_status} blocked=${r.blocked} (${r.latency_ms}ms)`);
        console.log('     detail:', JSON.stringify(r.detail));
      }
    }
    console.log('');
  } catch (err) {
    console.error('\nÉCHEC :', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
