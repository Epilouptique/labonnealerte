// scripts/test-token-hash.js — TESTS du chantier « jetons en empreinte », phase 1.
// Lancer : node scripts/test-token-hash.js   (nécessite TOKEN_HASH_SECRET dans l'env/.env)
//
// Ne touche AUCUNE base réelle : on importe le module de production server/token-hash.js et
// on simule la base par une Map. On couvre les DEUX familles hachées en phase 1 :
//   A) sessions.token           — stockée en empreinte, rendue brute au client, vérifiée en Bearer
//   B) subscribers.magic_token  — stockée en empreinte, e-mailée brute, échangée en session
// ainsi que le repli sur le clair (lignes legacy non encore converties) et le flux de
// connexion par code de l'app (brut gardé en mémoire, empreinte en base).

require('dotenv').config(); // charge TOKEN_HASH_SECRET depuis .env (local)
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { fingerprint, isFingerprint, lookupCandidates, PREFIX, RAW_RE } = require('../server/token-hash');
const mig = require('./hash-tokens-migration'); // doit exposer la MÊME empreinte

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.message || e)); process.exitCode = 1; }
}

const rawToken = () => crypto.randomBytes(32).toString('hex');

// Simule « WHERE col = ANY(lookupCandidates(raw)) » sur une Map {clé -> valeur stockée}.
function dbMatch(store, raw) {
  const cands = lookupCandidates(raw);
  for (const [k, stored] of store) if (cands.includes(stored)) return k;
  return null;
}

console.log('TESTS token-hash (phase 1)');

/* ---- empreinte ---- */
test('fingerprint déterministe', () => {
  const t = rawToken();
  assert.strictEqual(fingerprint(t), fingerprint(t));
});
test('fingerprint préfixée h1: et longueur attendue (h1: + 64 hex)', () => {
  const fp = fingerprint(rawToken());
  assert.ok(fp.startsWith(PREFIX));
  assert.strictEqual(fp.length, PREFIX.length + 64);
  assert.ok(isFingerprint(fp));
});
test('deux jetons distincts → empreintes distinctes', () => {
  assert.notStrictEqual(fingerprint(rawToken()), fingerprint(rawToken()));
});
test('empreinte dépend du secret', () => {
  const t = rawToken();
  const other = PREFIX + crypto.createHmac('sha256', 'autre-secret').update(t).digest('hex');
  assert.notStrictEqual(fingerprint(t), other);
});
test('RAW_RE accepte un brut, rejette une empreinte et le vide ; fingerprint(null forme)=null', () => {
  assert.ok(RAW_RE.test(rawToken()));
  assert.ok(!RAW_RE.test(fingerprint(rawToken())));
  assert.strictEqual(fingerprint('pas-un-jeton'), null);
  assert.strictEqual(fingerprint(''), null);
  assert.deepStrictEqual(lookupCandidates(''), []);
});
test('module serveur et script de migration calculent la MÊME empreinte', () => {
  const t = rawToken();
  assert.strictEqual(fingerprint(t), mig.fingerprint(t));
});

/* ---- A) session : stockée en empreinte, présentée brute ---- */
test('A: session convertie — le Bearer brut retrouve la ligne, personne déconnecté', () => {
  const raw = rawToken();                    // createSession retourne ce brut au client
  const sessions = new Map([['sess-1', fingerprint(raw)]]); // base ne garde que l'empreinte
  assert.strictEqual(dbMatch(sessions, raw), 'sess-1');
});
test('A: session legacy (clair) — repli ANY([fp,brut]) la retrouve pendant la transition', () => {
  const raw = rawToken();
  const sessions = new Map([['sess-legacy', raw]]);
  assert.strictEqual(dbMatch(sessions, raw), 'sess-legacy');
});
test('A: l\'UPDATE de prolongation cible la valeur STOCKÉE (empreinte), pas le brut', () => {
  // lookupCandidates place l'empreinte en premier → c'est elle qu\'on retrouve et qu\'on
  // réécrit WHERE token = <stored>. On vérifie que le premier candidat est bien l\'empreinte.
  const raw = rawToken();
  assert.strictEqual(lookupCandidates(raw)[0], fingerprint(raw));
});
test('A: un autre jeton ne matche pas une base en empreinte', () => {
  const sessions = new Map([['sess-1', fingerprint(rawToken())]]);
  assert.strictEqual(dbMatch(sessions, rawToken()), null);
});

