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
        WHEN 'risques' THEN ARRAY['vigilance-meteo']
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

-- Persistance des références anti-rétroactives (opt-in par source via loadRef/dumpRef,
-- cf. poller.js). NULL = pas de référence persistée → amorçage classique. Voir garde-fous
-- (dégradation silencieuse si la colonne manque, plafond de taille) dans poller.js.
ALTER TABLE source_states ADD COLUMN IF NOT EXISTS ref JSONB NULL;

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

-- Personnalisation de l'affichage (facultative). NULL = non renseigné ; la France
-- n'est un défaut que côté UI, jamais en base. Départements en TEXT (Corse 2A/2B).
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS departement TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS interests TEXT[];

-- Traçabilité de l'origine de country / departement : 'manual' (saisi/confirmé par
-- l'utilisateur dans Mon compte) ou 'auto' (pré-rempli depuis l'IP à l'inscription).
-- NULL = inconnu (comptes antérieurs, jamais rétro-remplis). Champs internes : aucune
-- UI, aucun comportement ne s'y appuie de façon bloquante — usage futur (ex. cibler les
-- profils jamais confirmés).
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS country_source TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS departement_source TEXT;

-- Granularités région / ville (pré-remplissage IPLocate : subdivision + city). Mêmes
-- règles que country/departement : NULL = non renseigné, *_source 'auto'|'manual'|NULL.
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS ville TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS region_source TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS ville_source TEXT;

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

-- ================================================================
-- OpenAlert v2 — sources paramétrées (étape 1 : schéma seul, aucune UI).
-- Rétrocompatible : params NULL = abonnement broadcast (comportement v1).
-- ================================================================

-- Schéma de paramètres déclaré par la source (interne ou externe). NULL = broadcast.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS params_schema JSONB NULL;

-- Valeurs de l'abonnement paramétré. NULL = broadcast (v1). Ex : {"departement":"05"}.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS params JSONB NULL;
-- F2) Mise en pause d'un abonnement SANS le supprimer (conserve les paramètres).
-- muted = true → le poller ne notifie plus cet abonnement (l'etat par combinaison,
-- partage entre abonnes, reste calcule). Defaut false = comportement inchange.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS muted BOOLEAN NOT NULL DEFAULT false;

-- Unicité : aujourd'hui garantie par la PK (subscriber_id, source_id). On la
-- remplace par un index unique sur (subscriber_id, source_id, COALESCE(params,'{}'))
-- pour autoriser plusieurs combinaisons par (abonné, source) tout en gardant
-- l'unicité du broadcast (params NULL → '{}'). Les INSERT applicatifs ciblent
-- désormais cette expression dans leur ON CONFLICT (subscribe.js, myalerts.js).
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_sub_src_params
  ON subscriptions (subscriber_id, source_id, COALESCE(params, '{}'::jsonb));

-- État par combinaison de paramètres (mêmes colonnes/valeurs par défaut que
-- source_states ; PK (source_id, params)). L'existant source_states reste le
-- chemin des sources broadcast, inchangé.
CREATE TABLE IF NOT EXISTS source_param_states (
  source_id VARCHAR(64) REFERENCES sources(id),
  params JSONB NOT NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'inactive',  -- active | pending | inactive
  since TIMESTAMPTZ,
  until_date TIMESTAMPTZ,
  message TEXT,
  url TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (source_id, params)
);

-- Persistance des références anti-rétroactives par combinaison (opt-in, cf. poller.js).
ALTER TABLE source_param_states ADD COLUMN IF NOT EXISTS ref JSONB NULL;

-- Historique par combinaison (les événements broadcast gardent params NULL).
ALTER TABLE source_events ADD COLUMN IF NOT EXISTS params JSONB NULL;

-- ================================================================
-- OpenAlert v2 · étape 2 — Vigilance météo PARAMÉTRÉE (dual-run avec les 15).
-- État par combinaison dans source_param_states : PAS de ligne source_states.
-- ================================================================
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'vigilance-meteo', 'Vigilance météo', 'Le département de votre choix',
  'Votre département passe en vigilance orange ou rouge ? Météo-France parle, vous êtes prévenu.',
  'internal', 'official', false, ARRAY['vigilance-meteo'], 19, '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"01","label":"Ain"},{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"15","label":"Cantal"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"26","label":"Drôme"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"32","label":"Gers"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"39","label":"Jura"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"48","label":"Lozère"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"91","label":"Essonne"},{"value":"92","label":"Hauts-de-Seine"},{"value":"93","label":"Seine-Saint-Denis"},{"value":"94","label":"Val-de-Marne"},{"value":"95","label":"Val-d''Oise"},{"value":"971","label":"Guadeloupe"},{"value":"972","label":"Martinique"},{"value":"973","label":"Guyane"},{"value":"974","label":"La Réunion"},{"value":"976","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo');
-- Réaligne le schéma en base sur le référentiel courant (idempotent).
UPDATE sources SET params_schema = '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"01","label":"Ain"},{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"15","label":"Cantal"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"26","label":"Drôme"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"32","label":"Gers"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"39","label":"Jura"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"48","label":"Lozère"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"91","label":"Essonne"},{"value":"92","label":"Hauts-de-Seine"},{"value":"93","label":"Seine-Saint-Denis"},{"value":"94","label":"Val-de-Marne"},{"value":"95","label":"Val-d''Oise"},{"value":"971","label":"Guadeloupe"},{"value":"972","label":"Martinique"},{"value":"973","label":"Guyane"},{"value":"974","label":"La Réunion"},{"value":"976","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'vigilance-meteo';


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
  'Les Hautes-Alpes passent en vigilance orange ou rouge ? Orages, neige, avalanches : vous êtes prévenu.',
  'internal', 'official', false, ARRAY['vigilance-meteo'], 20
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-05');

INSERT INTO source_states (source_id)
SELECT 'vigilance-meteo-05'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-05');

-- Vigilance météo (mêmes API/factory que le 05, un seul appel partagé).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-13', 'Vigilance météo — Bouches-du-Rhône', 'Alertes orange et rouge Météo-France',
  'Les Bouches-du-Rhône passent en vigilance orange ou rouge ? Canicule, orages : vous êtes prévenu.',
  'internal', 'official', false, ARRAY['vigilance-meteo'], 21
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-13');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-13'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-13');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-69', 'Vigilance météo — Rhône', 'Alertes orange et rouge Météo-France',
  'Le Rhône passe en vigilance orange ou rouge ? Canicule, orages, neige : vous êtes prévenu.',
  'internal', 'official', false, ARRAY['vigilance-meteo'], 22
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-69');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-69'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-69');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-75', 'Vigilance météo — Paris', 'Alertes orange et rouge Météo-France',
  'Paris passe en vigilance orange ou rouge ? Canicule, orages, pluie : vous êtes prévenu.',
  'internal', 'official', false, ARRAY['vigilance-meteo'], 23
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-75');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-75'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-75');

-- Source API officielle OAuth2 (RTE) : notification immédiate.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'ecowatt', 'EcoWatt', 'Tension du réseau électrique',
  'Système électrique tendu, risque de coupures ? Le signal national officiel, aujourd''hui et demain.',
  'internal', 'official', false, ARRAY['energie'], 30
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'ecowatt');

INSERT INTO source_states (source_id)
SELECT 'ecowatt'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'ecowatt');

-- Source API officielle Ecogaz (GRTgaz) : le jumeau gaz d'EcoWatt.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'ecogaz', 'Ecogaz', 'Tension du réseau de gaz',
  'Réseau de gaz tendu, risque de coupures ? Le signal national officiel, aujourd''hui et demain.',
  'internal', 'official', false, ARRAY['energie', 'gaz'], 31
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'ecogaz');
INSERT INTO source_states (source_id) SELECT 'ecogaz'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'ecogaz');

-- Source API officielle VigiEau : restrictions sécheresse pour Gap (05061).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigieau-gap', 'Restrictions d''eau — Gap', 'Arrêtés sécheresse en vigueur',
  'Gap et ses environs en restriction d''eau ? Arrosage, piscine, lavage : vous êtes prévenu direct.',
  'internal', 'official', false, ARRAY['secheresse', 'vigilance-meteo'], 26
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigieau-gap');
INSERT INTO source_states (source_id) SELECT 'vigieau-gap'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigieau-gap');

-- Source interne récurrente (offre hebdomadaire) : notification immédiate.
-- Le poller re-notifie à chaque nouvel « épisode » (avancée du champ since).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'epic-jeu-gratuit', 'Jeu gratuit Epic', 'Le jeu PC offert de la semaine',
  'Chaque semaine, un jeu PC gratuit sur l''Epic Games Store : prévenu dès qu''il tombe, avec la date limite.',
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
  'La Durance passe en vigilance crues orange ou rouge ? De Serre-Ponçon à Cadarache, vous êtes prévenu.',
  'internal', 'official', false, ARRAY['crues', 'vigilance-meteo'], 25
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

-- Sources « panne de service » (standard Statuspage). requires_confirmation =
-- TRUE : anti-flapping — une page de statut peut passer brièvement en « major »
-- puis revenir ; la confirmation sur 2 cycles évite de notifier un hoquet.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-github', 'Panne GitHub', 'Statut officiel de GitHub',
  'GitHub en panne ? Fini le doute « c''est moi ou c''est en panne ? » — vous avez la réponse.',
  'internal', 'official', true, ARRAY['pannes-services', 'github'], 40
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-github');
INSERT INTO source_states (source_id) SELECT 'statut-github'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-github');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-cloudflare', 'Panne Cloudflare', 'Statut officiel de Cloudflare',
  'Cloudflare en panne ? Quand la moitié du web tousse, vous savez pourquoi — et direct.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 41
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-cloudflare');
INSERT INTO source_states (source_id) SELECT 'statut-cloudflare'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-cloudflare');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-openai', 'Panne OpenAI', 'Statut officiel de OpenAI',
  'OpenAI en panne ? Fini le doute « c''est moi ou c''est en panne ? » — vous avez la réponse.',
  'internal', 'official', true, ARRAY['pannes-services', 'tech'], 42
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-openai');
INSERT INTO source_states (source_id) SELECT 'statut-openai'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-openai');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-discord', 'Panne Discord', 'Statut officiel de Discord',
  'Discord en panne ? Fini le doute « c''est moi ou c''est en panne ? » — vous avez la réponse.',
  'internal', 'official', true, ARRAY['pannes-services', 'tech'], 43
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-discord');
INSERT INTO source_states (source_id) SELECT 'statut-discord'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-discord');

-- Sources « calculées » (zéro API) : l'état se déduit de dates.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'changement-heure', 'Changement d''heure', 'Été et hiver, ne l''oubliez plus',
  'On avance ou on recule ? Prévenu quelques jours avant le changement d''heure. L''horloge ne vous aura plus.',
  'internal', 'official', false, ARRAY['vie-locale'], 50
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'changement-heure');
INSERT INTO source_states (source_id) SELECT 'changement-heure'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'changement-heure');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'soldes', 'Soldes nationales', 'Début des soldes officielles',
  'Soyez prévenu à l''approche des soldes nationales d''hiver et d''été, puis pendant toute leur durée.',
  'internal', 'official', false, ARRAY['soldes', 'bons-plans'], 51
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'soldes');
INSERT INTO source_states (source_id) SELECT 'soldes'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'soldes');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'perseides', 'Nuit des étoiles filantes', 'Le pic des Perséides en août',
  'Un rappel avant le pic des Perséides, la plus belle pluie d''étoiles filantes de l''année, dans la nuit du 12 au 13 août.',
  'internal', 'official', false, ARRAY['astronomie', 'etoiles-filantes'], 52
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'perseides');
INSERT INTO source_states (source_id) SELECT 'perseides'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'perseides');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'beaujolais-nouveau', 'Beaujolais nouveau', 'Le 3e jeudi de novembre',
  'Le 3e jeudi de novembre, le Beaujolais nouveau est arrivé. Prévenu à temps — l''excuse est toute trouvée.',
  'internal', 'official', false, ARRAY['vins', 'alimentation'], 53
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'beaujolais-nouveau');
INSERT INTO source_states (source_id) SELECT 'beaujolais-nouveau'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'beaujolais-nouveau');

-- Source Steam (heuristique sur les soldes saisonnières) : requires_confirmation true.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'soldes-steam', 'Soldes Steam', 'Les grandes soldes saisonnières',
  'Les grandes soldes Steam débarquent : des milliers de jeux en promo, et votre backlog qui tremble déjà.',
  'internal', 'official', true, ARRAY['jeux-video', 'soldes'], 54
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'soldes-steam');
INSERT INTO source_states (source_id) SELECT 'soldes-steam'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'soldes-steam');

-- Source aurores boréales (NOAA SWPC, données scientifiques).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'aurores-france', 'Aurores en France', 'Tempêtes géomagnétiques visibles',
  'Des aurores boréales visibles depuis la France ? Ça arrive — et vous serez dehors au bon moment.',
  'internal', 'official', false, ARRAY['aurores-boreales', 'astronomie'], 55
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'aurores-france');
INSERT INTO source_states (source_id) SELECT 'aurores-france'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'aurores-france');

-- ================================================================
-- Vague 4 : séismes (EMSC), vacances scolaires (zones A/B/C), SNCF.
-- ================================================================

-- Séismes ressentis en métropole (EMSC / centre euro-méditerranéen).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'seismes-france', 'Séisme en France', 'Secousses ressenties en métropole',
  'La terre a tremblé en France (magnitude 4+) ? Vous êtes informé dans les heures qui suivent.',
  'internal', 'official', false, ARRAY['seismes', 'vigilance-meteo'], 27
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'seismes-france');
INSERT INTO source_states (source_id) SELECT 'seismes-france'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'seismes-france');

-- Grandes perturbations SNCF (grève / mouvement social). Heuristique par mots-clés
-- → requires_confirmation = TRUE (anti faux positif).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'sncf-perturbations', 'Perturbations SNCF', 'Grèves et mouvements sociaux',
  'Grève ou mouvement social sur le rail ? Prévenu des grandes perturbations avant d''aller sur le quai.',
  'internal', 'official', true, ARRAY['greves', 'transports'], 35
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'sncf-perturbations');
INSERT INTO source_states (source_id) SELECT 'sncf-perturbations'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'sncf-perturbations');

-- Vacances scolaires — compte à rebours du départ (7 jours avant), par zone.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vacances-zone-a', 'Vacances — Zone A', 'Le compte à rebours des vacances',
  'Zone A : le compte à rebours des vacances est lancé. Prévenu une semaine avant le grand départ.',
  'internal', 'official', false, ARRAY['vacances-scolaires', 'vie-locale'], 60
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vacances-zone-a');
INSERT INTO source_states (source_id) SELECT 'vacances-zone-a'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vacances-zone-a');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vacances-zone-b', 'Vacances — Zone B', 'Le compte à rebours des vacances',
  'Zone B : le compte à rebours des vacances est lancé. Prévenu une semaine avant le grand départ.',
  'internal', 'official', false, ARRAY['vacances-scolaires', 'vie-locale'], 61
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vacances-zone-b');
INSERT INTO source_states (source_id) SELECT 'vacances-zone-b'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vacances-zone-b');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vacances-zone-c', 'Vacances — Zone C', 'Le compte à rebours des vacances',
  'Zone C : le compte à rebours des vacances est lancé. Prévenu une semaine avant le grand départ.',
  'internal', 'official', false, ARRAY['vacances-scolaires', 'vie-locale'], 62
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vacances-zone-c');
INSERT INTO source_states (source_id) SELECT 'vacances-zone-c'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vacances-zone-c');

-- ================================================================
-- Vague 5 : carburants, vigilances 06/33/59, statuts npm & Vercel.
-- (Torrents 05 et Qualité de l'air Gap écartés : données temps réel
--  inaccessibles / API dépréciée — voir rapport de faisabilité.)
-- ================================================================

-- Prix des carburants : franchissement de seuil symbolique à la baisse.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'carburant-seuils', 'Carburant en baisse', 'Passages sous les seuils symboliques',
  'Le gazole ou le SP95 repasse sous un seuil symbolique ? Le bon moment pour faire le plein, signalé.',
  'internal', 'official', false, ARRAY['prix-carburant', 'bons-plans'], 33
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'carburant-seuils');
INSERT INTO source_states (source_id) SELECT 'carburant-seuils'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'carburant-seuils');

-- Vigilances météo supplémentaires (même API/factory, un seul appel partagé).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-06', 'Vigilance météo — Alpes-Maritimes', 'Alertes orange et rouge Météo-France',
  'Les Alpes-Maritimes passent en vigilance orange ou rouge ? Orages, pluie, canicule : vous êtes prévenu.',
  'internal', 'official', false, ARRAY['vigilance-meteo'], 24
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-06');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-06'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-06');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-33', 'Vigilance météo — Gironde', 'Alertes orange et rouge Météo-France',
  'La Gironde passe en vigilance orange ou rouge ? Tempêtes, canicule, orages : vous êtes prévenu.',
  'internal', 'official', false, ARRAY['vigilance-meteo'], 25
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-33');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-33'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-33');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-59', 'Vigilance météo — Nord', 'Alertes orange et rouge Météo-France',
  'Le Nord passe en vigilance orange ou rouge ? Vent violent, neige-verglas : vous êtes prévenu.',
  'internal', 'official', false, ARRAY['vigilance-meteo'], 26
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-59');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-59'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-59');

-- Statuts de service supplémentaires (standard Statuspage). Anti-flapping : TRUE.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-npm', 'Panne npm', 'Statut officiel de npm',
  'npm en panne ? Vos installs qui échouent ont une explication — et vous l''avez avant tout le monde.',
  'internal', 'official', true, ARRAY['pannes-services', 'npm-packages'], 42
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-npm');
INSERT INTO source_states (source_id) SELECT 'statut-npm'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-npm');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-vercel', 'Panne Vercel', 'Statut officiel de Vercel',
  'Vercel en panne ? Votre déploiement qui échoue a une explication — et vous l''avez direct.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 43
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-vercel');
INSERT INTO source_states (source_id) SELECT 'statut-vercel'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-vercel');

-- ================================================================
-- Vague 6 : espace, Node LTS, statuts (Anthropic/Netlify/Railway),
--           fériés & ponts, Black Friday, Journées du patrimoine.
-- ================================================================

-- Lancements spatiaux européens (Launch Library 2).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'lancement-spatial', 'Lancement spatial', 'Les fusées européennes qui décollent',
  'Une fusée européenne décolle dans les 24h : heure de Paris et lieu inclus. Levez les yeux.',
  'internal', 'official', false, ARRAY['lancements-spatiaux', 'espace'], 57
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'lancement-spatial');
INSERT INTO source_states (source_id) SELECT 'lancement-spatial'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'lancement-spatial');

-- Nouvelles versions LTS de Node.js.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'node-lts', 'Node.js LTS', 'Nouvelles versions LTS de Node',
  'Nouvelle version LTS de Node.js ? Numéro et nom de code inclus. Mettez à jour l''esprit tranquille.',
  'internal', 'official', false, ARRAY['versions-logiciels', 'tech'], 45
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'node-lts');
INSERT INTO source_states (source_id) SELECT 'node-lts'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'node-lts');

-- Statuts de service supplémentaires. Anti-flapping : requires_confirmation = TRUE.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-anthropic', 'Panne Anthropic', 'Statut officiel de Claude / Anthropic',
  'Claude en panne ? Fini le doute « c''est moi ou c''est en panne ? » — vous avez la réponse.',
  'internal', 'official', true, ARRAY['pannes-services', 'tech'], 44
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-anthropic');
INSERT INTO source_states (source_id) SELECT 'statut-anthropic'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-anthropic');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-netlify', 'Panne Netlify', 'Statut officiel de Netlify',
  'Netlify en panne ? Votre déploiement qui échoue a une explication — et vous l''avez direct.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 46
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-netlify');
INSERT INTO source_states (source_id) SELECT 'statut-netlify'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-netlify');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-railway', 'Panne Railway', 'Statut officiel de Railway',
  'Railway en panne ? Fini le doute « c''est mon app ou c''est l''hébergeur ? » — vous avez la réponse.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 47
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-railway');
INSERT INTO source_states (source_id) SELECT 'statut-railway'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-railway');

-- Jours fériés & ponts (API calendrier gouv).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'jours-feries', 'Fériés & ponts', 'Les prochains jours fériés et leurs ponts',
  'Un férié approche — et peut-être un pont ! Prévenu une semaine avant, selon votre zone.',
  'internal', 'official', false, ARRAY['vie-locale'], 58
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'jours-feries');
INSERT INTO source_states (source_id) SELECT 'jours-feries'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'jours-feries');

-- Sources calculées (zéro API) supplémentaires.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'black-friday', 'Black Friday', 'Le rendez-vous shopping de novembre',
  'Le Black Friday approche : prévenu quelques jours avant. Et méfiez-vous des fausses promos.',
  'internal', 'official', false, ARRAY['deals-du-jour', 'bons-plans'], 51
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'black-friday');
INSERT INTO source_states (source_id) SELECT 'black-friday'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'black-friday');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'journees-patrimoine', 'Journées du patrimoine', 'Le 3e week-end de septembre',
  'Le 3e week-end de septembre, des lieux fermés toute l''année ouvrent gratuitement. Prévenu avant.',
  'internal', 'official', false, ARRAY['patrimoine', 'culture'], 59
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'journees-patrimoine');
INSERT INTO source_states (source_id) SELECT 'journees-patrimoine'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'journees-patrimoine');

-- ================================================================
-- Vague 7 : RappelConso, 4 vigilances de plus, 4 statuts de plus.
-- ================================================================

-- Rappels de produits alimentaires à risque grave (RappelConso / DGCCRF).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'rappel-conso', 'Rappels produits', 'Rappels alimentaires à risque grave',
  'Un produit rappelé pour risque grave dans vos rayons préférés ? Alerte immédiate, sans le bruit du reste.',
  'internal', 'official', true, ARRAY['rappels-produits', 'alimentation', 'sante'], 34
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'rappel-conso');
INSERT INTO source_states (source_id) SELECT 'rappel-conso'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'rappel-conso');

-- Vigilances météo supplémentaires (même API/factory, un seul appel partagé).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-31', 'Vigilance météo — Haute-Garonne', 'Alertes orange et rouge Météo-France',
  'La Haute-Garonne passe en vigilance orange ou rouge ? Orages, canicule : vous êtes prévenu.',
  'internal', 'official', false, ARRAY['vigilance-meteo'], 27
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-31');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-31'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-31');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-44', 'Vigilance météo — Loire-Atlantique', 'Alertes orange et rouge Météo-France',
  'La Loire-Atlantique passe en vigilance orange ou rouge ? Tempêtes, vent, submersion : vous êtes prévenu.',
  'internal', 'official', false, ARRAY['vigilance-meteo'], 28
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-44');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-44'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-44');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-67', 'Vigilance météo — Bas-Rhin', 'Alertes orange et rouge Météo-France',
  'Le Bas-Rhin passe en vigilance orange ou rouge ? Orages, neige, canicule : vous êtes prévenu.',
  'internal', 'official', false, ARRAY['vigilance-meteo'], 29
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-67');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-67'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-67');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-35', 'Vigilance météo — Ille-et-Vilaine', 'Alertes orange et rouge Météo-France',
  'L''Ille-et-Vilaine passe en vigilance orange ou rouge ? Tempêtes, vent, pluie : vous êtes prévenu.',
  'internal', 'official', false, ARRAY['vigilance-meteo'], 30
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-35');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-35'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-35');

-- Statuts de service supplémentaires (standard Statuspage). Anti-flapping : TRUE.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-figma', 'Panne Figma', 'Statut officiel de Figma',
  'Figma en panne ? Fini le doute « c''est moi ou c''est en panne ? » — vous avez la réponse.',
  'internal', 'official', true, ARRAY['pannes-services', 'tech'], 48
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-figma');
INSERT INTO source_states (source_id) SELECT 'statut-figma'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-figma');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-reddit', 'Panne Reddit', 'Statut officiel de Reddit',
  'Reddit en panne ? Fini le doute « c''est moi ou c''est en panne ? » — vous avez la réponse.',
  'internal', 'official', true, ARRAY['pannes-services', 'tech'], 49
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-reddit');
INSERT INTO source_states (source_id) SELECT 'statut-reddit'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-reddit');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-twitch', 'Panne Twitch', 'Statut officiel de Twitch',
  'Twitch en panne ? Fini le doute « c''est moi ou c''est en panne ? » — vous avez la réponse.',
  'internal', 'official', true, ARRAY['pannes-services', 'tech'], 50
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-twitch');
INSERT INTO source_states (source_id) SELECT 'statut-twitch'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-twitch');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-zoom', 'Panne Zoom', 'Statut officiel de Zoom',
  'Alerte quand Zoom déclare une panne majeure sur sa page de statut officielle. Fini le « c''est moi ou c''est en panne ? ».',
  'internal', 'official', true, ARRAY['pannes-services', 'tech'], 51
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-zoom');
INSERT INTO source_states (source_id) SELECT 'statut-zoom'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-zoom');

-- ================================================================
-- Vague 8 : Bison Futé (calendrier figé) + 3 calculées « ciel ».
-- (Pollens Gap différé : nécessite un compte Atmo Data — voir rapport.)
-- ================================================================

-- Bison Futé : jours rouges/noirs nationaux (calendrier 2026 codé en dur).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'bison-fute', 'Bison Futé', 'Jours rouges et noirs sur les routes',
  'Journée rouge ou noire sur les routes ? Bison Futé a parlé, vous le savez la veille. Partez malin.',
  'internal', 'official', false, ARRAY['trafic-routier', 'transports'], 36
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'bison-fute');
INSERT INTO source_states (source_id) SELECT 'bison-fute'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'bison-fute');

-- Éclipse de Soleil (dates connues, fenêtre J-7 → J).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'eclipse-solaire', 'Éclipse de Soleil', 'Les éclipses visibles de France',
  'Une éclipse de Soleil visible depuis la France approche : prévenu avant, lunettes homologuées en poche.',
  'internal', 'official', false, ARRAY['eclipses', 'astronomie'], 56
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'eclipse-solaire');
INSERT INTO source_states (source_id) SELECT 'eclipse-solaire'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'eclipse-solaire');

-- Nuits des Étoiles (AFA), dates annuelles codées en dur.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'nuits-des-etoiles', 'Nuits des Étoiles', 'Le grand rendez-vous d''astronomie de l''été',
  'Trois soirées d''observation gratuites partout en France : prévenu avant de sortir plaid et télescope.',
  'internal', 'official', false, ARRAY['astronomie', 'etoiles-filantes'], 56
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'nuits-des-etoiles');
INSERT INTO source_states (source_id) SELECT 'nuits-des-etoiles'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'nuits-des-etoiles');

-- Géminides (pic annuel, nuit du 13 au 14 décembre).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'geminides', 'Géminides', 'Le grand essaim d''étoiles filantes d''hiver',
  'Jusqu''à 120 étoiles filantes par heure dans la nuit du 13 au 14 décembre : le spectacle est annoncé.',
  'internal', 'official', false, ARRAY['etoiles-filantes', 'astronomie'], 56
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'geminides');
INSERT INTO source_states (source_id) SELECT 'geminides'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'geminides');

-- ================================================================
-- Vague 9 (sources) : échéances fiscales, Loi Montagne, 3 statuts.
-- (Notion écarté : status.notion.so est une SPA sans JSON de statut.)
-- ================================================================

-- Grandes échéances fiscales des particuliers (dates codées par année).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'echeances-fiscales', 'Échéances impôts', 'Les dates limites à ne pas rater',
  'Taxe foncière, taxe d''habitation secondaire : prévenu une semaine avant de passer à la caisse.',
  'internal', 'official', false, ARRAY['impots', 'vie-locale'], 59
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'echeances-fiscales');
INSERT INTO source_states (source_id) SELECT 'echeances-fiscales'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'echeances-fiscales');

-- Loi Montagne : rappel de l'obligation d'équipements hiver au 1er novembre.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'loi-montagne', 'Pneus hiver', 'Obligation Loi Montagne au 1er novembre',
  '1er novembre : la Loi Montagne entre en vigueur. Pneus hiver ou chaînes obligatoires ? Rappel avant l''hiver.',
  'internal', 'official', false, ARRAY['trafic-routier', 'transports', 'vie-locale'], 37
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'loi-montagne');
INSERT INTO source_states (source_id) SELECT 'loi-montagne'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'loi-montagne');

-- Statuts de service supplémentaires. Anti-flapping : requires_confirmation = TRUE.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-canva', 'Panne Canva', 'Statut officiel de Canva',
  'Canva en panne ? Fini le doute « c''est moi ou c''est en panne ? » — vous avez la réponse.',
  'internal', 'official', true, ARRAY['pannes-services', 'tech'], 52
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-canva');
INSERT INTO source_states (source_id) SELECT 'statut-canva'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-canva');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-dropbox', 'Panne Dropbox', 'Statut officiel de Dropbox',
  'Dropbox en panne ? Fini le doute « c''est moi ou c''est en panne ? » — vous avez la réponse.',
  'internal', 'official', true, ARRAY['pannes-services', 'tech'], 53
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-dropbox');
INSERT INTO source_states (source_id) SELECT 'statut-dropbox'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-dropbox');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-slack', 'Panne Slack', 'Statut officiel de Slack',
  'Alerte quand Slack déclare une panne majeure sur son statut officiel. Fini le « c''est moi ou c''est en panne ? ».',
  'internal', 'official', true, ARRAY['pannes-services', 'tech'], 54
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-slack');
INSERT INTO source_states (source_id) SELECT 'statut-slack'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-slack');

-- Source externe liée : service partenaire configuré sur son propre site.
-- Pas d'abonnement LaBonneAlerte, donc pas de ligne source_states.
INSERT INTO sources (id, name, subtitle, description, type, badge, link_url, requires_confirmation, categories, display_order)
SELECT 'doomname', 'DoomName', 'Surveillance de noms de domaine',
  'Ce nom de domaine que vous convoitez se libère ? Vous êtes le premier au courant. Service partenaire.',
  'linked', 'official', 'https://doomname.com', false, ARRAY['tech'], 40
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'doomname');

-- ================================================================
-- Vague 10 (sources) : alertes CERT-FR, taux du Livret A, 4 vigilances.
-- ================================================================

-- Alertes de sécurité critiques du CERT-FR (flux RSS officiel ANSSI, pas les avis).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'cert-fr-alertes', 'Alertes CERT-FR', 'Menaces de sécurité critiques (ANSSI)',
  'Faille critique activement exploitée ? L''alerte officielle française en cybersécurité, sans les avis mineurs.',
  'internal', 'official', false, ARRAY['securite', 'tech'], 55
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'cert-fr-alertes');
INSERT INTO source_states (source_id) SELECT 'cert-fr-alertes'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'cert-fr-alertes');

-- Révisions du taux du Livret A (dates codées : 1er février / 1er août).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'taux-livret-a', 'Taux du Livret A', 'Les révisions du taux de l''épargne réglementée',
  'Le taux du Livret A est révisé deux fois par an : prévenu à chaque décision, sans spéculation.',
  'internal', 'official', false, ARRAY['epargne', 'bons-plans'], 60
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'taux-livret-a');
INSERT INTO source_states (source_id) SELECT 'taux-livret-a'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'taux-livret-a');

