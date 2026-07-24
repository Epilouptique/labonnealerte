# LaBonneAlerte — État du projet (24 juillet 2026, fin de fil "apex, dons, emails & UX")

Ce document fait foi pour tout nouveau fil. Il remplace toute version antérieure d'etat-projet.md (fichiers du projet Claude Chat ET .claude/ côté VS Code — synchroniser les deux ; pas de synchro automatique, remplacer la copie Claude Chat à la main).

## Le projet en une phrase

labonnealerte.fr (URL canonique = apex ; www redirige en 301) — le kiosque francophone d'alertes utiles : ~240 sources actives prêtes à l'emploi, activables en un clic, gratuites, open source, anti-spam par ADN. Standard ouvert OpenAlert v2 paramétrée (champ params). Public : francophonie entière (métropole, outre-mer, Québec, Belgique/Suisse, diasporas, expatriés). Édité par Hugo Vial-Jaime (Dahu Concept, Gap). Projet frère : DoomName (doomname.com), même compte Railway, première source externe paramétrée du kiosque.

## État du produit (~240 sources actives en prod ; 241 enabled dont 1 orphelin spotify à purger — voir Dette)

> Inventaire détaillé et à jour du cycle "vagues" (juillet) : **rapports/synthese-etat-alertes-2026-07-23.md** (source de vérité des sources, familles + écartées + clés API). Les sections thématiques ci-dessous décrivent le socle historique ; le bloc VAGUES 2026 (fin de section) résume les ~56 ajouts.

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

ÉCARTÉES documentées (= liste de courses si un flux apparaît) : alerte-enlèvement (RSS officiel 404, diffusion médias/FR-Alert only), grèves, ZFE (légalement instable — seuls Paris/Lyon certains), séries (agrégateurs only), OMS/USPPI, INES nucléaire, Téléray, Reddit (OAuth requis), don-du-sang (ni bulk ni INSEE — API Carto EFS searchnearpoint lat/lon non contractuelle = seule voie), moustique-tigre, foire-aux-vins, nuit-des-chercheurs 2026 (pas de financement UE), MaPrimeRénov (ouvertures réactives au budget, pas de calendrier), sargasses, conseils-voyageurs, stations 05, nappes, baignade, jackpot, taux-immobilier, delais-titres, statuts opérateurs télécom, saisons-astronomiques (doublon fetes-laiques). NOUVEAU (cycle vagues) : veille-artiste-spotify (Developer Mode Spotify durci fév. 2026 → remplacée par Deezer ; fichier supprimé, LIGNE DB ORPHELINE À PURGER), sfr-box (doublon SHA-256 sfr-red-mobile), WHO DON (RSS 404), Marie Curie / Four Colors / Dolly (pas de jalon rond dans la fenêtre), streaming phase 2 Spotify/Disney+/… (SPA anti-bot → headless requis).

VAGUES 2026 (21-24 juil, ~56 sources ajoutées/refondues, display_order ≥ 384 — détail exhaustif : rapports/synthese-etat-alertes-2026-07-23.md). Familles :
- GÉO fine : qualite-air + pollens (Atmo France, attribution visible), vagues-submersion, veille-hydrometrie (station+seuil), ours-pyrenees (P dépt) ; COMMUNE (résolveur nom→INSEE/coords) : eau-potable-commune, catnat-commune, traditions-locales, marathons-villes, iss-passages (commune libre via coords, ex-enum 16 villes).
- VEILLE D'ÉTAT IMPRÉVISIBLE (cœur de cible, anti-rétroactif systématique) : veille-page, veille-stock, veille-entreprise, veille-boamp (marchés publics), crypto-seuil (paire+seuil), veille-emploi (France Travail), veille-twitch (Helix), veille-legifrance (JO), veille-arxiv, domaine-disponibilite, domaine-securite (URLhaus), hausse-tarif-operateur (hash-diff PDF FAI), hausse-tarif-streaming (Netflix/Deezer).
- SCIENCE : eruption-volcanique (GVP), exoplanete-habitable (NASA TAP), retraction-article (Crossref/Retraction Watch), ondes-gravitationnelles (GraceDB, + mécanisme de CORRECTION/rétractation), fete-science maj, grands-anniversaires +3 jalons.
- CONSO/CULTURE/ADMIN/OM : IPC alim, immo ancien, actus service-public, UFC-Que Choisir, ANSM, veille-artiste-deezer (remplace Spotify), grands-concerts, fashion-week, conventions-manga, actualisation/recensement/CFE/bourses/Crous/Parcoursup/CAF, commémorations + soldes + tours cyclistes outre-mer.

