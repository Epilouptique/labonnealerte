# LaBonneAlerte — État du projet (18 juillet 2026, fin de fil "vagues & v2")

Ce document fait foi pour tout nouveau fil. Il remplace toute version antérieure d'etat-projet.md (fichiers du projet Claude Chat ET .claude/ côté VS Code — synchroniser les deux).

## Le projet en une phrase

labonnealerte.fr — le kiosque francophone d'alertes utiles : ~178 sources actives prêtes à l'emploi, activables en un clic, gratuites, open source, anti-spam par ADN. Standard ouvert OpenAlert v2 paramétrée (champ params). Public : francophonie entière (métropole, outre-mer, Québec, Belgique/Suisse, diasporas, expatriés). Édité par Hugo Vial-Jaime (Dahu Concept, Gap). Projet frère : DoomName (doomname.com), même compte Railway, première source externe paramétrée du kiosque.

## État du produit (~178 sources actives en prod)

RISQUES & MÉTÉO : vigilance-meteo (param 101 dépts, LA fusion pilote), vigicrues-departement (param 85 dépts ~252 tronçons), vigieau (param commune INSEE — restrictions d'usage), risque-secheresse (param dépt — arrêté préfectoral, API VigiEau/RegLeau, Propluvia est MORT ; distinction avec vigieau inscrite dans les 2 descriptions), seismes-france + seismes-departement (param ~80 km) + seisme-mondial-majeur (USGS M≥7.5), indice-uv (param 101, Open-Meteo mutualisé), epidemies-france (Sentinelles), tempete-solaire (NOAA G≥4/R≥3), asteroide-frole-terre (JPL ≤1 LD + h≤24), essai-sirenes (1er mercredi midi), meteo-quebec/belgique/suisse/europe (params ; europe = 8 pays expat MeteoAlarm), pannes-hydro-quebec. DORMANTES (clés) : risque-avalanche (MF DPBRA), meteo-forets (MF), cyclones-outremer (6 territoires — licence vd@meteo.fr ou portail OM).

ÉNERGIE & CONSO : EcoWatt, Ecogaz, carburant (param 5 types), tempo (repli communautaire verified — RTE portail à souscrire avant nov), energie-tarifs, taux-livret-a, rappel-conso (param catégories), leboncoin-livraison (scraper, DataDome par vagues), ce-qui-change (mensuel service-public.gouv.fr), echeances-fiscales (TF/THRS/PAS 1er sept/remboursement 24-31 juil).

ÉCONOMIE (nouveau, INSEE SDMX sans clé via lib/insee-bdm.js — publications définitives OBS_QUAL=DEF only) : indice-reference-loyers (trimestriel), inflation-insee (mensuel), chomage-stats (trimestriel). Écartés : taux-immobilier (BdF Webstat = compte requis), delais-titres (ANTS = SPA sans API).

TECH & DEV : ~38 statuts (gisement épuisé, FR/EU rarement Statuspage — opérateurs télécom vérifiés : rien de structuré), CERT-FR, node-lts, fin-de-vie-logicielle (param endoflife.date), maj-navigateurs, rdv-tech (Ubuntu 26.10 : 15 oct), github/npm/pypi/crates/packagist/rubygems-release (params ; release-factory pour les 3 derniers — migration npm/pypi dessus = lot audit), steam-jeu-promo (param appid), veille-hackernews (param mot-clé), veille-rss (param URL, SSRF-safe, préfigure V3), prix-turing (fenêtre mars-avril).

FRANCOPHONIE & MONDE : fetes-nationales (param 23 pays — Algérie 5 juillet acté), feries-quebec/belgique/suisse, jours-feries (param 13 zones), grands-anniversaires (curée : Monet 5 déc 26, Lindbergh 21 mai 27, Metropolis...), francophonie (20 mars), grandes-journees-mondiales (5 ONU), don-organes (22 juin, française), taux-de-change (param devises BCE/Frankfurter).

CULTURE & SORTIES : prix-litteraires, rentree-litteraire, festival-bd-angouleme, festival-livre-paris (16-18 avr 27), festivals-musique (Hellfest 17-20 juin 27, Rock en Seine 26-30 août 26), japan-expo (8-11 juil 27), fete-des-lumieres, spectacles-recompenses, ceremonies, grands-festivals, guide-michelin, grands-prix-gastronomie (50 Best 4 nov 26 Lima, Bocuse d'Or 24-25 janv 27), nuits-de-la-lecture, fashion-week (FHCM 3 éditions), rendez-vous-aux-jardins (4-6 juin 27), sorties-jeux/cinema-majeures (GTA VI 19 nov 26, Avengers Doomsday 16 déc 26), rdv-gaming (+Next Fest 19-26 oct), billetterie-concerts (config vide, curation au fil), loto-patrimoine (TODO), carnavals, saint-nicolas, semaine-du-gout, braderie-lille (5-6 sept 26), grands-salons, nobel-prix (5-12 oct 26), fete-science (2-12 oct 26).

VIE PRATIQUE & SOCIAL : vacances-scolaires (param zones), rentree-scolaire (1er sept 26), dates-bac (TODO BO), allocation-rentree-scolaire (19 août 26), prime-noel (16 déc), smic-revalorisation, cheque-energie, treve-hivernale, hausses-tarifs, loi-montagne, bison-fute, sncf-perturbations (attend clé), ouverture-ventes-sncf (config vide), grandes-causes (Octobre Rose/Movember/Téléthon 4-5 déc + TODO Pièces Jaunes/Restos), mercato-foot (LFP 1er sept/1er fév), grands-rendez-vous-sportifs, courses-mythiques (config vide TODO sept), semaine-bleue (5-11 oct 26), tour-de-france-passage (param dépt, config vide TODO oct — parcours par dépt non publiable fiablement), fetes-familiales/gourmandes, fetes par tradition, changement-heure, soldes, journees-patrimoine (19-20 sept 26), elections-france, saints-de-glace, ouverture-peche, jour-depassement (30 juil 26), rdv-planete, vendredi-13, premier-avril, journees-geek, beaujolais, black-friday.

ASTRO : eclipse-solaire (12/08/2026 — dans 3 semaines !), perseides, geminides, nuits-des-etoiles (7-9 août), evenements-astro (+éclipse Lune partielle 28/08/26 — AUCUNE totale visible de France 2026-27), grandes-marees (13-15/08, 11-13/09, 27/10), aurores-france, lancement-spatial, iss-passages (param 15 villes+Gap — EXPÉRIMENTALE : iss-api.fly.dev communautaire sans SLA, marquée FRAGILE, repli N2YO prêt-à-brancher).

PÉPITES VIRALES : fete-des-prenoms (param prénom, 326 prénoms + 48 variantes, table vérifiée — bug de dates détecté par tests et corrigé), rappel-personnalise (param "JJ/MM Libellé" récurrent — première brique V3 datée EN PROD).

⚠️ FRAGILES (API non officielles → surveillance Robot 1) : meteo-suisse, pannes-hydro-quebec, iss-passages.

ÉCARTÉES documentées (= liste de courses si un flux apparaît) : alerte-enlèvement (RSS officiel 404, diffusion médias/FR-Alert only), grèves, ZFE (légalement instable — seuls Paris/Lyon certains), séries (agrégateurs only), OMS/USPPI, INES nucléaire, Téléray, Reddit (OAuth requis), don-du-sang (ni bulk ni INSEE — API Carto EFS searchnearpoint lat/lon non contractuelle = seule voie), moustique-tigre, foire-aux-vins, nuit-des-chercheurs 2026 (pas de financement UE), MaPrimeRénov (ouvertures réactives au budget, pas de calendrier), sargasses, conseils-voyageurs, stations 05, nappes, baignade, jackpot, taux-immobilier, delais-titres, statuts opérateurs télécom, saisons-astronomiques (doublon fetes-laiques).

## OpenAlert v2 (acquis, chantier terminé)

params enum|string|number, un param plat, multiple ; rétrocompatible (sans params = broadcast v1). DB : subscriptions.params + index unique d'expression, source_param_states (état par combinaison — SEULES LES COMBINAISONS SOUSCRITES sont calculées, rien d'autre n'existe en base), sources.params_schema, subscriptions.muted (pause sans désabonnement, filtré aux destinataires only). Poller : checkWithParams(combinaisons souscrites), transitions factorisées (decideTransition pure), libellés résolus partout, épisodes since≥24h. UI générique pilotée par params_schema (chips + « + ajouter » cyclique — exclusion mutuelle param-add/param-form corrigée par .param-add[hidden]). Pages statut : onglets d'instances + sélecteur + ?param=X. Fusions à zéro perte (pattern : migration idempotente + report d'état/since + enabled=false réversible + 301). Polling externe (safe-fetch SSRF, EXTERNAL_MAX_COMBOS=20, allSettled, round-robin). DoomName externe paramétrée (www.doomname.com/alert.json — apex doomname.com cassé côté Railway Domains, www suffit).

## Fonctionnalités produit

- Heures de veille : 23h-8h Paris défaut, différé + digest (deferred_notifications), tzdata vérifié. Limite : fuseau global — à adapter pour Québec/expat.
- Personnalisation : country/departement/interests → boost tri + reco (reco jamais hors-département, jamais de source disabled).
- Auto-remplissage 1re connexion : display_name (Google given_name / GitHub name / email → collision Hugo2..8), pays par geoip-lite local — correctif clientIp() : x-forwarded-for premier IP PUBLIC (Railway CGNAT 100.64/10 non résolu par geoip-lite, cause du bug pays). Département jamais deviné. RGPD en confidentialité.
- Likes + Favoris : table favorites + /favoris + sync montante localStorage→serveur + cœur header. Limite : sync descendante multi-appareils absente.
- « Les plus populaires » (ex-Sélection, top-12 likes public, slug interne 'selection' conservé) + « Nouveautés ».
- Collections : 7 packs officiels (étagère carrousel infini + fondu bords, adoption 1 clic idempotente, params résolus profil>pack>à compléter, sources dormantes auto-incluses à l'activation) + Decks utilisateurs (10 max, 24 motifs SVG + 11 teintes — UN SEUL CSS partagé toutes pages, partage lien non-listé token 128 bits révocable, fork-copie avec attribution figée, pseudo public display_name unique « Mon pseudo », signalements 3 IP → suspension auto, remontée Robot 1). « Ma collection » (abonnements) ≠ « Mes decks » (compositions). Avatar initiale.
- Le Point (/le-point) : « en ce moment » (broadcast actifs + agrégats paramétrés des combinaisons souscrites — assumé dans le libellé) + « à venir » 10 j (contrat upcoming() de calendar-factory, 72 sources ; paramétrées exclues — CHANTIER VALIDÉ EN ATTENTE : upcoming() toutes-combinaisons pour jours-feries + fetes-nationales). Cache 2 min, état calme assumé, pending exclus. Vitrine de lancement désignée.

## Audit & dette (audit-architecture.md à la racine, aucun 🔴 sécurité)

Lot 1 FAIT (index subscriptions(source_id) + partiel source_param_states actifs + import mort retiré — candidats favorites/deferred/reports écartés car déjà couverts). Lots 2-5 restants : migration npm/pypi sur release-factory, belgique/suisse sur lib/meteoalarm, découpe site.js (~1800 l.)/site.css (~2000 l.)/init.sql (~2500 l.), enum dépt dédupliqué, rate-limit /auth/*, 11 globals LBA*. À préserver : factories, contrat v2, idempotence, anti-spam.

## Corrections UX récentes & points ouverts

Faits : cartes mobile (.wrap media query), pref-chips pleine largeur, « Mon pseudo », bouton header min-width 185px, mes-decks CSS unifié (le divergent constaté était un prod-lag), param-add[hidden]. 
⚠️ OUVERT — MENU MOBILE SCROLL : 3 tentatives. Dernier état : hauteurs bornées (m-menu-flip height:100%) MAIS symptôme persistant « la scrollbar bouge, le contenu non » → prompt de reprise fourni (3 pistes : enfant absolute/fixed rattaché à un ancêtre, transform résiduel du preserve-3d, doublon de rendu ; inspection DYNAMIQUE exigée ; repli si échec : sortir la liste du preserve-3d, flip par crossfade). 
⚠️ OUVERT — PARTAGE /mes-decks : doit utiliser la modale LBAShare unifiée des collections (prompt fourni, réutilisation stricte, zéro duplication). 
À vérifier post-déploiement : auto-remplissage pays sur vrai callback, iss-passages en conditions réelles (un soir à Gap).
Pages de chargement : PAS de page unique — états locaux par page (.grid-loading home, .src-loading mes-decks/favoris/collection/deck), halo animé, reduced-motion respecté.

## Plateforme & infra

Express/PostgreSQL/Railway, poller */30 (runCycle ÉCRIT et notifie — JAMAIS depuis un agent), checked_at chaque passage, factories (vigilance/statuspage/calendar+upcoming/vacances/release/meteoalarm/insee-bdm), briques lib/ (feed-parser, prefectures, safe-fetch, ugc), geoip-lite local. Comptes : magic link + OAuth Google/GitHub (PAS d'autre fournisseur — décision actée ; Apple seulement si app iOS un jour), sessions 90j, suppression cascade. Notifs : Resend + push VAPID (PWA installable).

## Robots (headless, robots/PLANIFICATEUR.md, développés)

R1 maintenance QUOTIDIEN 4h (checked_at/events/TODO/fragiles via scripts *-readonly.js) · R2 audit sécu HEBDO dim 3h · R4 veille sources HEBDO mer 3h · R3 soumissions DORMANT (activer au lancement ; sonde safeFetchJson tracée, 1 sonde/URL, plafond/run, ne touche jamais enabled). Garde-fous absolus : lecture seule, rapport only, jamais runCycle, validation humaine.

## Conventions de travail (à respecter dans tout nouveau fil)

- Hugo : Claude Chat = architecture + prompts → Claude Code (VS Code, --dangerously-skip-permissions) exécute → rapports collés ici. Windows PowerShell 5 : PAS de && — git LIGNE PAR LIGNE (add . / status / commit / push), messages sans accents.
- Prompts de sources : explorer l'API réelle avant de coder ; dates vérifiées sur site officiel (JAMAIS de mémoire) ; non annoncé = TODO daté (JAMAIS de date inventée) ; écarter sans forcer en documentant ce qui manque ; ton factuel et calme sur les sujets anxiogènes ; anti-spam absolu (seuils stricts, jaune/mineur exclus).
- Séquence : add/status (.env et .claude/ absents !)/commit/push → node server/db/migrate.js dans le shell Railway si init.sql touché (⚠️ le .env local pointe la DB de PROD) → Deploy logs. Fusions : comptes de contrôle SQL zéro-perte. Deux dépôts Railway (doomname d'abord si touché).
- ⚠️ GitHub : shadow ban temporaire en cours (ticket ouvert) — déploiements Railway directs possibles ; resynchroniser GitHub à la levée, et revenir à « commit d'abord, déploiement ensuite ».
- display_order : utilisés jusqu'à ~365 ; toute nouvelle vague prend une plage au-dessus.

## Liste de courses — clés & souscriptions (débloquent des sources déjà codées)

1. Cyclones OM : mail à vd@meteo.fr OU portail « Bulletin Vigilance » OM → METEOFRANCE_VIGILANCE_OM_URL + enabled=true. PRIORITÉ (saison en cours, aucun concurrent).
2. MF DPBRA (avalanche, avant l'hiver) · 3. MF Forêts · 4. Atmo Data (pollens+pollution — inscription à validation manuelle, la lancer tôt) · 5. SNCF_API_KEY · 6. RTE Tempo (portail, avant novembre).

## Roadmap

1. Clore les 2 points UX ouverts (menu mobile scroll, partage mes-decks) + chantier upcoming() public + passes à clés.
2. ONBOARDING première visite (dernier volet densité : 3 questions dans le hero → grille personnalisée avant connexion → packs suggérés — cadrage fait, jamais lancé).
3. LANCEMENT (chantier jamais ouvert — discussion stratégique à avoir : README, dons /soutenir à activer, RGPD final, /le-point en vitrine, canaux : communautés dev pour OpenAlert, locales pour vigilances, activer Robot 3). Le produit est prêt pour des yeux extérieurs.
4. Lots 2-5 audit au fil de l'eau.
5. V3 « veilles citoyennes » (3 familles : datées d'abord — rappel-personnalise en préfigure la mécanique ; maintenues ; surveillées — veille-rss idem ; badge community, espace séparé, pré-modération + charte, compte obligatoire, display_name posé).
6. App native Android (Expo, FCM), PWA en pont. Apple Sign-In si iOS.

## Règle absolue — Header & menu (source unique)
Il existe UN SEUL header mobile normal et UN SEUL header PC normal, injectés par un composant/script
partagé (pas de HTML dupliqué par page). Toute nouvelle page DOIT utiliser ce composant, jamais
une variante recopiée. Exceptions uniquement sur la home (dashboard) : 3e ligne mobile, 2-3e ligne PC.
Voir docs/header-spec.md pour le détail figé.
HEADER — SOURCE UNIQUE (acquis, ne pas re-diverger) : le header hors-home est
injecté ENTIÈREMENT par js/header.js. Les pages hors-home ne contiennent qu'une
ancre <header><div class="wrap nav"></div></header> — AUCUN header statique, AUCUN
logo en dur. Le logo (LOGO_HTML dans header.js, avec ligature SVG) est la source
unique et alimente aussi le menu mobile (buildMenu). 1re ligne PC identique partout :
Ma collection · ♥ Favoris · Se connecter|Mon compte (auth via LBASession.renderHeader)
· thème. Pas d'OpenAlert dans nav-right (footer + menu mobile seulement). Le Point
retiré du header desktop (media query >720px), présent dans le menu mobile.
Exceptions : la HOME garde son header propre (index.html + mobile-header.js : 2e/3e
ligne catégories, KPI, condensation scroll m-scrolled) — dette assumée, 1re ligne
alignée à la main ; connexion.html et offline.html sont volontairement sans header.
Header mobile hors-home = body.m-secondary (hamburger + recherche). Pour ajouter une
page : charger theme.js + session.js + header.js, ne mettre qu'une ancre de header.

## Géoloc IP & département (tranché — NE PAS y revenir sans élément nouveau)
Pré-remplissage AUTO du département RETIRÉ (geoip-lite : `area` mesure la confiance, pas
l'exactitude — Gap→Champs-sur-Marne/93 area 20, faux de ~600 km). Département = saisie
manuelle uniquement. Le pays auto (countryFromIp) reste, fiable. Plus-proche-voisin sur
101 centroïdes conservé dans server/departements-geo.js (débranché, réutilisable si un
jour la source d'entrée est fiable). Colonnes country_source/departement_source ('auto'
inscription | 'manual' Mon compte | NULL inconnu) posées pour traçabilité future.
PISTE IPv6 ABANDONNÉE : l'IPv6 abonné géolocalise bien mieux (IPLocate met l'IPv6 de Gap
en 05), MAIS Railway ne fait PAS d'inbound IPv6 — l'endpoint *.up.railway.app n'a AUCUN
AAAA (vérifié : A=69.46.46.115, AAAA absent), et la doc/forum confirme « public inbound
connections still use IPv4 ». Le serveur ne verra donc jamais l'IPv6 du visiteur. Seule
voie pour ressusciter la piste : mettre Cloudflare (ou équivalent) en frontal — chantier
DNS/archi séparé, pas un lot Claude Code. IPLocate free = pas de champ de précision (donc
pas de garde-fou type `area`) → non intégrable seul même en IPv4. Middleware diag
temporaire LOG_CLIENT_IP=1 dans index.js désormais SANS OBJET (à retirer au prochain
nettoyage — il ne montrera jamais que de l'IPv4).