CREATE TABLE IF NOT EXISTS sources (
  id VARCHAR(64) PRIMARY KEY,            -- ex: 'leboncoin-livraison'
  name VARCHAR(255) NOT NULL,            -- titre court (~15-20 caractères)
  subtitle TEXT,                         -- fonction en une ligne (~25-30 caractères)
  description TEXT,                      -- description courte (~100-120 caractères)
  type VARCHAR(16) NOT NULL DEFAULT 'internal',  -- internal | external | linked
  endpoint_url TEXT,                     -- null si internal
  link_url TEXT,                         -- service partenaire (type 'linked') : URL de configuration
  badge VARCHAR(16) DEFAULT 'community', -- official | verified | community
  enabled BOOLEAN DEFAULT true,
  requires_confirmation BOOLEAN DEFAULT true, -- true : confirmation sur 2 cycles (scraper) ; false : notif immédiate (API officielle fiable)
  submitted_by_github TEXT,              -- proposition dev (type 'external') : pseudo GitHub
  submitted_by_email TEXT,               -- proposition dev : email de contact
  categories TEXT[] DEFAULT '{}',        -- annuaire kiosque : tags fermés (max 3), hors standard OpenAlert
  display_order INTEGER DEFAULT 100,     -- ordre d'affichage (les soumissions gardent 100 = fin de liste)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Applique les colonnes aux bases existantes (migrate.js rejoue ce fichier).
ALTER TABLE sources ADD COLUMN IF NOT EXISTS requires_confirmation BOOLEAN DEFAULT true;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS submitted_by_github TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS submitted_by_email TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 100;

-- Migration category (TEXT) -> categories (TEXT[]) puis suppression de l'ancienne colonne.
-- Mappe les anciens slugs vers la liste fermée actuelle ; défaut 'autre'.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'sources' AND column_name = 'category'
  ) THEN
    UPDATE sources SET categories = CASE category
        WHEN 'plans'   THEN ARRAY['bons-plans']
        WHEN 'risques' THEN ARRAY['meteo-risques']
        WHEN 'tech'    THEN ARRAY['tech']
        WHEN 'energie' THEN ARRAY['energie']
        ELSE ARRAY['autre']
      END
     WHERE category IS NOT NULL
       AND (categories IS NULL OR categories = '{}');
    ALTER TABLE sources DROP COLUMN category;
  END IF;
END $$;

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

-- Identités OAuth (fusion de compte par email vérifié).
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS github_id TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS github_username TEXT;

