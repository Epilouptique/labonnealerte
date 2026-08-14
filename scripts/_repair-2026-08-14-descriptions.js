// scripts/_repair-2026-08-14-descriptions.js — JETABLE, USAGE UNIQUE.
// À SUPPRIMER après usage (ne pas conserver comme script permanent du repo).
//
// INCIDENT (2026-08-14, éditeur SQL Railway) : un UPDATE sources SET description = '...'
// exécuté SANS clause WHERE a écrasé sources.description sur TOUTES les lignes avec le
// texte destiné à 'chat-perdu'. server/db/init.sql est intact (chaque INSERT porte la
// vraie description d'origine), mais la plupart des sources n'ont pas d'UPDATE dédié sur
// cette colonne : un simple re-run de migrate.js ne répare rien (INSERT ... WHERE NOT
// EXISTS ne se rejoue jamais sur un id déjà présent).
//
// MÉTHODE : reconstitue dans une table TEMP (sources_repair) la description d'origine de
// chaque source en réexécutant TEXTUELLEMENT les blocs `INSERT INTO sources (...) SELECT
// ... WHERE NOT EXISTS (...)` d'init.sql, avec pour SEULE modification le nom de la table
// cible (sources → sources_repair, y compris dans le WHERE NOT EXISTS — voir note ci-
// dessous). Diffe ensuite sources.description (corrompue) vs sources_repair.description
// (bonne valeur), colonne par colonne, id par id. Ne touche à AUCUNE autre colonne.
//
// ÉCART ASSUMÉ par rapport à la demande initiale (validé avec l'utilisateur avant
// écriture) : la demande voulait que le WHERE NOT EXISTS interne continue de pointer
// vers la VRAIE table `sources`. Mais tous les id existent déjà dans `sources` (l'incident
// a corrompu une colonne sur des lignes EXISTANTES, il n'a supprimé aucun id) — ce garde-
// fou serait donc TOUJOURS faux, sources_repair resterait vide, et le script échouerait
// systématiquement à l'étape de vérification du nombre de lignes sans jamais réparer
// quoi que ce soit. Le WHERE NOT EXISTS a donc été repointé vers sources_repair
// (table vide au 1er passage pour chaque id) : chaque bloc s'exécute normalement, et le
// garde-fou continue de protéger contre un id dupliqué À L'INTÉRIEUR d'init.sql lui-même.
//
// Usage :
//   node scripts/_repair-2026-08-14-descriptions.js            → --check (défaut)
//   node scripts/_repair-2026-08-14-descriptions.js --check    → idem, explicite
//   node scripts/_repair-2026-08-14-descriptions.js --apply    → ÉCRIT (transaction), puis auto-vérifie
//
// --check : AUCUNE écriture sur `sources` ; ROLLBACK systématique (rien n'est laissé en
// base, ni la table temp ni une quelconque écriture).
// --apply : UPDATE ciblé (IS DISTINCT FROM) sur description SEULEMENT, COMMIT si succès.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/db');

const APPLY = process.argv.includes('--apply');

// Seuil de cohérence : si sources_repair contient moins de 90 % du nombre de lignes
// réelles de `sources`, quelque chose s'est mal passé dans l'extraction/exécution des
// blocs — on abandonne plutôt que de continuer sur une base partielle.
const MIN_COVERAGE_RATIO = 0.9;

// Extrait, dans l'ordre du fichier, chaque bloc `INSERT INTO sources (...) ... ;`
// (accumulation ligne à ligne : démarre sur une ligne qui commence par
// "INSERT INTO sources (", s'arrête à la première ligne qui se termine par ";").
// Validé au préalable sur le fichier actuel : 291 blocs, tous terminés par la ligne de
// garde "WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = ...)", aucune anomalie.
function extractSourceInserts(sql) {
  const lines = sql.split('\n');
  const blocks = [];
  let inBlock = false;
  let buf = [];
  for (const line of lines) {
    if (!inBlock && line.trim().startsWith('INSERT INTO sources (')) {
      inBlock = true;
      buf = [line];
      continue;
    }
    if (inBlock) {
      buf.push(line);
      if (line.trim().endsWith(';')) {
        blocks.push(buf.join('\n'));
        inBlock = false;
        buf = [];
      }
    }
  }
  if (inBlock) throw new Error('Bloc INSERT INTO sources non terminé (fichier tronqué ?) — abandon.');
  return blocks;
}

