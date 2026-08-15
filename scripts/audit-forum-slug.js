// scripts/audit-forum-slug.js
// ─────────────────────────────────────────────────────────────────────────────
// AUDIT forum_slug — LECTURE SEULE, À LA DEMANDE (jamais un cron, jamais un hook).
//
// Ce script n'exécute QUE des SELECT : aucun INSERT/UPDATE/DELETE nulle part, et il
// n'appelle jamais le poller. Le .env local pointe la DB de PROD — c'est justement
// pourquoi il ne corrige rien tout seul : il DIT quoi lancer, l'écriture reste un
// geste humain (même règle que les robots de maintenance : rapport only).
//
// POURQUOI IL EXISTE (précédent chat-perdu, 08/2026) : une source ajoutée à la main
// dans server/db/init.sql naît SANS forum_slug — aucun INSERT du fichier n'en pose,
// et le backfill qui les remplit est un one-off que personne ne rejoue après coup.
// Résultat : ni badge @slug ni lien « On en parle au forum → » sur son verso, sans
// le moindre message d'erreur. À lancer après tout ajout de source dans init.sql.
//
//   node scripts/audit-forum-slug.js
//
// Sortie : rapport lisible + code de sortie 1 si une action est requise (0 sinon).
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const { pool } = require('../server/db');
const { slugify } = require('../server/forum-slug');

// Un mot par ligne manquante, pour que le rapport se lise sans ouvrir le code.
function ligne(r, attendu) {
  return '    ' + String(r.id).padEnd(30) + ' | type=' + String(r.type || '—').padEnd(10)
    + ' | slug attendu : ' + attendu;
}

(async () => {
  let action = false;
  try {
    console.log('=== AUDIT forum_slug (lecture seule) ===\n');

    const src = await pool.query(
      'SELECT id, name, type, forum_slug FROM sources ORDER BY display_order ASC, id ASC');
    const srcNull = src.rows.filter((r) => !r.forum_slug);

    // DISTINCTION ESSENTIELLE — une install NEUVE a 100 % de NULL (aucun INSERT de
    // init.sql ne pose la colonne) : lister 291 lignes serait du bruit pur, et un
    // audit qui crie au loup à chaque lancement finit par être ignoré. On ne détaille
    // que l'OUBLI PONCTUEL (quelques lignes au milieu de sources déjà sluguées).
    const toutesNulles = src.rows.length > 0 && srcNull.length === src.rows.length;

    if (toutesNulles) {
      console.log('SOURCES : aucune n\'a de forum_slug (' + src.rows.length + '/' + src.rows.length + ').');
      console.log('  → Ce n\'est PAS un oubli : c\'est une base FRAÎCHEMENT INSTALLÉE.');
      console.log('    init.sql ne pose jamais forum_slug ; le backfill n\'a simplement');
      console.log('    pas encore tourné sur cette base. Rien d\'anormal, une commande à passer :\n');
      console.log('      node scripts/backfill-forum-slug.js --check   (calcul + rapport, n\'écrit rien)');
      console.log('      node scripts/backfill-forum-slug.js           (écrit réellement)\n');
      action = true;
    } else if (srcNull.length) {
      console.log('SOURCES : ' + srcNull.length + ' sans forum_slug sur ' + src.rows.length + '.');
      console.log('  → OUBLI PONCTUEL : ces lignes ont été ajoutées après le dernier backfill');
      console.log('    (typiquement un INSERT écrit à la main dans init.sql). Sans slug :');
      console.log('    pas de badge @slug ni de lien forum sur leur verso.\n');
      srcNull.forEach((r) => console.log(ligne(r, slugify(r.name, r.id))));
      console.log('\n  À LANCER (il ne remplit que les NULL, n\'écrase jamais un slug posé) :\n');
      console.log('      node scripts/backfill-forum-slug.js --check   (calcul + rapport, n\'écrit rien)');
      console.log('      node scripts/backfill-forum-slug.js           (écrit réellement)\n');
      action = true;
    } else {
      console.log('SOURCES : ' + src.rows.length + '/' + src.rows.length + ' ont un forum_slug. Rien à faire.\n');
    }

    const col = await pool.query(
      'SELECT id, name, forum_slug FROM collections ORDER BY created_at ASC');
    const colNull = col.rows.filter((r) => !r.forum_slug);
    if (colNull.length) {
      // Miroir decks. Nuance : un deck créé APRÈS le 30/07 reçoit son slug au runtime
      // (server/routes/decks.js) — un NULL ici désigne donc un deck ANTÉRIEUR au
      // dispositif, pas un oubli de saisie.
      console.log('DECKS : ' + colNull.length + ' sans forum_slug sur ' + col.rows.length + '.');
      colNull.forEach((r) => console.log('    ' + String(r.id).padEnd(30) + ' | slug attendu : ' + slugify(r.name, r.id)));
      console.log('\n  À LANCER :\n');
      console.log('      node scripts/backfill-forum-slug-decks.js --check');
      console.log('      node scripts/backfill-forum-slug-decks.js\n');
      action = true;
    } else {
      console.log('DECKS : ' + col.rows.length + '/' + col.rows.length + ' ont un forum_slug. Rien à faire.\n');
    }

    // Filet : l'index unique partiel rend ce cas normalement impossible. S'il remonte
    // quand même, c'est un signal d'index absent (migration non passée) — à traiter
    // À LA MAIN, jamais par un backfill qui ne toucherait pas ces lignes (non NULL).
    const dup = await pool.query(
      `SELECT forum_slug, array_agg(id) AS ids FROM sources
        WHERE forum_slug IS NOT NULL GROUP BY forum_slug HAVING COUNT(*) > 1`);
    if (dup.rows.length) {
      console.log('⚠️  COLLISIONS (index unique absent ?) — à corriger à la main :');
      dup.rows.forEach((r) => console.log('    ' + r.forum_slug + ' ← ' + r.ids.join(', ')));
      console.log('');
      action = true;
    }

    console.log(action ? '=== ACTION REQUISE (voir commandes ci-dessus) ==='
                       : '=== RIEN À FAIRE ===');
    process.exitCode = action ? 1 : 0;
  } catch (e) {
    console.error('❌ ÉCHEC de l\'audit :', e.message);
    process.exitCode = 2;
  } finally {
    await pool.end();
  }
})();