-- 4 vigilances météo supplémentaires (factory mutualisée, 0 appel API en plus).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-34', 'Vigilance météo — Hérault', 'Alertes orange et rouge Météo-France',
  'Alerte de vigilance météo (orange ou rouge) émise par Météo-France pour l''Hérault (34).',
  'internal', 'official', false, ARRAY['vigilance-meteo'], 31
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-34');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-34'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-34');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-38', 'Vigilance météo — Isère', 'Alertes orange et rouge Météo-France',
  'Alerte de vigilance météo (orange ou rouge) émise par Météo-France pour l''Isère (38).',
  'internal', 'official', false, ARRAY['vigilance-meteo'], 32
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-38');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-38'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-38');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-83', 'Vigilance météo — Var', 'Alertes orange et rouge Météo-France',
  'Alerte de vigilance météo (orange ou rouge) émise par Météo-France pour le Var (83).',
  'internal', 'official', false, ARRAY['vigilance-meteo'], 33
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-83');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-83'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-83');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-74', 'Vigilance météo — Haute-Savoie', 'Alertes orange et rouge Météo-France',
  'Alerte de vigilance météo (orange ou rouge) émise par Météo-France pour la Haute-Savoie (74).',
  'internal', 'official', false, ARRAY['vigilance-meteo'], 34
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-74');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-74'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-74');

-- ================================================================
-- Vague 11 · Session 1 (société) : fêtes (4), élections, 2 humour.
-- (Épidémies France ÉCARTÉ : le seuil épidémique Sentinelles n'est exposé nulle
--  part en machine-readable — modèle de Serfling hebdo, bulletins/graphiques
--  seulement. Le coder à la main = seuil inventé, refusé par le brief.)
-- ================================================================

-- Fêtes chrétiennes (dates codées, ton informatif et respectueux).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'fetes-chretiennes', 'Fêtes chrétiennes', 'Pâques, Noël et les grandes fêtes',
  'Pâques, Pentecôte, Noël, Épiphanie : prévenu une semaine avant chaque grande fête chrétienne.',
  'internal', 'official', false, ARRAY['fetes', 'vie-locale'], 62
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'fetes-chretiennes');
INSERT INTO source_states (source_id) SELECT 'fetes-chretiennes'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'fetes-chretiennes');

-- Fêtes musulmanes (dates prévisionnelles, confirmées par l'observation lunaire).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'fetes-musulmanes', 'Fêtes musulmanes', 'Ramadan, Aïd el-Fitr, Aïd el-Adha',
  'Ramadan, Aïd el-Fitr, Aïd el-Adha : prévenu une semaine avant chaque grande fête musulmane.',
  'internal', 'official', false, ARRAY['fetes', 'vie-locale'], 63
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'fetes-musulmanes');
INSERT INTO source_states (source_id) SELECT 'fetes-musulmanes'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'fetes-musulmanes');

-- Fêtes juives (calendrier hébraïque, dates fixes fiables).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'fetes-juives', 'Fêtes juives', 'Roch Hachana, Kippour, Hanoucca, Pessah',
  'Roch Hachana, Yom Kippour, Hanoucca, Pessah : prévenu une semaine avant chaque grande fête juive.',
  'internal', 'official', false, ARRAY['fetes', 'vie-locale'], 64
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'fetes-juives');
INSERT INTO source_states (source_id) SELECT 'fetes-juives'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'fetes-juives');

-- Fêtes laïques (solstices, Fête de la musique, Halloween, Nouvel An chinois…).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'fetes-laiques', 'Fêtes laïques', 'Solstices, Fête de la musique, Halloween…',
  'Fête de la musique, Halloween, Saint-Valentin, solstices : les rendez-vous du calendrier, sans surprise.',
  'internal', 'official', false, ARRAY['fetes', 'vie-locale'], 65
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'fetes-laiques');
INSERT INTO source_states (source_id) SELECT 'fetes-laiques'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'fetes-laiques');

-- Élections (source en sommeil : aucune date tant que le décret n'est pas publié).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'elections-france', 'Élections', 'Scrutins et dates limites d''inscription',
  'Inscription sur les listes, veille et jour de scrutin : les échéances électorales, rappelées factuel.',
  'internal', 'official', false, ARRAY['elections', 'vie-locale'], 66
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'elections-france');
INSERT INTO source_states (source_id) SELECT 'elections-france'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'elections-france');

-- Vendredi 13 (calendrier grégorien pur, ton décalé).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vendredi-13', 'Vendredi 13', 'Jour de (mal)chance',
  'Un petit rappel la veille de chaque vendredi 13 : superstition, chat noir ou grille de loto, à vous de voir.',
  'internal', 'official', false, ARRAY['humour', 'insolite'], 70
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vendredi-13');
INSERT INTO source_states (source_id) SELECT 'vendredi-13'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vendredi-13');

-- 1er avril (poisson d'avril, ton complice).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'premier-avril', '1er avril', 'Poisson d''avril',
  'Un clin d''œil la veille et le jour du 1er avril : méfiez-vous de tout ce que vous lisez… sauf de vos alertes.',
  'internal', 'official', false, ARRAY['humour', 'insolite'], 71
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'premier-avril');
INSERT INTO source_states (source_id) SELECT 'premier-avril'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'premier-avril');

-- Métadonnées des sources existantes (idempotent) : titres courts, sous-titres,
-- catégories (tags) et ordre d'affichage.
UPDATE sources SET name = 'Livraison à 0,99 €', subtitle = 'Promo Mondial Relay sur leboncoin',
       categories = ARRAY['bons-plans'], display_order = 10 WHERE id = 'leboncoin-livraison';
UPDATE sources SET name = 'Vigilance météo — 05', subtitle = 'Alertes orange et rouge Météo-France',
       categories = ARRAY['vigilance-meteo'], display_order = 20 WHERE id = 'vigilance-meteo-05';
UPDATE sources SET name = 'EcoWatt', subtitle = 'Tension du réseau électrique',
       categories = ARRAY['energie'], display_order = 30 WHERE id = 'ecowatt';
UPDATE sources SET name = 'DoomName', subtitle = 'Surveillance de noms de domaine',
       categories = ARRAY['tech'], display_order = 40 WHERE id = 'doomname';

-- Auteur GitHub des sources maison (affiché au verso des cartes).
UPDATE sources SET submitted_by_github = 'Epilouptique'
 WHERE id IN ('leboncoin-livraison', 'doomname') AND submitted_by_github IS DISTINCT FROM 'Epilouptique';

-- ================================================================
-- Vague 9 (UX) : refonte des catégories (idempotent, corrige la prod).
-- ================================================================

-- Fusion 'meteo-risques' -> 'vigilance-meteo' (dédup en préservant l'ordre).
UPDATE sources SET categories = (
    SELECT array_agg(c ORDER BY ord)
      FROM (
        SELECT c, MIN(ord) AS ord
          FROM unnest(array_replace(categories, 'meteo-risques', 'vigilance-meteo'))
               WITH ORDINALITY AS u(c, ord)
         GROUP BY c
      ) d
  )
 WHERE 'meteo-risques' = ANY(categories);

-- Recatégorisation : sortir de 'autre', ranger avec l'astronomie / la vie locale.
UPDATE sources SET categories = ARRAY['astronomie', 'etoiles-filantes']
 WHERE id IN ('perseides', 'nuits-des-etoiles');
UPDATE sources SET categories = ARRAY['vie-locale']
 WHERE id IN ('changement-heure', 'jours-feries');

-- ================================================================
-- OpenAlert v2 · étape 3 — FUSION des 15 vigilance-meteo-XX vers vigilance-meteo.
-- 100% idempotent et rejouable. Ne supprime AUCUN ancien abonnement (purge
-- ultérieure, après plusieurs jours de fusion validée). substr(...,17) extrait le
-- code départemental après le préfixe « vigilance-meteo- » (16 caractères).
-- ================================================================

-- A1) Migration des abonnements : vigilance-meteo-XX (broadcast) → vigilance-meteo {XX}.
--     ON CONFLICT sur l'index d'expression DO NOTHING : ni doublon ni erreur, même
--     pour un utilisateur déjà abonné aux deux pendant le dual-run.
INSERT INTO subscriptions (subscriber_id, source_id, params)
SELECT sub.subscriber_id, 'vigilance-meteo',
       jsonb_build_object('departement', substr(sub.source_id, 17))
  FROM subscriptions sub
 WHERE sub.source_id LIKE 'vigilance-meteo-%' AND sub.params IS NULL
ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING;

-- A2) Report d'état en PRÉSERVANT since (le point critique : avec la canicule, la
--     moitié des départements sont actifs — un since recopié à l'identique évite
--     que la source paramétrée ne les traite comme une « nouvelle » alerte au 1er
--     cycle). On ne reporte que les états non-inactive, et seulement si la
--     combinaison n'a pas déjà un état (DO NOTHING : le dual-run a pu en créer un,
--     qu'on préserve tel quel).
INSERT INTO source_param_states (source_id, params, state, since, until_date, message, url, checked_at)
SELECT 'vigilance-meteo',
       jsonb_build_object('departement', substr(st.source_id, 17)),
       st.state, st.since, st.until_date, st.message, st.url, st.checked_at
  FROM source_states st
 WHERE st.source_id LIKE 'vigilance-meteo-%' AND st.state <> 'inactive'
ON CONFLICT (source_id, params) DO NOTHING;

-- B) Retrait des 15 sources : désactivation (réversible en un seul UPDATE). Le
--    kiosque (GET /api/sources) et le poller (runCycle) filtrent enabled=true →
--    plus aucune carte ni notification sur les anciennes.
UPDATE sources SET enabled = false
 WHERE id LIKE 'vigilance-meteo-%' AND enabled = true;

-- ================================================================
-- OpenAlert v2 · étape 6 — DoomName : linked → source EXTERNE PARAMÉTRÉE.
-- Première source externe paramétrée réelle (démo publique du standard).
-- Les abonnés broadcast actuels (params NULL) sont CONSERVÉS : l'endpoint sans
-- paramètre reste valide ; la carte propose désormais un champ « domaine ».
-- Idempotent (rejouable). Le badge n'est PAS modifié ici (décision à valider).
-- ================================================================
UPDATE sources SET
    type = 'external',
    badge = 'verified',
    endpoint_url = 'https://www.doomname.com/alert.json',
    params_schema = '[{"key":"domaine","label":"Nom de domaine","type":"string","multiple":true,"required":true,"placeholder":"mondomaine.fr","lowercase":true,"pattern":"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z]{2,})+$"}]'::jsonb
 WHERE id = 'doomname';

-- ================================================================
-- Vague 12 · Sources PARAMÉTRÉES v2 (fusions) + nouvelles broadcast.
-- Toutes les fusions suivent le patron vigilance (étape 3) : migration
-- idempotente des abonnements + report d'état/since (zéro notification
-- parasite), anciennes sources enabled=false (réversibles), redirections
-- 301 côté routes. 100% rejouable sans dégât.
-- ================================================================

-- ---------------------------------------------------------------
-- 2A-1) VACANCES SCOLAIRES paramétrée (fusion des zones A/B/C).
-- ---------------------------------------------------------------
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'vacances-scolaires', 'Vacances scolaires', 'La zone de votre choix',
  'Le compte à rebours des vacances scolaires de votre zone est lancé : prévenu une semaine avant.',
  'internal', 'official', false, ARRAY['vacances-scolaires', 'vie-locale'], 61,
  '[{"key":"zone","label":"Zone","type":"enum","values":[{"value":"A","label":"Zone A (Besançon, Bordeaux, Clermont, Dijon, Grenoble, Lyon, Poitiers…)"},{"value":"B","label":"Zone B (Aix-Marseille, Lille, Nantes, Nice, Rennes, Rouen, Strasbourg…)"},{"value":"C","label":"Zone C (Paris, Créteil, Versailles, Montpellier, Toulouse)"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vacances-scolaires');
-- Rejouable : force le schéma même si la ligne existait déjà.
UPDATE sources SET params_schema = '[{"key":"zone","label":"Zone","type":"enum","values":[{"value":"A","label":"Zone A (Besançon, Bordeaux, Clermont, Dijon, Grenoble, Lyon, Poitiers…)"},{"value":"B","label":"Zone B (Aix-Marseille, Lille, Nantes, Nice, Rennes, Rouen, Strasbourg…)"},{"value":"C","label":"Zone C (Paris, Créteil, Versailles, Montpellier, Toulouse)"}],"multiple":true,"required":true,"default":null}]'::jsonb
 WHERE id = 'vacances-scolaires';

-- Migration des abonnements : vacances-zone-{a,b,c} → vacances-scolaires {zone:X}.
INSERT INTO subscriptions (subscriber_id, source_id, params)
SELECT sub.subscriber_id, 'vacances-scolaires',
       jsonb_build_object('zone', upper(substr(sub.source_id, 15)))
  FROM subscriptions sub
 WHERE sub.source_id IN ('vacances-zone-a', 'vacances-zone-b', 'vacances-zone-c')
   AND sub.params IS NULL
ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING;

-- Report d'état (préserve since) pour les états non-inactive éventuels.
INSERT INTO source_param_states (source_id, params, state, since, until_date, message, url, checked_at)
SELECT 'vacances-scolaires',
       jsonb_build_object('zone', upper(substr(st.source_id, 15))),
       st.state, st.since, st.until_date, st.message, st.url, st.checked_at
  FROM source_states st
 WHERE st.source_id IN ('vacances-zone-a', 'vacances-zone-b', 'vacances-zone-c')
   AND st.state <> 'inactive'
ON CONFLICT (source_id, params) DO NOTHING;

-- Retrait des 3 cartes (réversible).
UPDATE sources SET enabled = false
 WHERE id IN ('vacances-zone-a', 'vacances-zone-b', 'vacances-zone-c') AND enabled = true;

-- ---------------------------------------------------------------
-- 2A-2) VIGIEAU paramétrée (commune INSEE au choix). Fusion vigieau-gap.
-- ---------------------------------------------------------------
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'vigieau', 'Restrictions d''eau', 'La commune de votre choix',
  'Arrosage, piscine, lavage : les restrictions d''eau en vigueur dans votre commune, sans jargon préfectoral.',
  'internal', 'official', false, ARRAY['secheresse', 'eau'], 26,
  '[{"key":"commune","label":"Code commune (INSEE)","type":"string","placeholder":"05061","pattern":"^(?:[0-9]{2}|2[AB])[0-9]{3}$","lowercase":false,"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigieau');
UPDATE sources SET params_schema = '[{"key":"commune","label":"Code commune (INSEE)","type":"string","placeholder":"05061","pattern":"^(?:[0-9]{2}|2[AB])[0-9]{3}$","lowercase":false,"multiple":true,"required":true,"default":null}]'::jsonb
 WHERE id = 'vigieau';

-- Migration : abonnés vigieau-gap (broadcast) → vigieau {commune:"05061"}.
INSERT INTO subscriptions (subscriber_id, source_id, params)
SELECT sub.subscriber_id, 'vigieau', jsonb_build_object('commune', '05061')
  FROM subscriptions sub
 WHERE sub.source_id = 'vigieau-gap' AND sub.params IS NULL
ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING;

-- Report d'état (préserve since).
INSERT INTO source_param_states (source_id, params, state, since, until_date, message, url, checked_at)
SELECT 'vigieau', jsonb_build_object('commune', '05061'),
       st.state, st.since, st.until_date, st.message, st.url, st.checked_at
  FROM source_states st
 WHERE st.source_id = 'vigieau-gap' AND st.state <> 'inactive'
ON CONFLICT (source_id, params) DO NOTHING;

UPDATE sources SET enabled = false WHERE id = 'vigieau-gap' AND enabled = true;

-- ---------------------------------------------------------------
-- 2A-3) RAPPELCONSO paramétrée par catégorie (upgrade EN PLACE, même id).
--       Les abonnés broadcast actuels → {categorie:"alimentation"} : le
--       comportement (rappels alimentaires graves) est préservé à l'identique.
-- ---------------------------------------------------------------
UPDATE sources SET
    name = 'Rappels produits', subtitle = 'La catégorie de votre choix',
    description = 'Alerte quand un produit est rappelé pour un RISQUE GRAVE, dans la ou les catégories de votre choix (alimentation, maison, appareils électriques, jouets, mode…). Filtre « risques graves uniquement » (microbien, toxique, blessure, brûlure, incendie, étouffement, chimique…) pour éviter le bruit. Source officielle RappelConso (DGCCRF).',
    categories = ARRAY['rappels-produits', 'sante', 'securite'],
    params_schema = '[{"key":"categorie","label":"Catégorie de produit","type":"enum","values":[{"value":"alimentation","label":"Alimentation"},{"value":"bébés-enfants (hors alimentaire)","label":"Bébés & enfants"},{"value":"maison-habitat","label":"Maison & habitat"},{"value":"appareils électriques, outils","label":"Appareils électriques & outils"},{"value":"vêtements, mode, epi","label":"Vêtements & mode"},{"value":"hygiène-beauté","label":"Hygiène & beauté"},{"value":"sports-loisirs","label":"Sports & loisirs"},{"value":"automobiles et moyens de déplacement","label":"Auto & mobilité"},{"value":"equipements de communication","label":"Équipements de communication"},{"value":"autres","label":"Autres produits"}],"multiple":true,"required":true,"default":"alimentation"}]'::jsonb
 WHERE id = 'rappel-conso';

-- Report d'état broadcast → combinaison {alimentation} (préserve since) AVANT de
-- convertir les abonnements, pour éviter toute re-notification au 1er cycle.
INSERT INTO source_param_states (source_id, params, state, since, until_date, message, url, checked_at)
SELECT 'rappel-conso', jsonb_build_object('categorie', 'alimentation'),
       st.state, st.since, st.until_date, st.message, st.url, st.checked_at
  FROM source_states st
 WHERE st.source_id = 'rappel-conso' AND st.state <> 'inactive'
ON CONFLICT (source_id, params) DO NOTHING;

-- Neutralise l'ancienne ligne broadcast : le poller n'écrit plus que dans
-- source_param_states pour cette source paramétrée ; sans ce reset, une carte
-- kiosque resterait bloquée sur un état « active » périmé.
UPDATE source_states
   SET state = 'inactive', since = NULL, until_date = NULL, message = NULL
 WHERE source_id = 'rappel-conso' AND state <> 'inactive';

-- Conversion des abonnements broadcast (params NULL) → {categorie:"alimentation"}.
INSERT INTO subscriptions (subscriber_id, source_id, params)
SELECT sub.subscriber_id, 'rappel-conso', jsonb_build_object('categorie', 'alimentation')
  FROM subscriptions sub
 WHERE sub.source_id = 'rappel-conso' AND sub.params IS NULL
ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING;
-- Retire l'ancien abonnement broadcast une fois la combinaison créée (le poller
-- paramétré ignore les params NULL : sans cette purge, plus aucune notification).
DELETE FROM subscriptions old
 WHERE old.source_id = 'rappel-conso' AND old.params IS NULL
   AND EXISTS (SELECT 1 FROM subscriptions n
                WHERE n.subscriber_id = old.subscriber_id AND n.source_id = 'rappel-conso'
                  AND n.params = jsonb_build_object('categorie', 'alimentation'));

-- ---------------------------------------------------------------
-- 2A-4) CARBURANT paramétré par type. Fusion carburant-seuils.
--       Le module carburant.js s'auto-initialise sans alerter au 1er cycle
--       (aucun report d'état nécessaire — logique par counters, pas par state).
-- ---------------------------------------------------------------
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'carburant', 'Carburant en baisse', 'Le carburant de votre choix',
  'Votre carburant repasse sous un seuil symbolique ? Le bon moment pour faire le plein, signalé.',
  'internal', 'official', false, ARRAY['prix-carburant', 'bons-plans'], 33,
  '[{"key":"carburant","label":"Carburant","type":"enum","values":[{"value":"gazole","label":"Gazole"},{"value":"e10","label":"SP95-E10"},{"value":"sp98","label":"SP98"},{"value":"e85","label":"E85"},{"value":"gplc","label":"GPLc"}],"multiple":true,"required":true,"default":"gazole"}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'carburant');
UPDATE sources SET params_schema = '[{"key":"carburant","label":"Carburant","type":"enum","values":[{"value":"gazole","label":"Gazole"},{"value":"e10","label":"SP95-E10"},{"value":"sp98","label":"SP98"},{"value":"e85","label":"E85"},{"value":"gplc","label":"GPLc"}],"multiple":true,"required":true,"default":"gazole"}]'::jsonb
 WHERE id = 'carburant';

-- Migration : chaque abonné carburant-seuils → 2 instances équivalentes (gazole + e10).
INSERT INTO subscriptions (subscriber_id, source_id, params)
SELECT sub.subscriber_id, 'carburant', jsonb_build_object('carburant', 'gazole')
  FROM subscriptions sub
 WHERE sub.source_id = 'carburant-seuils' AND sub.params IS NULL
ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING;
INSERT INTO subscriptions (subscriber_id, source_id, params)
SELECT sub.subscriber_id, 'carburant', jsonb_build_object('carburant', 'e10')
  FROM subscriptions sub
 WHERE sub.source_id = 'carburant-seuils' AND sub.params IS NULL
ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING;

UPDATE sources SET enabled = false WHERE id = 'carburant-seuils' AND enabled = true;

-- ================================================================
-- Vague 12 · Sources BROADCAST nouvelles (ciel & sciences, statuts).
-- French Days et Steam « free to keep » ÉCARTÉS (dates automne 2026 non
-- annoncées officiellement ; aucun flux Steam public fiable) — voir rapport.
-- Hub'Eau nappes ÉCARTÉ (aucun indicateur/seuil normalisé, valeurs brutes).
-- ================================================================

-- Rendez-vous célestes (œil nu / jumelles), source calculée.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'evenements-astro', 'Rendez-vous du ciel', 'Le ciel à l''œil nu ce mois-ci',
  'Étoiles filantes, planètes alignées, conjonctions : le ciel donne un spectacle ? Vous avez votre place.',
  'internal', 'official', false, ARRAY['astronomie', 'espace'], 72
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'evenements-astro');
INSERT INTO source_states (source_id) SELECT 'evenements-astro'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'evenements-astro');

-- Fête de la science (calendrier officiel).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'fete-science', 'Fête de la science', 'Le grand rendez-vous annuel',
  'Conférences, ateliers, portes ouvertes gratuites partout en France : la Fête de la science approche.',
  'internal', 'official', false, ARRAY['science', 'vie-locale'], 73
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'fete-science');
INSERT INTO source_states (source_id) SELECT 'fete-science'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'fete-science');

-- Grandes marées (coefficient >= 100).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'grandes-marees', 'Grandes marées', 'Coefficient 100 et plus',
  'Grande marée en vue sur le littoral : pêche à pied exceptionnelle, prudence de rigueur. Prévenu avant.',
  'internal', 'official', false, ARRAY['grandes-marees', 'marees'], 74
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'grandes-marees');
INSERT INTO source_states (source_id) SELECT 'grandes-marees'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'grandes-marees');

-- Indice UV élevé à Gap (Open-Meteo, seuil >= 8).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'indice-uv-gap', 'Indice UV — Gap', 'Alerte UV très élevé',
  'Alerte quand l''indice UV maximal du jour atteint 8 ou plus à Gap (protection solaire recommandée). Données Open-Meteo.',
  'internal', 'official', false, ARRAY['uv', 'sante'], 75
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'indice-uv-gap');
INSERT INTO source_states (source_id) SELECT 'indice-uv-gap'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'indice-uv-gap');

-- Semaine des prix Nobel (calendrier officiel).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'nobel-prix', 'Prix Nobel', 'La semaine des annonces',
  'La semaine des Nobel s''ouvre début octobre : les lauréats tombent jour après jour. Prévenu au départ.',
  'internal', 'official', false, ARRAY['science', 'culture'], 76
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'nobel-prix');
INSERT INTO source_states (source_id) SELECT 'nobel-prix'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'nobel-prix');

-- Statuts de services (standard Statuspage). Anti-flapping : requires_confirmation = true.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-atlassian', 'Panne Atlassian', 'Statut officiel de Jira / Atlassian',
  'Alerte quand Atlassian (Jira, Confluence, Trello…) déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 80
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-atlassian');
INSERT INTO source_states (source_id) SELECT 'statut-atlassian'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-atlassian');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-bitbucket', 'Panne Bitbucket', 'Statut officiel de Bitbucket',
  'Bitbucket en panne ? Vos push et pipelines qui échouent ont une explication — vous l''avez direct.',
  'internal', 'official', true, ARRAY['pannes-services', 'github'], 81
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-bitbucket');
INSERT INTO source_states (source_id) SELECT 'statut-bitbucket'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-bitbucket');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-pypi', 'Panne PyPI', 'Statut officiel de PyPI / Python',
  'Alerte quand PyPI (le registre de paquets Python) déclare une panne majeure. Vos pip install qui échouent, expliqués.',
  'internal', 'official', true, ARRAY['pannes-services', 'npm-packages'], 82
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-pypi');
INSERT INTO source_states (source_id) SELECT 'statut-pypi'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-pypi');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-digitalocean', 'Panne DigitalOcean', 'Statut officiel de DigitalOcean',
  'Alerte quand DigitalOcean déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 83
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-digitalocean');
INSERT INTO source_states (source_id) SELECT 'statut-digitalocean'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-digitalocean');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-supabase', 'Panne Supabase', 'Statut officiel de Supabase',
  'Alerte quand Supabase déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 84
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-supabase');
INSERT INTO source_states (source_id) SELECT 'statut-supabase'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-supabase');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-zapier', 'Panne Zapier', 'Statut officiel de Zapier',
  'Zapier en panne ? Vos automatisations à l''arrêt ont une explication — et vous l''avez direct.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 85
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-zapier');
INSERT INTO source_states (source_id) SELECT 'statut-zapier'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-zapier');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-airtable', 'Panne Airtable', 'Statut officiel d''Airtable',
  'Alerte quand Airtable déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 86
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-airtable');
INSERT INTO source_states (source_id) SELECT 'statut-airtable'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-airtable');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-linear', 'Panne Linear', 'Statut officiel de Linear',
  'Alerte quand Linear déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 87
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-linear');
INSERT INTO source_states (source_id) SELECT 'statut-linear'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-linear');

-- ================================================================
-- Heures de veille (plage silencieuse des notifications).
-- Par défaut : aucune notif (email + push) entre 23h et 8h (Europe/Paris) ;
-- les alertes de la nuit sont DIFFÉRÉES (jamais supprimées) puis envoyées
-- groupées à la sortie de plage. Réglable par utilisateur.
-- ================================================================
-- quiet_start / quiet_end : heures 0-23 (Europe/Paris). NULL = défaut 23/8
-- appliqué en code. quiet_disabled = true → aucune veille (envoi immédiat 24/24).
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS quiet_start SMALLINT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS quiet_end SMALLINT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS quiet_disabled BOOLEAN DEFAULT false;

-- File des notifications différées pendant la veille. Une ligne par
-- (destinataire, alerte, canal). payload = tout le nécessaire au rendu du
-- digest (libellé résolu, message, url, statusUrl). source_id + params
-- permettent de re-vérifier l'obsolescence au moment du flush.
CREATE TABLE IF NOT EXISTS deferred_notifications (
  id SERIAL PRIMARY KEY,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  source_id TEXT,
  params JSONB,
  kind TEXT NOT NULL,          -- 'email' | 'push'
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deferred_subscriber ON deferred_notifications (subscriber_id);

-- ================================================================
-- Vague 13 · Sources — endoflife (paramétrée), Tempo, causes, sport,
-- SMIC, statuts. Vigicrues param ÉCARTÉ (maille non départementale) ;
-- Jackpot FDJ ÉCARTÉ (aucun flux public sans clé) — voir rapport.
-- ================================================================

-- Fin de vie logicielle (endoflife.date) — source dev PARAMÉTRÉE (produit).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'fin-de-vie-logicielle', 'Fin de vie logicielle', 'Le produit de votre choix',
  'Votre OS, langage ou framework arrive en fin de vie ? Prévenu 30 jours avant. Migrez sans panique.',
  'internal', 'official', false, ARRAY['tech', 'securite'], 90,
  '[{"key":"produit","label":"Produit","type":"enum","values":[{"value":"windows","label":"Windows"},{"value":"ubuntu","label":"Ubuntu"},{"value":"debian","label":"Debian"},{"value":"nodejs","label":"Node.js"},{"value":"php","label":"PHP"},{"value":"python","label":"Python"},{"value":"postgresql","label":"PostgreSQL"},{"value":"mysql","label":"MySQL"},{"value":"docker-engine","label":"Docker Engine"},{"value":"django","label":"Django"},{"value":"laravel","label":"Laravel"},{"value":"kubernetes","label":"Kubernetes"},{"value":"angular","label":"Angular"},{"value":"dotnet","label":".NET"},{"value":"eclipse-temurin","label":"Java (Eclipse Temurin)"}],"multiple":true,"required":true,"default":"nodejs"}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'fin-de-vie-logicielle');
UPDATE sources SET params_schema = '[{"key":"produit","label":"Produit","type":"enum","values":[{"value":"windows","label":"Windows"},{"value":"ubuntu","label":"Ubuntu"},{"value":"debian","label":"Debian"},{"value":"nodejs","label":"Node.js"},{"value":"php","label":"PHP"},{"value":"python","label":"Python"},{"value":"postgresql","label":"PostgreSQL"},{"value":"mysql","label":"MySQL"},{"value":"docker-engine","label":"Docker Engine"},{"value":"django","label":"Django"},{"value":"laravel","label":"Laravel"},{"value":"kubernetes","label":"Kubernetes"},{"value":"angular","label":"Angular"},{"value":"dotnet","label":".NET"},{"value":"eclipse-temurin","label":"Java (Eclipse Temurin)"}],"multiple":true,"required":true,"default":"nodejs"}]'::jsonb
 WHERE id = 'fin-de-vie-logicielle';

-- Jours Tempo EDF (rouge). BROADCAST. Repli communautaire api-couleur-tempo.fr
-- (badge verified) tant que la souscription RTE portail n'est pas faite ; RTE
-- officielle (rte-auth.js) branchable ensuite. En sommeil l'été (rouges nov→mars).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'tempo', 'Jour Tempo rouge', 'EDF Tempo — jour rouge demain',
  'Demain est un jour Tempo ROUGE : électricité au tarif fort. Prévenu la veille, pour adapter vos usages.',
  'internal', 'verified', false, ARRAY['energie', 'bons-plans'], 91
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'tempo');
INSERT INTO source_states (source_id) SELECT 'tempo'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'tempo');

-- Grandes causes (mois/journées de sensibilisation), source calculée.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'grandes-causes', 'Grandes causes', 'Mois et journées de sensibilisation',
  'Octobre Rose, Movember, Téléthon : prévenu sobrement à l''ouverture de chaque grande cause.',
  'internal', 'official', false, ARRAY['sante', 'vie-locale', 'culture'], 92
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'grandes-causes');
INSERT INTO source_states (source_id) SELECT 'grandes-causes'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'grandes-causes');

-- Grands rendez-vous sportifs (calendrier), ton neutre.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'grands-rendez-vous-sportifs', 'Rendez-vous sportifs', 'Les grands événements à ne pas manquer',
  'Finale de Coupe du monde, arrivée du Tour : les grands moments du sport, rappelés la veille.',
  'internal', 'official', false, ARRAY['sport', 'vie-locale'], 93
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'grands-rendez-vous-sportifs');
INSERT INTO source_states (source_id) SELECT 'grands-rendez-vous-sportifs'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'grands-rendez-vous-sportifs');

