Le projet en une phrase
labonnealerte.fr — le kiosque français d'alertes utiles : des alertes prêtes à l'emploi, activables en un clic, gratuites, open source, anti-spam par ADN. Standard ouvert OpenAlert (alert.json, spec dans OPENALERT.md), en v2 paramétrée (champ params). Objectif : large audience francophone (métropole, outre-mer, Québec, Belgique/Suisse, expatriés), app native robuste à terme. Édité par Hugo Vial-Jaime (Dahu Concept, Gap).

État du produit (~130 cartes visibles en prod, sauf mention)

Le kiosque est passé d'environ 62 à ~130 cartes visibles après six grandes vagues, plus des sources dormantes (prêtes-à-brancher) en attente de clés. Beaucoup de cartes sont paramétrées (v2) et valent chacune des dizaines à des centaines d'instances.

SOURCES INTERNES — RISQUES & MÉTÉO : Vigilance météo PARAMÉTRÉE (une carte, 101 départements ; a remplacé 15 sources figées), Vigicrues Durance (vigicrues-05, non paramétrable proprement — dump national sans mapping département), VigiEau PARAMÉTRÉE (commune INSEE), séismes-france (national) + seismes-departement (PARAMÉTRÉE, rayon ~80 km autour du chef-lieu, cas mixte broadcast+param), risque-avalanche (PARAMÉTRÉE par massif, DORMANTE — attend clé portail MF DPBRA), meteo-forets (PARAMÉTRÉE par département, DORMANTE — attend clé portail MF Forêts), indice-uv (PARAMÉTRÉE 101 départements, mutualisée Open-Meteo multi-points ; a remplacé indice-uv-gap), epidemies-france (Sentinelles, seuils nationaux).

ÉNERGIE & CONSO : EcoWatt + Ecogaz (RTE OAuth2), carburant PARAMÉTRÉE (par type : gazole/E10/SP98/E85/GPLc ; a remplacé carburant-seuils), tempo (jours Tempo rouge, repli communautaire api-couleur-tempo.fr badge verified — RTE officiel = souscription portail à faire), energie-tarifs (TRV élec 1er fév/1er août), taux-livret-a, RappelConso PARAMÉTRÉE (par catégorie, filtre risques graves étendu au non-alimentaire), leboncoin livraison 0,99€ (scraper, DataDome par vagues).

TECH & DEV : 30+ statuts de services (Statuspage + variantes Instatus/Slack ; gisement FR/EU quasi épuisé, ils sont rarement sur Statuspage), Node LTS, CERT-FR alertes ANSSI, fin-de-vie-logicielle (PARAMÉTRÉE par produit, endoflife.date), maj-navigateurs (Firefox+Chrome), github-release (PARAMÉTRÉE par dépôt), npm-release / pypi-release (PARAMÉTRÉES par paquet), steam-jeu-promo (PARAMÉTRÉE par appid, remise ≥40%), veille-hackernews (PARAMÉTRÉE par mot-clé, >100 pts), veille-rss (PARAMÉTRÉE par URL de flux — prototype de la famille « surveillées » V3, la source la plus exposée : SSRF-safe mais à encadrer davantage au lancement).

GAMING & CULTURE : Epic/GOG/Steam (jeux gratuits/soldes), rdv-gaming (gamescom/PGW/Game Awards), sorties-jeux-majeures (GTA VI...), sorties-cinema-majeures (Avengers Doomsday...), grands-festivals (Cannes...), ceremonies (Césars/Oscars), guide-michelin, nuits-de-la-lecture, semaine-du-gout, grands-salons (Agriculture/Auto/VivaTech), braderie-lille.

FINANCE & EXPAT : bitcoin-mouvement (CoinGecko, |Δ24h|≥10%, fenêtre anti-flap), taux-de-change (PARAMÉTRÉE par devise, Frankfurter/BCE, |Δ7j|≥3%).

VIE PRATIQUE & CALENDAIRE : vacances scolaires PARAMÉTRÉE (par zone A/B/C ; a remplacé les 3 sources), jours fériés PARAMÉTRÉE (par zone, 13 zones ; logique ponts), échéances fiscales, Loi Montagne, Bison Futé (calendrier officiel 2026), SNCF perturbations (attend SNCF_API_KEY), ouverture-ventes-sncf (config vide + TODO — candidate au partage viral), treve-hivernale, cheque-energie, smic-revalorisation, hausses-tarifs (péages), rentree-scolaire, saints-de-glace, ouverture-peche, grandes-causes (Octobre Rose/Movember/Téléthon), grandes-journees-mondiales (5 dates ONU), grands-rendez-vous-sportifs, fetes-familiales, fetes-gourmandes.

