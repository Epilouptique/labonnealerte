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

-- Sources « panne de service » (standard Statuspage). requires_confirmation =
-- TRUE : anti-flapping — une page de statut peut passer brièvement en « major »
-- puis revenir ; la confirmation sur 2 cycles évite de notifier un hoquet.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-github', 'Panne GitHub', 'Statut officiel de GitHub',
  'Alerte quand GitHub déclare une panne majeure sur sa page de statut officielle. Fini le « c''est moi ou c''est en panne ? ».',
  'internal', 'official', true, ARRAY['pannes-services', 'github'], 40
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-github');
INSERT INTO source_states (source_id) SELECT 'statut-github'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-github');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-cloudflare', 'Panne Cloudflare', 'Statut officiel de Cloudflare',
  'Alerte quand Cloudflare déclare une panne majeure sur sa page de statut officielle. Fini le « c''est moi ou c''est en panne ? ».',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 41
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-cloudflare');
INSERT INTO source_states (source_id) SELECT 'statut-cloudflare'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-cloudflare');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-openai', 'Panne OpenAI', 'Statut officiel de OpenAI',
  'Alerte quand OpenAI déclare une panne majeure sur sa page de statut officielle. Fini le « c''est moi ou c''est en panne ? ».',
  'internal', 'official', true, ARRAY['pannes-services', 'tech'], 42
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-openai');
INSERT INTO source_states (source_id) SELECT 'statut-openai'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-openai');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-discord', 'Panne Discord', 'Statut officiel de Discord',
  'Alerte quand Discord déclare une panne majeure sur sa page de statut officielle. Fini le « c''est moi ou c''est en panne ? ».',
  'internal', 'official', true, ARRAY['pannes-services', 'tech'], 43
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-discord');
INSERT INTO source_states (source_id) SELECT 'statut-discord'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-discord');

-- Sources « calculées » (zéro API) : l'état se déduit de dates.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'changement-heure', 'Changement d''heure', 'Été et hiver, ne l''oubliez plus',
  'Un rappel quelques jours avant le passage à l''heure d''été ou d''hiver, pour ne plus jamais être pris au dépourvu par l''horloge.',
  'internal', 'official', false, ARRAY['autre', 'vie-locale'], 50
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
  'internal', 'official', false, ARRAY['astronomie', 'autre'], 52
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'perseides');
INSERT INTO source_states (source_id) SELECT 'perseides'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'perseides');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'beaujolais-nouveau', 'Beaujolais nouveau', 'Le 3e jeudi de novembre',
  'Chaque 3e jeudi de novembre, le Beaujolais nouveau est arrivé. On vous prévient — pour que vous soyez prêt, et que vous ayez une excuse toute trouvée.',
  'internal', 'official', false, ARRAY['vins', 'alimentation'], 53
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'beaujolais-nouveau');
INSERT INTO source_states (source_id) SELECT 'beaujolais-nouveau'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'beaujolais-nouveau');

-- Source Steam (heuristique sur les soldes saisonnières) : requires_confirmation true.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'soldes-steam', 'Soldes Steam', 'Les grandes soldes saisonnières',
  'Alerte au lancement des grandes soldes saisonnières Steam (été, hiver, automne, printemps). Des milliers de jeux PC en promo.',
  'internal', 'official', true, ARRAY['jeux-video', 'soldes'], 54
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'soldes-steam');
INSERT INTO source_states (source_id) SELECT 'soldes-steam'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'soldes-steam');

-- Source aurores boréales (NOAA SWPC, données scientifiques).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'aurores-france', 'Aurores en France', 'Tempêtes géomagnétiques visibles',
  'Alerte quand une tempête géomagnétique (indice Kp ≥ 7) rend possible l''observation d''aurores boréales depuis la France. Données officielles NOAA.',
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
  'Alerte quand un séisme de magnitude 4 ou plus est détecté en France métropolitaine au cours des dernières heures. Données du centre sismologique euro-méditerranéen (EMSC).',
  'internal', 'official', false, ARRAY['seismes', 'meteo-risques'], 27
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'seismes-france');
INSERT INTO source_states (source_id) SELECT 'seismes-france'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'seismes-france');

