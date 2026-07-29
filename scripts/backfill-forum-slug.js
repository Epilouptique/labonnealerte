// scripts/backfill-forum-slug.js — JETABLE (one-off).
// Renseigne sources.forum_slug pour TOUTES les sources qui ne l'ont pas encore,
// via le module partagé server/forum-slug.js (règle déterministe validée).
//
// Ordre déterministe pour la résolution de collision : display_order ASC, puis
// id ASC → la source la « plus haute » garde le slug nu, les suivantes reçoivent
// un suffixe numérique (2, 3, …). Rejouable : ne touche QUE les lignes à
// forum_slug NULL, et réserve les slugs DÉJÀ posés comme « pris » (donc un 2e
// passage n'entre jamais en collision avec l'existant).
//
//   node scripts/backfill-forum-slug.js           (.env pointe la base : écrit)
//   node scripts/backfill-forum-slug.js --check    (calcul + rapport, N'ÉCRIT RIEN)
//
// UPDATE paramétrés ($1/$2) → node-postgres échappe lui-même. Une seule
// transaction (pattern skins.js : client dédié, BEGIN/COMMIT, ROLLBACK sur erreur).
//
// PROCÉDURE POUR UNE FUTURE SOURCE (pas de route de création dynamique : les
// sources sont insérées à la main dans server/db/init.sql) :
//   soit relancer ce script après l'ajout (il ne remplit que les NULL),
//   soit poser forum_slug directement dans l'INSERT (valeur calculée avec la
//   même règle) — ne JAMAIS le régénérer ensuite.

require('dotenv').config();
const { pool } = require('../server/db');
const { slugify, resolveCollision } = require('../server/forum-slug');

(async () => {
  let client;
  try {
    // 1) Slugs DÉJÀ attribués (autres lignes, ou passage précédent) → réservés.
    const existing = await pool.query(
      'SELECT forum_slug FROM sources WHERE forum_slug IS NOT NULL'
    );
    const taken = new Set(existing.rows.map((r) => r.forum_slug));

    // 2) Sources à renseigner, dans l'ordre déterministe de résolution.
    const todo = await pool.query(
      `SELECT id, name FROM sources
        WHERE forum_slug IS NULL
        ORDER BY display_order ASC, id ASC`
    );
    console.log('À renseigner : ' + todo.rows.length + ' source(s). Déjà posées : ' + taken.size + '.');

    // 3) Calcul (collisions gérées via `taken`, muté au fur et à mesure).
    const plan = [];
    for (const s of todo.rows) {
      const base = slugify(s.name, s.id);
      const slug = resolveCollision(base, taken);
      taken.add(slug); // réserve pour les suivantes
      plan.push({ id: s.id, name: s.name, base, slug, suffixed: slug !== base });
    }

    // Rapport (utile en --check comme en écriture).
    const suffixed = plan.filter((p) => p.suffixed);
    console.log('Collisions résolues par suffixe : ' + suffixed.length);
    for (const p of suffixed) console.log('  ' + p.id + ' → ' + p.slug + '  (base "' + p.base + '" déjà prise)');
    const empties = plan.filter((p) => !p.slug);
    if (empties.length) throw new Error('Slug VIDE pour : ' + empties.map((p) => p.id).join(', '));
    console.log('Aperçu (10 premiers) :');
    for (const p of plan.slice(0, 10)) console.log('  ' + p.id.padEnd(28) + ' | ' + String(p.name).padEnd(28) + ' | ' + p.slug);

    if (process.argv.includes('--check')) { console.log('--check : aucun écriture.'); return; }

    // 4) Écriture : une seule transaction. Garde `forum_slug IS NULL` dans le
    //    WHERE → jamais d'écrasement d'un slug déjà posé (stabilité).
    client = await pool.connect();
    await client.query('BEGIN');
    let n = 0;
    for (const p of plan) {
      const r = await client.query(
        'UPDATE sources SET forum_slug = $1 WHERE id = $2 AND forum_slug IS NULL',
        [p.slug, p.id]
      );
      n += r.rowCount;
    }
    await client.query('COMMIT');
    console.log('COMMIT OK : ' + n + ' forum_slug posé(s).');
  } catch (e) {
    if (client) { try { await client.query('ROLLBACK'); console.error('ROLLBACK effectué.'); } catch (_) {} }
    console.error('ÉCHEC :', e.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
})();
