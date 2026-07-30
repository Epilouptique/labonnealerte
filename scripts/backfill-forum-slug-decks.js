// scripts/backfill-forum-slug-decks.js — JETABLE (one-off).
// Miroir strict de scripts/backfill-forum-slug.js, mais pour les DECKS (collections).
// Renseigne collections.forum_slug pour tous les decks EXISTANTS qui ne l'ont pas encore,
// via le module partagé server/forum-slug.js (règle déterministe validée).
//
// Espace de noms SÉPARÉ des sources : on ne réserve QUE les slugs de collections déjà
// posés (un slug source et un slug deck peuvent coïncider — désambiguïsés par la route).
// Ordre déterministe de résolution de collision : display_order ASC, puis id ASC.
// Rejouable : ne touche QUE les lignes à forum_slug NULL, réserve les slugs déjà posés.
//
//   node scripts/backfill-forum-slug-decks.js           (.env pointe la base : écrit)
//   node scripts/backfill-forum-slug-decks.js --check    (calcul + rapport, N'ÉCRIT RIEN)
//
// NB : les FUTURS decks reçoivent leur forum_slug à la création (server/routes/decks.js,
// POST /decks et /decks/shared/:token/fork). Ce script ne sert qu'au rattrapage de
// l'existant. Une seule transaction (pattern skins.js), UPDATE paramétrés ($1/$2).

require('dotenv').config();
const { pool } = require('../server/db');
const { slugify, resolveCollision } = require('../server/forum-slug');

const WRITE = !process.argv.includes('--check');

(async () => {
  let client;
  console.log('====================================================');
  console.log(WRITE ? 'MODE : ÉCRITURE (écrit en base)' : 'MODE : DRY-RUN (--check, aucune écriture)');
  console.log('DECKS (collections)');
  console.log('====================================================');
  try {
    // 1) Slugs de DECKS déjà attribués (autres lignes / passage précédent) → réservés.
    //    Espace séparé : on N'inclut PAS les slugs de sources.
    const existing = await pool.query(
      'SELECT forum_slug FROM collections WHERE forum_slug IS NOT NULL'
    );
    const taken = new Set(existing.rows.map((r) => r.forum_slug));

    // 2) Decks à renseigner, dans l'ordre déterministe de résolution.
    const todo = await pool.query(
      `SELECT id, name FROM collections
        WHERE forum_slug IS NULL
        ORDER BY display_order ASC, id ASC`
    );
    console.log('À renseigner : ' + todo.rows.length + ' deck(s). Déjà posées : ' + taken.size + '.');

    // 3) Calcul (collisions gérées via `taken`, muté au fur et à mesure).
    const plan = [];
    for (const d of todo.rows) {
      const base = slugify(d.name, d.id);
      const slug = resolveCollision(base, taken);
      taken.add(slug);
      plan.push({ id: d.id, name: d.name, base, slug, suffixed: slug !== base });
    }

    const suffixed = plan.filter((p) => p.suffixed);
    console.log('Collisions résolues par suffixe : ' + suffixed.length);
    for (const p of suffixed) console.log('  ' + p.id + ' → ' + p.slug + '  (base "' + p.base + '" déjà prise)');
    const empties = plan.filter((p) => !p.slug);
    if (empties.length) throw new Error('Slug VIDE pour : ' + empties.map((p) => p.id).join(', '));
    console.log('Aperçu (10 premiers) :');
    for (const p of plan.slice(0, 10)) console.log('  ' + p.id.padEnd(28) + ' | ' + String(p.name).padEnd(28) + ' | ' + p.slug);

    if (!WRITE) {
      console.log('\n>>> DRY-RUN : AUCUNE écriture. Relance SANS --check pour écrire réellement. <<<');
      return;
    }

    // 4) Écriture : une seule transaction. Garde `forum_slug IS NULL` → jamais d'écrasement.
    console.log('\n>>> ÉCRITURE en cours (transaction)… <<<');
    client = await pool.connect();
    await client.query('BEGIN');
    let n = 0;
    for (const p of plan) {
      const r = await client.query(
        'UPDATE collections SET forum_slug = $1 WHERE id = $2 AND forum_slug IS NULL',
        [p.slug, p.id]
      );
      n += r.rowCount;
    }
    await client.query('COMMIT');
    console.log('✅ COMMIT OK : ' + n + ' forum_slug posé(s).');
    if (n === 0 && plan.length > 0) {
      console.warn('⚠️  ATTENTION : 0 ligne écrite alors que ' + plan.length + ' étaient à renseigner ' +
        '(déjà remplies entre-temps, ou base différente de celle attendue ?).');
    }

    // 5) AUTO-VÉRIFICATION post-COMMIT sur LA base connectée.
    const check = await client.query('SELECT COUNT(*)::int AS n FROM collections WHERE forum_slug IS NOT NULL');
    console.log('🔎 Vérif en base (connexion du script) : ' + check.rows[0].n + ' deck(s) avec forum_slug non NULL.');
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
