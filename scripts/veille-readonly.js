// scripts/veille-readonly.js
// ─────────────────────────────────────────────────────────────────────────────
// VEILLE DE MAINTENANCE — LECTURE SEULE.
//
// Ce script n'exécute QUE des SELECT et imprime un unique objet JSON sur stdout.
// Il ne contient AUCUN INSERT / UPDATE / DELETE / TRUNCATE nulle part, et
// n'appelle jamais le poller (runCycle) : le .env local pointe la DB de PROD,
// toute écriture ou tout cycle notifierait de vrais abonnés.
//
// Usage : node scripts/veille-readonly.js
// Sortie : un seul objet JSON (rien d'autre sur stdout).
// ─────────────────────────────────────────────────────────────────────────────

// quiet:true — dotenv v17+ imprime sinon un bandeau de démarrage sur stdout,
// ce qui casserait le contrat « un seul objet JSON sur stdout » (un consommateur
// qui fait JSON.parse échouerait sur cette ligne).
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Même configuration de connexion que server/db.js (Railway impose le SSL,
// certificat auto-signé côté proxy → rejectUnauthorized: false).
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

// 1. failing_sources — sources avec ≥ 2 événements 'failed' sur 7 jours,
//    groupées par (source_id, params). Compte, dernier message et sa date.
const Q_FAILING = `
  WITH recent AS (
    SELECT source_id, params, message, created_at,
           ROW_NUMBER() OVER (PARTITION BY source_id, params ORDER BY created_at DESC) AS rn,
           COUNT(*)     OVER (PARTITION BY source_id, params) AS cnt
      FROM source_events
     WHERE event = 'failed'
       AND created_at >= NOW() - INTERVAL '7 days'
  )
  SELECT source_id,
         params,
         cnt         AS failed_count,
         message     AS last_message,
         created_at  AS last_failed_at
    FROM recent
   WHERE rn = 1 AND cnt >= 2
   ORDER BY cnt DESC, source_id ASC`;

// 2. stale_states — lignes de source_states ET source_param_states dont
//    checked_at date de plus de 24 h, POUR LES SOURCES enabled = true.
//
//    ⚠️ LIMITE CONNUE (caveat, voir aussi le champ `caveat` du JSON de sortie) :
//    le poller ne rafraîchit checked_at que sur écriture. Dans le cas
//    « still-inactive » (source restée inactive), decideTransition renvoie
//    write:false → checked_at N'EST PAS mis à jour (server/poller.js).
//    Un checked_at ancien sur une source/combinaison INACTIVE est donc NORMAL
//    tant que l'étape B n'est pas déployée. Ce signal est SECONDAIRE :
//    failing_sources fait foi.
const Q_STALE = `
  SELECT 'source_states'::text AS origin, ss.source_id, NULL::jsonb AS params,
         ss.state, ss.checked_at
    FROM source_states ss
    JOIN sources s ON s.id = ss.source_id
   WHERE s.enabled = true
     AND ss.checked_at < NOW() - INTERVAL '24 hours'
  UNION ALL
  SELECT 'source_param_states'::text AS origin, sps.source_id, sps.params,
         sps.state, sps.checked_at
    FROM source_param_states sps
    JOIN sources s ON s.id = sps.source_id
   WHERE s.enabled = true
     AND sps.checked_at < NOW() - INTERVAL '24 hours'
   ORDER BY checked_at ASC`;

// 3. never_active_90d — sources enabled = true, type <> 'linked', sans AUCUN
//    événement 'activated' (broadcast ou paramétré) depuis 90 jours.
const Q_NEVER_ACTIVE = `
  SELECT s.id, s.name, s.type, s.created_at
    FROM sources s
   WHERE s.enabled = true
     AND s.type <> 'linked'
     AND NOT EXISTS (
       SELECT 1 FROM source_events e
        WHERE e.source_id = s.id
          AND e.event = 'activated'
          AND e.created_at >= NOW() - INTERVAL '90 days'
     )
   ORDER BY s.created_at ASC NULLS FIRST, s.id ASC`;

// 4. display_order_collisions — valeurs de display_order partagées par
//    plusieurs sources enabled = true.
const Q_COLLISIONS = `
  SELECT display_order,
         COUNT(*)                      AS n,
         ARRAY_AGG(id ORDER BY id)     AS source_ids
    FROM sources
   WHERE enabled = true
   GROUP BY display_order
  HAVING COUNT(*) > 1
   ORDER BY display_order ASC`;

// 5. category_slugs — slugs distincts présents dans sources.categories (unnest)
//    pour les sources enabled = true. La comparaison avec categories.js est
//    faite par l'agent, PAS par le script.
const Q_SLUGS = `
  SELECT DISTINCT slug
    FROM sources, unnest(categories) AS slug
   WHERE enabled = true
   ORDER BY slug ASC`;

// 6bis. suspended_decks (phase 2 UGC) — decks utilisateurs ayant atteint le seuil
//    de signalements (≥ 3 ip distinctes) pour une cible ('deck' ou 'name'). Le
//    partage a alors été suspendu automatiquement (visibility 'private', token
//    invalidé). Signal de modération pour l'humain — aucune action du robot.
//    Aucune donnée personnelle (ip hashée, jamais l'email ; pas le contenu ici).
const Q_SUSPENDED_DECKS = `
  SELECT dr.deck_id,
         dr.target,
         COUNT(DISTINCT dr.ip_hash)   AS distinct_reports,
         MAX(dr.created_at)           AS last_report_at,
         c.visibility,
         (c.share_token IS NULL)      AS sharing_suspended
    FROM deck_reports dr
    JOIN collections c ON c.id = dr.deck_id
   GROUP BY dr.deck_id, dr.target, c.visibility, c.share_token
  HAVING COUNT(DISTINCT dr.ip_hash) >= 3
   ORDER BY last_report_at DESC`;

// 7. schema_check — COHÉRENCE SCHÉMA ATTENDU vs RÉEL (ajout post-incident : une
//    migration ref non appliquée avait été détectée tardivement). On confronte
//    les colonnes ATTENDUES par le code aux colonnes RÉELLEMENT présentes en base
//    (information_schema.columns). Un écart = migration probablement non appliquée
//    → le robot RAPPORTE seulement (jamais d'ALTER, jamais de migrate.js).
//
//    Dérivation de la liste attendue (méthode robuste, s'auto-étend à chaque
//    migration) : on parse server/db/init.sql pour tous les
//    « ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <c> » — c'est exactement le canal
//    des migrations idempotentes du projet. On y ajoute un NOYAU codé en dur (les
//    colonnes dont l'absence casserait le poller v2), avec un type attendu vérifié.
//    NOYAU à étendre à chaque migration sensible.
const SCHEMA_CORE = [
  { table: 'source_states',       column: 'ref',           type: 'jsonb' },
  { table: 'source_param_states', column: 'ref',           type: 'jsonb' },
  { table: 'subscriptions',       column: 'params',        type: 'jsonb' },
  { table: 'subscriptions',       column: 'muted',         type: 'boolean' },
  { table: 'sources',             column: 'params_schema', type: 'jsonb' },
];

// Parse init.sql → paires {table, column} de toutes les colonnes ajoutées par
// migration (ADD COLUMN IF NOT EXISTS). Best-effort : si le fichier est illisible
// on retombe sur le seul NOYAU (aucune exception propagée).
function expectedColumnsFromInitSql() {
  const expected = new Map(); // "table.column" → {table, column, type|null}
  for (const c of SCHEMA_CORE) expected.set(`${c.table}.${c.column}`, c);
  try {
    const sqlPath = path.join(__dirname, '..', 'server', 'db', 'init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const re = /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)/gi;
    let m;
    while ((m = re.exec(sql)) !== null) {
      const key = `${m[1]}.${m[2]}`;
      if (!expected.has(key)) expected.set(key, { table: m[1], column: m[2], type: null });
    }
  } catch (_) {
    // init.sql illisible → NOYAU seul (déjà en place).
  }
  return Array.from(expected.values());
}

// Requête bornée à la liste attendue (SELECT sur information_schema uniquement).
const Q_SCHEMA = `
  SELECT table_name, column_name, data_type
    FROM information_schema.columns
   WHERE table_schema = 'public'`;

// 8. panneaupocket_vitality — VITALITÉ des cartes broadcast (dont la famille
//    PanneauPocket curée, vague L). ⚠️ La colonne ref ne stocke QUE des couples
//    [panneauId, hash] : AUCUNE date de publication de panneau n'existe en base.
//    La « date du panneau le plus récent » n'est donc PAS dérivable ici. Le meilleur
//    proxy en base est last_activated_at (dernier panneau NOUVEAU/MODIFIÉ *alertable*
//    ayant déclenché un événement). Limite : une entité qui publie des panneaux
//    non-alertables (hors filtre thématique) ou seulement cosmétiques reste vivante
//    sans produire d'événement — donc ce proxy SOUS-ESTIME la vitalité. Le robot
//    croise cette liste avec le jeu de cartes curées (require de panneaupocket-veille
//    dans server/sources/*.js) et NE PROPOSE JAMAIS de désactivation automatique.
//    Émis pour toutes les sources enabled non-linked ; l'agent filtre au jeu curé.
const Q_PP_VITALITY = `
  SELECT s.id, s.name, s.type,
         ss.state, ss.checked_at,
         CASE WHEN ss.ref IS NULL THEN NULL
              ELSE jsonb_array_length(ss.ref) END           AS ref_panneau_count,
         (SELECT MAX(e.created_at) FROM source_events e
           WHERE e.source_id = s.id AND e.event = 'activated') AS last_activated_at
    FROM sources s
    LEFT JOIN source_states ss ON ss.source_id = s.id
   WHERE s.enabled = true
     AND s.type <> 'linked'
   ORDER BY s.id ASC`;

// 9. orphan_param_states — lignes source_param_states (combos paramétrés) dont
//    plus AUCUN abonnement ne porte le couple (source_id, params) : reliquat d'un
//    désabonnement. On COMPTE et on liste (échantillon) ; la purge est une décision
//    humaine (jamais de DELETE par le robot). Un abonnement muted compte comme
//    toujours abonné (params conservés) → n'est pas orphelin.
const Q_ORPHAN_PARAM_STATES = `
  SELECT sps.source_id, sps.params, sps.state, sps.checked_at
    FROM source_param_states sps
   WHERE NOT EXISTS (
     SELECT 1 FROM subscriptions sub
      WHERE sub.source_id = sps.source_id
        AND sub.params IS NOT DISTINCT FROM sps.params)
   ORDER BY sps.source_id ASC, sps.checked_at ASC`;

// 6. meta — nombre de sources enabled, nombre de combinaisons paramétrées.
const Q_META = `
  SELECT
    (SELECT COUNT(*) FROM sources WHERE enabled = true)   AS enabled_sources,
    (SELECT COUNT(*) FROM source_param_states)            AS param_combos`;

async function main() {
  const out = {
    meta: {
      generated_at: new Date().toISOString(),
      enabled_sources: null,
      param_combos: null,
    },
    caveat: {
      stale_states:
        "checked_at n'est rafraîchi que sur ecriture (write:true). Le cas " +
        "still-inactive (decideTransition, server/poller.js) laisse write:false, " +
        "donc un checked_at ancien sur une source/combinaison INACTIVE est NORMAL " +
        "tant que l'etape B (refresh de checked_at meme en still-inactive) n'est " +
        "pas deployee. Signal SECONDAIRE : failing_sources fait foi.",
    },
    failing_sources: [],
    stale_states: [],
    never_active_90d: [],
    display_order_collisions: [],
    category_slugs: [],
    suspended_decks: [],
    schema_check: null,
    panneaupocket_vitality: [],
    orphan_param_states: { count: 0, sample: [] },
  };

  const [failing, stale, never, collisions, slugs, meta] = await Promise.all([
    pool.query(Q_FAILING),
    pool.query(Q_STALE),
    pool.query(Q_NEVER_ACTIVE),
    pool.query(Q_COLLISIONS),
    pool.query(Q_SLUGS),
    pool.query(Q_META),
  ]);

  out.failing_sources = failing.rows;
  out.stale_states = stale.rows;
  out.never_active_90d = never.rows;
  out.display_order_collisions = collisions.rows;
  out.category_slugs = slugs.rows.map((r) => r.slug);
  out.meta.enabled_sources = Number(meta.rows[0].enabled_sources);
  out.meta.param_combos = Number(meta.rows[0].param_combos);

  // Phase 2 (UGC) : decks suspendus par signalements. Requête isolée (try/catch)
  // pour rester compatible avec une base pas encore migrée (tables absentes).
  try {
    const suspended = await pool.query(Q_SUSPENDED_DECKS);
    out.suspended_decks = suspended.rows;
  } catch (e) {
    out.suspended_decks = [];
  }

  // Contrôle schéma (le POINT de ce script quand une migration manque) : on
  // confronte les colonnes attendues au réel. Try/catch isolé — si même
  // information_schema échoue, on le dit sans faire échouer le reste.
  try {
    const expected = expectedColumnsFromInitSql();
    const actual = await pool.query(Q_SCHEMA);
    const seen = new Map(); // "table.column" → data_type
    for (const r of actual.rows) seen.set(`${r.table_name}.${r.column_name}`, r.data_type);
    const missing = [];
    const type_mismatch = [];
    for (const c of expected) {
      const key = `${c.table}.${c.column}`;
      if (!seen.has(key)) {
        missing.push({ table: c.table, column: c.column, expected_type: c.type });
      } else if (c.type && seen.get(key) !== c.type) {
        type_mismatch.push({ table: c.table, column: c.column, expected: c.type, actual: seen.get(key) });
      }
    }
    out.schema_check = {
      ok: missing.length === 0 && type_mismatch.length === 0,
      expected_columns: expected.length,
      missing,
      type_mismatch,
      hint:
        (missing.length || type_mismatch.length)
          ? "MIGRATION PROBABLEMENT NON APPLIQUEE : executer `node server/db/migrate.js` " +
            "dans le shell Railway. RAPPORT SEULEMENT — jamais d'ALTER par le robot."
          : null,
    };
  } catch (e) {
    out.schema_check = { ok: null, error: e.message,
      hint: "Controle schema impossible (information_schema inaccessible)." };
  }

  // Vitalité PanneauPocket curée (Vague L) — try/catch : la colonne ss.ref peut
  // manquer sur une base pas encore migrée (justement le cas que schema_check
  // signale). On dégrade proprement plutôt que de faire échouer tout le script.
  try {
    const pp = await pool.query(Q_PP_VITALITY);
    out.panneaupocket_vitality = pp.rows;
  } catch (e) {
    out.panneaupocket_vitality = [];
  }

  // Combos paramétrés orphelins (désabonnements) : compte + échantillon (50).
  try {
    const orphan = await pool.query(Q_ORPHAN_PARAM_STATES);
    out.orphan_param_states = { count: orphan.rows.length, sample: orphan.rows.slice(0, 50) };
  } catch (e) {
    out.orphan_param_states = { count: 0, sample: [] };
  }

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    // Erreur émise sur stderr pour ne pas polluer le JSON de stdout.
    console.error('[veille-readonly] ERREUR :', err.message);
    try { await pool.end(); } catch (_) { /* ignore */ }
    process.exit(1);
  });