## OpenAlert v2 (acquis, chantier terminé)

params enum|string|number, un param plat, multiple ; rétrocompatible (sans params = broadcast v1). DB : subscriptions.params + index unique d'expression, source_param_states (état par combinaison — SEULES LES COMBINAISONS SOUSCRITES sont calculées, rien d'autre n'existe en base), sources.params_schema, subscriptions.muted (pause sans désabonnement, filtré aux destinataires only). Poller : checkWithParams(combinaisons souscrites), transitions factorisées (decideTransition pure), libellés résolus partout, épisodes since≥24h. UI générique pilotée par params_schema (chips + « + ajouter » cyclique — exclusion mutuelle param-add/param-form corrigée par .param-add[hidden]). Pages statut : onglets d'instances + sélecteur + ?param=X. Fusions à zéro perte (pattern : migration idempotente + report d'état/since + enabled=false réversible + 301). Polling externe (safe-fetch SSRF, EXTERNAL_MAX_COMBOS=20, allSettled, round-robin). DoomName externe paramétrée (www.doomname.com/alert.json — apex doomname.com cassé côté Railway Domains, www suffit).

Acquis d'architecture cycle vagues (réutilisables) : (1) FRONT MULTI-CHAMPS — cards.js/site.js rendent un contrôle par descripteur params_schema (fields.map) et collectent tout au submit, rétrocompatible 1-champ ; débloque seuil+cible (crypto-seuil, veille-hydrometrie). Types : enum|string|number|commune|commune-coords. (2) RÉSOLVEUR COMMUNE — server/sources/lib/commune-insee.js : nom→INSEE (désambiguïsation dépt) et nom→{lat,lon}, résolu À LA SOUSCRIPTION (jamais au poll) via geo.api.gouv.fr, caches mémoire permanents ; branché dans routes/myalerts.js (toggle-param). (3) PATTERN VEILLE D'ÉTAT IMPRÉVISIBLE + anti-rétroactif : id stable par item, 1er cycle = amorçage SANS alerte, seul un id jamais-vu déclenche, échec → inactive (jamais de faux positif). (4) OAUTH2 client_credentials factorisé (rte/francetravail/twitch/legifrance-auth.js — token cache mémoire, renew -5min ; corps vs en-tête). (5) HASH-DIFF lib/hash-diff-html.js + hash-diff-pdf.js (denoise puis hash, on ne lit jamais le contenu). (6) ATTRIBUTION licence VISIBLE dans le message de notif (Atmo France/AASQA), pas qu'en commentaire.
DETTE : le cache anti-rétroactif est en MÉMOIRE → perdu au redéploiement sur toutes les veilles d'état (un item apparu pendant l'arrêt peut être manqué, jamais inventé). Amélioration possible : persister la référence en base.

## Fonctionnalités produit