// Seule transformation autorisée : le nom de la table cible de l'INSERT, ET le nom de
// table référencé par le WHERE NOT EXISTS interne (écart assumé, voir en-tête). Rien
// d'autre dans le texte de la requête n'est modifié (mêmes valeurs, mêmes colonnes).
function retarget(block) {
  let out = block.replace(/^INSERT INTO sources \(/, 'INSERT INTO sources_repair (');
  out = out.replace(/FROM sources WHERE id/g, 'FROM sources_repair WHERE id');
  return out;
}

function truncate(s, n) {
  s = String(s == null ? '(NULL)' : s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

(async () => {
  let client;
  console.log('====================================================');
  console.log(APPLY ? 'MODE : --apply (ÉCRITURE réelle sur sources.description)' : 'MODE : --check (aucune écriture, ROLLBACK systématique)');
  console.log('RÉPARATION sources.description (incident UPDATE sans WHERE, 2026-08-14)');
  console.log('====================================================');

  const sqlPath = path.join(__dirname, '..', 'server', 'db', 'init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const blocks = extractSourceInserts(sql).map(retarget);
  console.log('Blocs INSERT INTO sources extraits d\'init.sql : ' + blocks.length);

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    await client.query('CREATE TEMP TABLE sources_repair (LIKE sources INCLUDING ALL)');

    for (const stmt of blocks) {
      await client.query(stmt);
    }

    const repairCount = (await client.query('SELECT COUNT(*)::int AS n FROM sources_repair')).rows[0].n;
    const realCount = (await client.query('SELECT COUNT(*)::int AS n FROM sources')).rows[0].n;
    console.log('sources_repair : ' + repairCount + ' ligne(s) reconstituée(s) — sources (réel) : ' + realCount + ' ligne(s).');

    if (repairCount < realCount * MIN_COVERAGE_RATIO) {
      console.error('❌ ANOMALIE : couverture trop basse (' + repairCount + '/' + realCount +
        ') — abandon, ROLLBACK, aucune écriture. Ne pas relancer --apply avant d\'avoir compris pourquoi.');
      await client.query('ROLLBACK');
      process.exitCode = 1;
      return;
    }

    // Signal fiable de corruption réelle : la description actuelle porte le texte
    // caractéristique de l'incident ("chat disparaît"/"chat disparait", accent
    // optionnel). Une ligne qui diffère du texte d'init.sql SANS porter ce texte n'est
    // pas une victime de l'incident — c'est très probablement une révision éditoriale
    // légitime postérieure à l'INSERT d'origine (constaté sur 7 sources au --check
    // précédent : arrosage-canal-gap, grands-anniversaires, jours-feries, panneaupocket,
    // rappel-conso, vigicrues-05, vigieau). --apply ne doit JAMAIS toucher ces lignes.
    const INCIDENT_PATTERN_SQL = `s.description ~* 'chat dispara[iî]t'`;

    const diff = await client.query(
      `SELECT s.id, s.description AS current_desc, r.description AS repaired_desc,
              (${INCIDENT_PATTERN_SQL}) AS is_incident
         FROM sources s
         JOIN sources_repair r ON r.id = s.id
        WHERE s.description IS DISTINCT FROM r.description
        ORDER BY s.id`
    );

    const toRepair = diff.rows.filter((row) => row.is_incident);
    const excluded = diff.rows.filter((row) => !row.is_incident);

    console.log('Lignes où description diffère (corrompue vs originale) : ' + diff.rows.length);
    console.log('  dont victimes confirmées de l\'incident : ' + toRepair.length);
    console.log('  dont exclues (probable révision éditoriale légitime) : ' + excluded.length);
    console.log('----------------------------------------------------');
    for (const row of toRepair) {
      console.log('id: ' + row.id);
      console.log('  actuelle (corrompue) : ' + truncate(row.current_desc, 90));
      console.log('  réparée  (originale) : ' + truncate(row.repaired_desc, 90));
    }
    for (const row of excluded) {
      console.log('id: ' + row.id + '  ignoré : ne correspond pas au texte de l\'incident, probable révision éditoriale légitime');
      console.log('  actuelle (conservée) : ' + truncate(row.current_desc, 90));
      console.log('  init.sql (différente): ' + truncate(row.repaired_desc, 90));
    }
    console.log('----------------------------------------------------');

    if (!APPLY) {
      console.log('>>> --check : AUCUNE écriture effectuée. ROLLBACK. Relancez avec --apply après relecture. <<<');
      await client.query('ROLLBACK');
      return;
    }

    if (toRepair.length === 0) {
      console.log('Rien à réparer — aucune ligne victime confirmée de l\'incident. ROLLBACK (rien à committer).');
      await client.query('ROLLBACK');
      return;
    }

    console.log('>>> --apply : ÉCRITURE en cours (victimes confirmées de l\'incident uniquement)… <<<');
    const upd = await client.query(
      `UPDATE sources s SET description = r.description
         FROM sources_repair r
        WHERE s.id = r.id AND s.description IS DISTINCT FROM r.description
          AND ${INCIDENT_PATTERN_SQL}`
    );
    console.log('Lignes réellement modifiées : ' + upd.rowCount);

    // Auto-vérification post-apply (dans la même transaction, avant COMMIT) : plus
    // aucune description ne porte le texte corrupteur sur un id autre que 'chat-perdu'.
    // Requête AUTONOME (pas de dépendance à un alias défini ailleurs, ex. le "s" de
    // l'UPDATE ci-dessus) — bug corrigé : INCIDENT_PATTERN_SQL est écrit avec l'alias
    // "s." pour la requête diff/UPDATE, mais ici la table n'a pas d'alias.
    const stillCorrupt = await client.query(
      `SELECT COUNT(*)::int AS n FROM sources
        WHERE description ~* 'chat dispara[iî]t' AND id <> 'chat-perdu'`
    );
    const remaining = stillCorrupt.rows[0].n;
    console.log('Vérif post-apply : ' + remaining + ' description(s) encore suspectes (attendu : 0).');
    if (remaining !== 0) {
      console.error('❌ ANOMALIE post-apply : ' + remaining + ' ligne(s) encore corrompue(s) — ROLLBACK, rien n\'est committé.');
      await client.query('ROLLBACK');
      process.exitCode = 1;
      return;
    }

    await client.query('COMMIT');
    console.log('✅ COMMIT OK.');
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
