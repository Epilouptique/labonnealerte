CREATE TABLE IF NOT EXISTS sources (
  id VARCHAR(64) PRIMARY KEY,            -- ex: 'leboncoin-livraison'
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(16) NOT NULL DEFAULT 'internal',  -- internal | external | linked
  endpoint_url TEXT,                     -- null si internal
  link_url TEXT,                         -- service partenaire (type 'linked') : URL de configuration
  badge VARCHAR(16) DEFAULT 'community', -- official | verified | community
  enabled BOOLEAN DEFAULT true,
  requires_confirmation BOOLEAN DEFAULT true, -- true : confirmation sur 2 cycles (scraper) ; false : notif immédiate (API officielle fiable)
  submitted_by_github TEXT,              -- proposition dev (type 'external') : pseudo GitHub
  submitted_by_email TEXT,               -- proposition dev : email de contact
  category TEXT,                         -- annuaire kiosque : plans | risques | tech (hors standard OpenAlert)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Applique les colonnes aux bases existantes (migrate.js rejoue ce fichier).
ALTER TABLE sources ADD COLUMN IF NOT EXISTS requires_confirmation BOOLEAN DEFAULT true;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS submitted_by_github TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS submitted_by_email TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS category TEXT;

CREATE TABLE IF NOT EXISTS source_states (
  source_id VARCHAR(64) PRIMARY KEY REFERENCES sources(id),
  state VARCHAR(16) NOT NULL DEFAULT 'inactive',  -- active | pending | inactive
  since TIMESTAMPTZ,
  until_date TIMESTAMPTZ,
  message TEXT,
  url TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscribers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  confirmed BOOLEAN DEFAULT false,
  token VARCHAR(64),
  magic_token VARCHAR(64),               -- lien magique « Mes alertes » (nullable)
  magic_token_expires_at TIMESTAMPTZ,    -- expiration du lien magique (nullable)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Colonnes du lien magique pour les bases existantes.
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS magic_token VARCHAR(64);
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS magic_token_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS subscriptions (
  subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE CASCADE,
  source_id VARCHAR(64) REFERENCES sources(id) ON DELETE CASCADE,
  PRIMARY KEY (subscriber_id, source_id)
);

INSERT INTO sources (id, name, description, type, badge, category)
SELECT 'leboncoin-livraison', 'Leboncoin — Livraison à 0,99€',
  'Alerte quand la promo livraison Mondial Relay à 0,99€ est active sur leboncoin.fr',
  'internal', 'official', 'plans'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'leboncoin-livraison');

INSERT INTO source_states (source_id)
SELECT 'leboncoin-livraison'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'leboncoin-livraison');

-- Source API officielle : notification immédiate (requires_confirmation = false).
INSERT INTO sources (id, name, description, type, badge, requires_confirmation, category)
SELECT 'vigilance-meteo-05', 'Vigilance Météo — Hautes-Alpes (05)',
  'Alerte quand Météo-France place les Hautes-Alpes en vigilance orange ou rouge (orages, neige, avalanches, canicule...). Source officielle Météo-France.',
  'internal', 'official', false, 'risques'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-05');

INSERT INTO source_states (source_id)
SELECT 'vigilance-meteo-05'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-05');

-- Source API officielle OAuth2 (RTE) : notification immédiate.
INSERT INTO sources (id, name, description, type, badge, requires_confirmation, category)
SELECT 'ecowatt', 'EcoWatt — Tension électrique',
  'Alerte quand RTE annonce un système électrique tendu (orange) ou très tendu avec risque de coupures (rouge), aujourd''hui ou demain. Signal national officiel.',
  'internal', 'official', false, 'risques'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'ecowatt');

INSERT INTO source_states (source_id)
SELECT 'ecowatt'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'ecowatt');

-- Source externe liée : service partenaire configuré sur son propre site.
-- Pas d'abonnement LaBonneAlerte, donc pas de ligne source_states.
INSERT INTO sources (id, name, description, type, badge, link_url, requires_confirmation, category)
SELECT 'doomname', 'DoomName — Surveillance de domaines',
  'Surveillez la disponibilité d''un nom de domaine et soyez alerté quand il se libère. Service partenaire — configuration sur doomname.com.',
  'linked', 'official', 'https://doomname.com', false, 'tech'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'doomname');

-- Attribution de catégorie aux sources existantes (annuaire kiosque, idempotent).
UPDATE sources SET category = 'plans'   WHERE id = 'leboncoin-livraison' AND category IS DISTINCT FROM 'plans';
UPDATE sources SET category = 'risques' WHERE id = 'vigilance-meteo-05'  AND category IS DISTINCT FROM 'risques';
UPDATE sources SET category = 'tech'    WHERE id = 'doomname'            AND category IS DISTINCT FROM 'tech';