-- SMIC & revalorisations (calendrier), sans montant inventé.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'smic-revalorisation', 'SMIC & revalorisations', 'Les rendez-vous du 1er janvier',
  'SMIC, prestations, retraites : les revalorisations annuelles rappelées, montants fixés par décret.',
  'internal', 'official', false, ARRAY['social', 'vie-locale'], 94
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'smic-revalorisation');
INSERT INTO source_states (source_id) SELECT 'smic-revalorisation'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'smic-revalorisation');

-- Statuts de services (standard Statuspage). Anti-flapping : requires_confirmation = true.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-scaleway', 'Panne Scaleway', 'Statut officiel de Scaleway',
  'Alerte quand Scaleway déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 95
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-scaleway');
INSERT INTO source_states (source_id) SELECT 'statut-scaleway'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-scaleway');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-twilio', 'Panne Twilio', 'Statut officiel de Twilio',
  'Alerte quand Twilio (SMS, voix, API de communication) déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 96
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-twilio');
INSERT INTO source_states (source_id) SELECT 'statut-twilio'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-twilio');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-vimeo', 'Panne Vimeo', 'Statut officiel de Vimeo',
  'Alerte quand Vimeo déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'streaming'], 97
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-vimeo');
INSERT INTO source_states (source_id) SELECT 'statut-vimeo'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-vimeo');

-- ================================================================
-- Vague 14 · Jours fériés paramétré + éducation/culture/conso/tech +
-- statuts (fournée 3) + Météo-France avalanche/forêts (prêt-à-brancher).
-- ÉCARTÉS (voir rapport) : épidémies régional (aucun seuil), EFS réserves
-- sang & ANSM ruptures (pas de flux/seuil), cols 05 (pas d'API), Parcoursup
-- 2027 / résultats examens 2027 / vaccination grippe / prix timbre 2027 /
-- Prime Day / nuit des musées / printemps du cinéma / Avignon / Eurovision /
-- fête des voisins (non annoncés) — TODO à l'annonce.
-- ================================================================

-- ---------------------------------------------------------------
-- 1.1) JOURS FÉRIÉS paramétré par ZONE (upgrade EN PLACE, même id).
--      Abonnés broadcast actuels → {zone:"metropole"} (identique).
-- ---------------------------------------------------------------
UPDATE sources SET
    name = 'Fériés & ponts', subtitle = 'La zone de votre choix',
    description = 'Une semaine avant chaque jour férié, un rappel — et le bon plan pont. Choisissez votre zone (métropole, Alsace-Moselle, Outre-mer…). Calendrier officiel de l''administration française.',
    params_schema = '[{"key":"zone","label":"Zone","type":"enum","values":[{"value":"metropole","label":"Métropole"},{"value":"alsace-moselle","label":"Alsace-Moselle"},{"value":"guadeloupe","label":"Guadeloupe"},{"value":"martinique","label":"Martinique"},{"value":"guyane","label":"Guyane"},{"value":"la-reunion","label":"La Réunion"},{"value":"mayotte","label":"Mayotte"},{"value":"saint-barthelemy","label":"Saint-Barthélemy"},{"value":"saint-martin","label":"Saint-Martin"},{"value":"nouvelle-caledonie","label":"Nouvelle-Calédonie"},{"value":"polynesie-francaise","label":"Polynésie française"},{"value":"wallis-et-futuna","label":"Wallis-et-Futuna"},{"value":"saint-pierre-miquelon","label":"Saint-Pierre-et-Miquelon"}],"multiple":true,"required":true,"default":"metropole"}]'::jsonb
 WHERE id = 'jours-feries';

-- Report d'état broadcast → {zone:"metropole"} (préserve since) AVANT conversion.
INSERT INTO source_param_states (source_id, params, state, since, until_date, message, url, checked_at)
SELECT 'jours-feries', jsonb_build_object('zone', 'metropole'),
       st.state, st.since, st.until_date, st.message, st.url, st.checked_at
  FROM source_states st
 WHERE st.source_id = 'jours-feries' AND st.state <> 'inactive'
ON CONFLICT (source_id, params) DO NOTHING;
UPDATE source_states SET state = 'inactive', since = NULL, until_date = NULL, message = NULL
 WHERE source_id = 'jours-feries' AND state <> 'inactive';

-- Conversion des abonnements broadcast → {zone:"metropole"}, puis purge des NULL.
INSERT INTO subscriptions (subscriber_id, source_id, params)
SELECT sub.subscriber_id, 'jours-feries', jsonb_build_object('zone', 'metropole')
  FROM subscriptions sub
 WHERE sub.source_id = 'jours-feries' AND sub.params IS NULL
ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING;
DELETE FROM subscriptions old
 WHERE old.source_id = 'jours-feries' AND old.params IS NULL
   AND EXISTS (SELECT 1 FROM subscriptions n
                WHERE n.subscriber_id = old.subscriber_id AND n.source_id = 'jours-feries'
                  AND n.params = jsonb_build_object('zone', 'metropole'));

-- ---------------------------------------------------------------
-- Nouvelles sources BROADCAST (calendriers + navigateurs).
-- ---------------------------------------------------------------
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'fetes-familiales', 'Fêtes familiales', 'Mères, pères, grands-mères',
  'Fête des mères, des pères, des grands-mères : rappelé à temps pour le cadeau — ou au moins le coup de fil.',
  'internal', 'official', false, ARRAY['vie-locale', 'fetes'], 100
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'fetes-familiales');
INSERT INTO source_states (source_id) SELECT 'fetes-familiales'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'fetes-familiales');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'maj-navigateurs', 'Nouveau navigateur', 'Versions majeures Firefox & Chrome',
  'Firefox ou Chrome passe en version majeure ? Prévenu à la sortie, votre navigateur toujours au point.',
  'internal', 'official', false, ARRAY['tech', 'versions-logiciels'], 101
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'maj-navigateurs');
INSERT INTO source_states (source_id) SELECT 'maj-navigateurs'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'maj-navigateurs');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'rentree-scolaire', 'Rentrée scolaire', 'Le compte à rebours de septembre',
  'La rentrée approche : prévenu une semaine avant le retour des cartables. Courage aux parents.',
  'internal', 'official', false, ARRAY['vie-locale', 'ecoles'], 102
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'rentree-scolaire');
INSERT INTO source_states (source_id) SELECT 'rentree-scolaire'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'rentree-scolaire');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'nuits-de-la-lecture', 'Nuits de la lecture', 'Le grand rendez-vous du livre',
  'Lectures nocturnes, bibliothèques ouvertes partout en France : prévenu avant les Nuits de la lecture.',
  'internal', 'official', false, ARRAY['culture', 'livres'], 103
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'nuits-de-la-lecture');
INSERT INTO source_states (source_id) SELECT 'nuits-de-la-lecture'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'nuits-de-la-lecture');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'semaine-du-gout', 'Semaine du goût', 'Ateliers et dégustations',
  'Un rappel avant la Semaine du goût : ateliers, dégustations et éveil au bien manger. Dates officielles.',
  'internal', 'official', false, ARRAY['alimentation', 'vie-locale'], 104
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'semaine-du-gout');
INSERT INTO source_states (source_id) SELECT 'semaine-du-gout'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'semaine-du-gout');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'grands-festivals', 'Grands festivals', 'Cannes et les grands rendez-vous',
  'Un rappel à l''ouverture des grands festivals culturels français. Dates officielles.',
  'internal', 'official', false, ARRAY['culture', 'festivals'], 105
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'grands-festivals');
INSERT INTO source_states (source_id) SELECT 'grands-festivals'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'grands-festivals');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'ceremonies', 'Césars & Oscars', 'Les grandes cérémonies du cinéma',
  'Un rappel la veille des grandes cérémonies du cinéma : Césars et Oscars. Dates officielles.',
  'internal', 'official', false, ARRAY['culture', 'cinema'], 106
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'ceremonies');
INSERT INTO source_states (source_id) SELECT 'ceremonies'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'ceremonies');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'rdv-gaming', 'Rendez-vous gaming', 'gamescom, PGW, Game Awards',
  'Un rappel avant les grands rendez-vous du jeu vidéo : gamescom, Paris Games Week, The Game Awards. Dates officielles.',
  'internal', 'official', false, ARRAY['jeux-video', 'culture'], 107
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'rdv-gaming');
INSERT INTO source_states (source_id) SELECT 'rdv-gaming'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'rdv-gaming');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'braderie-lille', 'Braderie de Lille', 'La plus grande brocante d''Europe',
  'Un rappel avant la Braderie de Lille, le premier week-end de septembre. Dates officielles (Ville de Lille).',
  'internal', 'official', false, ARRAY['vie-locale', 'brocantes'], 108
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'braderie-lille');
INSERT INTO source_states (source_id) SELECT 'braderie-lille'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'braderie-lille');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'hausses-tarifs', 'Hausses de tarifs', 'Les échéances annuelles',
  'Péages et autres hausses récurrentes : prévenu avant chaque révision, sans montant inventé.',
  'internal', 'official', false, ARRAY['vie-locale', 'reglementation'], 109
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'hausses-tarifs');
INSERT INTO source_states (source_id) SELECT 'hausses-tarifs'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'hausses-tarifs');

-- ---------------------------------------------------------------
-- Statuts de services (fournée 3, standard Statuspage). requires_confirmation true.
-- ---------------------------------------------------------------
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-tailscale', 'Panne Tailscale', 'Statut officiel de Tailscale',
  'Alerte quand Tailscale déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 110
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-tailscale');
INSERT INTO source_states (source_id) SELECT 'statut-tailscale'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-tailscale');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-render', 'Panne Render', 'Statut officiel de Render',
  'Alerte quand Render déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 111
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-render');
INSERT INTO source_states (source_id) SELECT 'statut-render'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-render');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-flyio', 'Panne Fly.io', 'Statut officiel de Fly.io',
  'Alerte quand Fly.io déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 112
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-flyio');
INSERT INTO source_states (source_id) SELECT 'statut-flyio'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-flyio');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-grafana', 'Panne Grafana Cloud', 'Statut officiel de Grafana Cloud',
  'Alerte quand Grafana Cloud déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 113
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-grafana');
INSERT INTO source_states (source_id) SELECT 'statut-grafana'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-grafana');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-datadog', 'Panne Datadog', 'Statut officiel de Datadog',
  'Alerte quand Datadog déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 114
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-datadog');
INSERT INTO source_states (source_id) SELECT 'statut-datadog'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-datadog');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-shopify', 'Panne Shopify', 'Statut officiel de Shopify',
  'Alerte quand Shopify déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 115
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-shopify');
INSERT INTO source_states (source_id) SELECT 'statut-shopify'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-shopify');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-hubspot', 'Panne HubSpot', 'Statut officiel de HubSpot',
  'Alerte quand HubSpot déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 116
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-hubspot');
INSERT INTO source_states (source_id) SELECT 'statut-hubspot'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-hubspot');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-elevenlabs', 'Panne ElevenLabs', 'Statut officiel d''ElevenLabs',
  'Alerte quand ElevenLabs déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 117
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-elevenlabs');
INSERT INTO source_states (source_id) SELECT 'statut-elevenlabs'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-elevenlabs');

-- ---------------------------------------------------------------
-- Météo-France PRÊTES-À-BRANCHER (enabled=false) : nécessitent une souscription
-- portail MF distincte + clé env, puis passer enabled=true.
--   avalanche : env METEOFRANCE_DPBRA_API_KEY (produit DPBRA, XML)
--   forêts    : env METEOFRANCE_FORETS_API_KEY (produit DonneesPubliquesMeteoForets)
-- ---------------------------------------------------------------
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema, enabled)
SELECT 'risque-avalanche', 'Risque avalanche', 'Le massif de votre choix',
  'Risque d''avalanche fort ou très fort sur votre massif ? Alerte officielle avant de chausser les skis.',
  'internal', 'official', false, ARRAY['avalanches', 'vigilance-meteo'], 118,
  '[{"key":"massif","label":"Massif","type":"enum","values":[{"value":"13","label":"Thabor"},{"value":"16","label":"Pelvoux"},{"value":"17","label":"Queyras"},{"value":"18","label":"Dévoluy"},{"value":"19","label":"Champsaur"},{"value":"20","label":"Embrunais-Parpaillon"},{"value":"21","label":"Ubaye"},{"value":"23","label":"Mercantour"}],"multiple":true,"required":true,"default":null}]'::jsonb,
  false
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'risque-avalanche');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema, enabled)
SELECT 'meteo-forets', 'Météo des forêts', 'Le département de votre choix',
  'Danger de feux de forêt au niveau rouge dans votre département ? Alerte officielle, l''été surtout.',
  'internal', 'official', false, ARRAY['feux-de-foret', 'vigilance-meteo'], 119,
  '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"11","label":"Aude"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"26","label":"Drôme"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"30","label":"Gard"},{"value":"34","label":"Hérault"},{"value":"48","label":"Lozère"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"}],"multiple":true,"required":true,"default":null}]'::jsonb,
  false
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'meteo-forets');

-- ================================================================
-- Vague 15 · GitHub releases (paramétrée) + finance + logement/nature/
-- gourmandises/geek/salons/sorties + statuts (fournée 4).
-- ⚠️ display_order 130-145 (plage HAUTE : 3 vagues en attente de merge —
-- arbitrer les collisions éventuelles au merge). ÉCARTÉS (voir rapport) :
-- ouverture-chasse (préfectoral), nuit-blanche 2027 & marché de Noël
-- Strasbourg 2026 (non annoncés), déclaration-revenus (à intégrer aux
-- échéances fiscales à l'annonce printemps 2027), bourse (pas d'API gratuite).
-- ================================================================

-- 1.1) GitHub releases — source dev PARAMÉTRÉE (dépôt owner/repo).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'github-release', 'Release GitHub', 'Le dépôt de votre choix',
  'Nouvelle version stable d''un dépôt GitHub que vous suivez ? Prévenu à la sortie, sans surveiller les tags.',
  'internal', 'official', false, ARRAY['tech', 'dev'], 130,
  '[{"key":"depot","label":"Dépôt GitHub","type":"string","placeholder":"vercel/next.js","pattern":"^[A-Za-z0-9_.-]{1,39}/[A-Za-z0-9_.-]{1,100}$","lowercase":false,"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'github-release');
UPDATE sources SET params_schema = '[{"key":"depot","label":"Dépôt GitHub","type":"string","placeholder":"vercel/next.js","pattern":"^[A-Za-z0-9_.-]{1,39}/[A-Za-z0-9_.-]{1,100}$","lowercase":false,"multiple":true,"required":true,"default":null}]'::jsonb
 WHERE id = 'github-release';

-- 2.1) Mouvement fort du Bitcoin (broadcast). Aucun conseil d'investissement.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'bitcoin-mouvement', 'Bitcoin — gros mouvement', 'Variation forte sur 24h',
  'Le Bitcoin bouge de 10 % en 24h ? Vous êtes prévenu. L''info brute, jamais un conseil d''investissement.',
  'internal', 'official', false, ARRAY['crypto', 'tech'], 131
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'bitcoin-mouvement');
INSERT INTO source_states (source_id) SELECT 'bitcoin-mouvement'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'bitcoin-mouvement');

-- 3.1) Trêve hivernale (calendrier).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'treve-hivernale', 'Trêve hivernale', 'Début et fin de la trêve',
  'Début et fin de la trêve hivernale : les deux dates qui protègent locataires et foyers, rappelées.',
  'internal', 'official', false, ARRAY['vie-locale', 'logement'], 132
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'treve-hivernale');
INSERT INTO source_states (source_id) SELECT 'treve-hivernale'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'treve-hivernale');

-- 3.2) Chèque énergie (calendrier).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'cheque-energie', 'Chèque énergie', 'Les échéances à ne pas manquer',
  'Chèque énergie : la date limite de demande approche ? Rappel avant de laisser filer l''aide.',
  'internal', 'official', false, ARRAY['vie-locale', 'logement'], 133
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'cheque-energie');
INSERT INTO source_states (source_id) SELECT 'cheque-energie'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'cheque-energie');

-- 4.1) Saints de glace (calendrier, jardinage).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'saints-de-glace', 'Saints de glace', 'La sagesse du jardinier',
  'Les Saints de glace approchent : patience avant de planter les fragiles, les gelées tardives rôdent encore.',
  'internal', 'official', false, ARRAY['jardinage', 'vie-locale'], 134
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'saints-de-glace');
INSERT INTO source_states (source_id) SELECT 'saints-de-glace'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'saints-de-glace');

-- 4.2) Ouverture de la pêche 1re catégorie (calendrier).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'ouverture-peche', 'Ouverture de la pêche', '1re catégorie, 2e samedi de mars',
  'L''ouverture de la pêche approche (2e samedi de mars) : préparez cannes et vermicelles, on gère le rappel.',
  'internal', 'official', false, ARRAY['peche', 'vie-locale'], 135
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'ouverture-peche');
INSERT INTO source_states (source_id) SELECT 'ouverture-peche'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'ouverture-peche');

-- 4.3) Jour du dépassement (calendrier).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'jour-depassement', 'Jour du dépassement', 'Earth Overshoot Day',
  'Le jour où l''humanité a épuisé son budget planète annuel : une date qui donne à réfléchir, rappelée sobrement.',
  'internal', 'official', false, ARRAY['environnement', 'vie-locale'], 136
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'jour-depassement');
INSERT INTO source_states (source_id) SELECT 'jour-depassement'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'jour-depassement');

-- 4.4) Rendez-vous planète (calendrier multi-entrées).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'rdv-planete', 'Rendez-vous planète', 'Les grands gestes pour la Terre',
  'Heure de la Terre, World Cleanup Day : les grands rendez-vous écologiques, rappelés avant l''action.',
  'internal', 'official', false, ARRAY['environnement', 'vie-locale'], 137
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'rdv-planete');
INSERT INTO source_states (source_id) SELECT 'rdv-planete'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'rdv-planete');

-- 5.1) Fêtes gourmandes (calendrier).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'fetes-gourmandes', 'Fêtes gourmandes', 'Chandeleur, Mardi Gras, Saint-Patrick',
  'Un rappel la veille des petites fêtes gourmandes : Chandeleur (crêpes), Mardi Gras (beignets), Saint-Patrick. Ton léger.',
  'internal', 'official', false, ARRAY['fetes', 'vie-locale'], 138
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'fetes-gourmandes');
INSERT INTO source_states (source_id) SELECT 'fetes-gourmandes'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'fetes-gourmandes');

-- 6.1) Journées geek & insolites (calendrier).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'journees-geek', 'Journées geek', 'Pi Day, Star Wars Day, sauvegarde…',
  'Pi Day, Star Wars Day, Towel Day — et surtout la Journée mondiale de la sauvegarde. Ne l''oubliez pas.',
  'internal', 'official', false, ARRAY['humour', 'tech'], 139
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'journees-geek');
INSERT INTO source_states (source_id) SELECT 'journees-geek'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'journees-geek');

-- 7.1) Grands salons (calendrier).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'grands-salons', 'Grands salons', 'Agriculture, Auto, VivaTech, SIAL, Bourget…',
  'Salon de l''Agriculture, Mondial de l''Auto, VivaTech : prévenu à l''ouverture des grands salons parisiens.',
  'internal', 'official', false, ARRAY['vie-locale', 'evenements-locaux'], 140
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'grands-salons');
INSERT INTO source_states (source_id) SELECT 'grands-salons'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'grands-salons');

-- 8.1) Sorties jeux majeures (calendrier).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'sorties-jeux-majeures', 'Grosses sorties jeux', 'Les blockbusters du jeu vidéo',
  'Un rappel à la sortie des jeux vidéo majeurs, uniquement quand la date est officiellement confirmée par l''éditeur.',
  'internal', 'official', false, ARRAY['jeux-video', 'sorties-jeux'], 141
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'sorties-jeux-majeures');
INSERT INTO source_states (source_id) SELECT 'sorties-jeux-majeures'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'sorties-jeux-majeures');

-- 8.2) Sorties cinéma majeures (calendrier).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'sorties-cinema-majeures', 'Grosses sorties ciné', 'Les blockbusters au cinéma',
  'Les grands films arrivent en salle : prévenu à la sortie française, dates officielles uniquement.',
  'internal', 'official', false, ARRAY['cinema', 'films'], 142
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'sorties-cinema-majeures');
INSERT INTO source_states (source_id) SELECT 'sorties-cinema-majeures'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'sorties-cinema-majeures');

-- 9) Statuts de services (fournée 4, standard Statuspage). requires_confirmation true.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-proton', 'Panne Proton', 'Statut officiel de Proton',
  'Alerte quand Proton (Mail, VPN, Drive) déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 143
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-proton');
INSERT INTO source_states (source_id) SELECT 'statut-proton'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-proton');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-gandi', 'Panne Gandi', 'Statut officiel de Gandi',
  'Alerte quand Gandi (domaines, hébergement) déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 144
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-gandi');
INSERT INTO source_states (source_id) SELECT 'statut-gandi'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-gandi');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-brevo', 'Panne Brevo', 'Statut officiel de Brevo',
  'Alerte quand Brevo (emailing, ex-Sendinblue) déclare une panne majeure sur sa page de statut officielle.',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 145
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-brevo');
INSERT INTO source_states (source_id) SELECT 'statut-brevo'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-brevo');


-- ================================================================
-- Vague 16 · Sources PARAMÉTRÉES v2 (releases dev, veille, géo).
-- display_order 150-157 (plage HAUTE : merge multi-vagues). ÉCARTÉS (voir
-- rapport) : nappes-phréatiques (Hub''Eau brut, indice standardisé côté BRGM
-- sans flux), qualité-baignade (CSV statiques, pas d''API par site).
-- ================================================================

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'npm-release', 'Release npm', 'Le paquet de votre choix',
  'Prévenu à la sortie d''une nouvelle version stable d''un paquet npm que vous suivez. API publique npm, sans clé.',
  'internal', 'official', false, ARRAY['tech', 'dev'], 150, '[{"key":"paquet","label":"Paquet npm","type":"string","placeholder":"express","pattern":"^(?:@[a-z0-9-*~][a-z0-9-*._~]*/)?[a-z0-9-~][a-z0-9-._~]*$","lowercase":true,"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'npm-release');
UPDATE sources SET params_schema = '[{"key":"paquet","label":"Paquet npm","type":"string","placeholder":"express","pattern":"^(?:@[a-z0-9-*~][a-z0-9-*._~]*/)?[a-z0-9-~][a-z0-9-._~]*$","lowercase":true,"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'npm-release';

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'pypi-release', 'Release PyPI', 'Le paquet Python de votre choix',
  'Prévenu à la sortie d''une nouvelle version d''un paquet Python (PyPI) que vous suivez. API publique PyPI, sans clé.',
  'internal', 'official', false, ARRAY['tech', 'dev'], 151, '[{"key":"paquet","label":"Paquet PyPI","type":"string","placeholder":"requests","pattern":"^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$","lowercase":false,"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'pypi-release');
UPDATE sources SET params_schema = '[{"key":"paquet","label":"Paquet PyPI","type":"string","placeholder":"requests","pattern":"^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$","lowercase":false,"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'pypi-release';

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'steam-jeu-promo', 'Jeu Steam en promo', 'Le jeu de votre choix',
  'Alerte quand un jeu Steam que vous suivez passe à -40 % ou plus. Indiquez son identifiant (appid). Données Steam.',
  'internal', 'official', false, ARRAY['jeux-video', 'bons-plans'], 152, '[{"key":"appid","label":"Identifiant Steam (appid)","type":"string","placeholder":"292030","pattern":"^[0-9]{1,7}$","lowercase":false,"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'steam-jeu-promo');
UPDATE sources SET params_schema = '[{"key":"appid","label":"Identifiant Steam (appid)","type":"string","placeholder":"292030","pattern":"^[0-9]{1,7}$","lowercase":false,"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'steam-jeu-promo';

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'youtube-chaine', 'Nouvelle vidéo YouTube', 'La chaîne de votre choix',
  'Nouvelle vidéo sur une chaîne que vous suivez ? Prévenu direct — idéal pour les chaînes qui publient peu.',
  'internal', 'official', false, ARRAY['culture', 'tech'], 153, '[{"key":"channel_id","label":"ID de chaîne YouTube","type":"string","placeholder":"UCxxxxxxxxxxxxxxxxxxxxxx","pattern":"^UC[A-Za-z0-9_-]{22}$","lowercase":false,"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'youtube-chaine');
UPDATE sources SET params_schema = '[{"key":"channel_id","label":"ID de chaîne YouTube","type":"string","placeholder":"UCxxxxxxxxxxxxxxxxxxxxxx","pattern":"^UC[A-Za-z0-9_-]{22}$","lowercase":false,"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'youtube-chaine';

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'veille-hackernews', 'Veille Hacker News', 'Le mot-clé de votre choix',
  'Votre mot-clé explose sur Hacker News ? Prévenu quand une story décolle vraiment. Signal, pas bruit.',
  'internal', 'official', false, ARRAY['tech', 'dev'], 154, '[{"key":"motcle","label":"Mot-clé Hacker News","type":"string","placeholder":"rust","pattern":"^[a-z0-9][a-z0-9 .-]{1,29}$","lowercase":true,"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'veille-hackernews');
UPDATE sources SET params_schema = '[{"key":"motcle","label":"Mot-clé Hacker News","type":"string","placeholder":"rust","pattern":"^[a-z0-9][a-z0-9 .-]{1,29}$","lowercase":true,"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'veille-hackernews';

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'veille-rss', 'Veille RSS', 'Le flux de votre choix',
  'N''importe quel flux RSS, et chaque nouvel article vous est signalé. Votre lecteur de flux, sans le lecteur.',
  'internal', 'official', false, ARRAY['tech', 'culture'], 155, '[{"key":"flux","label":"URL du flux RSS/Atom","type":"string","placeholder":"https://exemple.fr/rss.xml","pattern":"^https://[^\\s]{1,300}$","lowercase":false,"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'veille-rss');
UPDATE sources SET params_schema = '[{"key":"flux","label":"URL du flux RSS/Atom","type":"string","placeholder":"https://exemple.fr/rss.xml","pattern":"^https://[^\\s]{1,300}$","lowercase":false,"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'veille-rss';

-- indice-uv : GÉNÉRALISATION de indice-uv-gap (fusion : migration {05} + retrait).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'indice-uv', 'Indice UV', 'Le département de votre choix',
  'Indice UV à 8 ou plus aujourd''hui chez vous ? Sortez chapeau et crème solaire, on vous aura prévenu.',
  'internal', 'official', false, ARRAY['uv', 'sante'], 156, '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"01","label":"Ain"},{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"15","label":"Cantal"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"26","label":"Drôme"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"32","label":"Gers"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"39","label":"Jura"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"48","label":"Lozère"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"91","label":"Essonne"},{"value":"92","label":"Hauts-de-Seine"},{"value":"93","label":"Seine-Saint-Denis"},{"value":"94","label":"Val-de-Marne"},{"value":"95","label":"Val-d''Oise"},{"value":"971","label":"Guadeloupe"},{"value":"972","label":"Martinique"},{"value":"973","label":"Guyane"},{"value":"974","label":"La Réunion"},{"value":"976","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'indice-uv');
UPDATE sources SET params_schema = '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"01","label":"Ain"},{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"15","label":"Cantal"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"26","label":"Drôme"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"32","label":"Gers"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"39","label":"Jura"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"48","label":"Lozère"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"91","label":"Essonne"},{"value":"92","label":"Hauts-de-Seine"},{"value":"93","label":"Seine-Saint-Denis"},{"value":"94","label":"Val-de-Marne"},{"value":"95","label":"Val-d''Oise"},{"value":"971","label":"Guadeloupe"},{"value":"972","label":"Martinique"},{"value":"973","label":"Guyane"},{"value":"974","label":"La Réunion"},{"value":"976","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'indice-uv';
INSERT INTO subscriptions (subscriber_id, source_id, params)
SELECT sub.subscriber_id, 'indice-uv', jsonb_build_object('departement', '05')
  FROM subscriptions sub WHERE sub.source_id = 'indice-uv-gap' AND sub.params IS NULL
ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING;
INSERT INTO source_param_states (source_id, params, state, since, until_date, message, url, checked_at)
SELECT 'indice-uv', jsonb_build_object('departement', '05'), st.state, st.since, st.until_date, st.message, st.url, st.checked_at
  FROM source_states st WHERE st.source_id = 'indice-uv-gap' AND st.state <> 'inactive'
ON CONFLICT (source_id, params) DO NOTHING;
UPDATE sources SET enabled = false WHERE id = 'indice-uv-gap' AND enabled = true;

-- seismes-departement : PARAMÉTRÉE (le national seismes-france reste, pas de migration).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'seismes-departement', 'Séismes près de chez vous', 'Le département de votre choix',
  'Un séisme ressenti possible près de votre département ? Vous êtes informé dans les heures qui suivent.',
  'internal', 'official', false, ARRAY['seismes', 'vigilance-meteo'], 157, '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"01","label":"Ain"},{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"15","label":"Cantal"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"26","label":"Drôme"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"32","label":"Gers"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"39","label":"Jura"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"48","label":"Lozère"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"91","label":"Essonne"},{"value":"92","label":"Hauts-de-Seine"},{"value":"93","label":"Seine-Saint-Denis"},{"value":"94","label":"Val-de-Marne"},{"value":"95","label":"Val-d''Oise"},{"value":"971","label":"Guadeloupe"},{"value":"972","label":"Martinique"},{"value":"973","label":"Guyane"},{"value":"974","label":"La Réunion"},{"value":"976","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'seismes-departement');
UPDATE sources SET params_schema = '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"01","label":"Ain"},{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"15","label":"Cantal"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"26","label":"Drôme"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"32","label":"Gers"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"39","label":"Jura"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"48","label":"Lozère"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"91","label":"Essonne"},{"value":"92","label":"Hauts-de-Seine"},{"value":"93","label":"Seine-Saint-Denis"},{"value":"94","label":"Val-de-Marne"},{"value":"95","label":"Val-d''Oise"},{"value":"971","label":"Guadeloupe"},{"value":"972","label":"Martinique"},{"value":"973","label":"Guyane"},{"value":"974","label":"La Réunion"},{"value":"976","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'seismes-departement';