-- Sessions durables (90 jours, expiration glissante). Le lien magique ne sert
-- qu'à ouvrir une session ; l'authentification des routes se fait via ce token.
CREATE TABLE IF NOT EXISTS sessions (
  token VARCHAR(64) PRIMARY KEY,
  subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS subscriptions (
  subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE CASCADE,
  source_id VARCHAR(64) REFERENCES sources(id) ON DELETE CASCADE,
  PRIMARY KEY (subscriber_id, source_id)
);

-- Abonnements push web (une entrée par appareil/navigateur d'un abonné).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriber ON push_subscriptions (subscriber_id);

-- Préférence d'envoi email (le push a son propre opt-in via push_subscriptions).
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN DEFAULT true;

-- Historique des événements de surveillance (transparence / status pages).
CREATE TABLE IF NOT EXISTS source_events (
  id SERIAL PRIMARY KEY,
  source_id VARCHAR(64) REFERENCES sources(id) ON DELETE CASCADE,
  event VARCHAR(16) NOT NULL,            -- 'activated' | 'deactivated' | 'failed'
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_source_events_source_date
  ON source_events (source_id, created_at DESC);

-- Compteurs globaux (vérifications effectuées, emails envoyés…).
CREATE TABLE IF NOT EXISTS counters (
  key VARCHAR(64) PRIMARY KEY,
  value BIGINT NOT NULL DEFAULT 0
);

INSERT INTO sources (id, name, subtitle, description, type, badge, categories, display_order)
SELECT 'leboncoin-livraison', 'Livraison à 0,99 €', 'Promo Mondial Relay sur leboncoin',
  'Alerte quand la promo livraison Mondial Relay à 0,99€ est active sur leboncoin.fr',
  'internal', 'official', ARRAY['bons-plans'], 10
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'leboncoin-livraison');

INSERT INTO source_states (source_id)
SELECT 'leboncoin-livraison'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'leboncoin-livraison');

-- Source API officielle : notification immédiate (requires_confirmation = false).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-05', 'Vigilance météo — 05', 'Alertes orange et rouge Météo-France',
  'Alerte quand Météo-France place les Hautes-Alpes en vigilance orange ou rouge (orages, neige, avalanches, canicule...). Source officielle Météo-France.',
  'internal', 'official', false, ARRAY['meteo-risques'], 20
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-05');

INSERT INTO source_states (source_id)
SELECT 'vigilance-meteo-05'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-05');

-- Vigilance météo (mêmes API/factory que le 05, un seul appel partagé).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-13', 'Vigilance météo — Bouches-du-Rhône', 'Alertes orange et rouge Météo-France',
  'Alerte quand Météo-France place les Bouches-du-Rhône en vigilance orange ou rouge (canicule, orages, pluie-inondation...). Source officielle Météo-France.',
  'internal', 'official', false, ARRAY['vigilance-meteo', 'meteo-risques'], 21
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-13');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-13'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-13');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-69', 'Vigilance météo — Rhône', 'Alertes orange et rouge Météo-France',
  'Alerte quand Météo-France place le Rhône en vigilance orange ou rouge (canicule, orages, neige-verglas...). Source officielle Météo-France.',
  'internal', 'official', false, ARRAY['vigilance-meteo', 'meteo-risques'], 22
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-69');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-69'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-69');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-75', 'Vigilance météo — Paris', 'Alertes orange et rouge Météo-France',
  'Alerte quand Météo-France place Paris en vigilance orange ou rouge (canicule, orages, pluie-inondation...). Source officielle Météo-France.',
  'internal', 'official', false, ARRAY['vigilance-meteo', 'meteo-risques'], 23
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-75');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-75'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-75');

-- Source API officielle OAuth2 (RTE) : notification immédiate.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'ecowatt', 'EcoWatt', 'Tension du réseau électrique',
  'Alerte quand RTE annonce un système électrique tendu (orange) ou très tendu avec risque de coupures (rouge), aujourd''hui ou demain. Signal national officiel.',
  'internal', 'official', false, ARRAY['energie'], 30
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'ecowatt');

INSERT INTO source_states (source_id)
SELECT 'ecowatt'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'ecowatt');

-- Source API officielle Ecogaz (GRTgaz) : le jumeau gaz d'EcoWatt.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'ecogaz', 'Ecogaz', 'Tension du réseau de gaz',
  'Alerte quand GRTgaz annonce un réseau de gaz tendu (orange) ou très tendu avec risque de coupures (rouge), aujourd''hui ou demain. Signal national officiel Ecogaz.',
  'internal', 'official', false, ARRAY['energie', 'gaz'], 31
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'ecogaz');
INSERT INTO source_states (source_id) SELECT 'ecogaz'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'ecogaz');

-- Source API officielle VigiEau : restrictions sécheresse pour Gap (05061).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigieau-gap', 'Restrictions d''eau — Gap', 'Arrêtés sécheresse en vigueur',
  'Alerte quand la préfecture place Gap et ses environs en restriction d''usage de l''eau (arrosage, piscines, lavage). Source officielle VigiEau.',
  'internal', 'official', false, ARRAY['secheresse', 'meteo-risques'], 26
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigieau-gap');
INSERT INTO source_states (source_id) SELECT 'vigieau-gap'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigieau-gap');

