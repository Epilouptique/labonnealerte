// scripts/reset-likes.js
// ─────────────────────────────────────────────────────────────────────────────
// REMISE À ZÉRO de sources.likes_count, avec SAUVEGARDE PRÉALABLE.
//
// POURQUOI : jusqu'au 14/08/2026, likes_count était un compteur incrémenté sans
// aucune dédup serveur (cf. commentaire de source_likes dans init.sql). L'historique
// « qui a aimé quoi » n'a JAMAIS été enregistré : il est donc IMPOSSIBLE de le
// reconstituer. Le seul état honnête après la bascule est 0 partout, la table
// source_likes repartant vide. Décision Hugo (14/08) : remise à zéro franche, pas de
// colonne likes_legacy qui traînerait indéfiniment dans les affichages.
//
// RÉVERSIBILITÉ : les valeurs sont écrites dans un fichier JSON horodaté AVANT toute
// écriture. Le fichier contient le SQL de restauration, prêt à copier.
//
//   node scripts/reset-likes.js --check    (rapport + sauvegarde, N'ÉCRIT RIEN en base)
//   node scripts/reset-likes.js --apply    (sauvegarde puis remise à zéro, transaction)
//
// Sans argument : refuse de s'exécuter (pas de mode par défaut sur un script d'écriture).
// Aucune commande SQL n'est à taper à la main dans la console Railway : tout passe ici,
// avec un WHERE explicite et une auto-vérification AVANT le COMMIT.
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/db');

const CHECK = process.argv.includes('--check');
const APPLY = process.argv.includes('--apply');

(async () => {
  let client;
  try {
    if (CHECK === APPLY) { // ni l'un ni l'autre, ou les deux
      console.error('Usage : node scripts/reset-likes.js --check   (puis)   --apply');
      process.exitCode = 2;
      return;
    }
    console.log('====================================================');
    console.log(APPLY ? 'MODE : --apply (ÉCRIT en base)' : 'MODE : --check (aucune écriture)');
    console.log('====================================================');

    // 1) État courant — la sauvegarde porte sur les lignes NON NULLES uniquement :
    //    remettre à 0 ce qui vaut déjà 0 n'a rien à restaurer.
    const { rows } = await pool.query(
      'SELECT id, likes_count FROM sources WHERE likes_count > 0 ORDER BY likes_count DESC, id');
    const total = rows.reduce((a, r) => a + r.likes_count, 0);
    console.log('Sources avec likes_count > 0 : ' + rows.length + ' (total ' + total + ' likes)');
    rows.forEach((r) => console.log('   ' + String(r.likes_count).padStart(5) + '  ' + r.id));

    // La table peut ne pas exister encore : en --check (lancé AVANT le migrate), c'est
    // le cas NORMAL. On le dit clairement au lieu de planter sur une erreur Postgres,
    // mais on refuse le --apply tant que la migration n'est pas passée.
    const t = await pool.query(
      `SELECT to_regclass('public.source_likes') IS NOT NULL AS existe`);
    if (!t.rows[0].existe) {
      console.log('\nTable source_likes : ABSENTE de cette base.');
      console.log('  → normal AVANT `node server/db/migrate.js` (la migration est dans init.sql).');
      if (APPLY) {
        console.error('\n❌ REFUS du --apply : lancez d\'abord node server/db/migrate.js.');
        process.exitCode = 1;
        return;
      }
    }
    const dejaLies = t.rows[0].existe
      ? await pool.query('SELECT COUNT(*)::int AS n FROM source_likes')
      : { rows: [{ n: 0 }] };
    console.log('Lignes dans source_likes : ' + dejaLies.rows[0].n);
    if (dejaLies.rows[0].n > 0) {
      // La table est déjà alimentée : une remise à zéro écraserait des likes RÉELS.
      // On refuse — ce script ne sert qu'à la bascule initiale.
      console.error('\n❌ REFUS : source_likes n\'est pas vide (' + dejaLies.rows[0].n + ' ligne(s)).');
      console.error('   Ce script est réservé à la BASCULE INITIALE. Des likes réels existent :');
      console.error('   les remettre à zéro les détruirait. Rien n\'a été écrit.');
      process.exitCode = 1;
      return;
    }

    // 2) SAUVEGARDE sur disque AVANT toute écriture — y compris en --check, pour que le
    //    fichier existe et soit relisible bien avant de lancer l'--apply.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(__dirname, '..', 'rapports');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'sauvegarde-likes-' + stamp + '.json');
    const restoreSql = rows.map((r) =>
      `UPDATE sources SET likes_count = ${r.likes_count} WHERE id = '${r.id}';`).join('\n');
    fs.writeFileSync(file, JSON.stringify({
      genere_le: new Date().toISOString(),
      raison: 'Bascule vers source_likes (dédup par compte) — likes_count remis a 0.',
      note: 'Historique "qui a like quoi" NON reconstituable : seul le total par source est sauve.',
      total_likes: total,
      valeurs: rows,
      sql_de_restauration: restoreSql,
    }, null, 2), 'utf8');
    console.log('\n💾 Sauvegarde écrite : ' + path.relative(path.join(__dirname, '..'), file));

    if (!APPLY) {
      console.log('\n>>> --check : AUCUNE écriture en base. Relance avec --apply pour exécuter. <<<');
      return;
    }

    // 3) Écriture : transaction, WHERE EXPLICITE (jamais d'UPDATE nu), recalcul depuis
    //    source_likes plutôt qu'un « = 0 » en dur → la même requête restera juste le jour
    //    où la table sera peuplée.
    console.log('\n>>> ÉCRITURE en cours (transaction)… <<<');
    client = await pool.connect();
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE sources s
          SET likes_count = (SELECT COUNT(*) FROM source_likes sl WHERE sl.source_id = s.id)
        WHERE s.likes_count <> (SELECT COUNT(*) FROM source_likes sl WHERE sl.source_id = s.id)`);
    console.log('Lignes mises à jour : ' + upd.rowCount);

    // 4) AUTO-VÉRIFICATION AVANT LE COMMIT : si un invariant n'est pas tenu, on ROLLBACK.
    const v1 = await client.query('SELECT COUNT(*)::int AS n FROM sources WHERE likes_count <> 0');
    const v2 = await client.query('SELECT COUNT(*)::int AS n FROM source_likes');
    console.log('Vérif : sources à likes_count ≠ 0 → ' + v1.rows[0].n + ' | lignes source_likes → ' + v2.rows[0].n);
    if (v1.rows[0].n !== 0 || v2.rows[0].n !== 0) {
      await client.query('ROLLBACK');
      console.error('❌ INVARIANT NON TENU → ROLLBACK, rien n\'a été modifié.');
      process.exitCode = 1;
      return;
    }
    await client.query('COMMIT');
    console.log('✅ COMMIT OK — tous les likes_count sont à 0, source_likes prend le relais.');
    console.log('   Restauration possible depuis ' + path.basename(file) + ' (champ sql_de_restauration).');
  } catch (e) {
    if (client) { try { await client.query('ROLLBACK'); console.error('ROLLBACK effectué.'); } catch (_) {} }
    console.error('❌ ÉCHEC :', e.stack || e.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
    console.log('Terminé — code de sortie : ' + (process.exitCode || 0));
  }
})();