- Heures de veille : 23h-8h Paris défaut, différé + digest (deferred_notifications), tzdata vérifié. Limite : fuseau global — à adapter pour Québec/expat.
- Personnalisation : country/departement/region/ville/interests → boost tri + reco (reco jamais hors-département, jamais de source disabled). region/ville ajoutés (mêmes garde-fous que departement, visibles/éditables dans Mon compte, *_source 'auto'/'manual').
- Auto-remplissage 1re connexion : display_name (Google given_name / GitHub name / email → collision Hugo2..8) ; pays par geoip-lite local ; departement/region/ville par IPLocate (voir section « Géoloc IP »). clientIp() : cf-connecting-ip (Cloudflare, vérifié par ORIGIN_SECRET) en priorité, sinon x-forwarded-for premier IP PUBLIC (Railway CGNAT 100.64/10). RGPD en confidentialité.
- Pré-remplissage géo sur cartes paramétrées : pour un schéma clé departement/region/pays/ville, le contrôle (select/input) est pré-rempli depuis le profil (pas de chip séparée). GÉO : switch « S'abonner » visible mais OFF, activation UNIQUEMENT au clic (jamais au pré-remplissage). NON-GÉO : switch visible mais disabled tant que vide, activation immédiate au choix/saisie (comportement d'origine). Une fois abonné, interrupteur pause/reprise (toggle-mute) = pause sans perdre le paramètre (distinct de la suppression d'instance). Seul le département matche une source aujourd'hui (region=Québec only, pays=slugs diaspora, ville=slugs iss/INSEE) → prefill générique, rien de faux affiché.
- Likes + Favoris : table favorites + /favoris + sync montante localStorage→serveur + cœur header. Limite : sync descendante multi-appareils absente.
- « Les plus populaires » (ex-Sélection, top-12 likes public, slug interne 'selection' conservé) + « Nouveautés ».
- Collections : 7 packs officiels (étagère carrousel infini + fondu bords, adoption 1 clic idempotente, params résolus profil>pack>à compléter, sources dormantes auto-incluses à l'activation) + Decks utilisateurs (10 max, 24 motifs SVG + 11 teintes — UN SEUL CSS partagé toutes pages, partage lien non-listé token 128 bits révocable, fork-copie avec attribution figée, pseudo public display_name unique « Mon pseudo », signalements 3 IP → suspension auto, remontée Robot 1). « Ma collection » (abonnements) ≠ « Mes decks » (compositions). Avatar initiale.
- Soutien financier (EN PROD, actif) : dons PayPal + Ko-fi. Archi = endpoint GET /api/support-links (lit PAYPAL_DONATE_URL / KOFI_URL côté serveur, ne renvoie l'URL que si posée ET https://) + public/js/support.js (rendu conditionnel : bouton actif <a target=_blank rel=noopener> si variable posée, sinon <button disabled> « bientôt » ; activation INDÉPENDANTE par service). Posées sur Railway : paypal.me/labonnealerteFR + ko-fi.com/labonnealerte. 3 emplacements synchronisés (soutenir.html + index.html ×2, data-label). Libellés : « Me soutenir avec PayPal » / « ☕ M'offrir un café » (icône café SVG inline, vapeur animée CSS pure dans site.css .sup-coffee, prefers-reduced-motion respecté). Widget externe Ko-fi REFUSÉ (dépendance tierce + rupture de charte). Mention « arrivent bientôt » retirée des textes.
- Le Point (/le-point) : « en ce moment » (broadcast actifs + agrégats paramétrés des combinaisons souscrites — assumé dans le libellé) + « à venir » 10 j (contrat upcoming() de calendar-factory, 72 sources ; paramétrées exclues — CHANTIER VALIDÉ EN ATTENTE : upcoming() toutes-combinaisons pour jours-feries + fetes-nationales). Cache 2 min, état calme assumé, pending exclus. Vitrine de lancement désignée.

## Audit & dette (audit-architecture.md à la racine, aucun 🔴 sécurité)

Lot 1 FAIT (index subscriptions(source_id) + partiel source_param_states actifs + import mort retiré — candidats favorites/deferred/reports écartés car déjà couverts). Lots 2-5 restants : migration npm/pypi sur release-factory, belgique/suisse sur lib/meteoalarm, découpe site.js (~1800 l.)/site.css (~2000 l.)/init.sql (~2500 l.), enum dépt dédupliqué, rate-limit /auth/*, 11 globals LBA*. À préserver : factories, contrat v2, idempotence, anti-spam.
DB vs CODE (vérifié 24/07) : migrate.js LANCÉ depuis le 23 — les 7 sources en attente (Deezer→ondes grav.) sont en base et enabled. RESTE : la ligne DB veille-artiste-spotify subsiste (enabled, fichier supprimé, absente d'init.sql) — migrate.js n'efface pas → DELETE manuel à faire (base 241 enabled = 240 réelles + 1 orphelin). Compteurs actuels : 268 lignes sources, 241 enabled, 58 paramétrées (57 hors orphelin).

## Corrections UX récentes & accessibilité

Faits (fil précédent) : cartes mobile (.wrap media query), pref-chips pleine largeur, « Mon pseudo », bouton header min-width 185px, mes-decks CSS unifié, param-add[hidden].
Faits (ce fil) : hero padding petits smartphones (≤400px) ; page /source responsive (manifeste JSON scrollable, .src-head compact) ; croix .src-back collection remontée mobile ; header une ligne hors home (body.m-secondary) ; /le-point aligné (header standard injecté, h1 centré, labels de section « En ce moment »/« À venir » qui se chevauchaient en ≥1280px corrigés) ; menu mobile : ligne thème retirée ; Mon compte réorganisé — section « Apparence » (thème clair/sombre + « Renforcer les contrastes »), liens morts « Mes decks »/« Proposer une source » retirés de Divers.
✅ RÉSOLU — MENU MOBILE SCROLL : le flip Menu⇄Catégories était un preserve-3d (couche 3D composée → contenu figé au scroll). Converti en glissement 2D translateX (m-menu-flip sans preserve-3d, m-menu-face = conteneur scrollable overflow-y:auto). Le flip 3D des CARTES kiosque (.card-inner) est intact.
✅ RÉSOLU — PARTAGE /mes-decks : decks.js utilise window.LBAShare.openModal (grande modale unifiée collection/deck), plus de lien brut.
ACCESSIBILITÉ : body.high-contrast (toggle Mon compte › Apparence, persistance localStorage lba-contrast, appliqué site-wide via theme.js/site.js). Règles CSS de contraste renforcé implémentées (overrides --muted/--line/--amber en light ET dark, ajustements par composant).
À vérifier post-déploiement : iss-passages en conditions réelles (un soir à Gap).
Pages de chargement : PAS de page unique — états locaux par page (.grid-loading home, .src-loading mes-decks/favoris/collection/deck), halo animé, reduced-motion respecté.

## Plateforme & infra

Express/PostgreSQL/Railway, poller */30 (runCycle ÉCRIT et notifie — JAMAIS depuis un agent), checked_at chaque passage, factories (vigilance/statuspage/calendar+upcoming/vacances/release/meteoalarm/insee-bdm), briques lib/ (feed-parser, prefectures, safe-fetch, ugc), geoip-lite local. Comptes : magic link + OAuth Google/GitHub (PAS d'autre fournisseur — décision actée ; Apple seulement si app iOS un jour), sessions 90j, suppression cascade. Notifs : Resend + push VAPID (PWA installable).
URL CANONIQUE = APEX (basculé ce fil) : labonnealerte.fr officielle, www redirige en 301 via Cloudflare Redirect Rule (query string PRÉSERVÉE — indispensable aux liens magiques ?token=). Toutes les refs en dur basculées (og:url server-rendered deck/collection/source, liens de partage JS, mailer PUBLIC_SITE+MYALERTS_URL, poller/webpush fallback, sources url par défaut, README, .env.example). BASE_URL Railway = apex ; consoles OAuth Google/GitHub mises à jour (redirect_uri apex, anciennes URI www retirées). DNS : enregistrement @ Cloudflare = CNAME Railway (connexion auto Railway), plus de A OVH 213.186.33.5. Sessions token en localStorage per-origin (lba-token) → les connectés sur www repassent par un magic link après bascule (désagrément mineur, session serveur 90j intacte).
EMAILS — identité expéditeur (mailer.js) : domaine d'envoi TECHNIQUE reste alert.labonnealerte.fr (reco Resend : isoler la réputation d'envoi sur un sous-domaine dédié — NE PAS basculer vers le domaine racine). Compensation cohérence : From = 'LaBonneAlerte <noreply@alert.labonnealerte.fr>' (constante FROM partagée) + tous les sujets préfixés « LaBonneAlerte · » (helper subject() partagé, 4 types : confirmation, lien magique, alerte, digest veille) ; suffixes redondants « à La Bonne Alerte » retirés des transactionnels (sujets < ~40 car., anti-troncature mobile).

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

1. Chantier upcoming() public (toutes-combinaisons jours-feries + fetes-nationales) + passes à clés. (Points UX menu mobile scroll + partage mes-decks : CLOS.)
2. ONBOARDING première visite (dernier volet densité : 3 questions dans le hero → grille personnalisée avant connexion → packs suggérés — cadrage fait, jamais lancé).
3. LANCEMENT (chantier jamais ouvert — discussion stratégique à avoir : README, ~~dons /soutenir à activer~~ FAIT (PayPal+Ko-fi en prod), RGPD final, /le-point en vitrine, canaux : communautés dev pour OpenAlert, locales pour vigilances, activer Robot 3). Le produit est prêt pour des yeux extérieurs.
   POSITIONNEMENT vs apps municipales (PanneauPocket/IntraMuros/Illiwap, exploré 24/07) : PAS des concurrents directs. Leur contenu = rédigé à la main par chaque mairie (payant 180€/an+), hyper-local, non structuré, zéro paramétrage fin côté habitant. LBA = agrégation machine de sources officielles nationales/thématiques, gratuit, open source, paramétrable → complémentaire, pas substituable (pas de flux ouvert exploitable côté leur contenu). Pitch : « PanneauPocket = la vie de votre commune racontée par votre mairie ; LaBonneAlerte = tout le reste ». Marché validé : 48% des Français utilisent une app officielle de collectivité (+39 pts depuis 2013, Epiceum/Harris 2024) → appétence prouvée. Opportunité LONG TERME (V3, PAS maintenant) : OpenAlert comme émetteur pour mairies (gratuit vs abonnement payant) — ne pas ouvrir avant le cœur de cible « veilles citoyennes ».
4. Lots 2-5 audit au fil de l'eau.
5. V3 « veilles citoyennes » (3 familles : datées d'abord — rappel-personnalise en préfigure la mécanique ; maintenues ; surveillées — veille-rss idem ; badge community, espace séparé, pré-modération + charte, compte obligatoire, display_name posé).
6. App native Android (Expo, FCM), PWA en pont. Apple Sign-In si iOS.

## Prochain fil
(a) Fonctionnement et apparence des CARTES et surtout des DECKS (comportement + visuel — relire d'abord identite-visuelle-reference.md). Puis (b) DÉBRIEFING STRATÉGIQUE : étapes à venir, opportunités, liste de changements mineurs à trancher. Nettoyages à ne pas oublier : purge de la ligne DB orpheline veille-artiste-spotify (DELETE, migrate.js ne supprime pas), retrait du middleware diag IP dormant (LOG_CLIENT_IP), backlog visuel.

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

## Règle absolue — Identité visuelle (source unique, même statut que le header)
rapports/identite-visuelle-reference.md = document de référence du visuel (audit complet :
tokens couleur, radius, typo, composants, motion, assets + erreurs classées par priorité).
Doit être TENU À JOUR et RELU avant toute création/modification de page ou d'élément visuel,
et sert de base pour ouvrir les fils de discussion sur le visuel. But : mettre fin aux
corrections graphiques manuelles récurrentes après chaque création. Règle d'or : aucune couleur
en dur (toujours un token var()), radius 24px cartes / 999px pilules, titres via .page-title
(Baloo 2), prefers-reduced-motion partout.
BACKLOG VISUEL (chantiers ouverts identifiés par l'audit, à traiter dans un futur lot dédié) :
doublon composant .sup-btn (redéfini inline dans soutenir.html alors que présent dans site.css) ;
.page h1 maison (Inter) vs token .page-title (Baloo 2 centré) sur pages éditoriales ; token
--danger manquant (#dc2626 répété ~10× en dur) ; .sup-block radius 20px (≠24px) ; bloc .page
copié-collé dans 3 fichiers à factoriser ; offline.html hors design-system ; fond-constellations
« - Copie.svg » résiduel à supprimer.

## Géoloc IP & département (RÉSOLU via Cloudflare + IPLocate — historique figé)
Parcours complet (ne pas rejouer les impasses) :
1. geoip-lite ABANDONNÉ pour le département : `area` mesure la confiance, pas l'exactitude
   (Gap→Champs-sur-Marne/93, area 20, faux de ~600 km). Un seuil `area` ne fiabilise rien.
2. IPv6 (plus précise) d'abord BLOQUÉE : Railway ne fait pas d'inbound IPv6 sur son edge
   public (endpoint *.up.railway.app sans AAAA ; « public inbound connections use IPv4 »).
3. BASCULE Cloudflare en frontal (DNS migré depuis OVH ; SSL Full strict ; apex
   labonnealerte.fr fonctionne maintenant SANS www). Cloudflare transmet cf-connecting-ip
   (vraie IP visiteur, IPv4 ou IPv6).
4. SÉCURISATION : ORIGIN_SECRET (var Railway) + Transform Rule Cloudflare injectant
   X-Origin-Secret. clientIp() ne fait confiance à cf-connecting-ip QUE si
   x-origin-secret == ORIGIN_SECRET (sinon repli x-forwarded-for filtré CGNAT) → empêche
   la falsification via l'URL Railway directe. Avertissement throttlé si tentative.
5. RÉSOLUTION FINALE : IPLocate (postal_code EXACT → département ; subdivision → region ;
   city → ville, en UN appel non bloquant, timeout court, clé IPLOCATE_APIKEY). Dérivation
   postal→dept dans profile-autofill.js (métropole 2 chiffres, Corse 2A/2B par plage,
   DROM 971..976), validée par isValidDepartement. Toujours « vide > faux » (hors FR /
   postal manquant / IPLocate down → NULL). Écriture profil UNIQUEMENT (departement/region/
   ville + *_source='auto'), JAMAIS dans subscriptions/source_param_states → aucune
   activation d'alerte automatique. Champs éditables dans Mon compte (→ *_source='manual').
Colonnes : country/departement/region/ville + *_source ('auto' inscription | 'manual' Mon
compte | NULL inconnu ; autofill ne remplit que si valeur NULL ET source NULL → un champ
vidé à la main n'est jamais re-deviné). server/departements-geo.js (plus-proche-voisin 101
centroïdes) reste DORMANT (postal exact d'IPLocate suffit), conservé pour usage futur.
⚠️ Middleware diag temporaire dans index.js (LOG_CLIENT_IP=1 → [ip-diag] + [ip-geo-diag])
TOUJOURS EN PLACE (dormant par défaut) — à retirer au prochain nettoyage.