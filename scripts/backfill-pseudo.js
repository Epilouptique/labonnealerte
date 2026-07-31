// scripts/backfill-pseudo.js — JETABLE (one-off).
// Renseigne subscribers.pseudo pour les comptes EXISTANTS ayant un display_name et
// pas encore de pseudo, via server/forum-slug.js (règle déterministe validée).
// Miroir strict des backfills forum_slug durcis (bannières MODE, --check, COMMIT OK,
// auto-vérif post-commit, catch stack + code de sortie).
//
// Espace de noms du pseudo = table subscribers uniquement (indépendant des forum_slug).
// Ordre déterministe : id ASC. Collision de slug → suffixe numérique ; repli u<id>.
// Rejouable : ne touche QUE pseudo IS NULL, réserve les pseudo déjà posés.
//
//   node scripts/backfill-pseudo.js           (.env pointe la base : écrit)
//   node scripts/backfill-pseudo.js --check    (calcul + rapport, N'ÉCRIT RIEN)
//
// NB : les futurs comptes reçoivent leur pseudo à la 1re pose du display_name
// (server/pseudo.js, via profile-autofill + POST /my-alerts/display-name).

require('dotenv').config();
const { pool } = require('../server/db');
const { slugify, resolveCollision, SLUG_MAX } = require('../server/forum-slug');

const WRITE = !process.argv.includes('--check');

(async () => {
  let client;
  console.log('====================================================');
  console.log(WRITE ? 'MODE : ÉCRITURE (écrit en base)' : 'MODE : DRY-RUN (--check, aucune écriture)');
  console.log('PSEUDOS (subscribers)');
  console.log('====================================================');
  try {
    // 1) Pseudos déjà attribués → réservés (espace subscribers uniquement).
    const existing = await pool.query('SELECT pseudo FROM subscribers WHERE pseudo IS NOT NULL');
    const taken = new Set(existing.rows.map((r) => r.pseudo));

    // 2) Comptes à renseigner : display_name posé, pseudo manquant.
    const todo = await pool.query(
      `SELECT id, display_name FROM subscribers
        WHERE display_name IS NOT NULL AND pseudo IS NULL
        ORDER BY id ASC`);
    console.log('À renseigner : ' + todo.rows.length + ' compte(s). Déjà posés : ' + taken.size + '.');

    // 3) Calcul (collisions via `taken`). Repli u<id> si slug vide.
    const plan = [];
    for (const s of todo.rows) {
      const fallback = 'u' + String(s.id);
      const base = (slugify(s.display_name, fallback) || fallback).slice(0, SLUG_MAX);
      const pseudo = resolveCollision(base, taken);
      taken.add(pseudo);
      plan.push({ id: s.id, name: s.display_name, base, pseudo, suffixed: pseudo !== base });
    }

    const suffixed = plan.filter((p) => p.suffixed);
    console.log('Collisions résolues par suffixe : ' + suffixed.length);
    for (const p of suffixed) console.log('  #' + p.id + ' → ' + p.pseudo + '  (base "' + p.base + '" déjà pris)');
    console.log('Aperçu (10 premiers) :');
    for (const p of plan.slice(0, 10)) console.log('  #' + String(p.id).padEnd(8) + ' | ' + String(p.name).padEnd(26) + ' | ' + p.pseudo);

    if (!WRITE) {
      console.log('\n>>> DRY-RUN : AUCUNE écriture. Relance SANS --check pour écrire réellement. <<<');
      return;
    }

    console.log('\n>>> ÉCRITURE en cours (transaction)… <<<');
    client = await pool.connect();
    await client.query('BEGIN');
    let n = 0;
    for (const p of plan) {
      const r = await client.query(
        'UPDATE subscribers SET pseudo = $1 WHERE id = $2 AND pseudo IS NULL', [p.pseudo, p.id]);
      n += r.rowCount;
    }
    await client.query('COMMIT');
    console.log('✅ COMMIT OK : ' + n + ' pseudo posé(s).');
    if (n === 0 && plan.length > 0) {
      console.warn('⚠️  ATTENTION : 0 ligne écrite alors que ' + plan.length + ' étaient à renseigner ' +
        '(déjà remplies, ou base différente de celle attendue ?).');
    }

    const check = await client.query('SELECT COUNT(*)::int AS n FROM subscribers WHERE pseudo IS NOT NULL');
    console.log('🔎 Vérif en base (connexion du script) : ' + check.rows[0].n + ' compte(s) avec pseudo non NULL.');
  } catch (e) {
    if (client) { try { await client.query('ROLLBACK'); console.error('ROLLBACK effectué (aucune écriture conservée).'); } catch (_) {} }
    console.error('❌ ÉCHEC :', e.stack || e.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
    console.log('Terminé — code de sortie : ' + (process.exitCode || 0));
  }
})();