-- Grandes perturbations SNCF (grève / mouvement social). Heuristique par mots-clés
-- → requires_confirmation = TRUE (anti faux positif).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'sncf-perturbations', 'Perturbations SNCF', 'Grèves et mouvements sociaux',
  'Alerte quand une grève ou un mouvement social provoque de grandes perturbations sur le réseau ferroviaire national. Données Navitia / SNCF.',
  'internal', 'official', true, ARRAY['greves', 'transports'], 35
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'sncf-perturbations');
INSERT INTO source_states (source_id) SELECT 'sncf-perturbations'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'sncf-perturbations');

-- Vacances scolaires — compte à rebours du départ (7 jours avant), par zone.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vacances-zone-a', 'Vacances — Zone A', 'Le compte à rebours des vacances',
  'Le compte à rebours des vacances scolaires de la zone A (Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Lyon, Poitiers…). Prévenu une semaine avant le départ. Calendrier officiel Éducation nationale.',
  'internal', 'official', false, ARRAY['vacances-scolaires', 'vie-locale'], 60
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vacances-zone-a');
INSERT INTO source_states (source_id) SELECT 'vacances-zone-a'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vacances-zone-a');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vacances-zone-b', 'Vacances — Zone B', 'Le compte à rebours des vacances',
  'Le compte à rebours des vacances scolaires de la zone B (Aix-Marseille, Lille, Nantes, Nice, Rennes, Rouen, Strasbourg…). Prévenu une semaine avant le départ. Calendrier officiel Éducation nationale.',
  'internal', 'official', false, ARRAY['vacances-scolaires', 'vie-locale'], 61
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vacances-zone-b');
INSERT INTO source_states (source_id) SELECT 'vacances-zone-b'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vacances-zone-b');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vacances-zone-c', 'Vacances — Zone C', 'Le compte à rebours des vacances',
  'Le compte à rebours des vacances scolaires de la zone C (Paris, Créteil, Versailles, Montpellier, Toulouse). Prévenu une semaine avant le départ. Calendrier officiel Éducation nationale.',
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
  'Alerte quand le prix moyen national du gazole ou du SP95-E10 repasse sous un seuil symbolique (1,80 / 1,70 / 1,60 / 1,50 €/L). Données officielles prix-carburants.gouv.fr.',
  'internal', 'official', false, ARRAY['prix-carburant', 'bons-plans'], 33
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'carburant-seuils');
INSERT INTO source_states (source_id) SELECT 'carburant-seuils'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'carburant-seuils');

-- Vigilances météo supplémentaires (même API/factory, un seul appel partagé).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-06', 'Vigilance météo — Alpes-Maritimes', 'Alertes orange et rouge Météo-France',
  'Alerte quand Météo-France place les Alpes-Maritimes en vigilance orange ou rouge (orages, pluie-inondation, canicule...). Source officielle Météo-France.',
  'internal', 'official', false, ARRAY['vigilance-meteo', 'meteo-risques'], 24
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-06');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-06'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-06');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-33', 'Vigilance météo — Gironde', 'Alertes orange et rouge Météo-France',
  'Alerte quand Météo-France place la Gironde en vigilance orange ou rouge (tempêtes, canicule, orages...). Source officielle Météo-France.',
  'internal', 'official', false, ARRAY['vigilance-meteo', 'meteo-risques'], 25
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-33');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-33'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-33');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'vigilance-meteo-59', 'Vigilance météo — Nord', 'Alertes orange et rouge Météo-France',
  'Alerte quand Météo-France place le Nord en vigilance orange ou rouge (vent violent, tempêtes, neige-verglas...). Source officielle Météo-France.',
  'internal', 'official', false, ARRAY['vigilance-meteo', 'meteo-risques'], 26
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'vigilance-meteo-59');
INSERT INTO source_states (source_id) SELECT 'vigilance-meteo-59'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'vigilance-meteo-59');

