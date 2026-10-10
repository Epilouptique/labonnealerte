// scripts/migrate-source-lifecycle.js — LOT 2 : applique le cycle de vie des sources.
// IDEMPOTENT. dry-run par défaut ; --write pour exécuter. À lancer par Hugo avec la
// bonne DATABASE_URL (jamais affichée). N'exécute QUE le DDL/backfill du bloc init.sql
// « OpenAlert v3 · LOT 2 » — aucune donnée métier touchée hors status/enabled/horodatages.
//
//   node scripts/migrate-source-lifecycle.js              (simulation)
//   node scripts/migrate-source-lifecycle.js --write      (exécution)
'use strict';
require('dotenv').config();
const WRITE = process.argv.includes('--write');

const DDL = `
ALTER TABLE sources ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'published';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS author_subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE SET NULL;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS status_reason VARCHAR(280);
ALTER TABLE sources ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE sources ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS engine VARCHAR(16);

CREATE OR REPLACE FUNCTION sources_sync_enabled() RETURNS trigger AS $FN$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    NEW.enabled := (NEW.status = 'published');
    NEW.status_changed_at := NOW();
    IF NEW.status = 'published' AND NEW.published_at IS NULL THEN NEW.published_at := NOW(); END IF;
  ELSE
    IF (NEW.status IS DISTINCT FROM OLD.status) THEN
      NEW.enabled := (NEW.status = 'published');
      NEW.status_changed_at := NOW();
      IF NEW.status = 'published' AND NEW.published_at IS NULL THEN NEW.published_at := NOW(); END IF;
    ELSIF (NEW.enabled IS DISTINCT FROM OLD.enabled) THEN
      IF NEW.enabled THEN
        NEW.status := 'published';
        NEW.published_at := COALESCE(NEW.published_at, NOW());
      ELSIF OLD.status = 'published' THEN
        NEW.status := 'suspended';
      END IF;
      NEW.status_changed_at := NOW();
    END IF;
  END IF;
  RETURN NEW;
END $FN$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sources_sync_enabled ON sources;
CREATE TRIGGER trg_sources_sync_enabled BEFORE INSERT OR UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION sources_sync_enabled();

UPDATE sources SET status = 'suspended',
       status_reason = COALESCE(status_reason, 'Désactivée (administration)')
 WHERE enabled = false AND status = 'published';
UPDATE sources SET published_at = COALESCE(published_at, created_at) WHERE status = 'published';

DO $DO$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sources_status_chk') THEN
    ALTER TABLE sources ADD CONSTRAINT sources_status_chk CHECK (status IN ('draft','testing','review','published','suspended'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sources_enabled_status_chk') THEN
    ALTER TABLE sources ADD CONSTRAINT sources_enabled_status_chk CHECK (enabled = (status = 'published'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sources_engine_chk') THEN
    ALTER TABLE sources ADD CONSTRAINT sources_engine_chk CHECK (engine IS NULL OR engine IN ('veille-page','veille-rss','veille-agenda','external'));
  END IF;
END $DO$;

CREATE INDEX IF NOT EXISTS idx_sources_author ON sources (author_subscriber_id);
CREATE INDEX IF NOT EXISTS idx_sources_status ON sources (status);

-- LOT 3 : config d'exécution + signalements.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS engine_config JSONB;
CREATE TABLE IF NOT EXISTS source_reports (
  id SERIAL PRIMARY KEY,
  source_id VARCHAR(64) REFERENCES sources(id) ON DELETE CASCADE,
  reporter_subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE SET NULL,
  reason VARCHAR(32) NOT NULL,
  comment VARCHAR(280),
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source_id, reporter_subscriber_id)
);
CREATE INDEX IF NOT EXISTS idx_source_reports_src ON source_reports (source_id);

-- Motif explicite pour les deux sources tierces désactivées par l'administrateur.
UPDATE sources SET status_reason = 'Désactivée par l''administrateur, source tierce indisponible'
 WHERE id IN ('sncf-perturbations','eruption-volcanique') AND status = 'suspended';
`;

(async () => {
  const { pool } = require('../server/db');
  try {
    console.log(`MODE : ${WRITE ? 'ÉCRITURE (--write)' : 'SIMULATION (dry-run)'}`);
    // État courant (lecture seule).
    const col = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='sources' AND column_name IN ('status','engine','author_subscriber_id','status_reason','published_at')");
    console.log(`Colonnes déjà présentes : ${col.rows.map((r) => r.column_name).join(', ') || '(aucune)'}`);
    const hasStatus = col.rows.some((r) => r.column_name === 'status');
    if (hasStatus) {
      const d = await pool.query('SELECT status, COUNT(*)::int n FROM sources GROUP BY status ORDER BY status');
      console.log('Répartition par statut :', JSON.stringify(Object.fromEntries(d.rows.map((r) => [r.status, r.n]))));
    } else {
      const d = await pool.query('SELECT enabled, COUNT(*)::int n FROM sources GROUP BY enabled');
      console.log('enabled → deviendra published/suspended :', JSON.stringify(Object.fromEntries(d.rows.map((r) => [String(r.enabled), r.n]))));
    }

    if (!WRITE) {
      console.log('\nSIMULATION : aucune écriture. Relancez avec --write pour appliquer le DDL idempotent.');
      return;
    }
    await pool.query('BEGIN');
    await pool.query(DDL);
    await pool.query('COMMIT');
    const d = await pool.query('SELECT status, COUNT(*)::int n FROM sources GROUP BY status ORDER BY status');
    console.log('\n✅ Appliqué. Répartition finale :', JSON.stringify(Object.fromEntries(d.rows.map((r) => [r.status, r.n]))));
  } catch (e) {
    try { await pool.query('ROLLBACK'); } catch {}
    console.error('Erreur :', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
