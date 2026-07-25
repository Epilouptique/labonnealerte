// scripts/apply-descriptions.js — JETABLE.
// Applique les descriptions courtes reecrites (descriptions-courtes-reecrites.md, a la
// racine) dans sources.description. VERIFS STRICTES avant toute ecriture ; UNE SEULE
// transaction (pattern skins.js : client dedie, BEGIN/COMMIT, ROLLBACK sur erreur).
// N'ecrit AUCUN autre champ (description_long intacte). NE MODIFIE PAS init.sql
// (coherence du seed : voir scripts/sync-init-descriptions.js).
//   node scripts/apply-descriptions.js           (.env pointe la PROD : applique)
//   node scripts/apply-descriptions.js --check    (verifs seules, lecture seule, N'ECRIT RIEN)
//
// Note : les UPDATE sont parametres ($1/$2) -> node-postgres echappe lui-meme les
// apostrophes/guillemets francais. Aucun echappement SQL manuel cote base.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/db');

const FILE = path.join(__dirname, '..', 'descriptions-courtes-reecrites.md');
const EXPECTED = 238;
const MAX = 120;

// Parse le markdown : `## id` puis la description sur la/les ligne(s) suivante(s),
// jusqu'au prochain `## ` (ou fin). Ignore le preambule (avant le 1er `## `).
function parseFile(md) {
  const map = new Map();
  let curId = null, buf = [];
  const flush = () => {
    if (curId !== null) {
      const desc = buf.join(' ').replace(/\s+/g, ' ').trim();
      if (map.has(curId)) throw new Error('id en double dans le fichier : ' + curId);
      map.set(curId, desc);
    }
    buf = [];
  };
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^##\s+([a-z0-9-]+)\s*$/);
    if (m) { flush(); curId = m[1]; }
    else if (curId !== null) { buf.push(line); }
  }
  flush();
  return map;
}

(async () => {
  let client;
  try {
    const map = parseFile(fs.readFileSync(FILE, 'utf8'));
    console.log('Parse : ' + map.size + ' descriptions.');

    // Verif 1 : compte exact.
    if (map.size !== EXPECTED) throw new Error('Compte parse = ' + map.size + ', attendu ' + EXPECTED);

    // Verif 2 : longueur <= 120 (en points de code, comme char_length de Postgres).
    const tooLong = [];
    const empty = [];
    for (const [id, d] of map) {
      const len = Array.from(d).length;
      if (len > MAX) tooLong.push(id + ' (' + len + ')');
      if (len === 0) empty.push(id);
    }
    if (empty.length) throw new Error('Descriptions vides : ' + empty.join(', '));
    if (tooLong.length) throw new Error('Descriptions > ' + MAX + ' :\n  ' + tooLong.join('\n  '));

    // Verif 3 : chaque id existe dans sources.
    const ids = [...map.keys()];
    const { rows } = await pool.query('SELECT id FROM sources WHERE id = ANY($1)', [ids]);
    const known = new Set(rows.map((r) => r.id));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length) {
      throw new Error('ids INCONNUS dans sources (' + unknown.length + ') :\n  ' + unknown.join('\n  '));
    }
    console.log('Verifs OK : ' + EXPECTED + ' descriptions, toutes <= ' + MAX + ', tous les ids existent.');

    if (process.argv.includes('--check')) { console.log('--check : verifs seules, aucune ecriture.'); return; }

    // Ecriture : une seule transaction.
    client = await pool.connect();
    await client.query('BEGIN');
    let n = 0;
    for (const [id, d] of map) {
      const r = await client.query('UPDATE sources SET description = $1 WHERE id = $2', [d, id]);
      n += r.rowCount;
    }
    await client.query('COMMIT');
    console.log('COMMIT OK : ' + n + ' ligne(s) mise(s) a jour. ids non trouves : ' + unknown.length + ' (0 attendu).');
    if (n !== EXPECTED) console.warn('ATTENTION : ' + n + ' UPDATE effectifs != ' + EXPECTED + ' (id present mais rowCount 0 ?).');
  } catch (e) {
    if (client) { try { await client.query('ROLLBACK'); console.error('ROLLBACK effectue (aucune ecriture conservee).'); } catch (_) {} }
    console.error('ECHEC :', e.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
})();