FÊTES & ASTRO & INSOLITE : fêtes par tradition (chrétiennes/musulmanes/juives/laïques), changement d'heure, soldes, Beaujolais, Black Friday, Journées patrimoine, élections France (en sommeil), Perséides, Géminides, éclipse solaire (12/08/2026 puis totale 02/08/2027), Nuits des étoiles, evenements-astro (oppositions/conjonctions), grandes-marees (coeff≥100), fete-science, nobel-prix, jour-depassement, rdv-planete (Heure de la Terre/World Cleanup Day/SERD), vendredi-13, 1er avril, journees-geek (Pi Day/Star Wars Day/sauvegarde...).

FRANCOPHONIE HORS MÉTROPOLE : cyclones-outremer (PARAMÉTRÉE par territoire, DORMANTE — attend licence vd@meteo.fr OU souscription portail Bulletin Vigilance OM + URL endpoint ; parser codé à la spec v5, 6 territoires), meteo-quebec (PARAMÉTRÉE par région, ECCC GeoMet GeoJSON FR natif, warnings only), pannes-hydro-quebec (seuil 50 000 foyers ; API non documentée, lecture défensive), feries-quebec, meteo-belgique (PARAMÉTRÉE par province, MeteoAlarm, orange+), meteo-suisse (PARAMÉTRÉE par canton romand ; API app mobile reverse-engineered, FRAGILE), feries-belgique, feries-suisse.

⚠️ Sources FRAGILES à surveiller (API non officielles, peuvent casser sans préavis) : meteo-suisse, pannes-hydro-quebec. C'est le premier cas d'usage concret du Robot 1 (veille de maintenance).