-- Statuts de service supplémentaires (standard Statuspage). Anti-flapping : TRUE.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-npm', 'Panne npm', 'Statut officiel de npm',
  'Alerte quand npm (le registre de paquets JavaScript) déclare une panne majeure sur sa page de statut officielle. Vos installs et déploiements qui échouent, expliqués.',
  'internal', 'official', true, ARRAY['pannes-services', 'npm-packages'], 42
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-npm');
INSERT INTO source_states (source_id) SELECT 'statut-npm'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-npm');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-vercel', 'Panne Vercel', 'Statut officiel de Vercel',
  'Alerte quand Vercel déclare une panne majeure sur sa page de statut officielle. Fini le « c''est mon déploiement ou c''est en panne ? ».',
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
  'Alerte quand une fusée européenne (Ariane, Vega, ESA) décolle dans les prochaines 24h, avec l''heure de Paris et le lieu. Données Launch Library 2.',
  'internal', 'official', false, ARRAY['lancements-spatiaux', 'espace'], 57
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'lancement-spatial');
INSERT INTO source_states (source_id) SELECT 'lancement-spatial'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'lancement-spatial');

-- Nouvelles versions LTS de Node.js.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'node-lts', 'Node.js LTS', 'Nouvelles versions LTS de Node',
  'Alerte à la sortie d''une nouvelle version LTS (support long terme) de Node.js, avec son numéro et son nom de code. Source officielle nodejs.org.',
  'internal', 'official', false, ARRAY['versions-logiciels', 'tech'], 45
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'node-lts');
INSERT INTO source_states (source_id) SELECT 'node-lts'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'node-lts');

-- Statuts de service supplémentaires. Anti-flapping : requires_confirmation = TRUE.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-anthropic', 'Panne Anthropic', 'Statut officiel de Claude / Anthropic',
  'Alerte quand Anthropic déclare une panne majeure de Claude sur sa page de statut officielle. Fini le « c''est moi ou c''est en panne ? ».',
  'internal', 'official', true, ARRAY['pannes-services', 'tech'], 44
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-anthropic');
INSERT INTO source_states (source_id) SELECT 'statut-anthropic'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-anthropic');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-netlify', 'Panne Netlify', 'Statut officiel de Netlify',
  'Alerte quand Netlify déclare une panne majeure sur sa page de statut officielle. Fini le « c''est mon déploiement ou c''est en panne ? ».',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 46
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-netlify');
INSERT INTO source_states (source_id) SELECT 'statut-netlify'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-netlify');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'statut-railway', 'Panne Railway', 'Statut officiel de Railway',
  'Alerte quand Railway déclare une panne sur sa page de statut officielle (format Instatus). Fini le « c''est mon app ou c''est l''hébergeur ? ».',
  'internal', 'official', true, ARRAY['pannes-services', 'status-cloud'], 47
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'statut-railway');
INSERT INTO source_states (source_id) SELECT 'statut-railway'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'statut-railway');

-- Jours fériés & ponts (API calendrier gouv).
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'jours-feries', 'Fériés & ponts', 'Les prochains jours fériés et leurs ponts',
  'Une semaine avant chaque jour férié, un rappel — et le bon plan pont quand le férié tombe un mardi ou un jeudi. Calendrier officiel de l''administration française.',
  'internal', 'official', false, ARRAY['autre', 'vie-locale'], 58
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'jours-feries');
INSERT INTO source_states (source_id) SELECT 'jours-feries'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'jours-feries');

-- Sources calculées (zéro API) supplémentaires.
INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'black-friday', 'Black Friday', 'Le rendez-vous shopping de novembre',
  'Rappel quelques jours avant le Black Friday (le vendredi après Thanksgiving). Et un conseil : comparez les prix, méfiez-vous des fausses promos.',
  'internal', 'official', false, ARRAY['deals-du-jour', 'bons-plans'], 51
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'black-friday');
INSERT INTO source_states (source_id) SELECT 'black-friday'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'black-friday');

INSERT INTO sources (id, name, subtitle, description, type, badge, requires_confirmation, categories, display_order)
SELECT 'journees-patrimoine', 'Journées du patrimoine', 'Le 3e week-end de septembre',
  'Rappel avant les Journées européennes du patrimoine : le 3e week-end de septembre, des monuments et lieux habituellement fermés ouvrent gratuitement.',
  'internal', 'official', false, ARRAY['patrimoine', 'culture'], 59
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = 'journees-patrimoine');
INSERT INTO source_states (source_id) SELECT 'journees-patrimoine'
WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'journees-patrimoine');

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