-- ================================================================
-- Vague 17 - VAGUE STRATEGIQUE : francophonie (Quebec, outre-mer,
-- Belgique/Suisse, expatries) + alertes a forte plus-value.
-- display_order 160-172 (PLAGE HAUTE : merge multi-vagues). cyclones-outremer
-- livree DESACTIVEE (prete a brancher, voir rapport). ECARTES (voir rapport) :
-- soldes-outremer (2027 non annonce), sargasses-antilles (PDF seulement),
-- conseils-voyageurs (pas de flux structure), ouverture-stations-05 (dates non fermes).
-- ================================================================

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'taux-de-change', 'Taux de change', 'La devise de votre choix',
  'L''euro décroche ou s''envole face à votre devise ? Prévenu dès 3 % de variation sur une semaine.',
  'internal', 'official', false, ARRAY['finance', 'expatries'], 160, '[{"key":"devise","label":"Devise (base euro)","type":"enum","values":[{"value":"USD","label":"EUR → USD (dollar américain)"},{"value":"GBP","label":"EUR → GBP (livre sterling)"},{"value":"CHF","label":"EUR → CHF (franc suisse)"},{"value":"CAD","label":"EUR → CAD (dollar canadien)"},{"value":"JPY","label":"EUR → JPY (yen japonais)"},{"value":"AUD","label":"EUR → AUD (dollar australien)"},{"value":"CNY","label":"EUR → CNY (yuan chinois)"},{"value":"SGD","label":"EUR → SGD (dollar de Singapour)"},{"value":"HKD","label":"EUR → HKD (dollar de Hong Kong)"},{"value":"ILS","label":"EUR → ILS (shekel israélien)"},{"value":"BRL","label":"EUR → BRL (réal brésilien)"},{"value":"THB","label":"EUR → THB (baht thaïlandais)"},{"value":"INR","label":"EUR → INR (roupie indienne)"},{"value":"ZAR","label":"EUR → ZAR (rand sud-africain)"},{"value":"MXN","label":"EUR → MXN (peso mexicain)"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'taux-de-change');
UPDATE sources SET params_schema = '[{"key":"devise","label":"Devise (base euro)","type":"enum","values":[{"value":"USD","label":"EUR → USD (dollar américain)"},{"value":"GBP","label":"EUR → GBP (livre sterling)"},{"value":"CHF","label":"EUR → CHF (franc suisse)"},{"value":"CAD","label":"EUR → CAD (dollar canadien)"},{"value":"JPY","label":"EUR → JPY (yen japonais)"},{"value":"AUD","label":"EUR → AUD (dollar australien)"},{"value":"CNY","label":"EUR → CNY (yuan chinois)"},{"value":"SGD","label":"EUR → SGD (dollar de Singapour)"},{"value":"HKD","label":"EUR → HKD (dollar de Hong Kong)"},{"value":"ILS","label":"EUR → ILS (shekel israélien)"},{"value":"BRL","label":"EUR → BRL (réal brésilien)"},{"value":"THB","label":"EUR → THB (baht thaïlandais)"},{"value":"INR","label":"EUR → INR (roupie indienne)"},{"value":"ZAR","label":"EUR → ZAR (rand sud-africain)"},{"value":"MXN","label":"EUR → MXN (peso mexicain)"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'taux-de-change';

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'meteo-quebec', 'Météo Québec', 'La région de votre choix',
  'Tempête hivernale, froid extrême, orages : les avertissements officiels pour votre région du Québec.',
  'internal', 'official', false, ARRAY['vigilance-meteo', 'quebec'], 161, '[{"key":"region","label":"Région","type":"enum","values":[{"value":"montreal","label":"Montréal"},{"value":"quebec","label":"Ville de Québec"},{"value":"gatineau","label":"Gatineau"},{"value":"sherbrooke","label":"Sherbrooke"},{"value":"trois-rivieres","label":"Trois-Rivières"},{"value":"saguenay","label":"Saguenay"},{"value":"laval","label":"Laval"},{"value":"longueuil","label":"Longueuil"},{"value":"levis","label":"Lévis"},{"value":"drummondville","label":"Drummondville"},{"value":"rimouski","label":"Rimouski"},{"value":"rouyn-noranda","label":"Rouyn-Noranda"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'meteo-quebec');
UPDATE sources SET params_schema = '[{"key":"region","label":"Région","type":"enum","values":[{"value":"montreal","label":"Montréal"},{"value":"quebec","label":"Ville de Québec"},{"value":"gatineau","label":"Gatineau"},{"value":"sherbrooke","label":"Sherbrooke"},{"value":"trois-rivieres","label":"Trois-Rivières"},{"value":"saguenay","label":"Saguenay"},{"value":"laval","label":"Laval"},{"value":"longueuil","label":"Longueuil"},{"value":"levis","label":"Lévis"},{"value":"drummondville","label":"Drummondville"},{"value":"rimouski","label":"Rimouski"},{"value":"rouyn-noranda","label":"Rouyn-Noranda"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'meteo-quebec';

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'pannes-hydro-quebec', 'Pannes Hydro-Québec', 'Les pannes majeures au Québec',
  'Panne d''électricité majeure au Québec (50 000+ foyers) ? Vous êtes informé rapidement.',
  'internal', 'official', false, ARRAY['coupures-electricite', 'quebec'], 162
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'pannes-hydro-quebec');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'meteo-belgique', 'Météo Belgique', 'La province de votre choix',
  'Avertissement météo orange ou rouge sur votre province belge ? Vous êtes prévenu à temps.',
  'internal', 'official', false, ARRAY['vigilance-meteo', 'belgique'], 163, '[{"key":"province","label":"Province","type":"enum","values":[{"value":"anvers","label":"Anvers"},{"value":"brabant","label":"Brabant"},{"value":"flandre-occidentale","label":"Flandre-Occidentale"},{"value":"flandre-orientale","label":"Flandre-Orientale"},{"value":"hainaut","label":"Hainaut"},{"value":"liege","label":"Liège"},{"value":"limbourg","label":"Limbourg"},{"value":"luxembourg","label":"Luxembourg (province)"},{"value":"namur","label":"Namur"},{"value":"littoral","label":"Littoral (zone côtière)"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'meteo-belgique');
UPDATE sources SET params_schema = '[{"key":"province","label":"Province","type":"enum","values":[{"value":"anvers","label":"Anvers"},{"value":"brabant","label":"Brabant"},{"value":"flandre-occidentale","label":"Flandre-Occidentale"},{"value":"flandre-orientale","label":"Flandre-Orientale"},{"value":"hainaut","label":"Hainaut"},{"value":"liege","label":"Liège"},{"value":"limbourg","label":"Limbourg"},{"value":"luxembourg","label":"Luxembourg (province)"},{"value":"namur","label":"Namur"},{"value":"littoral","label":"Littoral (zone côtière)"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'meteo-belgique';

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'meteo-suisse', 'Météo Suisse romande', 'Le canton de votre choix',
  'Danger météo sérieux en Suisse romande ? De Genève au Jura, vous êtes prévenu à temps.',
  'internal', 'official', false, ARRAY['vigilance-meteo', 'suisse'], 164, '[{"key":"canton","label":"Canton","type":"enum","values":[{"value":"geneve","label":"Genève"},{"value":"vaud","label":"Vaud"},{"value":"valais","label":"Valais"},{"value":"neuchatel","label":"Neuchâtel"},{"value":"fribourg","label":"Fribourg"},{"value":"jura","label":"Jura"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'meteo-suisse');
UPDATE sources SET params_schema = '[{"key":"canton","label":"Canton","type":"enum","values":[{"value":"geneve","label":"Genève"},{"value":"vaud","label":"Vaud"},{"value":"valais","label":"Valais"},{"value":"neuchatel","label":"Neuchâtel"},{"value":"fribourg","label":"Fribourg"},{"value":"jura","label":"Jura"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'meteo-suisse';

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'cyclones-outremer', 'Cyclones outre-mer', 'Le territoire de votre choix',
  'Alerte cyclonique officielle pour les Antilles, la Guyane, La Réunion et Mayotte. L''essentiel, à temps.',
  'internal', 'official', false, ARRAY['vigilance-meteo', 'outre-mer'], 165, '[{"key":"territoire","label":"Territoire","type":"enum","values":[{"value":"guadeloupe","label":"Guadeloupe"},{"value":"martinique","label":"Martinique"},{"value":"guyane","label":"Guyane"},{"value":"la-reunion","label":"La Réunion"},{"value":"mayotte","label":"Mayotte"},{"value":"iles-du-nord","label":"Îles du Nord (St-Martin / St-Barthélemy)"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'cyclones-outremer');
UPDATE sources SET params_schema = '[{"key":"territoire","label":"Territoire","type":"enum","values":[{"value":"guadeloupe","label":"Guadeloupe"},{"value":"martinique","label":"Martinique"},{"value":"guyane","label":"Guyane"},{"value":"la-reunion","label":"La Réunion"},{"value":"mayotte","label":"Mayotte"},{"value":"iles-du-nord","label":"Îles du Nord (St-Martin / St-Barthélemy)"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'cyclones-outremer';
UPDATE sources SET enabled = true WHERE id = 'cyclones-outremer';

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'feries-quebec', 'Jours fériés Québec', 'Les fériés québécois',
  'Fête nationale, Action de grâce : les jours fériés du Québec, rappelés la veille et le jour J.',
  'internal', 'official', false, ARRAY['vie-locale', 'quebec'], 166
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'feries-quebec');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'feries-belgique', 'Jours fériés Belgique', 'Les fériés légaux belges',
  'Prévenu la veille et le jour des 10 jours fériés légaux de Belgique.',
  'internal', 'official', false, ARRAY['vie-locale', 'belgique'], 167
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'feries-belgique');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'feries-suisse', 'Jours fériés Suisse', 'Les fêtes fédérales suisses',
  'Les principales fêtes suisses, rappelées la veille et le jour J. Du 1er août au Nouvel An.',
  'internal', 'official', false, ARRAY['vie-locale', 'suisse'], 168
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'feries-suisse');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'grandes-journees-mondiales', 'Grandes journées mondiales', 'Les journées ONU majeures',
  'Droits des femmes, droits de l''enfant, lutte contre le sida : cinq grandes journées ONU, le jour J.',
  'internal', 'official', false, ARRAY['vie-locale', 'culture'], 169
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'grandes-journees-mondiales');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'energie-tarifs', 'Tarifs de l''énergie', 'Les échéances du tarif réglementé',
  'Le tarif réglementé de l''électricité évolue au 1er février et au 1er août : rappel des échéances.',
  'internal', 'official', false, ARRAY['energie', 'electricite'], 170
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'energie-tarifs');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'ouverture-ventes-sncf', 'Ouverture des ventes SNCF', 'Les meilleurs prix, dès l''ouverture',
  'Les ventes de billets SNCF ouvrent bientôt : prévenu quand les meilleurs prix sont encore là.',
  'internal', 'official', false, ARRAY['billets-train', 'voyages'], 171
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'ouverture-ventes-sncf');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'guide-michelin', 'Guide Michelin', 'La cérémonie du palmarès',
  'Les étoiles Michelin tombent bientôt : prévenu à l''approche de la cérémonie du palmarès.',
  'internal', 'official', false, ARRAY['culture', 'restaurants'], 172
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'guide-michelin');


-- ================================================================
-- LOT 1 — migrations additives (idempotentes, réversibles).
-- Rejouées par `node server/db/migrate.js` (manuel ; rien ne tourne au deploy).
-- Aucune migration d'abonnés ici (voir server/db/migrations/ pour A2).
-- ================================================================

-- A1) Compteur de « j'aime » par source (départage aussi la « Sélection » A5).
--     Décision : colonne dédiée plutôt que la table counters → lecture/tri directs
--     dans /api/sources. Existantes : 0 par défaut.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;

-- A4) created_at : présent dans le CREATE TABLE mais SANS ALTER → les bases
--     provisionnées avant son ajout ne l'ont pas. Backfill = NOW() à l'ajout
--     (date de création réelle inconnue pour l'existant → « sinon now() », validé).
ALTER TABLE sources ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- B2) Liens de visibilité pro du déposant (LinkedIn, GitLab, Mastodon, portfolio…).
--     Format : JSONB = tableau [{ "label": "...", "url": "https://..." }] (0 à 3 entrées).
--     Validés côté serveur au dépôt (format URL http(s), longueur bornée) — voir Lot 3/4.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS submitted_links JSONB;

-- A7) Suppression de la catégorie « github » : réaffectation → « tech ».
--     Diagnostic prod (lecture seule) : 2 sources concernées (statut-github,
--     statut-bitbucket), toutes deux [pannes-services, github], AUCUNE n'ayant
--     déjà « tech » → array_replace suffit, pas de doublon. Idempotent (après coup,
--     plus aucune source ne porte « github » → WHERE ne matche plus).
UPDATE sources
   SET categories = array_replace(categories, 'github', 'tech')
 WHERE 'github' = ANY(categories);


-- ================================================================
-- A2 — Séismes & crues : broadcast → paramétré par département.
-- Calque le pattern éprouvé indice-uv-gap → indice-uv (migration {05},
-- désactivation ; on NE supprime PAS les anciens abonnements : la source
-- désactivée devient inerte). Idempotent, rejouable.
-- Diagnostic prod (lecture seule) : séismes 0 abonné, crues 2 abonnés.
-- ================================================================

-- --- CRUES : création de la source paramétrée (COUVERTURE PARTIELLE, cf. code) ---
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'vigicrues-departement', 'Crues par département', 'Le département de votre choix (couverture partielle)',
  'Crue en vigilance orange ou rouge dans votre département ? Prévenu avant que la rivière ne déborde.',
  'internal', 'official', false, ARRAY['crues', 'vigilance-meteo'], 158,
  '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"95","label":"Val-d''Oise"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigicrues-departement');
UPDATE sources SET params_schema = '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"95","label":"Val-d''Oise"}],"multiple":true,"required":true,"default":null}]'::jsonb
  WHERE id = 'vigicrues-departement';

-- --- CRUES : migration des abonnés broadcast vigicrues-05 → instance 05 ---
INSERT INTO subscriptions (subscriber_id, source_id, params)
SELECT sub.subscriber_id, 'vigicrues-departement', jsonb_build_object('departement', '05')
  FROM subscriptions sub WHERE sub.source_id = 'vigicrues-05' AND sub.params IS NULL
ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING;
INSERT INTO source_param_states (source_id, params, state, since, until_date, message, url, checked_at)
SELECT 'vigicrues-departement', jsonb_build_object('departement', '05'), st.state, st.since, st.until_date, st.message, st.url, st.checked_at
  FROM source_states st WHERE st.source_id = 'vigicrues-05' AND st.state <> 'inactive'
ON CONFLICT (source_id, params) DO NOTHING;
UPDATE sources SET enabled = false WHERE id = 'vigicrues-05' AND enabled = true;

-- --- SEISMES : le paramétré seismes-departement existe déjà ; on désactive le
--     broadcast seismes-france (0 abonné au diagnostic ; migration idempotente au
--     cas où un abonné apparaîtrait entre-temps). ---
INSERT INTO subscriptions (subscriber_id, source_id, params)
SELECT sub.subscriber_id, 'seismes-departement', jsonb_build_object('departement', '05')
  FROM subscriptions sub WHERE sub.source_id = 'seismes-france' AND sub.params IS NULL
ON CONFLICT (subscriber_id, source_id, COALESCE(params, '{}'::jsonb)) DO NOTHING;
INSERT INTO source_param_states (source_id, params, state, since, until_date, message, url, checked_at)
SELECT 'seismes-departement', jsonb_build_object('departement', '05'), st.state, st.since, st.until_date, st.message, st.url, st.checked_at
  FROM source_states st WHERE st.source_id = 'seismes-france' AND st.state <> 'inactive'
ON CONFLICT (source_id, params) DO NOTHING;
UPDATE sources SET enabled = false WHERE id = 'seismes-france' AND enabled = true;


-- ================================================================
-- COLLECTIONS (phase 1) : packs de cartes editorialises, abonnables en un
-- clic. Phase 1 = officielles seulement (owner_subscriber_id NULL, visibility
-- 'official'). Les colonnes owner_subscriber_id + visibility sont en place
-- pour la PHASE 2 (decks utilisateurs), non utilisees en phase 1.
-- Idempotent : upsert des collections et de leurs items (rejouable par migrate.js).
-- ================================================================
CREATE TABLE IF NOT EXISTS collections (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  emoji VARCHAR(16),
  owner_subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE CASCADE, -- NULL = officielle (phase 1)
  visibility VARCHAR(16) NOT NULL DEFAULT 'official', -- 'official' | 'private' | 'unlisted' (phase 2)
  display_order INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_collections_owner ON collections (owner_subscriber_id);

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id VARCHAR(64) REFERENCES collections(id) ON DELETE CASCADE,
  source_id VARCHAR(64) REFERENCES sources(id) ON DELETE CASCADE,
  default_params JSONB, -- NULL = broadcast OU a resoudre par le profil ; objet = instance ; tableau = plusieurs instances
  position INTEGER DEFAULT 0,
  PRIMARY KEY (collection_id, source_id)
);
CREATE INDEX IF NOT EXISTS idx_collection_items_coll ON collection_items (collection_id);

INSERT INTO collections (id, name, description, emoji, owner_subscriber_id, visibility, display_order)
VALUES ('pack-essentiel', 'L''essentiel', 'Le kit de départ : la météo près de chez vous, les rappels de produits, les fériés et les échéances à ne pas rater.', '🎒', NULL, 'official', 10)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, emoji = EXCLUDED.emoji, display_order = EXCLUDED.display_order;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-essentiel', 'vigilance-meteo', NULL, 0)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-essentiel', 'rappel-conso', '{"categorie":"alimentation"}'::jsonb, 1)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-essentiel', 'jours-feries', '{"zone":"metropole"}'::jsonb, 2)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-essentiel', 'changement-heure', NULL, 3)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-essentiel', 'echeances-fiscales', NULL, 4)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-essentiel', 'ouverture-ventes-sncf', NULL, 5)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;

INSERT INTO collections (id, name, description, emoji, owner_subscriber_id, visibility, display_order)
VALUES ('pack-bonnes-affaires', 'Bonnes affaires', 'Jeux offerts, soldes, carburant au meilleur prix, jours Tempo rouges et Black Friday : de quoi ménager votre budget.', '💸', NULL, 'official', 20)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, emoji = EXCLUDED.emoji, display_order = EXCLUDED.display_order;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-bonnes-affaires', 'epic-jeu-gratuit', NULL, 0)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-bonnes-affaires', 'gog-jeu-offert', NULL, 1)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-bonnes-affaires', 'soldes-steam', NULL, 2)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-bonnes-affaires', 'soldes', NULL, 3)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-bonnes-affaires', 'carburant', '{"carburant":"gazole"}'::jsonb, 4)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-bonnes-affaires', 'tempo', NULL, 5)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-bonnes-affaires', 'black-friday', NULL, 6)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-bonnes-affaires', 'taux-livret-a', NULL, 7)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;

INSERT INTO collections (id, name, description, emoji, owner_subscriber_id, visibility, display_order)
VALUES ('pack-parents', 'Parents', 'Le rythme scolaire, les rappels de produits bébés et alimentaires, les fériés et le chèque énergie.', '👶', NULL, 'official', 30)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, emoji = EXCLUDED.emoji, display_order = EXCLUDED.display_order;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-parents', 'vacances-scolaires', '{"zone":"A"}'::jsonb, 0)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-parents', 'rentree-scolaire', NULL, 1)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-parents', 'rappel-conso', '[{"categorie":"bébés-enfants (hors alimentaire)"},{"categorie":"alimentation"}]'::jsonb, 2)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-parents', 'jours-feries', '{"zone":"metropole"}'::jsonb, 3)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-parents', 'fetes-familiales', NULL, 4)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-parents', 'cheque-energie', NULL, 5)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;

INSERT INTO collections (id, name, description, emoji, owner_subscriber_id, visibility, display_order)
VALUES ('pack-montagne', 'Montagne', 'Vigilance, avalanche, loi montagne, crues et météo des forêts autour des Hautes-Alpes. Identité Gap assumée.', '🏔️', NULL, 'official', 40)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, emoji = EXCLUDED.emoji, display_order = EXCLUDED.display_order;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-montagne', 'vigilance-meteo', '{"departement":"05"}'::jsonb, 0)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-montagne', 'risque-avalanche', '{"massif":"19"}'::jsonb, 1)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-montagne', 'loi-montagne', NULL, 2)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-montagne', 'vigicrues-05', NULL, 3)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-montagne', 'meteo-forets', '{"departement":"05"}'::jsonb, 4)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-montagne', 'indice-uv', '{"departement":"05"}'::jsonb, 5)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;

INSERT INTO collections (id, name, description, emoji, owner_subscriber_id, visibility, display_order)
VALUES ('pack-ciel', 'Ciel & étoiles', 'Éclipses, pluies d''étoiles filantes, Nuits des étoiles, rendez-vous astronomiques et aurores boréales.', '🌌', NULL, 'official', 50)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, emoji = EXCLUDED.emoji, display_order = EXCLUDED.display_order;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-ciel', 'eclipse-solaire', NULL, 0)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-ciel', 'perseides', NULL, 1)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-ciel', 'geminides', NULL, 2)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-ciel', 'nuits-des-etoiles', NULL, 3)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-ciel', 'evenements-astro', NULL, 4)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-ciel', 'aurores-france', NULL, 5)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-ciel', 'indice-uv', NULL, 6)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;

INSERT INTO collections (id, name, description, emoji, owner_subscriber_id, visibility, display_order)
VALUES ('pack-dev', 'Développeur', 'Failles CERT-FR, fins de support logiciel, statuts des services majeurs, Node LTS et mises à jour navigateurs. Ajoutez vos dépôts GitHub.', '💻', NULL, 'official', 60)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, emoji = EXCLUDED.emoji, display_order = EXCLUDED.display_order;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-dev', 'cert-fr-alertes', NULL, 0)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-dev', 'fin-de-vie-logicielle', '[{"produit":"nodejs"},{"produit":"python"}]'::jsonb, 1)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-dev', 'github-release', NULL, 2)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-dev', 'statut-github', NULL, 3)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-dev', 'statut-cloudflare', NULL, 4)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-dev', 'statut-openai', NULL, 5)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-dev', 'node-lts', NULL, 6)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-dev', 'maj-navigateurs', NULL, 7)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;

INSERT INTO collections (id, name, description, emoji, owner_subscriber_id, visibility, display_order)
VALUES ('pack-quebec', 'Québec', 'Avertissements météo, pannes Hydro-Québec, jours fériés québécois et taux de change euro/dollar canadien.', '🍁', NULL, 'official', 70)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, emoji = EXCLUDED.emoji, display_order = EXCLUDED.display_order;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-quebec', 'meteo-quebec', '{"region":"montreal"}'::jsonb, 0)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-quebec', 'pannes-hydro-quebec', NULL, 1)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-quebec', 'feries-quebec', NULL, 2)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-quebec', 'taux-de-change', '{"devise":"CAD"}'::jsonb, 3)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;


-- ================================================================
-- COLLECTIONS PHASE 2 : decks utilisateurs (UGC), partageables par lien (fork).
-- Idempotent. owner_subscriber_id + visibility (deja en place phase 1) portent le
-- deck ; ici on ajoute le token de partage non-liste, le pseudo public, les
-- compteurs anti-abus et la table de signalements. RGPD : tout part en CASCADE
-- avec le compte (owner_subscriber_id ON DELETE CASCADE, deja defini).
-- ================================================================

-- Token de partage non devinable (16+ octets). NULL tant que non partage ; unique.
ALTER TABLE collections ADD COLUMN IF NOT EXISTS share_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_collections_share_token
  ON collections (share_token) WHERE share_token IS NOT NULL;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
-- Copie independante : nom du createur d'origine (valorisation, ligne « inspire de »).
ALTER TABLE collections ADD COLUMN IF NOT EXISTS forked_from_name TEXT;

-- Pseudo public : signe les decks partages. NULL = pas encore choisi. Unicite
-- insensible a la casse (empeche les sosies). Jamais l'email en public.
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS display_name TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscribers_display_name_lower
  ON subscribers (lower(display_name)) WHERE display_name IS NOT NULL;

-- Journal des changements de pseudo (rate-limit 3 / 30 jours).
CREATE TABLE IF NOT EXISTS display_name_changes (
  subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE CASCADE,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dnc_sub ON display_name_changes (subscriber_id, changed_at);

-- Signalements UGC (deck ou pseudo). IP HASHEE (RGPD), jamais en clair. Un
-- signalement distinct = une ip_hash distincte ; a 3 distincts -> partage suspendu
-- (deck repasse 'private') et, pour target 'name', display_name remis a NULL.
CREATE TABLE IF NOT EXISTS deck_reports (
  id SERIAL PRIMARY KEY,
  deck_id VARCHAR(64) REFERENCES collections(id) ON DELETE CASCADE,
  target VARCHAR(8) NOT NULL DEFAULT 'deck',   -- 'deck' | 'name'
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deck_reports_deck ON deck_reports (deck_id, target);

-- D) FAVORIS : le « j'aime » d'un compte connecte devient aussi un favori personnel.
-- Le compteur global (sources.likes_count) reste inchange ; ceci ajoute la dimension
-- personnelle. Les anonymes utilisent le localStorage lba-likes (aucune ligne ici).
CREATE TABLE IF NOT EXISTS favorites (
  subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE CASCADE,
  source_id VARCHAR(64) REFERENCES sources(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (subscriber_id, source_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_sub ON favorites (subscriber_id, created_at DESC);


-- ================================================================
-- DECKS/COLLECTIONS : teinte dominante (motif x teinte). Le champ emoji EST
-- l'identifiant du motif (bibliotheque public/js/deck-motifs.js) ; l'emoji ne
-- s'affiche plus sur le deck, il sert de selecteur dans le formulaire. La teinte
-- (1-8) colore le fond + le motif. Idempotent. Defaut = 1 (violet maison).
-- ================================================================
ALTER TABLE collections ADD COLUMN IF NOT EXISTS tint SMALLINT DEFAULT 1;

-- Retrofit des packs officiels : emoji ramene dans le set des 24 motifs + teinte
-- assortie (aucun deck ne doit afficher un emoji brut ; motif derive de l'emoji).
UPDATE collections SET emoji = '💰', tint = 4 WHERE id = 'pack-bonnes-affaires';
UPDATE collections SET emoji = '📚', tint = 6 WHERE id = 'pack-parents';
UPDATE collections SET tint = 1 WHERE id = 'pack-essentiel';
UPDATE collections SET tint = 7 WHERE id = 'pack-montagne';
UPDATE collections SET tint = 2 WHERE id = 'pack-ciel';
UPDATE collections SET tint = 8 WHERE id = 'pack-dev';
UPDATE collections SET tint = 5 WHERE id = 'pack-quebec';


-- ================================================================
-- VAGUE « risques majeurs & planete » (sources internes, ton factuel/calme).
-- 3 candidates ecartees et documentees au rapport : urgences-sanitaires-oms
-- (PHEIC non machine-lisible), incidents-nucleaires (niveau INES absent de tout
-- flux fiable, RSS ASNR 404), radioactivite-ambiante (Teleray = nSv/h bruts sans
-- seuil officiel). display_order en plage haute (300+).
-- ================================================================

-- Essai mensuel des sirenes SAIP : 1er mercredi du mois a midi (calcule, zero API).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'essai-sirenes', 'Essai des sirènes', 'Le test mensuel du signal d''alerte',
  'Premier mercredi du mois, midi : les sirènes sonnent, c''est un essai. Rappel calme, zéro panique.',
  'internal', 'official', false, ARRAY['vie-locale', 'securite'], 300
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'essai-sirenes');
INSERT INTO source_states (source_id) SELECT 'essai-sirenes'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'essai-sirenes');

-- Tempete solaire a impact techno : NOAA SWPC, G>=4 OU R>=3 (distinct de aurores-france Kp>=7).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'tempete-solaire', 'Tempête solaire', 'Impact techno (GPS, radio, réseaux)',
  'Le Soleil s''énerve : tempête géomagnétique sévère en cours, GPS et radios possiblement chahutés. Vous saurez.',
  'internal', 'official', false, ARRAY['espace', 'tech'], 301
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'tempete-solaire');
INSERT INTO source_states (source_id) SELECT 'tempete-solaire'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'tempete-solaire');

-- Asteroide qui frole la Terre : NASA/JPL CNEOS, >=~50 m a moins de 1 distance lunaire sous 7 j.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'asteroide-frole-terre', 'Astéroïde au plus près', 'Un passage proche, sans risque',
  'Un astéroïde frôle la Terre cette semaine ? On vous le dit. Spoiler : il passera à côté, promis.',
  'internal', 'official', false, ARRAY['espace', 'astronomie'], 302
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'asteroide-frole-terre');
INSERT INTO source_states (source_id) SELECT 'asteroide-frole-terre'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'asteroide-frole-terre');

-- Seisme mondial majeur : USGS, M>=7.5 (zone mondiale, distinct des seismes France).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'seisme-mondial-majeur', 'Séisme mondial majeur', 'Magnitude 7,5 ou plus dans le monde',
  'Un séisme majeur secoue la planète ? Une poignée par an, jamais de bruit : seuls les vrais géants comptent.',
  'internal', 'official', false, ARRAY['seismes', 'monde'], 303
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'seisme-mondial-majeur');
INSERT INTO source_states (source_id) SELECT 'seisme-mondial-majeur'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'seisme-mondial-majeur');


-- ================================================================
-- VAGUE « monde & mémoire » (sources internes calculées, ton sobre et respectueux).
-- Anti-doublon : fêtes nationales Québec/Belgique/Suisse déjà dans feries-* ; 14/07
-- dans jours-feries ; Royaume-Uni écarté (pas de fête nationale fixe). display_order 310+.
-- ================================================================

-- Fêtes nationales PARAMÉTRÉES par pays (~23 pays, calculé, zéro API).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'fetes-nationales', 'Fêtes nationales', 'Le pays de votre choix',
  'La fête nationale de votre pays de cœur, annoncée l''avant-veille. Pour ne jamais oublier de célébrer.',
  'internal', 'official', false, ARRAY['monde', 'fetes'], 310, '[{"key":"pays","label":"Pays","type":"enum","values":[{"value":"algerie","label":"Algérie"},{"value":"maroc","label":"Maroc"},{"value":"tunisie","label":"Tunisie"},{"value":"senegal","label":"Sénégal"},{"value":"cote-ivoire","label":"Côte d''Ivoire"},{"value":"mali","label":"Mali"},{"value":"cameroun","label":"Cameroun"},{"value":"rdc","label":"RD Congo"},{"value":"madagascar","label":"Madagascar"},{"value":"haiti","label":"Haïti"},{"value":"liban","label":"Liban"},{"value":"portugal","label":"Portugal"},{"value":"comores","label":"Comores"},{"value":"congo-brazzaville","label":"Congo-Brazzaville"},{"value":"usa","label":"États-Unis"},{"value":"espagne","label":"Espagne"},{"value":"allemagne","label":"Allemagne"},{"value":"italie","label":"Italie"},{"value":"luxembourg","label":"Luxembourg"},{"value":"monaco","label":"Monaco"},{"value":"grece","label":"Grèce"},{"value":"pays-bas","label":"Pays-Bas"},{"value":"irlande","label":"Irlande"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'fetes-nationales');
UPDATE sources SET params_schema = '[{"key":"pays","label":"Pays","type":"enum","values":[{"value":"algerie","label":"Algérie"},{"value":"maroc","label":"Maroc"},{"value":"tunisie","label":"Tunisie"},{"value":"senegal","label":"Sénégal"},{"value":"cote-ivoire","label":"Côte d''Ivoire"},{"value":"mali","label":"Mali"},{"value":"cameroun","label":"Cameroun"},{"value":"rdc","label":"RD Congo"},{"value":"madagascar","label":"Madagascar"},{"value":"haiti","label":"Haïti"},{"value":"liban","label":"Liban"},{"value":"portugal","label":"Portugal"},{"value":"comores","label":"Comores"},{"value":"congo-brazzaville","label":"Congo-Brazzaville"},{"value":"usa","label":"États-Unis"},{"value":"espagne","label":"Espagne"},{"value":"allemagne","label":"Allemagne"},{"value":"italie","label":"Italie"},{"value":"luxembourg","label":"Luxembourg"},{"value":"monaco","label":"Monaco"},{"value":"grece","label":"Grèce"},{"value":"pays-bas","label":"Pays-Bas"},{"value":"irlande","label":"Irlande"}],"multiple":true,"required":true,"default":null}]'::jsonb
  WHERE id = 'fetes-nationales';