-- Source interne récurrente (offre hebdomadaire) : notification immédiate.
-- Le poller re-notifie à chaque nouvel « épisode » (avancée du champ since).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'epic-jeu-gratuit', 'Jeu gratuit Epic', 'Le jeu PC offert de la semaine',
  'Chaque semaine, l''Epic Games Store offre un jeu PC. Soyez prévenu dès qu''un nouveau jeu devient gratuit, avec son nom et la date limite.',
  'internal', 'official', false, ARRAY['jeux-video', 'bons-plans'], 15
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'epic-jeu-gratuit');

INSERT INTO source_states (source_id)
SELECT 'epic-jeu-gratuit'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'epic-jeu-gratuit');

-- Source interne headless (giveaway GOG ponctuel) : notification immédiate.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'gog-jeu-offert', 'Jeu offert GOG', 'Les jeux offerts ponctuellement par GOG',
  'GOG offre parfois un jeu PC sans DRM pendant quelques jours. Soyez prévenu dès que ça arrive.',
  'internal', 'official', false, ARRAY['jeux-video', 'bons-plans'], 17
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'gog-jeu-offert');

INSERT INTO source_states (source_id)
SELECT 'gog-jeu-offert'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'gog-jeu-offert');

-- Source API officielle Vigicrues (SCHAPI) : notification immédiate.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigicrues-05', 'Crues — Hautes-Alpes', 'Vigilance crues de la Durance',
  'Alerte quand la Durance (de Serre-Ponçon à Cadarache) passe en vigilance crues orange ou rouge. Source officielle Vigicrues (SCHAPI).',
  'internal', 'official', false, ARRAY['crues', 'meteo-risques'], 25
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigicrues-05');

INSERT INTO source_states (source_id)
SELECT 'vigicrues-05'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigicrues-05');

-- Correctif idempotent (installations existantes) : Vigicrues ne couvre que la
-- Durance pour le 05 (GA30, GA21), ni le Buëch ni le Guil.
UPDATE sources
   SET subtitle = 'Vigilance crues de la Durance',
       description = 'Alerte quand la Durance (de Serre-Ponçon à Cadarache) passe en vigilance crues orange ou rouge. Source officielle Vigicrues (SCHAPI).'
 WHERE id = 'vigicrues-05';

-- Source externe liée : service partenaire configuré sur son propre site.
-- Pas d'abonnement LaBonneAlerte, donc pas de ligne source_states.
INSERT INTO sources (id, name, subtitle, description, type, badge, link_url, requires_confirmation, categories, display_order)
SELECT 'doomname', 'DoomName', 'Surveillance de noms de domaine',
  'Surveillez la disponibilité d''un nom de domaine et soyez alerté quand il se libère. Service partenaire — configuration sur doomname.com.',
  'linked', 'official', 'https://doomname.com', false, ARRAY['tech'], 40
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'doomname');

-- Métadonnées des sources existantes (idempotent) : titres courts, sous-titres,
-- catégories (tags) et ordre d'affichage.
UPDATE sources SET name = 'Livraison à 0,99 €', subtitle = 'Promo Mondial Relay sur leboncoin',
       categories = ARRAY['bons-plans'], display_order = 10 WHERE id = 'leboncoin-livraison';
UPDATE sources SET name = 'Vigilance météo — 05', subtitle = 'Alertes orange et rouge Météo-France',
       categories = ARRAY['meteo-risques'], display_order = 20 WHERE id = 'vigilance-meteo-05';
UPDATE sources SET name = 'EcoWatt', subtitle = 'Tension du réseau électrique',
       categories = ARRAY['energie'], display_order = 30 WHERE id = 'ecowatt';
UPDATE sources SET name = 'DoomName', subtitle = 'Surveillance de noms de domaine',
       categories = ARRAY['tech'], display_order = 40 WHERE id = 'doomname';

-- Auteur GitHub des sources maison (affiché au verso des cartes).
UPDATE sources SET submitted_by_github = 'Epilouptique'
 WHERE id IN ('leboncoin-livraison', 'doomname') AND submitted_by_github IS DISTINCT FROM 'Epilouptique';