/* ---- B) lien magique : stockée en empreinte, e-mailée brute, échangée ---- */
test('B: lien magique — le brut du lien e-mailé retrouve la ligne en empreinte', () => {
  const raw = rawToken();                    // e-mailé dans ?token=<raw>
  const subs = new Map([['sub-1', fingerprint(raw)]]); // magic_token stocké en empreinte
  assert.strictEqual(dbMatch(subs, raw), 'sub-1');
});
test('B: magic_token legacy (clair) encore valide via le repli', () => {
  const raw = rawToken();
  const subs = new Map([['sub-legacy', raw]]);
  assert.strictEqual(dbMatch(subs, raw), 'sub-legacy');
});

/* ---- Flux connexion par code de l'app : brut en mémoire, empreinte en base ---- */
test('APP: le code en mémoire garde le BRUT ; la base garde l\'empreinte ; verify réussit', () => {
  const raw = rawToken();
  // app-api : codes.set(email, { token: raw }) en mémoire, UPDATE magic_token = fingerprint(raw).
  const memory = { token: raw };
  const subs = new Map([['sub-app', fingerprint(raw)]]);
  // verify : authenticate(entry.token) == authenticate(raw) → retrouve la ligne par empreinte.
  assert.strictEqual(dbMatch(subs, memory.token), 'sub-app');
});

/* ---- Schéma : la largeur déclarée doit accueillir l'empreinte (détecte l'erreur
       « value too long for type character varying(64) » AVANT déploiement) ---- */
const SQL = fs.readFileSync(path.join(__dirname, '..', 'server', 'db', 'init.sql'), 'utf8');

// Largeur effective déclarée pour <table>.<col> dans init.sql = max des VARCHAR(n) trouvés
// sur la définition de colonne (ancrée en début de ligne, donc `token` ne capte pas
// `magic_token`) ET sur les ALTER (ADD COLUMN / ALTER COLUMN … TYPE). null si introuvable.
function declaredWidth(table, col) {
  const widths = [];
  // Bloc CREATE TABLE de la table.
  const create = new RegExp('CREATE TABLE IF NOT EXISTS ' + table + '\\s*\\(([\\s\\S]*?)\\n\\);');
  const mBlock = create.exec(SQL);
  if (mBlock) {
    const colRe = new RegExp('(?:^|\\n)\\s*' + col + '\\s+VARCHAR\\((\\d+)\\)', 'i');
    const mc = colRe.exec(mBlock[1]);
    if (mc) widths.push(Number(mc[1]));
  }
  // ALTER globaux visant table.col (ADD COLUMN IF NOT EXISTS … / ALTER COLUMN … TYPE …).
  const alterRe = new RegExp(
    'ALTER TABLE ' + table + '\\s+(?:ADD COLUMN IF NOT EXISTS|ALTER COLUMN)\\s+' + col +
    '\\s+(?:TYPE\\s+)?VARCHAR\\((\\d+)\\)', 'gi');
  let m;
  while ((m = alterRe.exec(SQL)) !== null) widths.push(Number(m[1]));
  return widths.length ? Math.max(...widths) : null;
}

const fpLen = fingerprint('0'.repeat(64)).length; // 67 = PREFIX + 64 hex
const SCHEMA_TOKENS = [
  { table: 'sessions',    col: 'token',         hashed: true },
  { table: 'subscribers', col: 'magic_token',   hashed: true },
  { table: 'subscribers', col: 'token',         hashed: false }, // C, brut 64 hex
  { table: 'user_tasks',  col: 'confirm_token', hashed: false }, // D, brut 64 hex
];
for (const c of SCHEMA_TOKENS) {
  test(`schéma ${c.table}.${c.col} : largeur ≥ ${c.hashed ? 'empreinte (' + fpLen + ')' : 'brut (64)'}`, () => {
    const w = declaredWidth(c.table, c.col);
    assert.ok(w != null, `largeur introuvable dans init.sql pour ${c.table}.${c.col}`);
    const need = c.hashed ? fpLen : 64;
    assert.ok(w >= need, `${c.table}.${c.col} déclaré VARCHAR(${w}) < ${need} requis`);
  });
}

console.log(`\n${passed} test(s) réussi(s)` + (process.exitCode ? ' — ÉCHECS présents.' : '.'));