-- Grands anniversaires historiques (chiffre rond), curés 2026-2027. TODO annuel.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'grands-anniversaires', 'Grands anniversaires', 'Mémoire culturelle et scientifique',
  '100 ans de Metropolis, 50 ans de vos mangas cultes… Les grands anniversaires de la culture, jamais ratés.',
  'internal', 'official', false, ARRAY['culture', 'monde'], 311
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'grands-anniversaires');
INSERT INTO source_states (source_id) SELECT 'grands-anniversaires'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'grands-anniversaires');


-- ================================================================
-- VAGUE « culture francophone, sport & traditions » (sources internes calculées).
-- Anti-doublon : Saint-Patrick reste dans fetes-gourmandes ET fetes-nationales/irlande ;
-- Cannes/Avignon dans grands-festivals ; Césars/Oscars dans ceremonies. Écartés faute
-- de date officielle : rentree-litteraire (pas de jour unique), spectacles-recompenses
-- (Molières/Victoires 2027 non annoncés), festival-bd-angouleme (2027 non confirmé).
-- display_order 320+. Dates VÉRIFIÉES (voir en-tête de chaque source).
-- ================================================================

-- Saint-Nicolas : 6 décembre, fixe (Est, Belgique, Suisse).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'saint-nicolas', 'Saint-Nicolas', 'La grande fête du 6 décembre',
  'Le 6 décembre approche : Saint-Nicolas passe dans l''Est, en Belgique et en Suisse. Rappel chaleureux.',
  'internal', 'official', false, ARRAY['fetes', 'vie-locale'], 320
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'saint-nicolas');
INSERT INTO source_states (source_id) SELECT 'saint-nicolas'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'saint-nicolas');

-- Prix littéraires d'automne : dates 2026 vérifiées (Académie française officielle,
-- autres via calendrier Livres Hebdo). TODO annuel + Goncourt des lycéens.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'prix-litteraires', 'Prix littéraires', 'Goncourt, Renaudot, Femina, Médicis…',
  'Goncourt, Renaudot, Femina, Médicis : prévenu la veille et le jour des grandes proclamations d''automne.',
  'internal', 'official', false, ARRAY['livres', 'culture'], 321
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'prix-litteraires');
INSERT INTO source_states (source_id) SELECT 'prix-litteraires'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'prix-litteraires');

-- Fête des Lumières de Lyon : 5-8 décembre 2026 (officiel fetedeslumieres.lyon.fr).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'fete-des-lumieres', 'Fête des Lumières', 'Lyon s''illumine en décembre',
  'Lyon s''illumine autour du 8 décembre : prévenu avant les quatre soirs de la Fête des Lumières.',
  'internal', 'official', false, ARRAY['vie-locale', 'culture'], 322
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'fete-des-lumieres');
INSERT INTO source_states (source_id) SELECT 'fete-des-lumieres'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'fete-des-lumieres');

-- Carnavals : Nice 2027 (office de tourisme métropolitain) ; Dunkerque en TODO.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'carnavals', 'Carnavals', 'Nice, Dunkerque…',
  'Nice, Dunkerque : les grands carnavals français annoncés à l''avance. Sortez les confettis.',
  'internal', 'official', false, ARRAY['vie-locale', 'fetes'], 323
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'carnavals');
INSERT INTO source_states (source_id) SELECT 'carnavals'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'carnavals');

-- Francophonie : Journée internationale (20 mars, fixe). Semaine 2027 en TODO.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'francophonie', 'Francophonie', 'La langue en partage, le 20 mars',
  'Le 20 mars, 300 millions de personnes parlent votre langue. On vous le rappelle la veille.',
  'internal', 'official', false, ARRAY['monde', 'culture'], 324
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'francophonie');
INSERT INTO source_states (source_id) SELECT 'francophonie'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'francophonie');


-- ================================================================
-- TRÈS GRANDE VAGUE : paramétrées v2 (meteo-europe, releases crates/packagist/rubygems)
-- + calendaires & broadcast (festivals, admin/social, sport, mode). display_order 330+.
-- Écartés (voir rapport) : reddit (bloqué sans OAuth en 2026), don-du-sang (filtrage
-- honnête possible mais spammy au département — design commune à faire), loto-patrimoine,
-- dates-bac, moustique-tigre (pas de flux temps réel propre). B8/B9 : extensions des
-- sources existantes grandes-causes (TODO) et echeances-fiscales (PAS au 1er sept).
-- ================================================================

-- Météo Europe PARAMÉTRÉE par pays d'expatriation (MeteoAlarm, orange+, échelle pays).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'meteo-europe', 'Météo Europe', 'Le pays d''expatriation de votre choix',
  'Vigilance météo grave dans votre pays d''expatriation ? De l''Espagne à l''Irlande, vous êtes prévenu.',
  'internal', 'official', false, ARRAY['vigilance-meteo', 'monde', 'expatries'], 330, '[{"key":"pays","label":"Pays","type":"enum","values":[{"value":"espagne","label":"Espagne"},{"value":"allemagne","label":"Allemagne"},{"value":"italie","label":"Italie"},{"value":"portugal","label":"Portugal"},{"value":"grece","label":"Grèce"},{"value":"pays-bas","label":"Pays-Bas"},{"value":"irlande","label":"Irlande"},{"value":"luxembourg","label":"Luxembourg"},{"value":"royaume-uni","label":"Royaume-Uni"},{"value":"suede","label":"Suède"},{"value":"norvege","label":"Norvège"},{"value":"danemark","label":"Danemark"},{"value":"autriche","label":"Autriche"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'meteo-europe');
UPDATE sources SET params_schema = '[{"key":"pays","label":"Pays","type":"enum","values":[{"value":"espagne","label":"Espagne"},{"value":"allemagne","label":"Allemagne"},{"value":"italie","label":"Italie"},{"value":"portugal","label":"Portugal"},{"value":"grece","label":"Grèce"},{"value":"pays-bas","label":"Pays-Bas"},{"value":"irlande","label":"Irlande"},{"value":"luxembourg","label":"Luxembourg"},{"value":"royaume-uni","label":"Royaume-Uni"},{"value":"suede","label":"Suède"},{"value":"norvege","label":"Norvège"},{"value":"danemark","label":"Danemark"},{"value":"autriche","label":"Autriche"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'meteo-europe';

-- Release crates.io (Rust), PARAMÉTRÉE par crate.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'crates-release', 'Release crates.io', 'Le crate Rust de votre choix',
  'Prévenu à la sortie d''une nouvelle version stable d''un crate Rust que vous suivez. Registre public crates.io, sans clé.',
  'internal', 'official', false, ARRAY['tech', 'dev'], 331, '[{"key":"crate","label":"Crate Rust","type":"string","placeholder":"serde","pattern":"^[a-z0-9][a-z0-9._-]{0,63}$","lowercase":true,"multiple":true,"required":true,"default":null,"hint":"nom du crate sur crates.io, ex. serde ou tokio"}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'crates-release');
UPDATE sources SET params_schema = '[{"key":"crate","label":"Crate Rust","type":"string","placeholder":"serde","pattern":"^[a-z0-9][a-z0-9._-]{0,63}$","lowercase":true,"multiple":true,"required":true,"default":null,"hint":"nom du crate sur crates.io, ex. serde ou tokio"}]'::jsonb WHERE id = 'crates-release';

-- Release Packagist (PHP/Composer), PARAMÉTRÉE par paquet.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'packagist-release', 'Release Packagist', 'Le paquet Composer de votre choix',
  'Nouvelle version stable d''un paquet PHP que vous suivez ? Prévenu à la sortie, sans surveiller.',
  'internal', 'official', false, ARRAY['tech', 'dev'], 332, '[{"key":"paquet","label":"Paquet Composer","type":"string","placeholder":"monolog/monolog","pattern":"^[a-z0-9]([a-z0-9._-]*)?/[a-z0-9]([a-z0-9._-]*)$","lowercase":true,"multiple":true,"required":true,"default":null,"hint":"vendor/package sur Packagist, ex. monolog/monolog"}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'packagist-release');
UPDATE sources SET params_schema = '[{"key":"paquet","label":"Paquet Composer","type":"string","placeholder":"monolog/monolog","pattern":"^[a-z0-9]([a-z0-9._-]*)?/[a-z0-9]([a-z0-9._-]*)$","lowercase":true,"multiple":true,"required":true,"default":null,"hint":"vendor/package sur Packagist, ex. monolog/monolog"}]'::jsonb WHERE id = 'packagist-release';

-- Release RubyGems (Ruby), PARAMÉTRÉE par gem.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'rubygems-release', 'Release RubyGems', 'La gem Ruby de votre choix',
  'Prévenu à la sortie d''une nouvelle version d''une gem Ruby que vous suivez. Registre public RubyGems, sans clé.',
  'internal', 'official', false, ARRAY['tech', 'dev'], 333, '[{"key":"gem","label":"Gem Ruby","type":"string","placeholder":"rails","pattern":"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"nom de la gem sur RubyGems, ex. rails ou devise"}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'rubygems-release');
UPDATE sources SET params_schema = '[{"key":"gem","label":"Gem Ruby","type":"string","placeholder":"rails","pattern":"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"nom de la gem sur RubyGems, ex. rails ou devise"}]'::jsonb WHERE id = 'rubygems-release';

-- Festivals de musique (calendrier). Dates vérifiées ; TODO pour les non annoncés.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'festivals-musique', 'Festivals de musique', 'Hellfest, Rock en Seine, Tomorrowland…',
  'Hellfest, Rock en Seine et les autres : prévenu avant les grands festivals, le temps de trouver un billet.',
  'internal', 'official', false, ARRAY['culture', 'festivals'], 334
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'festivals-musique');
INSERT INTO source_states (source_id) SELECT 'festivals-musique'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'festivals-musique');

-- Festival du Livre de Paris (calendrier). 16-18 avril 2027 (officiel).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'festival-livre-paris', 'Festival du Livre de Paris', 'Le grand rendez-vous du livre',
  'Un rappel à l''approche et pendant le Festival du Livre de Paris, au Grand Palais (printemps). Dates officielles.',
  'internal', 'official', false, ARRAY['livres', 'culture'], 335
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'festival-livre-paris');
INSERT INTO source_states (source_id) SELECT 'festival-livre-paris'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'festival-livre-paris');

-- Japan Expo (calendrier). 8-11 juillet 2027.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'japan-expo', 'Japan Expo', 'Mangas et culture japonaise',
  'Un rappel à l''approche et pendant Japan Expo, à Paris-Nord Villepinte (juillet). Dates officielles.',
  'internal', 'official', false, ARRAY['jeux-video', 'culture'], 336
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'japan-expo');
INSERT INTO source_states (source_id) SELECT 'japan-expo'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'japan-expo');

-- Rendez-vous tech (keynotes + sorties d'OS). Ubuntu 26.10 daté ; keynotes en TODO.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'rdv-tech', 'Rendez-vous tech', 'Sorties d''OS et grandes keynotes',
  'Sorties d''OS majeures, grandes keynotes : les rendez-vous tech officiellement datés, jamais manqués.',
  'internal', 'official', false, ARRAY['tech'], 337
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'rdv-tech');
INSERT INTO source_states (source_id) SELECT 'rdv-tech'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'rdv-tech');

-- Allocation de rentrée scolaire (versement CAF). 19 août 2026 (officiel).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'allocation-rentree-scolaire', 'Allocation de rentrée', 'Le versement de l''ARS',
  'L''allocation de rentrée scolaire arrive mi-août : un rappel à l''approche du versement.',
  'internal', 'official', false, ARRAY['social', 'vie-locale'], 338
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'allocation-rentree-scolaire');
INSERT INTO source_states (source_id) SELECT 'allocation-rentree-scolaire'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'allocation-rentree-scolaire');

-- Prime de Noël (versement CAF). 16 décembre 2026 (officiel).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'prime-noel', 'Prime de Noël', 'Le versement de mi-décembre',
  'La prime de Noël arrive mi-décembre pour les bénéficiaires : un rappel à l''approche du versement.',
  'internal', 'official', false, ARRAY['social'], 339
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'prime-noel');
INSERT INTO source_states (source_id) SELECT 'prime-noel'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'prime-noel');

-- Mercato foot (fermeture des fenêtres de transferts). Dates LFP 2026-2027 (officiel).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'mercato-foot', 'Mercato foot', 'La clôture des transferts',
  'Le mercato ferme ses portes : prévenu la veille et le jour J. Que les rumeurs s''achèvent enfin.',
  'internal', 'official', false, ARRAY['sport'], 340
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'mercato-foot');
INSERT INTO source_states (source_id) SELECT 'mercato-foot'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'mercato-foot');

-- Fashion Week de Paris (prêt-à-porter femme). Calendrier officiel FHCM.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'fashion-week', 'Fashion Week Paris', 'Les défilés prêt-à-porter',
  'La Fashion Week de Paris ouvre ses portes : prévenu la veille du premier défilé.',
  'internal', 'official', false, ARRAY['culture'], 341
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'fashion-week');
INSERT INTO source_states (source_id) SELECT 'fashion-week'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'fashion-week');


-- ================================================================
-- VAGUE « originales & vendeuses ». display_order 350+. Sources ZÉRO API pour A1-A3.
-- Écartés (voir rapport) : alerte-enlevement + greves-nationales (aucun flux officiel),
-- zfe-restrictions (calendrier légalement incertain post-2025), sorties-series-majeures
-- (aucune date plateforme confirmée), nuit-des-chercheurs (pas d'édition FR 2026),
-- foire-aux-vins (pas de fenêtre officielle nationale). Extensions : evenements-astro
-- (éclipse Lune 28/08/2026), rdv-gaming (Steam Next Fest), echeances-fiscales (remb. impôt).
-- ================================================================

-- Fête des prénoms PARAMÉTRÉE (table interne du calendrier des Postes, zéro API).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'fete-des-prenoms', 'Fête des prénoms', 'Le prénom de votre choix',
  '« Demain, c''est la fête des Hugo » : la fête de votre prénom (ou de vos proches), rappelée la veille.',
  'internal', 'official', false, ARRAY['fetes', 'vie-locale'], 350, '[{"key":"prenom","label":"Prénom","type":"string","placeholder":"Hugo","pattern":"^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ''-]{1,24}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"un prénom du calendrier français, ex. Hugo, Marie, Nicolas"}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'fete-des-prenoms');
UPDATE sources SET params_schema = '[{"key":"prenom","label":"Prénom","type":"string","placeholder":"Hugo","pattern":"^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ''-]{1,24}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"un prénom du calendrier français, ex. Hugo, Marie, Nicolas"}]'::jsonb WHERE id = 'fete-des-prenoms';

-- Rappel personnalisé PARAMÉTRÉE (alerte datée annuelle créée par l'utilisateur).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'rappel-personnalise', 'Rappel personnalisé', 'Votre propre alerte datée',
  'Votre propre rappel annuel : une date, un libellé, et plus jamais d''anniversaire de maman oublié.',
  'internal', 'official', false, ARRAY['vie-locale'], 351, '[{"key":"rappel","label":"Rappel daté","type":"string","placeholder":"14/02 Anniversaire de maman","pattern":"^(0[1-9]|[12][0-9]|3[01])/(0[1-9]|1[0-2]) [^/@]{1,40}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"format JJ/MM Libellé, ex. 14/02 Anniversaire de maman (rappel annuel)"}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'rappel-personnalise');
UPDATE sources SET params_schema = '[{"key":"rappel","label":"Rappel daté","type":"string","placeholder":"14/02 Anniversaire de maman","pattern":"^(0[1-9]|[12][0-9]|3[01])/(0[1-9]|1[0-2]) [^/@]{1,40}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"format JJ/MM Libellé, ex. 14/02 Anniversaire de maman (rappel annuel)"}]'::jsonb WHERE id = 'rappel-personnalise';

-- Tour de France PARAMÉTRÉE par département (config vide au 18/07/2026, TODO parcours 2027).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'tour-de-france-passage', 'Tour de France près de chez vous', 'Le département de votre choix',
  'Le Tour de France traverse votre département ? Prévenu l''avant-veille, le temps de choisir votre virage.',
  'internal', 'official', false, ARRAY['sport', 'vie-locale'], 352, '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"01","label":"Ain"},{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"15","label":"Cantal"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"26","label":"Drôme"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"32","label":"Gers"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"39","label":"Jura"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"48","label":"Lozère"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"91","label":"Essonne"},{"value":"92","label":"Hauts-de-Seine"},{"value":"93","label":"Seine-Saint-Denis"},{"value":"94","label":"Val-de-Marne"},{"value":"95","label":"Val-d''Oise"},{"value":"971","label":"Guadeloupe"},{"value":"972","label":"Martinique"},{"value":"973","label":"Guyane"},{"value":"974","label":"La Réunion"},{"value":"976","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'tour-de-france-passage');
UPDATE sources SET params_schema = '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"01","label":"Ain"},{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"15","label":"Cantal"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"26","label":"Drôme"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"32","label":"Gers"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"39","label":"Jura"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"48","label":"Lozère"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"91","label":"Essonne"},{"value":"92","label":"Hauts-de-Seine"},{"value":"93","label":"Seine-Saint-Denis"},{"value":"94","label":"Val-de-Marne"},{"value":"95","label":"Val-d''Oise"},{"value":"971","label":"Guadeloupe"},{"value":"972","label":"Martinique"},{"value":"973","label":"Guyane"},{"value":"974","label":"La Réunion"},{"value":"976","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'tour-de-france-passage';

-- Ce qui change au 1er du mois (digest mensuel service-public), broadcast.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'ce-qui-change', 'Ce qui change au 1er', 'Le récap officiel du mois',
  'SMIC, tarifs, aides, démarches : tout ce qui change au 1er du mois, résumé la veille. Douze fois par an.',
  'internal', 'official', false, ARRAY['vie-locale', 'reglementation'], 353
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'ce-qui-change');
INSERT INTO source_states (source_id) SELECT 'ce-qui-change'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'ce-qui-change');

-- Billetterie concerts (mises en vente des tournées événements), config vide + TODO.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'billetterie-concerts', 'Billetterie concerts', 'Les ouvertures de vente à ne pas rater',
  'Les billets de la grande tournée partent en vente ? Prévenu avant l''ouverture, pas devant la file d''attente.',
  'internal', 'official', false, ARRAY['culture', 'bons-plans'], 354
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'billetterie-concerts');
INSERT INTO source_states (source_id) SELECT 'billetterie-concerts'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'billetterie-concerts');

-- Rendez-vous aux jardins (ministère de la Culture). 4-6 juin 2027 (officiel).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'rendez-vous-aux-jardins', 'Rendez-vous aux jardins', 'Jardins ouverts en juin',
  'Trois jours pour visiter des jardins publics et privés partout en France : prévenu avant l''ouverture.',
  'internal', 'official', false, ARRAY['culture', 'vie-locale'], 355
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'rendez-vous-aux-jardins');
INSERT INTO source_states (source_id) SELECT 'rendez-vous-aux-jardins'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'rendez-vous-aux-jardins');


-- ================================================================
-- VAGUE « quotidien, admin, sport, pépites » (économie INSEE, sécheresse
-- départementale, ISS, journées & prix). display_order 356+.
-- APIs/datasets explorés et vérifiés (voir en-tête de chaque source). Écartés
-- (rapport) : delais-titres (SPA ANTS sans API), taux-immobilier (BdF Webstat =
-- compte requis ; Observatoire = PDF), ouverture-maprimerenov (aucun calendrier à
-- l'avance), don-du-sang par commune (pas de fichier bulk officiel ; API Carto EFS
-- sans code INSEE), saisons-astronomiques (doublon fetes-laiques), statut-operateurs
-- (aucun flux structuré : cartes propriétaires par adresse).
-- ================================================================

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'risque-secheresse', 'Risque sécheresse', 'Le département de votre choix',
  'Restriction d''eau décrétée dans votre département ? Vous le savez avant que le jardin ne le sente passer.',
  'internal', 'official', false, ARRAY['secheresse', 'vigilance-meteo'], 356, '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"01","label":"Ain"},{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"15","label":"Cantal"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"26","label":"Drôme"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"32","label":"Gers"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"39","label":"Jura"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"48","label":"Lozère"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"91","label":"Essonne"},{"value":"92","label":"Hauts-de-Seine"},{"value":"93","label":"Seine-Saint-Denis"},{"value":"94","label":"Val-de-Marne"},{"value":"95","label":"Val-d''Oise"},{"value":"971","label":"Guadeloupe"},{"value":"972","label":"Martinique"},{"value":"973","label":"Guyane"},{"value":"974","label":"La Réunion"},{"value":"976","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'risque-secheresse');
UPDATE sources SET params_schema = '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"01","label":"Ain"},{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"15","label":"Cantal"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"26","label":"Drôme"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"32","label":"Gers"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"39","label":"Jura"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"48","label":"Lozère"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"91","label":"Essonne"},{"value":"92","label":"Hauts-de-Seine"},{"value":"93","label":"Seine-Saint-Denis"},{"value":"94","label":"Val-de-Marne"},{"value":"95","label":"Val-d''Oise"},{"value":"971","label":"Guadeloupe"},{"value":"972","label":"Martinique"},{"value":"973","label":"Guyane"},{"value":"974","label":"La Réunion"},{"value":"976","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'risque-secheresse';
UPDATE sources SET description = 'Restrictions d''usage de l''eau (sécheresse) pour la ou les communes de votre choix : arrêtés préfectoraux en vigueur (alerte, alerte renforcée, crise). Le niveau « vigilance » est exclu (anti-bruit). Pour la vue d''ensemble par département, voir « Risque sécheresse ». Source officielle VigiEau.' WHERE id = 'vigieau';
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'indice-reference-loyers', 'Indice des loyers (IRL)', 'Publication trimestrielle INSEE',
  'L''indice de référence des loyers vient de tomber : LA valeur pour réviser un loyer, quatre fois par an.',
  'internal', 'official', false, ARRAY['immobilier', 'vie-locale'], 357
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'indice-reference-loyers');
INSERT INTO source_states (source_id) SELECT 'indice-reference-loyers'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'indice-reference-loyers');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'inflation-insee', 'Inflation (INSEE)', 'Indice des prix, chaque mois',
  'L''inflation sur un an, en un chiffre : la publication mensuelle INSEE, sans commentaire superflu.',
  'internal', 'official', false, ARRAY['economie', 'vie-locale'], 358
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'inflation-insee');
INSERT INTO source_states (source_id) SELECT 'inflation-insee'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'inflation-insee');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'chomage-stats', 'Taux de chômage', 'Publication trimestrielle INSEE',
  'Le taux de chômage trimestriel, en un chiffre : un repère économique, quatre fois par an.',
  'internal', 'official', false, ARRAY['economie'], 359
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'chomage-stats');
INSERT INTO source_states (source_id) SELECT 'chomage-stats'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'chomage-stats');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'semaine-bleue', 'Semaine Bleue', 'Semaine des personnes âgées',
  'Une semaine d''animations avec et pour les aînés, partout en France : prévenu avant le coup d''envoi.',
  'internal', 'official', false, ARRAY['vie-locale', 'sante'], 360
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'semaine-bleue');
INSERT INTO source_states (source_id) SELECT 'semaine-bleue'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'semaine-bleue');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'don-organes', 'Don d''organes', 'Journée nationale, le 22 juin',
  'Le 22 juin, une journée pour réfléchir au don d''organes — et l''occasion d''en parler à vos proches.',
  'internal', 'official', false, ARRAY['sante', 'vie-locale'], 361
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'don-organes');
INSERT INTO source_states (source_id) SELECT 'don-organes'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'don-organes');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'prix-turing', 'Prix Turing', 'Le « Nobel de l''informatique »',
  'Le « Nobel de l''informatique » est décerné chaque printemps : un rappel à la saison de l''annonce.',
  'internal', 'official', false, ARRAY['tech', 'dev'], 362
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'prix-turing');
INSERT INTO source_states (source_id) SELECT 'prix-turing'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'prix-turing');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'grands-prix-gastronomie', 'Grands prix gastronomie', 'Bocuse d''Or, World''s 50 Best',
  '50 Best Restaurants, Bocuse d''Or : les sommets de la gastronomie mondiale, annoncés avant le service.',
  'internal', 'official', false, ARRAY['culture', 'gastronomie'], 363
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'grands-prix-gastronomie');
INSERT INTO source_states (source_id) SELECT 'grands-prix-gastronomie'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'grands-prix-gastronomie');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'courses-mythiques', 'Courses mythiques', 'Marathon de Paris, Paris-Versailles',
  'Marathon de Paris, Semi, Paris-Versailles : prévenu la veille des grandes courses. À vos baskets.',
  'internal', 'official', false, ARRAY['sport', 'vie-locale'], 364
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'courses-mythiques');
INSERT INTO source_states (source_id) SELECT 'courses-mythiques'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'courses-mythiques');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'iss-passages', 'Passage de l''ISS', 'La Station spatiale au-dessus de votre ville',
  'La Station spatiale passe au-dessus de chez vous ce soir ? Levez les yeux — on vous dit quand.',
  'internal', 'official', false, ARRAY['iss', 'espace'], 365, '[{"key":"ville","label":"Commune","type":"commune-coords","placeholder":"Votre commune","multiple":true,"required":true,"default":null,"hint":"Le nom de votre commune (ou une autre). Alerte quand la Station spatiale internationale sera visible à l''œil nu au-dessus."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'iss-passages');
UPDATE sources SET params_schema = '[{"key":"ville","label":"Commune","type":"commune-coords","placeholder":"Votre commune","multiple":true,"required":true,"default":null,"hint":"Le nom de votre commune (ou une autre). Alerte quand la Station spatiale internationale sera visible à l''œil nu au-dessus."}]'::jsonb WHERE id = 'iss-passages';


-- ================================================================
-- VAGUE « événements culturels » (théâtre, arts visuels, BD/manga). Sources internes
-- calculées (calendar-factory). Dates VÉRIFIÉES le 19/07/2026 sur sites officiels (voir
-- en-tête de chaque source). Anti-doublon : Angoulême/Molières/Avignon restent en TODO
-- (2027 non annoncé) ; Japan Expo dans japan-expo ; anniversaires (One Piece, Final
-- Fantasy, GTA, Juan Gris) dans grands-anniversaires. display_order 366+.
-- ================================================================

-- Théâtre : Journée mondiale du théâtre (27 mars, fixe). Avignon/Molières/Fourvière en TODO.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'theatre-evenements', 'Théâtre', 'La Journée mondiale du théâtre',
  'Journée mondiale du théâtre, et bientôt Avignon et les Molières : les trois coups, jamais manqués.',
  'internal', 'official', false, ARRAY['culture', 'festivals'], 366
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'theatre-evenements');
INSERT INTO source_states (source_id) SELECT 'theatre-evenements'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'theatre-evenements');

-- Arts visuels : peinture, art contemporain, dessin, illustration. Dates officielles.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'arts-visuels-evenements', 'Arts visuels', 'Art Basel, Salon du Dessin, Duchamp…',
  'Art Basel, Biennale de Venise, Prix Duchamp… Les grands rendez-vous de l''art, rappelés juste avant.',
  'internal', 'official', false, ARRAY['culture', 'festivals'], 367
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'arts-visuels-evenements');
INSERT INTO source_states (source_id) SELECT 'arts-visuels-evenements'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'arts-visuels-evenements');

-- BD & manga : festivals, prix, conventions (hors Japan Expo). Dates officielles.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'bd-manga-evenements', 'BD & manga', 'Conventions, prix et festivals',
  'Otakuthon, Paris Manga, Made in Asia : les grands rendez-vous BD et manga francophones, à l''agenda.',
  'internal', 'official', false, ARRAY['culture', 'festivals'], 368
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'bd-manga-evenements');
INSERT INTO source_states (source_id) SELECT 'bd-manga-evenements'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'bd-manga-evenements');


-- ================================================================
-- LOT 1 (audit-architecture.md, axe 4) — index de performance.
-- ================================================================

-- Poller, hot path : à chaque cycle (48×/jour), pour chaque source paramétrée,
--   poller.js:387  SELECT DISTINCT params FROM subscriptions WHERE source_id = $1 AND params IS NOT NULL
--   (+ poller doomname:587, + UPDATE de fusion WHERE source_id). L'unique index
--   existant uq_subscriptions_sub_src_params démarre par subscriber_id → inutilisable
--   pour un filtre sur source_id seul. Cet index sert directement ces requêtes.
CREATE INDEX IF NOT EXISTS idx_subscriptions_source ON subscriptions (source_id);

-- Lectures d'états actifs (Le Point, cartes, pages de statut) :
--   le-point.js:53  SELECT ... FROM source_param_states WHERE state = 'active'
-- Index PARTIEL : n'indexe que les combinaisons active/pending (rares), donc coût
-- d'écriture quasi nul ; la clause state='active' implique state <> 'inactive' →
-- le planificateur peut le servir. Les accès ciblés (source_id, params) restent sur la PK.
CREATE INDEX IF NOT EXISTS idx_source_param_states_active
  ON source_param_states (source_id) WHERE state <> 'inactive';


-- ================================================================
-- VAGUE « Québec — culture, fiscalité, sport, société, éducation » (sources
-- internes calculées, dates officielles vérifiées 2026-07-19, jamais de mémoire).
-- Anti-doublon confirmé : aucun chevauchement avec meteo-quebec (avertissements
-- ECCC), pannes-hydro-quebec (pannes réseau), feries-quebec (jours fériés CNESST).
-- La Fête nationale (24 juin) et la Journée des Patriotes restent dans feries-quebec
-- et NE sont PAS reprises dans societe-quebec (décision : éviter le doublon).
-- Écartés faute de source fiable/date officielle (documentés au rapport de vague) :
-- temps des sucres (météo-dépendant), ouverture motoneige FCMQ (pas de date ferme),
-- Mondial Choral (disparu 2014), Fête des Neiges de Montréal (dormante depuis 2020).
-- ipc-quebec : PRÊTE À BRANCHER, désactivée (enabled=false), flux ISQ/StatCan à câbler.
-- display_order en plage 370+.
-- ================================================================

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'festivals-quebec', 'Festivals du Québec', 'Les grands rendez-vous culturels',
  'Osheaga, FEQ, Jazz de Montréal, Carnaval de Québec : prévenu à l''ouverture des grands festivals québécois.',
  'internal', 'official', false, ARRAY['culture', 'festivals', 'quebec'], 370
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'festivals-quebec');
INSERT INTO source_states (source_id) SELECT 'festivals-quebec'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'festivals-quebec');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'fiscalite-quebec', 'Échéances Québec', 'Impôts, REER, tarifs, salaire minimum',
  'REER, impôts, salaire minimum : les échéances fiscales du Québec, rappelées avant qu''il ne soit trop tard.',
  'internal', 'official', false, ARRAY['economie', 'social', 'quebec'], 371
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'fiscalite-quebec');
INSERT INTO source_states (source_id) SELECT 'fiscalite-quebec'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'fiscalite-quebec');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'sport-quebec', 'Sport au Québec', 'Canadiens, Coupe Grey, Le Brier',
  'Canadiens de Montréal, Coupe Grey, Brier : les grands rendez-vous du sport québécois, à l''agenda.',
  'internal', 'official', false, ARRAY['sport', 'quebec'], 372
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'sport-quebec');
INSERT INTO source_states (source_id) SELECT 'sport-quebec'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'sport-quebec');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'societe-quebec', 'Société & institutions Québec', 'Déménagement, autochtones, élections',
  'Peuples autochtones, jour du déménagement, élections : les grands rendez-vous de la société québécoise.',
  'internal', 'official', false, ARRAY['vie-locale', 'social', 'quebec'], 373
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'societe-quebec');
INSERT INTO source_states (source_id) SELECT 'societe-quebec'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'societe-quebec');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'education-quebec', 'École au Québec', 'Rentrée & semaine de relâche',
  'Rentrée scolaire et semaine de relâche au Québec : les repères du calendrier, rappelés à temps.',
  'internal', 'official', false, ARRAY['vie-locale', 'quebec'], 374
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'education-quebec');
INSERT INTO source_states (source_id) SELECT 'education-quebec'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'education-quebec');

