-- ============================================================================
-- PATCH CORRECTIF — lignes source_states manquantes (sources broadcast orphelines)
-- ============================================================================
-- Contexte : 8 sources broadcast (params_schema IS NULL) enabled=true ont été
-- migrées SANS leur ligne source_states. Le poller (applyResult) logue alors
-- « aucune ligne d'état (migration ?) » à chaque cycle et ne les évalue jamais.
--
-- Diagnostic (2026-07-23, DB de PROD, lecture seule) : balayage COMPLET de
-- toutes les sources enabled + params_schema IS NULL sans ligne source_states →
-- EXACTEMENT ces 8, ni plus ni moins. Les sources paramétrées (params_schema
-- non NULL) utilisent source_param_states et n'ont légitimement pas de ligne
-- source_states : elles ne sont PAS concernées.
--
-- Correctif : INSERT idempotent (WHERE NOT EXISTS) d'un état initial cohérent
-- — state='inactive', since=NULL (valeurs par défaut de la table source_states),
-- même schéma que les migrations existantes (cf. init.sql). Rejouable sans effet.
-- ============================================================================

INSERT INTO source_states (source_id) SELECT 'pannes-hydro-quebec'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'pannes-hydro-quebec');

INSERT INTO source_states (source_id) SELECT 'feries-quebec'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'feries-quebec');

INSERT INTO source_states (source_id) SELECT 'feries-belgique'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'feries-belgique');

INSERT INTO source_states (source_id) SELECT 'feries-suisse'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'feries-suisse');

INSERT INTO source_states (source_id) SELECT 'grandes-journees-mondiales'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'grandes-journees-mondiales');

INSERT INTO source_states (source_id) SELECT 'energie-tarifs'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'energie-tarifs');

INSERT INTO source_states (source_id) SELECT 'ouverture-ventes-sncf'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'ouverture-ventes-sncf');

INSERT INTO source_states (source_id) SELECT 'guide-michelin'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'guide-michelin');
