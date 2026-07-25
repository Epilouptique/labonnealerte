// scripts/sync-init-descriptions.js — JETABLE.
// Aligne les descriptions du SEED (server/db/init.sql) sur descriptions-courtes-reecrites.md.
// POURQUOI : les INSERT INTO sources sont insert-only (SELECT ... WHERE NOT EXISTS) -> un
// migrate.js NE reecrit PAS une base existante (donc pas de risque de reintroduire les
// anciennes descriptions en prod). MAIS le seed doit refleter la verite pour une INSTALL
// NEUVE. Ce script remplace, dans chaque bloc INSERT d'une source, le 4e litteral chaine
// (= la description ; ordre garanti id, name, subtitle, description ; subtitle jamais NULL).
//
// SANS ecriture par defaut (dry-run : rapport des changements). Ecrit init.sql avec --write.
//   node scripts/sync-init-descriptions.js            (dry-run)
//   node scripts/sync-init-descriptions.js --write    (applique dans init.sql)
//
// N'ouvre AUCUNE connexion DB. Echappe les apostrophes SQL ('' pour un litteral standard).

const fs = require('fs');
const path = require('path');

const MD = path.join(__dirname, '..', 'descriptions-courtes-reecrites.md');
const SQL = path.join(__dirname, '..', 'server', 'db', 'init.sql');
const WRITE = process.argv.includes('--write');
const MAX = 120;

function parseFile(md) {
  const map = new Map();
  let curId = null, buf = [];
  const flush = () => {
    if (curId !== null) {
      const d = buf.join(' ').replace(/\s+/g, ' ').trim();
      if (map.has(curId)) throw new Error('id en double : ' + curId);
      map.set(curId, d);
    }
    buf = [];
  };
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^##\s+([a-z0-9-]+)\s*$/);
    if (m) { flush(); curId = m[1]; }
    else if (curId !== null) buf.push(line);
  }
  flush();
  return map;
}

// Dans `region` (texte du SELECT, apres 'SELECT' et avant 'WHERE NOT EXISTS'), remplace le
// contenu du Nieme litteral chaine SQL (gestion des '' echappes). Renvoie { text, old } ou null.
function replaceNthLiteral(region, n, newInner) {
  let i = 0, count = 0, inStr = false, start = -1;
  while (i < region.length) {
    const ch = region[i];
    if (!inStr) {
      if (ch === "'") { inStr = true; start = i; }
      i++;
    } else if (ch === "'") {
      if (region[i + 1] === "'") { i += 2; continue; } // '' = apostrophe echappee
      count++;
      if (count === n) {
        const oldInner = region.slice(start + 1, i);
        return { text: region.slice(0, start) + "'" + newInner + "'" + region.slice(i + 1), old: oldInner };
      }
      inStr = false; i++;
    } else { i++; }
  }
  return null;
}

function main() {
  const map = parseFile(fs.readFileSync(MD, 'utf8'));
  if (map.size !== 238) throw new Error('Compte parse = ' + map.size + ', attendu 238');
  for (const [id, d] of map) {
    if (Array.from(d).length > MAX) throw new Error('Description > ' + MAX + ' : ' + id);
    if (!d) throw new Error('Description vide : ' + id);
  }

  let sql = fs.readFileSync(SQL, 'utf8');
  const changed = [];
  const notFound = [];
  const parseErr = [];

  for (const [id, desc] of map) {
    const anchor = "WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = '" + id + "')";
    const anchorIdx = sql.indexOf(anchor);
    if (anchorIdx === -1) { notFound.push(id); continue; }
    const insertIdx = sql.lastIndexOf('INSERT INTO sources (', anchorIdx);
    if (insertIdx === -1) { parseErr.push(id + ' (INSERT introuvable)'); continue; }
    const colClose = sql.indexOf(')', insertIdx);          // fin de la liste de colonnes
    const selIdx = sql.indexOf('SELECT', colClose);        // debut du SELECT de valeurs
    if (selIdx === -1 || selIdx > anchorIdx) { parseErr.push(id + ' (SELECT introuvable)'); continue; }
    const regionStart = selIdx + 'SELECT'.length;
    const region = sql.slice(regionStart, anchorIdx);
    const esc = desc.replace(/'/g, "''");
    const res = replaceNthLiteral(region, 4, esc);          // 4e litteral = description
    if (!res) { parseErr.push(id + ' (4e litteral introuvable)'); continue; }
    if (res.old === esc) { continue; }                      // deja a jour
    sql = sql.slice(0, regionStart) + res.text + sql.slice(anchorIdx);
    changed.push({ id, oldLen: res.old.length, newLen: esc.length });
  }

  console.log('--- sync-init-descriptions (' + (WRITE ? 'WRITE' : 'DRY-RUN') + ') ---');
  console.log('A remplacer : ' + changed.length + ' / 238');
  if (notFound.length) console.log('NON TROUVES dans le seed (ignores) : ' + notFound.join(', ')
    + '  <- attendu pour veille-artiste-spotify (orphelin absent d\'init.sql).');
  if (parseErr.length) {
    console.error('ERREURS DE PARSE (aucune ecriture) :\n  ' + parseErr.join('\n  '));
    process.exitCode = 1; return;
  }

  if (WRITE) {
    fs.writeFileSync(SQL, sql, 'utf8');
    console.log('init.sql reecrit (' + changed.length + ' descriptions).');
  } else {
    console.log('Dry-run : rien ecrit. Relancer avec --write pour appliquer.');
    console.log('Apercu (3 premiers) :');
    changed.slice(0, 3).forEach((c) => console.log('  ' + c.id + ' : ' + c.oldLen + ' -> ' + c.newLen + ' car.'));
  }
}

try { main(); } catch (e) { console.error('ECHEC :', e.message); process.exitCode = 1; }