-- IPC Québec : PRÊTE À BRANCHER (flux ISQ/StatCan à câbler) → désactivée.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'ipc-quebec', 'Inflation Québec', 'La publication mensuelle de l''IPC',
  'L''inflation au Québec, publiée chaque mois : un chiffre, un repère, zéro commentaire.',
  'internal', 'official', false, ARRAY['economie', 'quebec'], 375
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'ipc-quebec');
INSERT INTO source_states (source_id) SELECT 'ipc-quebec'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'ipc-quebec');
UPDATE sources SET enabled = false WHERE id = 'ipc-quebec';

-- Ajout au pack officiel « Québec » (sources actives uniquement ; ipc-quebec exclue).
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-quebec', 'festivals-quebec', NULL, 4)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-quebec', 'fiscalite-quebec', NULL, 5)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-quebec', 'sport-quebec', NULL, 6)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-quebec', 'societe-quebec', NULL, 7)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;
INSERT INTO collection_items (collection_id, source_id, default_params, position)
VALUES ('pack-quebec', 'education-quebec', NULL, 8)
ON CONFLICT (collection_id, source_id) DO UPDATE SET default_params = EXCLUDED.default_params, position = EXCLUDED.position;

-- ── Vague prestations sociales & vie étudiante (sources calculées calendar-factory).
-- display_order en plage 376+.

-- Dates de versement des prestations CAF (table annuelle en dur, décalages réels).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'versement-prestations-caf', 'Versement CAF', 'Le rappel de la date de virement',
  'Le versement CAF du mois arrive demain : un rappel discret, la veille, sans montant ni intrusion.',
  'internal', 'official', false, ARRAY['caf', 'allocations', 'social'], 376
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'versement-prestations-caf');
INSERT INTO source_states (source_id) SELECT 'versement-prestations-caf'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'versement-prestations-caf');

-- Revalorisations annuelles des prestations sociales (1er avril & 1er octobre).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'revalorisation-prestations-sociales', 'Revalorisation des aides', 'RSA, primes, allocations, APL',
  'RSA, prime d''activité, APL : les rendez-vous annuels de revalorisation, sans montant inventé.',
  'internal', 'official', false, ARRAY['allocations', 'social', 'aides'], 377
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'revalorisation-prestations-sociales');
INSERT INTO source_states (source_id) SELECT 'revalorisation-prestations-sociales'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'revalorisation-prestations-sociales');

-- Calendrier Parcoursup (dates officielles codées par session).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'parcoursup', 'Parcoursup', 'Les échéances de la procédure',
  'Vœux, confirmations, réponses : les échéances Parcoursup rappelées avant qu''il ne soit trop tard.',
  'internal', 'official', false, ARRAY['parcoursup', 'formations', 'examens'], 378
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'parcoursup');
INSERT INTO source_states (source_id) SELECT 'parcoursup'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'parcoursup');

-- Dossier Social Étudiant (DSE) du CROUS (bourse + logement).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'crous-dse', 'Bourse & logement Crous', 'La campagne du Dossier Social Étudiant',
  'Bourse et logement étudiant : les dates clés du Dossier Social Étudiant, rappelées avant la limite.',
  'internal', 'official', false, ARRAY['bourses', 'aides', 'formations'], 379
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'crous-dse');
INSERT INTO source_states (source_id) SELECT 'crous-dse'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'crous-dse');

-- ── Vague échéances administratives (suite : items 5-8, calendar-factory).
-- display_order en plage 380+.

-- Bourses de collège et de lycée (date limite unique codée par campagne).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'bourses-scolaires', 'Bourses collège & lycée', 'La date limite de demande',
  'Bourse de collège ou lycée : la date limite du dossier approche ? Rappel avant de laisser passer.',
  'internal', 'official', false, ARRAY['bourses', 'aides', 'formations'], 380
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'bourses-scolaires');
INSERT INTO source_states (source_id) SELECT 'bourses-scolaires'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'bourses-scolaires');

-- Cotisation Foncière des Entreprises (CFE) — public professionnel uniquement.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'cfe-entreprises', 'CFE des entreprises', 'L''échéance du 15 décembre',
  'Indépendants, auto-entrepreneurs : la date limite de la CFE approche ? Rappel avant la majoration.',
  'internal', 'official', false, ARRAY['impots', 'finance', 'creation-entreprise'], 381
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'cfe-entreprises');
INSERT INTO source_states (source_id) SELECT 'cfe-entreprises'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'cfe-entreprises');

-- Actualisation mensuelle France Travail (fenêtre générique du 28 au 15).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'actualisation-france-travail', 'Actualisation France Travail', 'La fenêtre mensuelle de déclaration',
  'La fenêtre d''actualisation France Travail est ouverte : un rappel mensuel pour ne jamais la manquer.',
  'internal', 'official', false, ARRAY['emploi', 'allocations'], 382
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'actualisation-france-travail');
INSERT INTO source_states (source_id) SELECT 'actualisation-france-travail'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'actualisation-france-travail');

-- Recensement citoyen à 16 ans (rappel pédagogique annuel de rentrée).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'recensement-citoyen', 'Recensement citoyen', 'Le rappel des 16 ans',
  '16 ans dans le foyer ? Rappel de rentrée : le recensement citoyen, indispensable pour le bac et le permis.',
  'internal', 'official', false, ARRAY['vie-locale', 'administration', 'social'], 383
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'recensement-citoyen');
INSERT INTO source_states (source_id) SELECT 'recensement-citoyen'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'recensement-citoyen');

-- ── Vague outre-mer & expatriés (nouvelles sources A, B, J, D). display_order 384+.

-- A. Commémorations LOCALES de l'abolition de l'esclavage, PARAMÉTRÉES par territoire.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'commemorations-outremer', 'Commémorations outre-mer', 'L''abolition de l''esclavage, par territoire',
  'La date de commémoration de l''abolition de l''esclavage propre à votre territoire, rappelée chaque année.',
  'internal', 'official', false, ARRAY['memoire', 'outre-mer'], 384, '[{"key":"territoire","label":"Territoire","type":"enum","values":[{"value":"guadeloupe","label":"Guadeloupe"},{"value":"martinique","label":"Martinique"},{"value":"guyane","label":"Guyane"},{"value":"reunion","label":"La Réunion"},{"value":"mayotte","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'commemorations-outremer');
UPDATE sources SET params_schema = '[{"key":"territoire","label":"Territoire","type":"enum","values":[{"value":"guadeloupe","label":"Guadeloupe"},{"value":"martinique","label":"Martinique"},{"value":"guyane","label":"Guyane"},{"value":"reunion","label":"La Réunion"},{"value":"mayotte","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'commemorations-outremer';
INSERT INTO source_states (source_id) SELECT 'commemorations-outremer'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'commemorations-outremer');

-- B. Ouverture / fermeture officielle de la saison cyclonique par bassin (broadcast).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'saison-cyclonique', 'Saison cyclonique', 'Ouverture et fermeture officielles par bassin',
  'Début et fin de la saison cyclonique de votre bassin : le repère calendaire officiel, sans stress inutile.',
  'internal', 'official', false, ARRAY['meteo', 'outre-mer'], 385
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'saison-cyclonique');
INSERT INTO source_states (source_id) SELECT 'saison-cyclonique'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'saison-cyclonique');

-- J. Soldes en outre-mer, PARAMÉTRÉES par territoire (arrêté du 27 mai 2019).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'soldes-outremer', 'Soldes outre-mer', 'Les dates propres à votre territoire',
  'Les dates de soldes de votre territoire d''outre-mer — parce que non, ce ne sont pas celles de Paris.',
  'internal', 'official', false, ARRAY['soldes', 'outre-mer'], 386, '[{"key":"territoire","label":"Territoire","type":"enum","values":[{"value":"guadeloupe","label":"Guadeloupe"},{"value":"martinique","label":"Martinique"},{"value":"guyane","label":"Guyane"},{"value":"reunion","label":"La Réunion"},{"value":"mayotte","label":"Mayotte"},{"value":"saint-pierre-et-miquelon","label":"Saint-Pierre-et-Miquelon"},{"value":"saint-barthelemy","label":"Saint-Barthélemy"},{"value":"saint-martin","label":"Saint-Martin"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'soldes-outremer');
UPDATE sources SET params_schema = '[{"key":"territoire","label":"Territoire","type":"enum","values":[{"value":"guadeloupe","label":"Guadeloupe"},{"value":"martinique","label":"Martinique"},{"value":"guyane","label":"Guyane"},{"value":"reunion","label":"La Réunion"},{"value":"mayotte","label":"Mayotte"},{"value":"saint-pierre-et-miquelon","label":"Saint-Pierre-et-Miquelon"},{"value":"saint-barthelemy","label":"Saint-Barthélemy"},{"value":"saint-martin","label":"Saint-Martin"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'soldes-outremer';
INSERT INTO source_states (source_id) SELECT 'soldes-outremer'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'soldes-outremer');

-- D. Tours cyclistes d'outre-mer (source EN SOMMEIL : dates 2027 à transcrire).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'tours-cyclistes-outremer', 'Tours cyclistes outre-mer', 'Guadeloupe, Martinique…',
  'Tour de Guadeloupe, Tour de Martinique : prévenu dès que les dates officielles tombent.',
  'internal', 'official', false, ARRAY['cyclisme', 'sport', 'outre-mer'], 387
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'tours-cyclistes-outremer');
INSERT INTO source_states (source_id) SELECT 'tours-cyclistes-outremer'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'tours-cyclistes-outremer');

-- ── Vague consommation / santé / réglementaire (5 sources RSS & INSEE). display_order 388+.

-- 1. ANSM : alertes médicaments & dispositifs médicaux (broadcast RSS, complète RappelConso).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'ansm-rappels-medicaments', 'Alertes ANSM', 'Médicaments & dispositifs médicaux',
  'Rupture, retrait ou alerte sur un médicament : l''information officielle santé, dès sa publication.',
  'internal', 'official', false, ARRAY['medicaments', 'sante', 'rappels-produits'], 388
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'ansm-rappels-medicaments');
INSERT INTO source_states (source_id) SELECT 'ansm-rappels-medicaments'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'ansm-rappels-medicaments');

-- 2. Prix de l'alimentation (INSEE IPC poste 01.1, glissement annuel mensuel).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'ipc-alimentaire', 'Prix de l''alimentation', 'L''inflation alimentaire, chaque mois',
  'Les prix de l''alimentation sur un an, en un chiffre : la publication mensuelle INSEE, sans blabla.',
  'internal', 'official', false, ARRAY['consommation', 'alimentation', 'inflation'], 389
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'ipc-alimentaire');
INSERT INTO source_states (source_id) SELECT 'ipc-alimentaire'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'ipc-alimentaire');

-- 3. Prix des logements anciens (INSEE-Notaires, glissement annuel trimestriel).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'prix-logements-anciens', 'Prix de l''immobilier ancien', 'L''indice INSEE-Notaires, chaque trimestre',
  'Les prix de l''immobilier ancien sur un an, en un chiffre : la publication trimestrielle, sans blabla.',
  'internal', 'official', false, ARRAY['immobilier', 'logement', 'consommation'], 390
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'prix-logements-anciens');
INSERT INTO source_states (source_id) SELECT 'prix-logements-anciens'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'prix-logements-anciens');

-- 4. Actualités officielles service-public.gouv.fr (broadcast RSS, per-item).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'service-public-actualites', 'Actualités service-public', 'Les nouveautés pratiques du quotidien',
  'Nouvelles aides, démarches, droits : chaque annonce officielle pour les particuliers, au fil de l''eau.',
  'internal', 'official', false, ARRAY['vie-pratique', 'consommation', 'reglementation'], 391
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'service-public-actualites');
INSERT INTO source_states (source_id) SELECT 'service-public-actualites'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'service-public-actualites');

-- 5. Alertes consommateurs UFC-Que Choisir (broadcast RSS filtré).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'ufc-que-choisir-actions', 'Alertes UFC-Que Choisir', 'Rappels, arnaques, actions de groupe',
  'Arnaques, rappels, mises en garde : les alertes consommateurs d''UFC-Que Choisir, sans le reste.',
  'internal', 'official', false, ARRAY['consommation', 'arnaques'], 392
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'ufc-que-choisir-actions');
INSERT INTO source_states (source_id) SELECT 'ufc-que-choisir-actions'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'ufc-que-choisir-actions');

-- ── Vague mode & concerts (2 sources calculées calendar-factory). display_order 393+.

-- Semaines de la mode & salons pro (distinct de fashion-week = PAP femme Paris).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'semaines-mode', 'Semaines de la mode', 'Fashion weeks & salons pro',
  'Paris, Milan, Haute Couture : le calendrier des grandes semaines de la mode, sans en rater une.',
  'internal', 'official', false, ARRAY['mode', 'culture'], 393
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'semaines-mode');
INSERT INTO source_states (source_id) SELECT 'semaines-mode'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'semaines-mode');

-- Grands concerts : têtes d'affiche en France, dates officielles 2027 (billetterie/salle).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'grands-concerts', 'Grands concerts', 'Les têtes d''affiche en France',
  'Les grandes têtes d''affiche débarquent en France ? Prévenu avant le concert, pas après le sold-out.',
  'internal', 'official', false, ARRAY['musique', 'concerts', 'culture'], 394
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'grands-concerts');
INSERT INTO source_states (source_id) SELECT 'grands-concerts'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'grands-concerts');

-- ── Vague journées & semaines thématiques (7 sources calculées). display_order 395+.

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'sante-prevention', 'Prévention santé', 'Journées & semaines de prévention',
  'Santé mentale, journée sans tabac, semaine du cerveau : les grands rendez-vous de prévention, à l''heure.',
  'internal', 'official', false, ARRAY['sante'], 395
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'sante-prevention');
INSERT INTO source_states (source_id) SELECT 'sante-prevention'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'sante-prevention');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'journees-environnement', 'Journées environnement', 'Terre, océans, biodiversité, nature',
  'Jour de la Terre, biodiversité, océans : les grandes journées de l''environnement, rappelées à temps.',
  'internal', 'official', false, ARRAY['environnement'], 396
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'journees-environnement');
INSERT INTO source_states (source_id) SELECT 'journees-environnement'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'journees-environnement');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'numerique-cyber', 'Numérique & cyber', 'Données, mots de passe, Cybermois',
  'Protection des données, World Password Day, Cybermois : les rendez-vous pour rester au point.',
  'internal', 'official', false, ARRAY['cybersecurite', 'numerique', 'securite'], 397
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'numerique-cyber');
INSERT INTO source_states (source_id) SELECT 'numerique-cyber'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'numerique-cyber');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'mobilite-douce', 'Mobilité douce', 'Vélo, marche, sans voiture',
  'Semaine de la mobilité, journée sans voiture, Mai à vélo : pour se déplacer autrement, rappelé à temps.',
  'internal', 'official', false, ARRAY['transports', 'environnement'], 398
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'mobilite-douce');
INSERT INTO source_states (source_id) SELECT 'mobilite-douce'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'mobilite-douce');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'civisme-solidarite', 'Civisme & solidarité', 'Aidants, handicap & emploi',
  'Journée des aidants, semaine du handicap au travail : les rendez-vous de la solidarité, rappelés à temps.',
  'internal', 'official', false, ARRAY['solidarite', 'civisme'], 399
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'civisme-solidarite');
INSERT INTO source_states (source_id) SELECT 'civisme-solidarite'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'civisme-solidarite');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'sport-participatif', 'Sport pour tous', 'Journée olympique, SOP',
  'Journée olympique, semaine du sport pour tous : bougez, on s''occupe de vous rappeler quand.',
  'internal', 'official', false, ARRAY['sport', 'jeunesse'], 400
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'sport-participatif');
INSERT INTO source_states (source_id) SELECT 'sport-participatif'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'sport-participatif');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'journees-civiques-mondiales', 'Journées civiques mondiales', 'Droits, paix, démocratie, presse',
  'Liberté de la presse, démocratie, paix, droits de l''homme : cinq grandes journées mondiales, le jour J.',
  'internal', 'official', false, ARRAY['civisme', 'vie-locale'], 401
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'journees-civiques-mondiales');
INSERT INTO source_states (source_id) SELECT 'journees-civiques-mondiales'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'journees-civiques-mondiales');

-- ── Vague salons & journées thématiques (5 sources calculées). display_order 402+.

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'gastronomie-terroir', 'Gastronomie & terroir', 'Salons, foires & journées food',
  'Salon du Chocolat, Concours Agricole, journée des abeilles : les rendez-vous du goût et du terroir.',
  'internal', 'official', false, ARRAY['gastronomie', 'agriculture'], 402
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'gastronomie-terroir');
INSERT INTO source_states (source_id) SELECT 'gastronomie-terroir'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'gastronomie-terroir');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'patrimoine-nature', 'Patrimoine & nature', 'Monuments, forêts, métiers d''art',
  'Monuments, forêts, chauves-souris et métiers d''art : les rendez-vous du patrimoine et de la nature.',
  'internal', 'official', false, ARRAY['patrimoine', 'nature'], 403
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'patrimoine-nature');
INSERT INTO source_states (source_id) SELECT 'patrimoine-nature'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'patrimoine-nature');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'entrepreneuriat-seniors', 'Entrepreneuriat', 'Salons pro, industrie & 3e âge',
  'GO Entrepreneurs, BIG, Semaine de l''industrie : les temps forts de la vie économique, à l''agenda.',
  'internal', 'official', false, ARRAY['entrepreneuriat', 'seniors'], 404
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'entrepreneuriat-seniors');
INSERT INTO source_states (source_id) SELECT 'entrepreneuriat-seniors'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'entrepreneuriat-seniors');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'revalorisation-retraite', 'Revalorisation retraites', 'Base (1er janvier) & Agirc-Arrco (1er novembre)',
  'Retraite de base, complémentaire Agirc-Arrco : les deux rendez-vous annuels de revalorisation, rappelés.',
  'internal', 'official', false, ARRAY['retraite', 'seniors'], 405
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'revalorisation-retraite');
INSERT INTO source_states (source_id) SELECT 'revalorisation-retraite'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'revalorisation-retraite');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'innovation-civile', 'Innovation civile', 'Propriété intellectuelle & aviation',
  'Propriété intellectuelle, aviation civile : deux journées internationales, rappelées le jour J.',
  'internal', 'official', false, ARRAY['innovation', 'numerique'], 406
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'innovation-civile');
INSERT INTO source_states (source_id) SELECT 'innovation-civile'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'innovation-civile');

-- ── Vague sport & barèmes auto. display_order 407+.
-- (Les extensions grands-rendez-vous-sportifs et grands-salons sont code-only,
--  aucune modification de base requise.)

-- Barèmes automobiles à date fixe (malus écologique au 1er janvier, sans montant).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'baremes-auto', 'Barèmes auto', 'Malus écologique au 1er janvier',
  'Le malus écologique est révisé chaque 1er janvier : rappel de l''échéance, sans présumer des montants.',
  'internal', 'official', false, ARRAY['automobile', 'impots'], 407
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'baremes-auto');
INSERT INTO source_states (source_id) SELECT 'baremes-auto'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'baremes-auto');

-- ── Vague culture manga & jeunesse (2 sources calculées). display_order 408+.
-- (Les extensions festivals-musique et grands-anniversaires sont code-only ; leurs
--  descriptions sont rafraîchies ci-dessus.)

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'manga-conventions', 'Conventions manga', 'Japan Touch, Polymanga, Comiket…',
  'Comiket, Japan Touch, AnimeJapan : les grandes conventions manga et pop-culture asiatique, prévenues.',
  'internal', 'official', false, ARRAY['manga', 'culture', 'jeux-video'], 408
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'manga-conventions');
INSERT INTO source_states (source_id) SELECT 'manga-conventions'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'manga-conventions');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'journees-jeunesse-education', 'Journées jeunesse & éducation', 'Éducation, jeunesse, numérique responsable',
  'Éducation, alphabétisation, jeunesse : les grandes journées ONU de la jeunesse, rappelées le jour J.',
  'internal', 'official', false, ARRAY['jeunesse', 'education'], 409
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'journees-jeunesse-education');
INSERT INTO source_states (source_id) SELECT 'journees-jeunesse-education'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'journees-jeunesse-education');

-- ── Carte webmaster : surveillance de disponibilité d'un domaine. display_order 410.
-- requires_confirmation = TRUE → l'alerte de panne exige 2 échecs consécutifs
-- (inactive → pending → active), via la machine à états du poller.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'domaine-disponibilite', 'Surveillance de domaine', 'Le site de votre choix répond-il ?',
  'Votre site ne répond plus ? Vous le savez avant vos visiteurs. Alerte confirmée, jamais de fausse alerte.',
  'internal', 'official', true, ARRAY['uptime', 'pannes-services', 'noms-de-domaine'], 410, '[{"key":"domaine","label":"Domaine à surveiller","type":"string","placeholder":"annad.fr","pattern":"^[a-z0-9-]+(\\.[a-z0-9-]+)+$","lowercase":true,"multiple":true,"required":true,"default":null,"hint":"Le nom de domaine seul, sans https:// (exemple : annad.fr). Alerte si le site répond en erreur (4xx/5xx) ou ne répond plus, confirmée sur deux vérifications."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'domaine-disponibilite');
UPDATE sources SET params_schema = '[{"key":"domaine","label":"Domaine à surveiller","type":"string","placeholder":"annad.fr","pattern":"^[a-z0-9-]+(\\.[a-z0-9-]+)+$","lowercase":true,"multiple":true,"required":true,"default":null,"hint":"Le nom de domaine seul, sans https:// (exemple : annad.fr). Alerte si le site répond en erreur (4xx/5xx) ou ne répond plus, confirmée sur deux vérifications."}]'::jsonb WHERE id = 'domaine-disponibilite';
INSERT INTO source_states (source_id) SELECT 'domaine-disponibilite'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'domaine-disponibilite');

-- ── Carte webmaster : réputation sécurité d'un domaine (URLhaus). display_order 411.
-- requires_confirmation = FALSE → alerte IMMÉDIATE dès signalement en blocklist
-- (une inscription malware est un signal fort en soi, pas de temporisation).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'domaine-securite', 'Réputation d''un domaine', 'Le domaine est-il signalé malveillant ?',
  'Votre domaine signalé dans une base de malware ou phishing ? Alerte immédiate, avec le type de menace.',
  'internal', 'official', false, ARRAY['securite', 'phishing', 'noms-de-domaine'], 411, '[{"key":"domaine","label":"Domaine à vérifier","type":"string","placeholder":"annad.fr","pattern":"^[a-z0-9-]+(\\.[a-z0-9-]+)+$","lowercase":true,"multiple":true,"required":true,"default":null,"hint":"Le nom de domaine seul, sans https:// (exemple : annad.fr). Alerte si le domaine est signalé dans la base malware/phishing publique URLhaus."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'domaine-securite');
UPDATE sources SET params_schema = '[{"key":"domaine","label":"Domaine à vérifier","type":"string","placeholder":"annad.fr","pattern":"^[a-z0-9-]+(\\.[a-z0-9-]+)+$","lowercase":true,"multiple":true,"required":true,"default":null,"hint":"Le nom de domaine seul, sans https:// (exemple : annad.fr). Alerte si le domaine est signalé dans la base malware/phishing publique URLhaus."}]'::jsonb WHERE id = 'domaine-securite';
INSERT INTO source_states (source_id) SELECT 'domaine-securite'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'domaine-securite');

-- ── Hausse de tarif opérateur (FAI) — 7 offres (PHASE 1 : 4 à URL stable ;
-- PHASE 2 : 3 à URL résolue à chaque cycle). display_order 412.
-- Convention « Bison Futé » : le contenu n'est jamais interprété, seul un hash du TEXTE
-- extrait est comparé d'un cycle à l'autre. L'alerte dit « un changement a été détecté »,
-- jamais un montant. requires_confirmation = FALSE → alerte immédiate (impulsion one-shot),
-- le hash de référence étant mis à jour au moment du changement. Poll hebdomadaire (module).
-- PHASE 2 (extension d'enum, pas de nouvel INSERT) : Orange mobile/box (résolution headless
-- via le runner Playwright partagé) & Bouygues mobile (résolution d'index HTML).
-- sfr-box écarté (vague 2, 2026-07-21) : doublon SHA-256 avec sfr-red-mobile (cf. module).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'hausse-tarif-operateur', 'Grille tarifaire opérateur', 'Un changement dans la grille de votre offre ?',
  'Votre opérateur retouche discrètement sa grille tarifaire ? Nous, on le remarque. Et on vous le dit.',
  'internal', 'official', false, ARRAY['consommation', 'vie-pratique'], 412, '[{"key":"offre","label":"Offre","type":"enum","values":[{"value":"bbox","label":"Bouygues — Internet/Box"},{"value":"freebox","label":"Free — Internet/Box"},{"value":"free-mobile","label":"Free Mobile"},{"value":"sfr-red-mobile","label":"SFR RED Mobile"},{"value":"orange-mobile","label":"Orange — Forfait mobile"},{"value":"orange-box","label":"Orange — Internet/Box"},{"value":"bouygues-mobile","label":"Bouygues — Forfait mobile"}],"multiple":true,"required":true,"default":null,"hint":"Choisissez l’offre à surveiller. Vous êtes prévenu qu’un changement a été détecté dans la grille tarifaire — sans montant, à vérifier vous-même sur le document officiel."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'hausse-tarif-operateur');
UPDATE sources SET params_schema = '[{"key":"offre","label":"Offre","type":"enum","values":[{"value":"bbox","label":"Bouygues — Internet/Box"},{"value":"freebox","label":"Free — Internet/Box"},{"value":"free-mobile","label":"Free Mobile"},{"value":"sfr-red-mobile","label":"SFR RED Mobile"},{"value":"orange-mobile","label":"Orange — Forfait mobile"},{"value":"orange-box","label":"Orange — Internet/Box"},{"value":"bouygues-mobile","label":"Bouygues — Forfait mobile"}],"multiple":true,"required":true,"default":null,"hint":"Choisissez l’offre à surveiller. Vous êtes prévenu qu’un changement a été détecté dans la grille tarifaire — sans montant, à vérifier vous-même sur le document officiel."}]'::jsonb WHERE id = 'hausse-tarif-operateur';
INSERT INTO source_states (source_id) SELECT 'hausse-tarif-operateur'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'hausse-tarif-operateur');

-- ================================================================
-- Vague ALERTES RÉGIONALES (display_order 413-419). Valeurs enum région = noms
-- EXACTS de server/geo.js (subdivision IPLocate) → pré-remplissage profil (LBADefaults.region).
-- Air/pollens : connecteur partagé lib/atmo-connector.js (Atmo France, sans clé, agrégation
-- commune→département). Submersion : Météo-France DPVigilance (clé METEOFRANCE_VIGILANCE_API_KEY,
-- no-op sans clé). Ours/algues/transhumance/fete-bretagne : sources calculées (dates vérifiées).
-- ================================================================

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'qualite-air', 'Qualité de l''air', 'Le département de votre choix',
  'L''air se dégrade sérieusement dans votre département ? Alerte immédiate. Le reste du temps : silence.',
  'internal', 'official', false, ARRAY['qualite-air', 'environnement', 'sante'], 413, '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"01","label":"Ain"},{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"15","label":"Cantal"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"26","label":"Drôme"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"32","label":"Gers"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"39","label":"Jura"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"48","label":"Lozère"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"91","label":"Essonne"},{"value":"92","label":"Hauts-de-Seine"},{"value":"93","label":"Seine-Saint-Denis"},{"value":"94","label":"Val-de-Marne"},{"value":"95","label":"Val-d''Oise"},{"value":"971","label":"Guadeloupe"},{"value":"972","label":"Martinique"},{"value":"973","label":"Guyane"},{"value":"974","label":"La Réunion"},{"value":"976","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'qualite-air');
UPDATE sources SET params_schema = '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"01","label":"Ain"},{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"15","label":"Cantal"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"26","label":"Drôme"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"32","label":"Gers"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"39","label":"Jura"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"48","label":"Lozère"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"91","label":"Essonne"},{"value":"92","label":"Hauts-de-Seine"},{"value":"93","label":"Seine-Saint-Denis"},{"value":"94","label":"Val-de-Marne"},{"value":"95","label":"Val-d''Oise"},{"value":"971","label":"Guadeloupe"},{"value":"972","label":"Martinique"},{"value":"973","label":"Guyane"},{"value":"974","label":"La Réunion"},{"value":"976","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'qualite-air';
INSERT INTO source_states (source_id) SELECT 'qualite-air'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'qualite-air');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'pollens', 'Pollens & allergies', 'Le département de votre choix',
  'Le bouleau attaque, les graminées complotent : alerté dès que le risque allergie grimpe chez vous.',
  'internal', 'official', false, ARRAY['pollens', 'allergies', 'sante'], 414, '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"01","label":"Ain"},{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"15","label":"Cantal"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"26","label":"Drôme"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"32","label":"Gers"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"39","label":"Jura"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"48","label":"Lozère"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"91","label":"Essonne"},{"value":"92","label":"Hauts-de-Seine"},{"value":"93","label":"Seine-Saint-Denis"},{"value":"94","label":"Val-de-Marne"},{"value":"95","label":"Val-d''Oise"},{"value":"971","label":"Guadeloupe"},{"value":"972","label":"Martinique"},{"value":"973","label":"Guyane"},{"value":"974","label":"La Réunion"},{"value":"976","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'pollens');