OpenAlert v2 — PARAMÉTRÉ (chantier terminé, 6 étapes) : champ params optionnel (types enum|string|number, un paramètre plat, multiple possible ; geo reporté v2.1) ; rétrocompatible (sans params = broadcast v1). DB : subscriptions.params JSONB + index unique d'expression, table source_param_states (état par combinaison), source_events.params, sources.params_schema. Poller : checkWithParams(paramsList) sur les seules combinaisons souscrites, transitions factorisées (decideTransition pure + applyResult), notifications par combinaison avec libellé résolu. UI générique pilotée par params_schema : select (enum) ou input validé (string, pattern honoré seulement pour schémas internes de confiance — anti-ReDoS), chips par instance + « + ajouter », état de carte = pire instance, indicateur Abonné/Non abonné toujours visible. Page de statut : une page par source, onglets des instances de l'abonné + sélecteur, ?param=X en query (SEO), grande flèche retour. Fusions réalisées (pattern : migration idempotente ON CONFLICT DO NOTHING + report d'état/since = zéro notification parasite, anciennes sources enabled=false réversibles, redirections 301 statut/badge/API) : vigilance (15→1), vacances (3→1), jours fériés, VigiEau, RappelConso, carburant, indice-uv. Polling EXTERNE construit à cette occasion (broadcast + paramétré, safe-fetch.js SSRF partagé validateur/poller, plafond EXTERNAL_MAX_COMBOS défaut 20, échecs isolés allSettled, round-robin). Validateur /proposer étendu (schéma params + sonde dynamique). DoomName = 1re source externe paramétrée (param domaine, endpoint GET /alert.json?domaine=x côté www.doomname.com, badge verified, endpoint interne de tracking à secret partagé). Dimensionnement réseau vérifié : mutualisation systématique (une carte météo pays = 1 appel) ; pire cas ~140 appels/cycle pour les 8 sources dev-paramétrées les plus sollicitées, borné par cache + plafond.

HEURES DE VEILLE : par défaut aucune notification (email + push) entre 23h et 8h Europe/Paris (tzdata OK sur Railway, vérifié) — les alertes de nuit sont DIFFÉRÉES (table deferred_notifications), jamais supprimées, envoyées en digest à la sortie de plage (« Pendant votre veille : N alertes », marquage « terminée entre-temps » si l'état est retombé). Réglable dans Mon compte (quiet_start/quiet_end/quiet_disabled). Émails non-alerte jamais différés. ⚠️ Limite connue : plage globale en heure de Paris — à adapter au fuseau de l'utilisateur quand le public s'internationalisera (Québec/expat).

PERSONNALISATION : colonnes subscribers country/departement/interests (nullables), section « Personnaliser les alertes » dans Mon compte, pondération des recommandations et de l'ordre des cartes (inchangé si rien de renseigné). Le département pré-remplit l'abonnement vigilance et sert de boost au tri (étendu aux cartes paramétrées). La reco exclut les sources désactivées et n'affiche jamais une source géo d'un autre département que le profil.

Plateforme : Express/PostgreSQL/Railway (Dockerfile image Playwright), poller 30 min (cron */30 ; cycle forçable : node -e "require('./server/poller').runCycle().then(()=>process.exit(0))" — ⚠️ ÉCRIT en base et envoie de vraies notifications, à ne JAMAIS lancer depuis un agent automatique), états pending/active/inactive (requires_confirmation par source), épisodes (since avance ≥24h → re-notification), source_events + pages de statut publiques (uptime 90j, timeline), badge SVG, compteurs. checked_at mis à jour à chaque passage (base de la veille de maintenance). Factories : vigilance/statuspage/calendar/vacances (caches mutualisés). Briques : lib/feed-parser.js (RSS+Atom), lib/prefectures.js (101 chefs-lieux), safe-fetch.js (safeFetchJson/safeFetchText SSRF).

Comptes : magic link + OAuth Google/GitHub, fusion par email vérifié, sessions 90j (localStorage), suppression autonome (cascade DB). Notifications : email (Resend) + web push VAPID (PWA installable).

UX : one-page type Railway, home 2 modes (vitrine/app), header PC condensé (recherche centrée + catégories + kpi près du thème), header mobile qui se condense au scroll (recherche+connexion persistent), panneau Mon compte unifié style notif-card (personnalisation, veille, notifs, soutien, proposer, déconnexion ; historique pleine hauteur au verso), cartes mobile qui réduisent leur hauteur (p/state repliés), carte recommandée avec remplacement sans trou, filtres FLIP, footer blur, hero à halo animé léger. Recherche/tags masqués dans Mon compte et hors home. ⚠️ À valider visuellement : hero quasi-vide en mode connecté (kpi déplacé dans le header).

Identité : violet #a567e3/#bd8ef0, vert = état actif UNIQUEMENT, Inter/JetBrains Mono/Baloo 2, ping radar, « Veille de nuit » sur pages dev, fond constellations jour/nuit.

Robots (agents Claude Code headless, PC allumé la nuit — voir robots/PLANIFICATEUR.md)

Les 4 robots sont DÉVELOPPÉS. Garde-fous communs : LECTURE SEULE (jamais de push/écriture DB/lancement de runCycle), sortie = rapport markdown (au plus un brouillon de prompt), validation humaine avant tout déploiement, accès DB via scripts *-readonly.js dédiés (que des SELECT, revus une fois). Planning :
- Robot 1 — Veille de MAINTENANCE : QUOTIDIEN 04h00. Lit checked_at/source_events en base (pas les logs en ligne) + les fichiers sources : sources en échec répété (priorité aux fragiles meteo-suisse/hydro-quebec), sources muettes >90j, TODO calendaires qui approchent, collisions display_order, slugs orphelins.
- Robot 2 — Audit SÉCURITÉ (code, pas site) : HEBDO dimanche 03h00. npm audit, routes exposées, patterns SSRF/injection, cohérence validations client/serveur. Zéro requête vers la prod.
- Robot 4 — Veille de NOUVELLES SOURCES : HEBDO mercredi 03h00. Rapport de candidats (data.gouv récents, API publiques, changelogs), PAS un prompt prêt — des pistes à trier.
- Robot 3 — Trieur de SOUMISSIONS dev : DORMANT (rien à trier tant que le site n'est pas public ; à activer au lancement). Accès via soumissions-readonly.js, sonde via safeFetchJson avec traçage dédié + une sonde/URL sans retry + plafond/run ; ne touche jamais enabled — Hugo décide.

Conventions de travail (à respecter)

Hugo travaille : Claude Chat = architecture + prompts → Claude Code (VS Code) exécute → Hugo colle les rapports ici. Windows PowerShell 5 : PAS de && — séquences git LIGNE PAR LIGNE (git add . / git status / commit / push), messages de commit sans accents, sans Co-Authored-By.
Tout prompt de source impose : explorer l'API réelle avant de coder, écarter sans forcer si impraticable (le documenter), rapport des structures constatées. Toute date calendaire vérifiée sur le site officiel, JAMAIS de mémoire ; non annoncé = écarté avec TODO daté (jamais de date inventée).
Séquence après chaque chantier : git add . / git status (vérifier .env/.claude absents) / commit / push (Railway auto-déploie) → node server/db/migrate.js dans le shell Railway si init.sql touché (⚠️ le .env local pointe la DB de PROD). Surveillance post-migration : Deploy logs Railway. Pour toute fusion : compte de contrôle SQL avant/après (invariant zéro-perte).
Anti-spam produit : jamais d'alerte sur du bruit (jaune exclu, seuils stricts, jusque dans les migrations : report d'état) ; messages émoji + concis + dates FR sans année ; « Aujourd'hui :/Demain : » pour J/J+1.
Deux dépôts sur le même compte Railway : labonnealerte et doomname — commits séparés (doomname d'abord).
display_order : plages hautes pour éviter les collisions entre vagues en cours ; l'existant max est monté à ~172.

Liste de courses — clés & souscriptions (chacune débloque du lourd)

- Cyclones outre-mer : licence vd@meteo.fr OU souscription portail « Bulletin Vigilance » OM + URL endpoint → METEOFRANCE_VIGILANCE_OM_URL + enabled=true. PRIORITÉ HAUTE (public antillais/réunionnais, saison cyclonique, aucun concurrent grand public).
- Avalanche : souscription portail MF DPBRA → METEOFRANCE_DPBRA_API_KEY + enabled=true (hivernal).
- Météo des forêts : souscription portail MF Forêts → METEOFRANCE_FORETS_API_KEY (+ confirmer le champ de danger réel) + enabled=true (estival).
- Atmo Data (inscription admindata.atmo-france.org/inscription-api, validation manuelle) → passe pollens-gap + épisodes de pollution (cache 12h+, requêtes hors 13h-15h, ?withGeom=false, mention ODbL « Atmo France / AASQA »).
- SNCF : SNCF_API_KEY → calibrage seuil.
- RTE Tempo : souscription « Tempo Like Supply Contract » portail data.rte-france.com → bascule tempo du repli communautaire (verified) vers l'officiel (official). Sans urgence (rouges nov→mars).

En attente / à surveiller

- DoomName : apex doomname.com mal routé côté Railway (www suffit ; à réparer dans Settings→Domains si voulu).
- Densité du kiosque (~130 cartes) : SUJET PRODUIT PRIORITAIRE avant lancement — la personnalisation et le regroupement par catégories doivent faire qu'un visiteur voie LES SIENNES d'abord, pas 130 cartes brutes.
- veille-rss : à encadrer davantage au lancement (quota par utilisateur ? liste de flux ?).
- Purge éventuelle des anciens abonnements des sources fusionnées (conservés par prudence), et de l'abonné de test reco-e2e@example.com.
- Sources FRAGILES (meteo-suisse, pannes-hydro-quebec) : surveillance Robot 1.
- Dons /soutenir : boutons désactivés tant que PayPal/Ko-fi non créés.
- TODO calendaires nombreux (configs par année) : Bison Futé 2027, dates fiscales 2027, fêtes mobiles, ouvertures SNCF, causes 2027, sorties datées, montant SMIC, coeff marées 2027, etc. → suivis par Robot 1.
- Backlog écarté (faute de flux propre) : soldes outre-mer 2027, sargasses (PDF), conseils-voyageurs, stations 05, nappes phréatiques, qualité baignade, jackpot, réserves de sang, pénurie médicaments, ouverture cols/chasse. ISS = cas v2.1 (type geo).

Roadmap convenue

1. Passes à clés (liste de courses ci-dessus) — cyclones OM en priorité.
2. Sujet densité/UX du kiosque (~130 cartes) avant toute communication.
3. Candidats v2 restants : Vigicrues (curée à la main), autres déclinaisons régionales si seuil propre.
4. V3 « veilles citoyennes » (dépôt d'alertes tout public) : conception à faire. Trois familles (datées = MVP le plus sûr ; maintenues par un humain ; surveillées — veille-rss en préfigure la mécanique), badge community, espace séparé du kiosque officiel, pré-modération + charte, compte obligatoire. Objectif accroche/viralité (pages publiques « N personnes attendent... »). APRÈS consolidation v2.
5. App native Android (Expo, FCM) ; PWA en pont.
6. Communication/lancement : reporté (« présenter fini et complet »). Prérequis restants : densité/UX traitée, README, dons activés, RGPD complet.