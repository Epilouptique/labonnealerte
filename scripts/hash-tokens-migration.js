// scripts/hash-tokens-migration.js — CONVERSION PHASE 2 (jetons en clair → empreinte HMAC).
// Chantier sécurité « jetons en empreinte », cf. rapports/audit/securite-jetons-empreinte-plan-2026-10-08.md
//
//   node scripts/hash-tokens-migration.js            → DRY-RUN (défaut, AUCUNE écriture)
//   node scripts/hash-tokens-migration.js --write     → ÉCRITURE réelle (transaction)
//
// LIVRÉ NON EXÉCUTÉ. À lancer seulement APRÈS :
//   1) déploiement de la phase 1 (écriture en empreinte + lecture par ANY([empreinte, brut])),
//   2) variable TOKEN_HASH_SECRET posée (la MÊME que celle du serveur),
//   3) élargissement des colonnes (ALTER … TYPE VARCHAR(80)) — voir le plan.
//
// Garde-fous (imposés par le cahier des charges) :
//   - bannière de mode en tête ; DRY-RUN par défaut, écriture seulement sur --write explicite ;
//   - PAS d'UPDATE nu : chaque UPDATE porte WHERE <col> = $brut AND <col> NOT LIKE 'h1:%'
//     (une seule ligne ciblée, idempotent, rejouable — les lignes déjà converties sont exclues) ;
//   - sélection contrôlée : on ne lit QUE les lignes encore en clair (NOT LIKE 'h1:%') ;
//   - HMAC calculé en Node (le secret n'entre JAMAIS dans une requête SQL ni dans les logs) ;
//   - transaction + ROLLBACK sur erreur + code de sortie ;
//   - auto-vérification post-commit (0 ligne en clair restante sur le périmètre traité +
//     un échantillon converti est bien retrouvable par son empreinte) ;
//   - aucun jeton (brut ni empreinte) n'est écrit dans les logs.

require('dotenv').config();
const crypto = require('crypto');
const { pool } = require('../server/db');

const WRITE = process.argv.includes('--write');

// ---- Empreinte (identique au module serveur proposé en phase 1) -----------------
const SECRET = (process.env.TOKEN_HASH_SECRET || '').trim();
const PREFIX = 'h1:';
const RAW_RE = /^[0-9a-f]{64}$/i;

function fingerprint(raw) {
  if (typeof raw !== 'string' || !RAW_RE.test(raw)) return null;
  return PREFIX + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
}

// Tables/colonnes à convertir. `where` restreint au périmètre « encore en clair ».
// id = colonne de clé pour l'auto-vérif par échantillon (PK de la table).
const TARGETS = [
  { table: 'sessions',   col: 'token',         id: 'token' },
  { table: 'subscribers', col: 'token',         id: 'id' },
  { table: 'subscribers', col: 'magic_token',   id: 'id' },
  { table: 'user_tasks',  col: 'confirm_token', id: 'id' },
];

async function convertTarget(client, t, counters) {
  const { table, col, id } = t;
  // Sélection contrôlée : non NULL et pas déjà convertie.
  const sel = await client.query(
    `SELECT ${id} AS k, ${col} AS raw FROM ${table}
      WHERE ${col} IS NOT NULL AND ${col} NOT LIKE '${PREFIX}%'`
  );
  const rows = sel.rows;
  let malformed = 0;
  console.log(`\n[${table}.${col}] en clair : ${rows.length} ligne(s).`);

  if (!WRITE) {
    for (const r of rows) if (!fingerprint(r.raw)) malformed++;
    console.log(`  DRY-RUN : ${rows.length} à convertir, ${malformed} de forme inattendue (seraient IGNORÉES).`);
    counters.planned += rows.length - malformed;
    counters.malformed += malformed;
    return;
  }

  let done = 0;
  for (const r of rows) {
    const fp = fingerprint(r.raw);
    if (!fp) { malformed++; continue; } // forme inattendue → on NE touche PAS la ligne
    // PAS d'UPDATE nu : ciblage par valeur brute + exclusion des déjà-converties.
    const u = await client.query(
      `UPDATE ${table} SET ${col} = $1 WHERE ${col} = $2 AND ${col} NOT LIKE '${PREFIX}%'`,
      [fp, r.raw]
    );
    done += u.rowCount;
  }
  console.log(`  ÉCRITURE : ${done} converti(s), ${malformed} ignoré(s) (forme inattendue).`);
  counters.written += done;
  counters.malformed += malformed;

  // Auto-vérif 1 : plus aucune ligne en clair sur ce périmètre.
  const left = await client.query(
    `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${col} IS NOT NULL AND ${col} NOT LIKE '${PREFIX}%'`
  );
  const nLeft = left.rows[0].n;
  console.log(`  🔎 restant en clair : ${nLeft} (hors ${malformed} de forme inattendue).`);
  if (nLeft - malformed > 0) throw new Error(`[${table}.${col}] ${nLeft} lignes toujours en clair après conversion.`);

  // Auto-vérif 2 : un échantillon converti est bien retrouvable par son empreinte.
  if (rows.length) {
    const sample = rows.find((r) => fingerprint(r.raw));
    if (sample) {
      const fp = fingerprint(sample.raw);
      const chk = await client.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${col} = $1`, [fp]);
      if (chk.rows[0].n < 1) throw new Error(`[${table}.${col}] empreinte d'échantillon introuvable — conversion incohérente.`);
      console.log('  🔎 échantillon retrouvé par empreinte : OK.');
    }
  }
}

// Guardé : un `require` depuis les tests importe fingerprint SANS lancer la conversion
// ni ouvrir de connexion base. Ne s'exécute qu'en invocation directe (node scripts/…).
if (require.main === module) main();

async function main() {
  console.log('====================================================');
  console.log(WRITE ? 'MODE : ÉCRITURE (écrit en base, transaction)' : 'MODE : DRY-RUN (--write absent, AUCUNE écriture)');
  console.log('CONVERSION JETONS → EMPREINTE HMAC (phase 2)');
  console.log('====================================================');

  if (!SECRET) {
    console.error('❌ TOKEN_HASH_SECRET manquant : posez la MÊME clé que le serveur avant de lancer.');
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const counters = { planned: 0, written: 0, malformed: 0 };
  let client;
  try {
    client = await pool.connect();
    if (WRITE) await client.query('BEGIN');
    for (const t of TARGETS) await convertTarget(client, t, counters);
    if (WRITE) {
      await client.query('COMMIT');
      console.log(`\n✅ COMMIT OK : ${counters.written} jeton(s) converti(s), ${counters.malformed} ignoré(s).`);
    } else {
      console.log(`\n>>> DRY-RUN : ${counters.planned} à convertir, ${counters.malformed} de forme inattendue.`);
      console.log('>>> Relance avec --write pour écrire réellement. <<<');
    }
  } catch (e) {
    if (client && WRITE) { try { await client.query('ROLLBACK'); console.error('ROLLBACK (aucune écriture conservée).'); } catch (_) {} }
    console.error('❌ ÉCHEC :', e.stack || e.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
    console.log('Terminé — code de sortie : ' + (process.exitCode || 0));
  }
}

// Exporté pour les tests (scripts/test-token-hash.js).
module.exports = { fingerprint, PREFIX, RAW_RE };