UPDATE sources SET params_schema = '[{"key":"departement","label":"Département","type":"enum","values":[{"value":"01","label":"Ain"},{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"15","label":"Cantal"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"26","label":"Drôme"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"32","label":"Gers"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"39","label":"Jura"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"48","label":"Lozère"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"91","label":"Essonne"},{"value":"92","label":"Hauts-de-Seine"},{"value":"93","label":"Seine-Saint-Denis"},{"value":"94","label":"Val-de-Marne"},{"value":"95","label":"Val-d''Oise"},{"value":"971","label":"Guadeloupe"},{"value":"972","label":"Martinique"},{"value":"973","label":"Guyane"},{"value":"974","label":"La Réunion"},{"value":"976","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'pollens';
INSERT INTO source_states (source_id) SELECT 'pollens'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'pollens');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'vigilance-submersion', 'Vagues-submersion', 'La région côtière de votre choix',
  'Vagues-submersion sur votre littoral : alerté dès la vigilance orange, avant que la mer ne monte.',
  'internal', 'official', false, ARRAY['submersion', 'vigilance-meteo', 'littoral'], 415, '[{"key":"region","label":"Région","type":"enum","values":[{"value":"Hauts-de-France","label":"Hauts-de-France"},{"value":"Normandie","label":"Normandie"},{"value":"Bretagne","label":"Bretagne"},{"value":"Pays de la Loire","label":"Pays de la Loire"},{"value":"Nouvelle-Aquitaine","label":"Nouvelle-Aquitaine"},{"value":"Occitanie","label":"Occitanie"},{"value":"Provence-Alpes-Côte d''Azur","label":"Provence-Alpes-Côte d''Azur"},{"value":"Corse","label":"Corse"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-submersion');
UPDATE sources SET params_schema = '[{"key":"region","label":"Région","type":"enum","values":[{"value":"Hauts-de-France","label":"Hauts-de-France"},{"value":"Normandie","label":"Normandie"},{"value":"Bretagne","label":"Bretagne"},{"value":"Pays de la Loire","label":"Pays de la Loire"},{"value":"Nouvelle-Aquitaine","label":"Nouvelle-Aquitaine"},{"value":"Occitanie","label":"Occitanie"},{"value":"Provence-Alpes-Côte d''Azur","label":"Provence-Alpes-Côte d''Azur"},{"value":"Corse","label":"Corse"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'vigilance-submersion';
INSERT INTO source_states (source_id) SELECT 'vigilance-submersion'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-submersion');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'ours-pyrenees', 'Ours des Pyrénées', 'Occitanie ou Nouvelle-Aquitaine',
  'Le bilan annuel de l''ours brun des Pyrénées approche ? Un rappel pour les curieux de la grande faune.',
  'internal', 'official', false, ARRAY['nature', 'animaux', 'environnement'], 416, '[{"key":"region","label":"Région","type":"enum","values":[{"value":"Occitanie","label":"Occitanie"},{"value":"Nouvelle-Aquitaine","label":"Nouvelle-Aquitaine"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'ours-pyrenees');
UPDATE sources SET params_schema = '[{"key":"region","label":"Région","type":"enum","values":[{"value":"Occitanie","label":"Occitanie"},{"value":"Nouvelle-Aquitaine","label":"Nouvelle-Aquitaine"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'ours-pyrenees';
INSERT INTO source_states (source_id) SELECT 'ours-pyrenees'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'ours-pyrenees');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'algues-vertes-bretagne', 'Algues vertes (Bretagne)', 'Marées vertes, avril→octobre',
  'La saison des algues vertes bat son plein en Bretagne ? Un rappel mensuel pour consulter le suivi officiel.',
  'internal', 'official', false, ARRAY['environnement', 'sante'], 417
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'algues-vertes-bretagne');
INSERT INTO source_states (source_id) SELECT 'algues-vertes-bretagne'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'algues-vertes-bretagne');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'transhumance', 'Fêtes de la transhumance', 'Alpes & Pyrénées',
  'Les troupeaux montent en estive : prévenu avant les grandes fêtes de la transhumance.',
  'internal', 'official', false, ARRAY['culture', 'patrimoine', 'agriculture'], 418
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'transhumance');
INSERT INTO source_states (source_id) SELECT 'transhumance'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'transhumance');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'fete-bretagne', 'Fête de la Bretagne', 'Gouel Breizh, mi-mai',
  'Gouel Breizh approche : 200 événements dans toute la Bretagne autour de la Saint-Yves. Prévenu avant.',
  'internal', 'official', false, ARRAY['culture', 'fetes', 'identite-regionale'], 419
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'fete-bretagne');
INSERT INTO source_states (source_id) SELECT 'fete-bretagne'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'fete-bretagne');

-- ================================================================
-- Vague VILLE / COMMUNE (display_order 420-421). Champ paramètre type 'commune' :
-- nom de ville saisi/pré-rempli → résolu en CODE INSEE à la souscription (lib/commune-insee,
-- via la route toggle-param), valeur canonique = INSEE. Sources jusqu'au niveau village.
-- Init sans fausse alerte rétroactive : 1er passage = référence mémorisée, pas d'alerte.
-- ================================================================

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'eau-potable-commune', 'Eau potable (commune)', 'Contrôle sanitaire de votre commune',
  'L''eau du robinet de votre commune déclarée non conforme ? Vous êtes alerté avant de remplir la carafe.',
  'internal', 'official', false, ARRAY['sante', 'environnement', 'eau'], 420, '[{"key":"commune","label":"Commune","type":"commune","placeholder":"Votre commune","multiple":true,"required":true,"default":null,"hint":"Le nom de votre commune (ou une autre). Alerte si un contrôle sanitaire déclare l’eau du robinet non conforme."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'eau-potable-commune');
UPDATE sources SET params_schema = '[{"key":"commune","label":"Commune","type":"commune","placeholder":"Votre commune","multiple":true,"required":true,"default":null,"hint":"Le nom de votre commune (ou une autre). Alerte si un contrôle sanitaire déclare l’eau du robinet non conforme."}]'::jsonb WHERE id = 'eau-potable-commune';
INSERT INTO source_states (source_id) SELECT 'eau-potable-commune'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'eau-potable-commune');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'catnat-commune', 'Catastrophe naturelle (commune)', 'Nouvel arrêté CatNat pour votre commune',
  'Catastrophe naturelle reconnue dans votre commune : soyez prévenu à temps pour prévenir votre assurance.',
  'internal', 'official', false, ARRAY['risques-naturels', 'assurance', 'inondations'], 421, '[{"key":"commune","label":"Commune","type":"commune","placeholder":"Votre commune","multiple":true,"required":true,"default":null,"hint":"Le nom de votre commune (ou une autre). Alerte à la publication d’un nouvel arrêté de catastrophe naturelle."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'catnat-commune');
UPDATE sources SET params_schema = '[{"key":"commune","label":"Commune","type":"commune","placeholder":"Votre commune","multiple":true,"required":true,"default":null,"hint":"Le nom de votre commune (ou une autre). Alerte à la publication d’un nouvel arrêté de catastrophe naturelle."}]'::jsonb WHERE id = 'catnat-commune';
INSERT INTO source_states (source_id) SELECT 'catnat-commune'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'catnat-commune');

-- ================================================================
-- Vague « villes » — traditions & courses (display_order 422-423). Sources PARAMÉTRÉES ENUM
-- (l'abonné choisit ce qu'il suit). Dates vérifiées sur source officielle le 21/07/2026.
-- TODO datés & Ostensions Limousines (2030) documentés en tête des modules .js.
-- ================================================================

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'traditions-locales', 'Traditions & fêtes locales', 'La tradition de votre choix',
  'Férias, pardons, vendanges, foires aux vins : choisissez vos traditions, on s''occupe du rappel.',
  'internal', 'official', false, ARRAY['culture', 'traditions', 'evenements-locaux'], 422, '[{"key":"tradition","label":"Tradition","type":"enum","values":[{"value":"feria-beziers","label":"Féria de Béziers"},{"value":"feria-vendanges-nimes","label":"Féria des Vendanges de Nîmes"},{"value":"carnaval-nice","label":"Carnaval de Nice"},{"value":"fete-citron-menton","label":"Fête du Citron de Menton"},{"value":"pardon-sainte-anne-auray","label":"Grand Pardon de Sainte-Anne-d''Auray"},{"value":"remparts-dinan","label":"Fête des Remparts de Dinan"},{"value":"foire-vins-colmar","label":"Foire aux vins de Colmar"},{"value":"mirabelle-metz","label":"Fête de la Mirabelle de Metz"},{"value":"trois-glorieuses-beaune","label":"Trois Glorieuses de Beaune"},{"value":"vendanges-montmartre","label":"Fête des Vendanges de Montmartre"},{"value":"foire-marseille","label":"Foire Internationale de Marseille"},{"value":"marathon-medoc","label":"Marathon du Médoc"},{"value":"nuits-sonores-lyon","label":"Nuits Sonores à Lyon"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'traditions-locales');
UPDATE sources SET params_schema = '[{"key":"tradition","label":"Tradition","type":"enum","values":[{"value":"feria-beziers","label":"Féria de Béziers"},{"value":"feria-vendanges-nimes","label":"Féria des Vendanges de Nîmes"},{"value":"carnaval-nice","label":"Carnaval de Nice"},{"value":"fete-citron-menton","label":"Fête du Citron de Menton"},{"value":"pardon-sainte-anne-auray","label":"Grand Pardon de Sainte-Anne-d''Auray"},{"value":"remparts-dinan","label":"Fête des Remparts de Dinan"},{"value":"foire-vins-colmar","label":"Foire aux vins de Colmar"},{"value":"mirabelle-metz","label":"Fête de la Mirabelle de Metz"},{"value":"trois-glorieuses-beaune","label":"Trois Glorieuses de Beaune"},{"value":"vendanges-montmartre","label":"Fête des Vendanges de Montmartre"},{"value":"foire-marseille","label":"Foire Internationale de Marseille"},{"value":"marathon-medoc","label":"Marathon du Médoc"},{"value":"nuits-sonores-lyon","label":"Nuits Sonores à Lyon"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'traditions-locales';
INSERT INTO source_states (source_id) SELECT 'traditions-locales'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'traditions-locales');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'marathons-villes', 'Marathons des grandes villes', 'La course de votre choix',
  'Le marathon de votre ville approche ? Prévenu avant le départ, que vous couriez ou encouragiez.',
  'internal', 'official', false, ARRAY['sport', 'running'], 423, '[{"key":"course","label":"Course","type":"enum","values":[{"value":"marathon-paris","label":"Marathon de Paris"},{"value":"semi-paris","label":"Semi-marathon de Paris"},{"value":"run-in-lyon","label":"Run in Lyon (marathon)"},{"value":"20km-paris","label":"20 km de Paris"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'marathons-villes');
UPDATE sources SET params_schema = '[{"key":"course","label":"Course","type":"enum","values":[{"value":"marathon-paris","label":"Marathon de Paris"},{"value":"semi-paris","label":"Semi-marathon de Paris"},{"value":"run-in-lyon","label":"Run in Lyon (marathon)"},{"value":"20km-paris","label":"20 km de Paris"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'marathons-villes';
INSERT INTO source_states (source_id) SELECT 'marathons-villes'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'marathons-villes');

-- ================================================================
-- Vague « veille d'état imprévisible » (display_order 424-428). Sources PARAMÉTRÉES.
-- Anti-SSRF via safe-fetch (URL utilisateur). Référence au 1er cycle sans alerte
-- (pas de faux positif rétroactif). Limites documentées en tête de chaque module .js.
-- veille-prix : NON codée (trop fragile, prix JS-rendus) — TODO reprise via headless.
-- ================================================================

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'veille-page', 'Veille de page', 'Suivez n''importe quelle page web',
  'Donnez-nous une page web : on vous prévient dès qu''elle change. Votre vigie personnelle du web.',
  'internal', 'official', false, ARRAY['numerique', 'veille'], 424, '[{"key":"url","label":"URL de la page à surveiller","type":"string","placeholder":"https://exemple.fr/page","pattern":"^https://[^\\s]{1,300}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"URL https d''une page. Vous êtes prévenu quand son contenu change. Fonctionne mieux sur des pages « classiques » (pas les sites 100% JavaScript ni les pages d''actualité qui changent en continu)."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'veille-page');
UPDATE sources SET params_schema = '[{"key":"url","label":"URL de la page à surveiller","type":"string","placeholder":"https://exemple.fr/page","pattern":"^https://[^\\s]{1,300}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"URL https d''une page. Vous êtes prévenu quand son contenu change. Fonctionne mieux sur des pages « classiques » (pas les sites 100% JavaScript ni les pages d''actualité qui changent en continu)."}]'::jsonb WHERE id = 'veille-page';
INSERT INTO source_states (source_id) SELECT 'veille-page'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'veille-page');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'veille-stock', 'Veille de stock', 'Retour en stock d''un produit',
  'Ce produit convoité revient en stock ? Donnez-nous la page, on surveille pour vous. Plus besoin de F5.',
  'internal', 'official', false, ARRAY['bons-plans', 'disponibilite'], 425, '[{"key":"url","label":"URL de la page produit","type":"string","placeholder":"https://boutique.fr/produit","pattern":"^https://[^\\s]{1,300}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"URL https d''une page produit. Vous êtes prévenu quand la disponibilité change (retour en stock / rupture). Heuristique : fonctionne mieux sur les sites classiques, pas sur les boutiques 100% JavaScript."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'veille-stock');
UPDATE sources SET params_schema = '[{"key":"url","label":"URL de la page produit","type":"string","placeholder":"https://boutique.fr/produit","pattern":"^https://[^\\s]{1,300}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"URL https d''une page produit. Vous êtes prévenu quand la disponibilité change (retour en stock / rupture). Heuristique : fonctionne mieux sur les sites classiques, pas sur les boutiques 100% JavaScript."}]'::jsonb WHERE id = 'veille-stock';
INSERT INTO source_states (source_id) SELECT 'veille-stock'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'veille-stock');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'veille-entreprise', 'Veille d''entreprise', 'Statut légal (SIREN) suivi',
  'Radiation, changement de dirigeant, nouveau nom : surveillez une entreprise par son SIREN, sans effort.',
  'internal', 'official', false, ARRAY['creation-entreprise', 'veille'], 426, '[{"key":"siren","label":"SIREN de l''entreprise","type":"string","placeholder":"552032534","pattern":"^\\d{9}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Le SIREN à 9 chiffres de l''entreprise (ex. Danone = 552032534). Alerte en cas de radiation, changement de nom ou de dirigeant."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'veille-entreprise');
UPDATE sources SET params_schema = '[{"key":"siren","label":"SIREN de l''entreprise","type":"string","placeholder":"552032534","pattern":"^\\d{9}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Le SIREN à 9 chiffres de l''entreprise (ex. Danone = 552032534). Alerte en cas de radiation, changement de nom ou de dirigeant."}]'::jsonb WHERE id = 'veille-entreprise';
INSERT INTO source_states (source_id) SELECT 'veille-entreprise'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'veille-entreprise');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'veille-boamp', 'Veille marchés publics', 'Un mot-clé dans les appels d’offres',
  'Un marché public correspond à votre mot-clé ? Prévenu dès la publication. Répondez avant les autres.',
  'internal', 'official', false, ARRAY['marches-publics', 'veille'], 427, '[{"key":"motcle","label":"Mot-clé (objet du marché)","type":"string","placeholder":"voirie, informatique, restauration scolaire…","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Un mot-clé recherché dans l''objet des avis de marchés publics (BOAMP). Alerte à la publication d''un nouvel avis correspondant."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'veille-boamp');
UPDATE sources SET params_schema = '[{"key":"motcle","label":"Mot-clé (objet du marché)","type":"string","placeholder":"voirie, informatique, restauration scolaire…","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Un mot-clé recherché dans l''objet des avis de marchés publics (BOAMP). Alerte à la publication d''un nouvel avis correspondant."}]'::jsonb WHERE id = 'veille-boamp';
INSERT INTO source_states (source_id) SELECT 'veille-boamp'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'veille-boamp');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'veille-hydrometrie', 'Niveau de rivière', 'Franchissement d’un seuil (station)',
  'Votre rivière monte ou descend au-delà de votre seuil ? Riverains, pêcheurs, kayakistes : vous saurez.',
  'internal', 'official', false, ARRAY['crues', 'environnement'], 428, '[{"key":"station","label":"Code de la station Hub''Eau","type":"string","placeholder":"O972001001","pattern":"^[A-Za-z0-9]{6,12}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Le code de la station hydrométrique (trouvez-le sur hubeau.eaufrance.fr)."},{"key":"seuil","label":"Seuil de hauteur d''eau (mm)","type":"number","placeholder":"1500","min":0,"multiple":true,"required":true,"default":null,"hint":"La hauteur d''eau en millimètres au franchissement de laquelle être alerté (montée ou baisse)."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'veille-hydrometrie');
UPDATE sources SET params_schema = '[{"key":"station","label":"Code de la station Hub''Eau","type":"string","placeholder":"O972001001","pattern":"^[A-Za-z0-9]{6,12}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Le code de la station hydrométrique (trouvez-le sur hubeau.eaufrance.fr)."},{"key":"seuil","label":"Seuil de hauteur d''eau (mm)","type":"number","placeholder":"1500","min":0,"multiple":true,"required":true,"default":null,"hint":"La hauteur d''eau en millimètres au franchissement de laquelle être alerté (montée ou baisse)."}]'::jsonb WHERE id = 'veille-hydrometrie';
INSERT INTO source_states (source_id) SELECT 'veille-hydrometrie'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'veille-hydrometrie');

-- ================================================================
-- Crypto — franchissement d'un seuil de prix choisi (display_order 429). Endpoints publics
-- Binance/Coinbase (SANS clé). Champ combiné « SYM SEUIL ». Anti-rétroactif au 1er cycle.
-- Complémentaire de bitcoin-mouvement (variation %). Purement informatif, pas de conseil.
-- ================================================================

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'crypto-seuil', 'Seuil de prix crypto', 'Franchissement d''un seuil que vous fixez',
  'Votre crypto franchit le prix que VOUS avez fixé ? Alerte immédiate, à la hausse comme à la baisse.',
  'internal', 'official', false, ARRAY['finance', 'crypto'], 429, '[{"key":"paire","label":"Cryptomonnaie","type":"enum","values":[{"value":"BTC","label":"Bitcoin (BTC)"},{"value":"ETH","label":"Ethereum (ETH)"},{"value":"SOL","label":"Solana (SOL)"},{"value":"XRP","label":"XRP (XRP)"},{"value":"ADA","label":"Cardano (ADA)"},{"value":"DOGE","label":"Dogecoin (DOGE)"},{"value":"BNB","label":"BNB (BNB)"},{"value":"LTC","label":"Litecoin (LTC)"}],"multiple":true,"required":true,"default":null},{"key":"seuil","label":"Seuil de prix (€)","type":"number","placeholder":"55000","min":0,"multiple":true,"required":true,"default":null,"hint":"Le prix en euros au franchissement duquel être alerté (hausse ou baisse). Purement informatif, pas un conseil financier."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'crypto-seuil');
UPDATE sources SET params_schema = '[{"key":"paire","label":"Cryptomonnaie","type":"enum","values":[{"value":"BTC","label":"Bitcoin (BTC)"},{"value":"ETH","label":"Ethereum (ETH)"},{"value":"SOL","label":"Solana (SOL)"},{"value":"XRP","label":"XRP (XRP)"},{"value":"ADA","label":"Cardano (ADA)"},{"value":"DOGE","label":"Dogecoin (DOGE)"},{"value":"BNB","label":"BNB (BNB)"},{"value":"LTC","label":"Litecoin (LTC)"}],"multiple":true,"required":true,"default":null},{"key":"seuil","label":"Seuil de prix (€)","type":"number","placeholder":"55000","min":0,"multiple":true,"required":true,"default":null,"hint":"Le prix en euros au franchissement duquel être alerté (hausse ou baisse). Purement informatif, pas un conseil financier."}]'::jsonb WHERE id = 'crypto-seuil';
INSERT INTO source_states (source_id) SELECT 'crypto-seuil'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'crypto-seuil');

-- ================================================================
-- Veille d'offres d'emploi (France Travail, OAuth2). display_order 430. Multi-champs :
-- motcle (string) + departement (enum, pré-rempli profil). Anti-rétroactif + dédoublonnage
-- par id d'offre. Mentions CGU (source + date MAJ) dans le message, aucune donnée de contact.
-- Prête-à-brancher : no-op sans FRANCETRAVAIL_CLIENT_ID/SECRET.
-- ================================================================

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'veille-emploi', 'Veille offres d''emploi', 'Une nouvelle offre pour vos critères',
  'Votre métier, votre département : une nouvelle offre d''emploi correspond ? Vous êtes le premier prévenu.',
  'internal', 'official', false, ARRAY['emploi', 'offres-emploi'], 430, '[{"key":"motcle","label":"Mots-clés","type":"string","placeholder":"développeur web","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Les mots-clés du poste recherché (ex. « aide-soignant », « développeur web »)."},{"key":"departement","label":"Département","type":"enum","values":[{"value":"01","label":"Ain"},{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"15","label":"Cantal"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"26","label":"Drôme"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"32","label":"Gers"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"39","label":"Jura"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"48","label":"Lozère"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"91","label":"Essonne"},{"value":"92","label":"Hauts-de-Seine"},{"value":"93","label":"Seine-Saint-Denis"},{"value":"94","label":"Val-de-Marne"},{"value":"95","label":"Val-d''Oise"},{"value":"971","label":"Guadeloupe"},{"value":"972","label":"Martinique"},{"value":"973","label":"Guyane"},{"value":"974","label":"La Réunion"},{"value":"976","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'veille-emploi');
UPDATE sources SET params_schema = '[{"key":"motcle","label":"Mots-clés","type":"string","placeholder":"développeur web","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Les mots-clés du poste recherché (ex. « aide-soignant », « développeur web »)."},{"key":"departement","label":"Département","type":"enum","values":[{"value":"01","label":"Ain"},{"value":"02","label":"Aisne"},{"value":"03","label":"Allier"},{"value":"04","label":"Alpes-de-Haute-Provence"},{"value":"05","label":"Hautes-Alpes"},{"value":"06","label":"Alpes-Maritimes"},{"value":"07","label":"Ardèche"},{"value":"08","label":"Ardennes"},{"value":"09","label":"Ariège"},{"value":"10","label":"Aube"},{"value":"11","label":"Aude"},{"value":"12","label":"Aveyron"},{"value":"13","label":"Bouches-du-Rhône"},{"value":"14","label":"Calvados"},{"value":"15","label":"Cantal"},{"value":"16","label":"Charente"},{"value":"17","label":"Charente-Maritime"},{"value":"18","label":"Cher"},{"value":"19","label":"Corrèze"},{"value":"2A","label":"Corse-du-Sud"},{"value":"2B","label":"Haute-Corse"},{"value":"21","label":"Côte-d''Or"},{"value":"22","label":"Côtes-d''Armor"},{"value":"23","label":"Creuse"},{"value":"24","label":"Dordogne"},{"value":"25","label":"Doubs"},{"value":"26","label":"Drôme"},{"value":"27","label":"Eure"},{"value":"28","label":"Eure-et-Loir"},{"value":"29","label":"Finistère"},{"value":"30","label":"Gard"},{"value":"31","label":"Haute-Garonne"},{"value":"32","label":"Gers"},{"value":"33","label":"Gironde"},{"value":"34","label":"Hérault"},{"value":"35","label":"Ille-et-Vilaine"},{"value":"36","label":"Indre"},{"value":"37","label":"Indre-et-Loire"},{"value":"38","label":"Isère"},{"value":"39","label":"Jura"},{"value":"40","label":"Landes"},{"value":"41","label":"Loir-et-Cher"},{"value":"42","label":"Loire"},{"value":"43","label":"Haute-Loire"},{"value":"44","label":"Loire-Atlantique"},{"value":"45","label":"Loiret"},{"value":"46","label":"Lot"},{"value":"47","label":"Lot-et-Garonne"},{"value":"48","label":"Lozère"},{"value":"49","label":"Maine-et-Loire"},{"value":"50","label":"Manche"},{"value":"51","label":"Marne"},{"value":"52","label":"Haute-Marne"},{"value":"53","label":"Mayenne"},{"value":"54","label":"Meurthe-et-Moselle"},{"value":"55","label":"Meuse"},{"value":"56","label":"Morbihan"},{"value":"57","label":"Moselle"},{"value":"58","label":"Nièvre"},{"value":"59","label":"Nord"},{"value":"60","label":"Oise"},{"value":"61","label":"Orne"},{"value":"62","label":"Pas-de-Calais"},{"value":"63","label":"Puy-de-Dôme"},{"value":"64","label":"Pyrénées-Atlantiques"},{"value":"65","label":"Hautes-Pyrénées"},{"value":"66","label":"Pyrénées-Orientales"},{"value":"67","label":"Bas-Rhin"},{"value":"68","label":"Haut-Rhin"},{"value":"69","label":"Rhône"},{"value":"70","label":"Haute-Saône"},{"value":"71","label":"Saône-et-Loire"},{"value":"72","label":"Sarthe"},{"value":"73","label":"Savoie"},{"value":"74","label":"Haute-Savoie"},{"value":"75","label":"Paris"},{"value":"76","label":"Seine-Maritime"},{"value":"77","label":"Seine-et-Marne"},{"value":"78","label":"Yvelines"},{"value":"79","label":"Deux-Sèvres"},{"value":"80","label":"Somme"},{"value":"81","label":"Tarn"},{"value":"82","label":"Tarn-et-Garonne"},{"value":"83","label":"Var"},{"value":"84","label":"Vaucluse"},{"value":"85","label":"Vendée"},{"value":"86","label":"Vienne"},{"value":"87","label":"Haute-Vienne"},{"value":"88","label":"Vosges"},{"value":"89","label":"Yonne"},{"value":"90","label":"Territoire de Belfort"},{"value":"91","label":"Essonne"},{"value":"92","label":"Hauts-de-Seine"},{"value":"93","label":"Seine-Saint-Denis"},{"value":"94","label":"Val-de-Marne"},{"value":"95","label":"Val-d''Oise"},{"value":"971","label":"Guadeloupe"},{"value":"972","label":"Martinique"},{"value":"973","label":"Guyane"},{"value":"974","label":"La Réunion"},{"value":"976","label":"Mayotte"}],"multiple":true,"required":true,"default":null}]'::jsonb WHERE id = 'veille-emploi';
INSERT INTO source_states (source_id) SELECT 'veille-emploi'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'veille-emploi');

-- ================================================================
-- Veille Twitch : passage EN DIRECT d'une chaîne (OAuth2 App Access Token). display_order 431.
-- Batch jusqu'à 100 user_login/requête. Anti-rétroactif (chaîne déjà en direct à la souscription
-- ne déclenche pas). Prête-à-brancher : no-op sans TWITCH_CLIENT_ID/SECRET.
-- ================================================================

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'veille-twitch', 'Chaîne Twitch en direct', 'Prévenu quand elle passe en live',
  'Votre streamer préféré passe en direct ? Vous le savez à la seconde. Une alerte, pas cinquante.',
  'internal', 'official', false, ARRAY['streaming', 'twitch'], 431, '[{"key":"chaine","label":"Chaîne Twitch","type":"string","placeholder":"zerator","pattern":"^[A-Za-z0-9_]{3,25}$","lowercase":true,"multiple":true,"required":true,"default":null,"hint":"Le nom de la chaîne Twitch (l''identifiant, PAS l''URL). Ex. pour twitch.tv/zerator, saisissez « zerator ». Alerte quand la chaîne passe en direct."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'veille-twitch');
UPDATE sources SET params_schema = '[{"key":"chaine","label":"Chaîne Twitch","type":"string","placeholder":"zerator","pattern":"^[A-Za-z0-9_]{3,25}$","lowercase":true,"multiple":true,"required":true,"default":null,"hint":"Le nom de la chaîne Twitch (l''identifiant, PAS l''URL). Ex. pour twitch.tv/zerator, saisissez « zerator ». Alerte quand la chaîne passe en direct."}]'::jsonb WHERE id = 'veille-twitch';
INSERT INTO source_states (source_id) SELECT 'veille-twitch'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'veille-twitch');

-- ================================================================
-- Veille juridique Légifrance (PISTE, OAuth2). display_order 432. UN SEUL appel global
-- (lot du jour du Journal Officiel via lastNJo+jorfCont) + filtrage local par mot-clé.
-- Anti-rétroactif par combo, dédoublonnage par CID. No-op sans LEGIFRANCE_CLIENT_ID/SECRET.
-- ================================================================

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'veille-legifrance', 'Veille juridique', 'Un nouveau texte au Journal Officiel',
  'Un mot-clé, et chaque loi, décret ou arrêté qui le mentionne au Journal Officiel vous est signalé.',
  'internal', 'official', false, ARRAY['juridique', 'journal-officiel', 'veille'], 432, '[{"key":"motcle","label":"Mot-clé juridique","type":"string","placeholder":"éolien, gendarmerie, apprentissage…","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Un mot-clé recherché dans les nouveaux textes du Journal Officiel (lois, décrets, arrêtés). Alerte à la publication d''un texte correspondant."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'veille-legifrance');
UPDATE sources SET params_schema = '[{"key":"motcle","label":"Mot-clé juridique","type":"string","placeholder":"éolien, gendarmerie, apprentissage…","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Un mot-clé recherché dans les nouveaux textes du Journal Officiel (lois, décrets, arrêtés). Alerte à la publication d''un texte correspondant."}]'::jsonb WHERE id = 'veille-legifrance';
INSERT INTO source_states (source_id) SELECT 'veille-legifrance'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'veille-legifrance');

-- ================================================================
-- Veille artiste Deezer (API publique SANS clé). display_order 433. Remplace le concept
-- Spotify abandonné. Résolution nom→artistId (cache permanent), nouveauté par id d'album,
-- anti-rétroactif au 1er cycle, mutualisé par artiste. Message factuel, lien Deezer.
-- ================================================================
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'veille-artiste-deezer', 'Nouvel album', 'La sortie du prochain album de votre artiste',
  'Votre artiste sort un nouvel album ? Vous le savez dès sa mise en ligne, lien direct inclus.',
  'internal', 'official', false, ARRAY['musique', 'culture'], 433, '[{"key":"artiste","label":"Artiste","type":"string","placeholder":"Daft Punk, Aya Nakamura…","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Le nom d''un artiste ou groupe. Alerte à la sortie d''un nouvel album sur Deezer."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'veille-artiste-deezer');
UPDATE sources SET params_schema = '[{"key":"artiste","label":"Artiste","type":"string","placeholder":"Daft Punk, Aya Nakamura…","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Le nom d''un artiste ou groupe. Alerte à la sortie d''un nouvel album sur Deezer."}]'::jsonb WHERE id = 'veille-artiste-deezer';
INSERT INTO source_states (source_id) SELECT 'veille-artiste-deezer'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'veille-artiste-deezer');

-- ================================================================
-- Hausse tarif streaming — PHASE 1 : Netflix + Deezer. display_order 434. Hash-diff de la page
-- tarifs (lib/hash-diff-html), référence au 1er cycle sans alerte, message factuel (jamais de
-- montant). enum extensible sans migration lourde (phase 2 headless : Spotify/Disney+/… en TODO).
-- ================================================================
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'hausse-tarif-streaming', 'Tarif streaming', 'Un changement sur la page des tarifs',
  'Netflix ou Deezer retouche sa page de tarifs ? Souvent le signe d''une hausse. Vous le saurez avant tous.',
  'internal', 'official', false, ARRAY['streaming', 'consommation'], 434, '[{"key":"service","label":"Service de streaming","type":"enum","values":[{"value":"netflix","label":"Netflix"},{"value":"deezer","label":"Deezer"}],"multiple":true,"required":true,"default":null,"hint":"Vous êtes prévenu quand la page des tarifs de ce service change (indice possible d''évolution de prix). Aucun montant n''est interprété ni annoncé."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'hausse-tarif-streaming');
UPDATE sources SET params_schema = '[{"key":"service","label":"Service de streaming","type":"enum","values":[{"value":"netflix","label":"Netflix"},{"value":"deezer","label":"Deezer"}],"multiple":true,"required":true,"default":null,"hint":"Vous êtes prévenu quand la page des tarifs de ce service change (indice possible d''évolution de prix). Aucun montant n''est interprété ni annoncé."}]'::jsonb WHERE id = 'hausse-tarif-streaming';
INSERT INTO source_states (source_id) SELECT 'hausse-tarif-streaming'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'hausse-tarif-streaming');

-- ================================================================
-- VAGUE FINALE « SCIENCE » — 5 sources « état imprévisible » (display_order 435-439).
-- Nouveaux slugs : recherche, physique, risques, integrite-scientifique (voir categories.js).
-- ================================================================

-- 435. veille-arxiv (PARAMÉTRÉE, mot-clé) — nouveau preprint arXiv. Throttle ~1 req/3s, dédoublonnage par id arXiv, anti-rétroactif. Message : preprints (pas relus par les pairs).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'veille-arxiv', 'Veille arXiv', 'Un nouveau preprint pour votre mot-clé',
  'Un nouveau preprint scientifique mentionne votre mot-clé ? Votre veille recherche, en pilote automatique.',
  'internal', 'official', false, ARRAY['science', 'recherche', 'veille'], 435, '[{"key":"motcle","label":"Mot-clé de recherche","type":"string","placeholder":"exoplanet, graphene, transformer…","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Un mot-clé (de préférence en anglais). Alerte à la publication d''un nouveau preprint arXiv correspondant. Ce sont des preprints, pas encore relus par les pairs."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'veille-arxiv');
UPDATE sources SET params_schema = '[{"key":"motcle","label":"Mot-clé de recherche","type":"string","placeholder":"exoplanet, graphene, transformer…","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Un mot-clé (de préférence en anglais). Alerte à la publication d''un nouveau preprint arXiv correspondant. Ce sont des preprints, pas encore relus par les pairs."}]'::jsonb WHERE id = 'veille-arxiv';
INSERT INTO source_states (source_id) SELECT 'veille-arxiv'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'veille-arxiv');

-- 436. eruption-volcanique (BROADCAST) — GVP Weekly Volcanic Activity Report, entrées « New Eruptive Activity » uniquement, cadence hebdomadaire.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'eruption-volcanique', 'Éruption volcanique', 'Une nouvelle éruption signalée',
  'Un volcan se réveille quelque part sur Terre ? Le rapport hebdomadaire mondial vous le signale.',
  'internal', 'official', false, ARRAY['science', 'nature', 'risques'], 436
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'eruption-volcanique');
INSERT INTO source_states (source_id) SELECT 'eruption-volcanique'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'eruption-volcanique');

-- 437. exoplanete-habitable (BROADCAST) — NASA Exoplanet Archive TAP, sous-ensemble petit+zone tempérée, dédoublonnage par pl_name.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'exoplanete-habitable', 'Exoplanète habitable', 'Une nouvelle planète potentiellement habitable',
  'Une nouvelle planète potentiellement habitable confirmée ? Vous faites partie des premiers informés.',
  'internal', 'official', false, ARRAY['science', 'espace', 'astronomie'], 437
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'exoplanete-habitable');
INSERT INTO source_states (source_id) SELECT 'exoplanete-habitable'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'exoplanete-habitable');

-- 438. retraction-article (BROADCAST) — Retraction Watch via Crossref, dédoublonnage par DOI.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'retraction-article', 'Rétractation scientifique', 'Une nouvelle rétractation d''article',
  'Un article scientifique officiellement retiré ? La science se corrige, et vous le voyez en direct.',
  'internal', 'official', false, ARRAY['science', 'integrite-scientifique', 'veille'], 438
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'retraction-article');
INSERT INTO source_states (source_id) SELECT 'retraction-article'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'retraction-article');

-- 439. ondes-gravitationnelles (BROADCAST) — GraceDB, Production + SIGNIF_LOCKED + ADVOK, correction si ADVNO, dédoublonnage par superevent_id.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'ondes-gravitationnelles', 'Onde gravitationnelle', 'Une détection LIGO/Virgo/KAGRA',
  'Deux trous noirs fusionnent à des milliards d''années-lumière ? L''Univers tremble, et vous êtes au courant.',
  'internal', 'official', false, ARRAY['science', 'espace', 'physique'], 439
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'ondes-gravitationnelles');
INSERT INTO source_states (source_id) SELECT 'ondes-gravitationnelles'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'ondes-gravitationnelles');

-- Extension code-only grands-anniversaires (vague science) : couverture étendue à 2028.
UPDATE sources SET description = 'La veille et le jour J des grands anniversaires à chiffre rond (30, 50, 100, 150 ans) de la culture et de la science, curés à la main pour 2026-2028, plus les anniversaires de 1re parution en France de mangas cultes (Naruto, Dragon Ball, One Piece…). Mémoire culturelle et scientifique, jamais un calendrier des tragédies.'
WHERE id = 'grands-anniversaires';

-- ================================================================
-- PanneauPocket (display_order 440). Source PARAMÉTRÉE. L'abonné saisit l'URL de la page
-- de sa collectivité sur app.panneaupocket.com (mairie, syndicat des eaux, ASA…). Alerte
-- à chaque nouveau panneau ou mise à jour. Anti-SSRF via safe-fetch (URL utilisateur,
-- hôte validé). Anti-rétroactif : 1er cycle = amorçage sans alerte. Détail : panneaupocket.js.
-- ================================================================
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'panneaupocket', 'PanneauPocket', 'Les panneaux de votre collectivité',
  'Coupures d''eau, travaux, infos de votre mairie : les panneaux de votre collectivité, directement chez vous.',
  'internal', 'official', false, ARRAY['vie-locale', 'local', 'mairie'], 440, '[{"key":"url","label":"URL de la page PanneauPocket","type":"string","placeholder":"https://app.panneaupocket.com/ville/398423648-asa-du-canal-de-gap-05000","pattern":"^https://app\\.panneaupocket\\.com/ville/[^\\s]{1,200}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Copiez l''adresse de la page de votre collectivité sur app.panneaupocket.com (mairie, syndicat des eaux, ASA…). Vous êtes prévenu à chaque nouveau panneau ou mise à jour (coupure d''eau, arrosage, travaux…)."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'panneaupocket');
UPDATE sources SET params_schema = '[{"key":"url","label":"URL de la page PanneauPocket","type":"string","placeholder":"https://app.panneaupocket.com/ville/398423648-asa-du-canal-de-gap-05000","pattern":"^https://app\\.panneaupocket\\.com/ville/[^\\s]{1,200}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Copiez l''adresse de la page de votre collectivité sur app.panneaupocket.com (mairie, syndicat des eaux, ASA…). Vous êtes prévenu à chaque nouveau panneau ou mise à jour (coupure d''eau, arrosage, travaux…)."}]'::jsonb WHERE id = 'panneaupocket';
-- Texte de présentation (l'INSERT ci-dessus est ignoré si la source existe déjà → cet UPDATE force la mise à jour sur base peuplée).
UPDATE sources SET
  name = 'PanneauPocket',
  subtitle = 'Les panneaux de votre collectivité',
  description = 'Recevez les alertes et infos de votre mairie, syndicat des eaux ou collectivité publiées sur PanneauPocket (coupures d''eau, arrosage, travaux…). Copiez l''adresse de la page de votre collectivité sur app.panneaupocket.com à suivre.'
WHERE id = 'panneaupocket';
INSERT INTO source_states (source_id) SELECT 'panneaupocket'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'panneaupocket');

-- ================================================================
-- Arrosage — Canal de Gap (display_order 441). Carte THÉMATIQUE broadcast par-dessus le moteur
-- PanneauPocket (URL ASA du Canal de Gap en dur). Filtre eau d'irrigation (arrosage, tours
-- d'eau, restrictions, coupures…) : les autres panneaux de l'ASA sont ignorés. Anti-rétroactif :
-- 1er cycle = amorçage sans alerte. Détail : arrosage-canal-gap.js.
-- ================================================================
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'arrosage-canal-gap', 'Arrosage — Canal de Gap', 'Tours d''eau et coupures d''irrigation',
  'Tours d''eau, autorisations et coupures du Canal de Gap : l''info irrigation, filtrée et sans détour.',
  'internal', 'official', false, ARRAY['vie-locale', 'eau'], 441
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'arrosage-canal-gap');
-- Correction description (retrait de la phrase anti-rétroactivité) sur base déjà peuplée : UPDATE idempotent.
UPDATE sources SET description =
  'Autorisations d''arrosage, tours d''eau et coupures du réseau d''irrigation de l''ASA du Canal de Gap (Gap et communes desservies). Alertes issues des panneaux publiés par l''ASA sur PanneauPocket, filtrées sur l''eau d''irrigation.'
WHERE id = 'arrosage-canal-gap';
INSERT INTO source_states (source_id) SELECT 'arrosage-canal-gap'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'arrosage-canal-gap');

-- ================================================================
-- Ma collectivité (display_order 442). Source PARAMÉTRÉE, champ dynamic-enum : l'utilisateur
-- saisit sa VILLE, choisit son entité (mairie, ASA, syndicat…) via lookup(q) → /public-api/city.
-- La valeur stockée est l'URL /ville/ (même format que panneaupocket) → même moteur de veille.
-- Anti-rétroactif : 1er cycle = amorçage sans alerte. Détail : ma-collectivite.js.
-- ================================================================
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, params_schema)
SELECT 'ma-collectivite', 'Ma collectivité', 'Les infos de votre mairie ou collectivité',
  'Les alertes et infos de votre mairie ou collectivité (coupures, travaux, événements...) — choisissez votre ville.',
  'internal', 'official', false, ARRAY['vie-locale'], 442, '[{"key":"url","label":"Votre ville","type":"dynamic-enum","lookup":"ma-collectivite","placeholder":"Ex. Gap, Annecy, Bayonne…","pattern":"^https://app\\.panneaupocket\\.com/ville/[^\\s]{1,200}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Saisissez votre commune, puis choisissez votre collectivité (mairie, syndicat des eaux, ASA…) dans la liste."}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'ma-collectivite');
UPDATE sources SET params_schema = '[{"key":"url","label":"Votre ville","type":"dynamic-enum","lookup":"ma-collectivite","placeholder":"Ex. Gap, Annecy, Bayonne…","pattern":"^https://app\\.panneaupocket\\.com/ville/[^\\s]{1,200}$","lowercase":false,"multiple":true,"required":true,"default":null,"hint":"Saisissez votre commune, puis choisissez votre collectivité (mairie, syndicat des eaux, ASA…) dans la liste."}]'::jsonb WHERE id = 'ma-collectivite';
INSERT INTO source_states (source_id) SELECT 'ma-collectivite'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'ma-collectivite');

-- ================================================================
-- VAGUE L « PanneauPocket curé » (display_order 443-460). 18 cartes THÉMATIQUES broadcast v1,
-- chacune dédiée à UNE entité PanneauPocket (URL en dur), sur le modèle de arrosage-canal-gap (441).
-- Filtre « eau » pour les cartes eau à page multi-thème ; mono-thème (filtre null) sinon.
-- Anti-rétroactif : 1er cycle = amorçage sans alerte (moteur commun panneaupocket-veille.js).
-- ⚠️ Cartes dependantes de la vitalite d un tiers : controle Robot 1 (sans panneau > 90 j -> rapport).
-- Descriptions grand public (aucune mention anti-rétroactivité/hash/polling). Détail : <slug>.js.
-- ================================================================
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'eau-regie-metz', 'Coupures d’eau — Régie de Metz', 'Coupures, travaux et sécheresse',
  'Coupures, travaux, sécheresse : les alertes eau de l''Eurométropole de Metz, directement chez vous.',
  'internal', 'official', false, ARRAY['vie-locale', 'eau'], 443, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'eau-regie-metz');
INSERT INTO source_states (source_id) SELECT 'eau-regie-metz'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'eau-regie-metz');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'eau-provence-verte', 'Coupures d’eau — Provence Verte', 'Travaux et coupures du réseau',
  'Coupures d''eau, travaux et arnaques au faux plombier : les alertes de la Régie de la Provence Verte.',
  'internal', 'official', false, ARRAY['vie-locale', 'eau'], 444, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'eau-provence-verte');
INSERT INTO source_states (source_id) SELECT 'eau-provence-verte'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'eau-provence-verte');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'eau-isle-dronne', 'Coupures d’eau — SIAEPA Isle & Dronne', 'Coupures et fuites du réseau',
  'Coupures et fuites sur le réseau d''eau des Vallées de l''Isle et de la Dronne : prévenu directement.',
  'internal', 'official', false, ARRAY['vie-locale', 'eau'], 445, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'eau-isle-dronne');
INSERT INTO source_states (source_id) SELECT 'eau-isle-dronne'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'eau-isle-dronne');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'eau-charles-chaigneau', 'Restrictions d’eau — SIAEP Charles Chaigneau', 'Limitations d’usage de l’eau',
  'Restrictions et limitations d''eau du SIAEP Charles Chaigneau (Tannay) : l''info filtrée, sans détour.',
  'internal', 'official', false, ARRAY['vie-locale', 'eau'], 446, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'eau-charles-chaigneau');
INSERT INTO source_states (source_id) SELECT 'eau-charles-chaigneau'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'eau-charles-chaigneau');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'eau-puisaye-forterre', 'Coupures d’eau — Puisaye-Forterre', 'Coupures et restrictions d’usage',
  'Coupures et restrictions d''eau de la Régie Puisaye-Forterre : l''essentiel, directement chez vous.',
  'internal', 'official', false, ARRAY['vie-locale', 'eau'], 447, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'eau-puisaye-forterre');
INSERT INTO source_states (source_id) SELECT 'eau-puisaye-forterre'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'eau-puisaye-forterre');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'eau-coteaux-lizon', 'Restrictions d’eau — Coteaux du Lizon', 'Restrictions et coupures d’eau',
  'Restrictions et coupures d''eau aux Coteaux du Lizon : l''info filtrée, directement chez vous.',
  'internal', 'official', false, ARRAY['vie-locale', 'eau'], 448, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'eau-coteaux-lizon');
INSERT INTO source_states (source_id) SELECT 'eau-coteaux-lizon'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'eau-coteaux-lizon');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'dechets-saulieu', 'Déchets — Pays de Saulieu', 'Déchèteries, collectes, incivilités',
  'Déchèteries, collectes, dépôts sauvages : les infos du service déchets de Saulieu, directement chez vous.',
  'internal', 'official', false, ARRAY['vie-locale'], 449, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'dechets-saulieu');
INSERT INTO source_states (source_id) SELECT 'dechets-saulieu'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'dechets-saulieu');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'dechets-la-saucelle', 'Déchets — La Saucelle', 'Collecte et déchèteries',
  'Collectes, déchèteries, démarchages signalés : les infos du secteur de La Saucelle, chez vous.',
  'internal', 'official', false, ARRAY['vie-locale'], 450, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'dechets-la-saucelle');
INSERT INTO source_states (source_id) SELECT 'dechets-la-saucelle'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'dechets-la-saucelle');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'dechets-campagne-caux', 'Déchets — Campagne de Caux', 'Déchèterie et collectes',
  'Déchèterie fermée, collecte décalée ? Les infos de la CC Campagne de Caux, directement chez vous.',
  'internal', 'official', false, ARRAY['vie-locale'], 451, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'dechets-campagne-caux');
INSERT INTO source_states (source_id) SELECT 'dechets-campagne-caux'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'dechets-campagne-caux');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'securite-gendarmerie-albi', 'Alertes gendarmerie — Albi', 'Arnaques et prévention',
  'Arnaques, démarchages frauduleux, tranquillité vacances : les alertes de la gendarmerie d''Albi.',
  'internal', 'official', false, ARRAY['vie-locale', 'securite'], 452, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'securite-gendarmerie-albi');
INSERT INTO source_states (source_id) SELECT 'securite-gendarmerie-albi'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'securite-gendarmerie-albi');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'securite-gendarmerie-bayeux', 'Alertes gendarmerie — Bayeux', 'Cambriolages et démarchages',
  'Cambriolages, démarchages frauduleux : les alertes de la gendarmerie de Bayeux, directement chez vous.',
  'internal', 'official', false, ARRAY['vie-locale', 'securite'], 453, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'securite-gendarmerie-bayeux');
INSERT INTO source_states (source_id) SELECT 'securite-gendarmerie-bayeux'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'securite-gendarmerie-bayeux');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'securite-gendarmerie-essarts', 'Alertes gendarmerie — Essarts-en-Bocage', 'Prévention et sécurité',
  'Prévention et sécurité : les alertes de la gendarmerie d''Essarts-en-Bocage, directement chez vous.',
  'internal', 'official', false, ARRAY['vie-locale', 'securite'], 454, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'securite-gendarmerie-essarts');
INSERT INTO source_states (source_id) SELECT 'securite-gendarmerie-essarts'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'securite-gendarmerie-essarts');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'local-chablis', 'Infos locales — Chablis', 'La comcom Chablis Villages et Terroirs',
  'France Services, collectes, événements : les infos de la CC Chablis Villages et Terroirs, chez vous.',
  'internal', 'official', false, ARRAY['vie-locale'], 455, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'local-chablis');
INSERT INTO source_states (source_id) SELECT 'local-chablis'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'local-chablis');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'local-agly-fenouilledes', 'Infos locales — Agly-Fenouillèdes', 'La comcom Agly-Fenouillèdes',
  'Déchets, eau, animations : les infos de la CC Agly-Fenouillèdes, directement chez vous.',
  'internal', 'official', false, ARRAY['vie-locale'], 456, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'local-agly-fenouilledes');
INSERT INTO source_states (source_id) SELECT 'local-agly-fenouilledes'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'local-agly-fenouilledes');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'local-buech-devoluy', 'Infos locales — Buëch-Dévoluy', 'La comcom Buëch-Dévoluy',
  'Navettes stations, déchets, événements : les infos de la CC Buëch-Dévoluy, directement chez vous.',
  'internal', 'official', false, ARRAY['vie-locale'], 457, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'local-buech-devoluy');
INSERT INTO source_states (source_id) SELECT 'local-buech-devoluy'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'local-buech-devoluy');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'local-chabris-bazelle', 'Infos locales — Pays de Bazelle', 'La comcom Chabris — Pays de Bazelle',
  'Piscine, déchèterie, tourisme : les infos de la CC Chabris — Pays de Bazelle, directement chez vous.',
  'internal', 'official', false, ARRAY['vie-locale'], 458, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'local-chabris-bazelle');
INSERT INTO source_states (source_id) SELECT 'local-chabris-bazelle'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'local-chabris-bazelle');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'agenda-luc-en-diois', 'Agenda — Luc-en-Diois', 'Événements et manifestations',
  'Marchés, expositions, concerts et animations de Luc-en-Diois. Panneaux publiés par la commune sur PanneauPocket.',
  'internal', 'official', false, ARRAY['vie-locale', 'evenements-locaux'], 459, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'agenda-luc-en-diois');
INSERT INTO source_states (source_id) SELECT 'agenda-luc-en-diois'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'agenda-luc-en-diois');
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order, enabled)
SELECT 'cantine-a2m2v', 'Menus cantine — SIVOM A2M2V', 'Menus et infos scolaires',
  'Menus de la cantine et infos scolaires du SIVOM A2M2V. Panneaux publiés sur PanneauPocket.',
  'internal', 'official', false, ARRAY['vie-locale'], 460, true
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'cantine-a2m2v');
INSERT INTO source_states (source_id) SELECT 'cantine-a2m2v'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'cantine-a2m2v');

-- ================================================================
-- DECKS DANS LA GRILLE : categories auto-derivees + suivi d'adoption +
-- decks perso publics par defaut. Idempotent (rejouable par migrate.js).
-- ================================================================

-- 1) Categories auto : top-3 des categories les plus frequentes parmi les cartes
--    ENABLED du deck. LECTURE SEULE cote UI (jamais choisies par l'utilisateur, pour
--    empecher le gonflage de visibilite) ; recalculees par le serveur a chaque
--    ajout/retrait de carte, et re-backfillees ci-dessous a chaque migrate.
ALTER TABLE collections ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}';

-- 2) Suivi d'adoption (popularite des decks). Une ligne = un compte a adopte un deck.
--    Idempotent (PK composite) ; CASCADE avec le compte ET le deck. Popularite d'un
--    deck = COUNT sur cette table (aucun compteur denormalise a maintenir). Repart de
--    zero : aucune adoption passee n'a jamais ete enregistree avant ce chantier.
CREATE TABLE IF NOT EXISTS collection_adoptions (
  subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE CASCADE,
  collection_id VARCHAR(64) REFERENCES collections(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (subscriber_id, collection_id)
);
CREATE INDEX IF NOT EXISTS idx_collection_adoptions_coll ON collection_adoptions (collection_id);

-- 3) Decks perso PUBLICS par defaut : les decks jusqu'ici partages par lien (unlisted)
--    rejoignent le kiosque public (ils avaient deja choisi de partager). Migration
--    idempotente. Les decks 'private' restent prives ; 'official' inchange. Les
--    nouveaux decks perso sont crees en 'public' cote serveur (routes/decks.js).
UPDATE collections SET visibility = 'public'
 WHERE visibility = 'unlisted' AND owner_subscriber_id IS NOT NULL;

-- 4) Backfill idempotent des categories auto pour TOUS les decks (officiels + perso).
--    top-3 par frequence, departage alphabetique stable ; deck sans carte -> '{}'.
WITH cat_counts AS (
  SELECT ci.collection_id AS cid, cat, COUNT(*) AS n
    FROM collection_items ci
    JOIN sources s ON s.id = ci.source_id AND s.enabled = true
    CROSS JOIN LATERAL unnest(s.categories) AS cat
   GROUP BY ci.collection_id, cat
), ranked AS (
  SELECT cid, cat,
         ROW_NUMBER() OVER (PARTITION BY cid ORDER BY n DESC, cat ASC) AS rk
    FROM cat_counts
), top3 AS (
  SELECT cid, array_agg(cat ORDER BY rk) AS cats
    FROM ranked WHERE rk <= 3
   GROUP BY cid
)
UPDATE collections c
   SET categories = COALESCE(t.cats, '{}')
  FROM (SELECT id FROM collections) base
  LEFT JOIN top3 t ON t.cid = base.id
 WHERE c.id = base.id;

-- ============================================================================
-- Points cosmetiques (phase 1) : ledger append-only + solde denormalise.
-- Statutaire/ludique uniquement, JAMAIS convertible ni achetable avec de l'argent
-- reel. Le solde ne servira qu'a debloquer des skins visuels (phase ulterieure).
-- 4 evenements cables cote serveur (routes/points.js award()) :
--   ALERT_SUBSCRIBED       (5)  ref_id = source_id            — une fois/source a vie
--   DECK_ADOPTED           (10) ref_id = deck_id              — une fois/(user, deck)
--   DECK_CREATED           (25) ref_id = deck_id              — une fois/deck cree (hors fork)
--   DECK_ADOPTED_BY_OTHERS (50) ref_id = 'deck_id:adopter_id' — une fois/(deck, adoptant)
-- Ecriture defensive : l'echec d'un award ne bloque jamais l'action metier.
-- Pas de classement/boutique/parrainage ici (fils separes) : schema volontairement
-- minimal, juste assez ouvert (ref_id nullable) pour ces extensions.
-- ============================================================================

-- Solde denormalise, incremente dans la meme requete que l'INSERT ledger (cf. award()).
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS points_balance INTEGER NOT NULL DEFAULT 0;

-- Journal append-only : jamais d'UPDATE en place, jamais de DELETE (sauf moderation
-- exceptionnelle). Chaque ligne = un gain de points date et trace vers sa cible.
CREATE TABLE IF NOT EXISTS points_ledger (
  id BIGSERIAL PRIMARY KEY,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  ref_id TEXT,                       -- cible : source_id | deck_id | 'deck_id:adopter_id' ; NULL tolere
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Anti double-comptage "une fois par cible". Un event deja compte -> ON CONFLICT
-- DO NOTHING dans award(). ref_id NULL reste DISTINCT (semantique UNIQUE de Postgres :
-- plusieurs NULL autorises) -> garde la porte ouverte a un futur event global sans
-- cible. Aucun de nos 4 events actuels n'a de ref_id NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_points_ledger_unique
  ON points_ledger (subscriber_id, event_type, ref_id);

-- Lecture du journal d'un compte (usage futur : detail du ledger, hors phase 1).
CREATE INDEX IF NOT EXISTS idx_points_ledger_subscriber
  ON points_ledger (subscriber_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Phase 2 : rang prive + badge Top 20 (PAS de classement public, PAS de liste
-- d'utilisateurs). Opt-out EXPLICITE : true = exclu du calcul de rang, dans les
-- DEUX sens (ni son rang calcule, ni compte dans le rang des autres). Le rang se
-- calcule a la volee (RANK() filtre optout=false ET display_name non nul, cf.
-- server/points.js), aucune colonne de rang denormalisee a maintenir.
-- ---------------------------------------------------------------------------
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS leaderboard_optout BOOLEAN NOT NULL DEFAULT false;

-- Classement par solde parmi les participants (optout=false, pseudo non nul).
-- Sert getTop20Ids() (cache 2 min) et le rang perso. Partiel : n'indexe que les
-- participants exposables, l'invariant du calcul de rang.
CREATE INDEX IF NOT EXISTS idx_subscribers_leaderboard
  ON subscribers (points_balance DESC)
  WHERE leaderboard_optout = false AND display_name IS NOT NULL;

-- ===========================================================================
-- Phase 3 : boutique de skins cosmetiques (SQUELETTE technique). AUCUN visuel
-- definitif : asset_ref = simple token CSS placeholder (ex. 'skin-aurore'),
-- remplacable par les vrais assets SANS migration. Skins achetables en POINTS
-- uniquement (jamais d'argent reel), statutaires/ludiques.
--   type 'dashboard' -> classe posee sur la grille du dashboard du proprietaire
--                       (PRIVE : visible de lui seul sur ses cartes source).
--   type 'deck'      -> override par deck, PUBLIC (visible de tous sur la tuile
--                       kiosque + le detail du deck partage).
-- ===========================================================================

-- Catalogue. id = slug lisible (coherent avec sources/collections en VARCHAR).
CREATE TABLE IF NOT EXISTS skins (
  id VARCHAR(64) PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('dashboard', 'deck')),
  name VARCHAR(120) NOT NULL,
  cost INTEGER NOT NULL CHECK (cost >= 0),   -- prix en points
  asset_ref TEXT NOT NULL,                    -- placeholder : token/classe CSS (ex. 'skin-aurore')
  active BOOLEAN NOT NULL DEFAULT true,       -- false = retire du catalogue (n'est plus achetable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Possession. Un compte possede un skin une fois (PK composite). L'achat (INSERT
-- ici + decrement du solde) se fait dans UNE transaction cote serveur (routes/skins.js).
CREATE TABLE IF NOT EXISTS user_skins (
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  skin_id VARCHAR(64) NOT NULL REFERENCES skins(id) ON DELETE CASCADE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (subscriber_id, skin_id)
);
CREATE INDEX IF NOT EXISTS idx_user_skins_subscriber ON user_skins (subscriber_id);

-- Equipement. NULL = aucun skin (defaut / heritage). ON DELETE SET NULL : retirer
-- un skin du catalogue ne casse jamais une ligne qui le reference encore.
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS equipped_dashboard_skin_id VARCHAR(64)
  REFERENCES skins(id) ON DELETE SET NULL;
-- Override par deck : NULL = herite du skin dashboard du proprietaire.
ALTER TABLE collections ADD COLUMN IF NOT EXISTS equipped_skin_id VARCHAR(64)
  REFERENCES skins(id) ON DELETE SET NULL;

-- Seed des 4 skins placeholder de depart (couts varies). Idempotent : ON CONFLICT
-- rafraichit les metadonnees mais preserve active/created_at. Les vrais visuels
-- remplaceront le STYLE de asset_ref cote CSS, sans retoucher ces lignes.
INSERT INTO skins (id, type, name, cost, asset_ref) VALUES
  ('aurore',       'dashboard', 'Aurore pastel', 30,  'skin-aurore'),
  ('nuit-etoilee', 'dashboard', 'Nuit etoilee',  60,  'skin-nuit-etoilee'),
  ('menthe',       'deck',      'Givre menthe',  30,  'skin-menthe'),
  ('or-royal',     'deck',      'Or royal',      100, 'skin-or-royal')
ON CONFLICT (id) DO UPDATE SET
  type = EXCLUDED.type, name = EXCLUDED.name, cost = EXCLUDED.cost, asset_ref = EXCLUDED.asset_ref;

-- ================================================================
-- DESCRIPTIONS : courte (<=120, affichee sur la carte) + longue (<=300, popup « i » +
-- page /source/:id). Idempotent. La colonne `description` DEVIENT la description COURTE
-- (bornee <=120) ; `description_long` (nouvelle, nullable) porte le texte detaille.
-- ORDRE IMPERATIF : (1) copier le texte integral actuel dans description_long AVANT de
-- tronquer ; (2) tronquer description a 117 + « … » (coupe sur un espace, jamais en plein
-- mot) ; (3) poser les CHECK (DO block : Postgres n'a pas d'ADD CONSTRAINT IF NOT EXISTS).
-- Le seed des sources est insert-only (WHERE NOT EXISTS) -> re-migrer ne reinjecte pas de
-- texte long : troncature + CHECK tiennent dans le temps.
-- CONVENTION (des le CHECK pose) : toute NOUVELLE source seedee doit avoir description
-- <=120 (sinon son INSERT viole le CHECK avant la troncature de fin). Le texte integral
-- d'origine reste dans les INSERT ci-dessus (git) : reference pour la reecriture.
-- 9 sources depassaient 300 -> leur description_long est tronquee a 297+… en securite,
-- A REECRIRE (Hugo) : risque-secheresse, catnat-commune, rappel-conso, veille-page,
-- eau-potable-commune, grands-anniversaires, crypto-seuil, hausse-tarif-operateur,
-- arts-visuels-evenements.
-- ================================================================
ALTER TABLE sources ADD COLUMN IF NOT EXISTS description_long TEXT;

-- (1) Copie du texte integral vers description_long (une seule fois : guard IS NULL), pour
--     les sources dont la description depasse 120. Bornee a 300 (297+… si >300).
UPDATE sources
   SET description_long = CASE
         WHEN char_length(description) > 300
           THEN regexp_replace(left(description, 297), '\s\S*$', '') || '…'
         ELSE description
       END
 WHERE description_long IS NULL AND char_length(description) > 120;

-- (2) Troncature de securite de la description courte a 117 + « … » (coupe sur un espace).
UPDATE sources
   SET description = regexp_replace(left(description, 117), '\s\S*$', '') || '…'
 WHERE char_length(description) > 120;

-- (3) CHECK idempotents (pg_constraint : pas d'ADD CONSTRAINT IF NOT EXISTS natif).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sources_description_short_len') THEN
    ALTER TABLE sources ADD CONSTRAINT sources_description_short_len CHECK (char_length(description) <= 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sources_description_long_len') THEN
    ALTER TABLE sources ADD CONSTRAINT sources_description_long_len
      CHECK (description_long IS NULL OR char_length(description_long) <= 300);
  END IF;
END $$;
