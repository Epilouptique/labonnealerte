# Phase 1b (v2) — Découverte d'alertes « appli / newsletter à remplacer » — 12/10/2026

Aucun code, aucun commit, aucune base touchée. Recherche réelle par 4 agents web (≈150 requêtes / pages).
Notation des preuves : **P** = page/flux ouvert et réponse lue ; **R** = extrait du résultat de recherche seulement (page non ouverte).

## Bilan honnête d'abord

- 127 pistes brutes trouvées (Passe 1 : 85 ; Passe 2 : 30 applis, dont 14 restées « non vérifié »). Cible ~100 : atteinte.
- **Aucun témoignage « j'ai installé l'appli juste pour… » trouvé en français.** Seul témoignage d'usage unique : avis anglais sur PC Games Radar (« I only use Epic when their stuff goes free », R). Le gain 1/2 est donc **mon interprétation**, pas la parole des utilisateurs.
- Après Passe 4 : **20 candidates NOUVELLES** passent le critère (≥ 15 → pas de retour obligatoire en Passe 1), mais **moins que les 25 demandées**, et seulement **8 ont une source testée qui répond**. Les CGU n'ont été lues que pour 2 sites (HIBP, Dealabs). Passe 3 donc **incomplète** — voir « Reste à faire ».
- Le catalogue est déjà très couvrant : 17 pistes fortes sont des DOUBLONS.

## Tableau

| # | Appli / newsletter remplacée | Événement unique | Gain | Statut | Source + preuve | robots / CGU | Activité mesurée | Slug proposé | Titre — description (≤120 c.) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Appli PlayStation / blog PS | Jeux PS Plus du mois annoncés | 2 | **NOUVELLE** | P `blog.fr.playstation.com/tag/playstation-plus/feed/` → « Les jeux du mois PlayStation Plus d'octobre : F1 25, Hunt: Showdown 1896… » (30/09/2026) | robots : `/tag/…/feed/` non interdit, `Crawl-delay: 5` / CGU non lues | 12/an (+ catalogue) | `ps-plus-jeux-mois` | Jeux PS Plus du mois — Les jeux offerts aux abonnés PS Plus dès leur annonce, sans ouvrir l'appli PlayStation. |
| 2 | Appli Xbox | Nouvelle vague Game Pass | 2 | **NOUVELLE** | R `news.xbox.com/fr-fr/feed/` lu une fois par l'agent 1A (« Prochainement dans le XBOX Game Pass… » 15/09) ; **bloqué Cloudflare** pour l'agent 4 | non lu (Cloudflare) / non lues | ~2 vagues/mois (presse) | `game-pass-ajouts` | Nouveautés Game Pass — La liste des jeux qui arrivent dans le Game Pass, deux fois par mois. |
| 3 | Appli Prime Video / Prime Gaming | Jeux PC offerts du mois | 1 | **NOUVELLE** | R journaldugeek.com 09/10/2026 : 10 jeux, livrés les 1, 8, 15, 22, 29/10 | **aucune source officielle testée** | 10 jeux en oct. 2026 | `prime-gaming-jeux` | Jeux offerts Prime — Les jeux PC offerts aux abonnés Amazon Prime ce mois-ci. |
| 4 | Ubisoft Connect | Jeu offert à garder | 1 | **NOUVELLE** | R gameblog.fr : Ghost Recon (6-13/08/2026), For Honor (sept. 2026) | aucune source officielle testée | ≥2 en 2026 (R) | `ubisoft-jeu-offert` | Jeu offert Ubisoft — Un jeu Ubisoft à garder gratuitement : prévenu avec la date limite. |
| 5 | Nintendo (appli / Switch) | Annonce d'un Nintendo Direct | 2 | **NOUVELLE** | R seulement (gamespot, exemple 2018) | non vérifié | non mesuré | `nintendo-direct` | Nintendo Direct — Prévenu dès qu'un Nintendo Direct est annoncé, avec l'heure française. |
| 6 | Newsletters cybersécurité | Fuite de données majeure | 1 | **NOUVELLE** (quasi `numerique-cyber`, qui n'est qu'un calendrier) | P `haveibeenpwned.com/api/v3/latestbreach` sans clé → `{"Name":"Neogen","AddedDate":"2026-10-09…","PwnCount":435963}` | robots : `/api/` non interdit / **licence CC BY 4.0 (attribution obligatoire)** | 130 fuites ajoutées en 12 mois, 54 ≥ 1 M comptes ; FR : PassSport 6,37 M, AUTOSUR | `fuite-donnees-majeure` | Fuite de données majeure — Une grosse fuite de comptes vient d'être confirmée : changez ce mot de passe. |
| 7 | Alertes taux de l'appli banque/bourse | Décision de taux de la BCE | 1 | **NOUVELLE** | P `ecb.europa.eu/rss/press.html` → « Meeting of 9-10 September 2026 » | robots : RSS non interdit, `Crawl-delay: 5` / CGU non lues | 8 réunions/an (prochaine 28-29/10) | `bce-taux-directeurs` | Taux de la BCE — La BCE monte, baisse ou maintient ses taux : prévenu le jour de la décision. |
| 8 | Newsletters immobilier/crédit | Nouveau taux d'usure | 1 | **NOUVELLE** | R banque-france.fr, legifiscal.fr (publication JO fin de trimestre) | non lu | 4/an | `taux-usure` | Taux d'usure — Le nouveau plafond des taux de crédit pour le trimestre, dès sa publication. |
| 9 | Appli Amazon | Annonce des dates du Prime Day | 2 | **NOUVELLE** (TODO vague 14) | R aboutamazon.eu publié le **02/06/2026** pour le 23-26/06 → **21 j de préavis** | robots aboutamazon.fr : `Crawl-delay: 10` ; pas de RSS / CGU non lues | 1-2/an (+ Big Deal Days 6-7/10, annonce non trouvée) | `prime-day` | Prime Day — Les dates du Prime Day dès leur annonce par Amazon, sans garder l'appli. |
| 10 | Applis Fnac/Darty/Cdiscount | French Days | 2 | **NOUVELLE** (écartée vague 12) | R clubic/sortiraparis : 29/04-05/05 et 07-14/09/2026 ; **aucune source officielle** | — | 2/an | `french-days` | French Days — Les French Days commencent : prévenu au lancement, sans les newsletters des enseignes. |
| 11 | Newsletter Ouigo | Vente flash Ouigo | 1 | **NOUVELLE** | P `ouigo.com/bons-plans` (« La newsletter OUIGO : pour ne rien louper des promos ! ») ; R ventes 2-3/09, janv. 2026 | non lu ; **pas de flux** | ≥2 en 2026 | `ouigo-vente-flash` | Vente flash Ouigo — Des billets Ouigo à petit prix pour 48 h : prévenu dès l'ouverture. |
| 12 | Newsletter Flixbus | Opération billets à 0,99 € | 1 | **NOUVELLE** | R vitepromo, bons-plans-malins | non lu ; pas de flux | non mesuré | `flixbus-promo` | Promo Flixbus — Une vente flash Flixbus est lancée : prévenu avant que tout parte. |
| 13 | Newsletter / appli Ryanair | Vente flash nationale | 1 | **NOUVELLE** | R corporate.ryanair.com (communiqués), connexionfrance (48 h dès 14,99 €) | non lu | non mesuré | `ryanair-vente-flash` | Vente flash Ryanair — Une vente flash Ryanair démarre : prévenu, sans l'appli. |
| 14 | Appli Air France / WhatsApp AF News | Ventes flash Air France | 1 | **NOUVELLE** | R wwws.airfrance.fr (AF News WhatsApp) | non lu | non mesuré | `air-france-promo` | Promo Air France — Les ventes flash Air France dès leur lancement. |
| 15 | Applis enseignes / UGC | Fête du Cinéma (5 €) | 1/2 | **NOUVELLE** (quasi `sorties-cinema-majeures` ; « printemps du cinéma » en TODO) | P cnc.fr : 28/06-01/07/2026, publié le 25/06 (**3 j de préavis seulement**) | non lu | 1/an (+ Printemps du cinéma) | `fete-du-cinema` | Fête du Cinéma — La séance à 5 € pendant 4 jours : prévenu dès l'annonce. |
| 16 | Newsletters musées | Nuit européenne des musées | 1 | **NOUVELLE** (TODO vague 14) | R culture.gouv.fr : 23/05/2026 | non lu | 1/an | `nuit-des-musees` | Nuit des musées — Une nuit de musées gratuits partout en France : prévenu avant. |
| 17 | Newsletters musées | 1er dimanche gratuit (musées nationaux) | 1 | **NOUVELLE** | R finestresullarte (reprise au 6/10) | non lu ; calculable | 12/an (selon saison/musées) | `musees-dimanche-gratuit` | Musées gratuits dimanche — Le 1er dimanche du mois, des musées nationaux gratuits : rappel la veille. |
| 18 | Appli impots.gouv | Avis d'impôt disponible | 2 | **NOUVELLE** | R economie.gouv.fr (calendrier) | non lu | 1/an (étalé) | `avis-impot-disponible` | Avis d'impôt en ligne — Votre avis d'impôt arrive dans l'espace particulier : prévenu des dates. |
| 19 | Appli impots.gouv | Ouverture de la déclaration de revenus | 2 | **QUASI** `echeances-fiscales` (ne couvre que foncière / TH secondaire) | R toutsurmesfinances : ouverte le 09/04/2026 | non lu | 1/an | `declaration-revenus-ouverture` | Déclaration de revenus — Le service de déclaration ouvre : prévenu le jour J et avant chaque date limite. |
| 20 | Newsletters énergie | Prix repère du gaz CRE (mensuel) | 1 | **QUASI** `energie-tarifs` (électricité seule) | R cre.fr PDF du 10/06/2026 (illisible via l'outil) | robots cre.fr `Allow: /`, `Disallow: /recherche` | 12/an | `prix-repere-gaz` | Prix repère du gaz — Le prix repère du gaz du mois, dès sa publication par la CRE. |
| 21 | Newsletter La Poste / Moneyvox | Hausse du timbre au 1er janvier | 1 | **QUASI** `hausses-tarifs` (péages ; timbre en TODO) | R moneyvox : lettre verte 1,52 € au 01/01/2026 | non lu | 1/an | `prix-timbre` | Prix du timbre — Le nouveau prix du timbre dès son annonce, avant la hausse de janvier. |
| 22 | Appli Lidl Plus | Catalogue de la semaine | 2 | **NOUVELLE** (faible) | R bonial.fr (agrégateur) ; pas de source officielle | non lu | 52/an | `lidl-catalogue` | Catalogue Lidl — Le catalogue Lidl de la semaine, sans les notifications de l'appli. |
| 23 | Appli Steam | Week-end gratuit / jeu à garder | 1 | **NOUVELLE** (écartée vague 12) | R steamcommunity, steamdb.info/upcoming/free (non ouvert) | steamdb robots `Allow: /` | non mesuré | `steam-jeu-garder` | Jeu Steam à garder — Un jeu Steam gratuit à garder pour toujours : prévenu avec l'échéance. |
| 24 | Humble Choice (newsletter) | Jeux du mois | 1 | **NOUVELLE** (payant → faible) | R chocobonplan (1er mardi du mois) | non lu | 12/an | `humble-choice` | Humble Choice du mois — Les jeux du Humble Choice dès leur révélation. |
| 25 | Applis opérateurs | Panne nationale d'un opérateur | 1 | **QUASI** `pannes-services` (à vérifier : périmètre opérateurs) | R zoneadsl (carte Arcep), statut-services | non lu | non mesuré | `panne-operateur` | Panne opérateur — Grosse panne chez Orange, SFR, Free ou Bouygues : prévenu et rassuré. |
| — | Epic Games Store | Jeu gratuit de la semaine | 1 | DOUBLON `epic-jeu-gratuit` | P `freeGamesPromotions` → Out of Sight 08→15/10/2026 (non documenté) | robots 404 ; CGU 403 | 52/an | — | — |
| — | GOG Galaxy | Giveaway 48 h | 1 | DOUBLON `gog-jeu-offert` | R actugaming | — | — | — | — |
| — | Steam | Grandes soldes | 2 | DOUBLON `soldes-steam` | P flux `/feeds/news/app/593110/?l=french` → « C'est parti pour les soldes d'automne ! » | non lu | 6 annonces août-oct. 2026 | — | — |
| — | MySelectra / SMS EDF | Jour Tempo rouge | 1 | DOUBLON `tempo` | P api-couleur-tempo.fr (non officiel) | robots 404 ; licence non trouvée | 22 j rouges/saison | — | — |
| — | Appli EcoWatt | Signal rouge | 1 | DOUBLON `ecowatt` | R tomsguide, moneyvox | — | — | — | — |
| — | Newsletters épargne | Taux Livret A / LEP | 1 | DOUBLON `taux-livret-a` | P banque-france.fr | — | 2/an | — | — |
| — | Appli RappelConso | Rappel produit | 1 | DOUBLON `rappel-conso` | P API data.economie.gouv.fr : 3 624 rappels en 12 mois | **robots `Disallow: /api/`** ⚠ | ~10/jour | — | — |
| — | Enseignes | Soldes légales | 1/2 | DOUBLON `soldes` | P entreprises.gouv.fr | — | 2/an | — | — |
| — | Enseignes | Black Friday | 2 | DOUBLON `black-friday` | R icalendrier | — | 1/an | — | — |
| — | Newsletters culture | Journées du patrimoine | 1 | DOUBLON `journees-patrimoine` | R | — | — | — | — |
| — | chequeenergie.gouv.fr | Campagne d'envoi | 1 | DOUBLON `cheque-energie` | R lafinancepourtous | — | 1/an | — | — |
| — | Appli Caf | Date de versement | 2 | DOUBLON `versement-prestations-caf` | R caf.fr PDF | — | 12/an | — | — |
| — | Lettre Service-Public | Actualités | 1 | DOUBLON `service-public-actualites` | P flux RSS officiel | robots : RSS non interdit | plusieurs/jour | — | — |
| — | Applis opérateurs | Hausse tarif box | 2 | DOUBLON `hausse-tarif-operateur` | R selectra | — | — | — | — |
| — | SNCF Connect | Ouverture des ventes | 2 | DOUBLON `ouverture-ventes-sncf` (config vide, voir §SNCF) | R seulement | robots 403 DataDome | 3/an | — | — |
| — | Appli Bison Futé | Journée rouge/noire | 1 | DOUBLON `bison-fute` | R | — | — | — | — |
| — | OVPF | Éruption Piton de la Fournaise | — | DOUBLON `eruption-volcanique` | R PDF ipgp.fr | ipgp.fr hors délai | 1 éruption, 3 épisodes en 2026 | — | — |

## Réévaluation imposée

| Piste | Verdict | Phrase d'admission / raison |
|---|---|---|
| PlayStation Plus mensuel | **PASSE** (n°1) | « …peut couper les notifications de l'appli PlayStation, parce que cette carte lui donne la seule information qu'il en attendait : les jeux du mois. » Flux officiel par tag, filtre titre « jeux du mois ». |
| Game Pass | **PASSE le critère, faisabilité ouverte** | « …peut couper les notifications de l'appli Xbox… » ; flux Xbox Wire bloqué par Cloudflare au 2e essai. |
| Vaccination grippe/Covid | **NE PASSE PAS** | Aucune appli/newsletter nommée à remplacer ; l'Assurance Maladie écrit déjà aux publics à risque (campagne 13/10/2026). Déjà écarté vague 14. |
| Fuite majeure (HIBP) | **PASSE** (n°6) avec filtre ≥ 1 M comptes ou domaine .fr | « …peut se désabonner des newsletters cybersécurité… ». Limite à dire au public : ne dit pas si *son* compte est touché. CC BY → citer HIBP. |
| Dealabs « deal du moment » | **NE PASSE PAS** | Flux continu, pas une information unique : personne ne désinstalle Dealabs pour ça. |
| Volcan de La Réunion | **NE PASSE PAS (doublon)** | `eruption-volcanique` existe ; FR-Alert/préfecture couvrent localement ; aucune appli nommée. |
| BCE | **PASSE** (n°7) | « …peut couper les alertes taux de son appli bancaire/boursière… ». Flux en anglais, filtrer « Monetary policy decisions ». |
| Statut Epic | **NE PASSE PAS** | Technique, Fortnite prévient déjà ses joueurs. (`/history.rss` existe, `Disallow: /api/`.) Le *jeu gratuit* Epic, lui, passe mais est DOUBLON. |

## Points déjà identifiés

**Dealabs** — `server/sources/lib/dealabs-promo.js:21` appelle bien `https://www.dealabs.com/search?q=…` alors que le robots.txt contient `Disallow: /search` (confirmé, ainsi que `/rest-api/`, `/graphql`, `/*?merchant-id=*`). **Non conforme, non touché.**
Flux autorisés qui répondent : `/rss/tendance` (= `/rss/hot`), `/rss/nouveaux`, `/rss/codes-promo`, `/rss/discussions`. Introuvables : `/rss/marchand/leboncoin`, `/rss/groupe/…` (404).
Chemin conforme côté robots : filtrer `/rss/nouveaux` (+ `/rss/codes-promo`) sur « leboncoin » + « 0,99 ». **Mais CGU Dealabs** (`dealabs.com/cgu`) : est abusif de « reproduire, copier, mettre à la disposition de tiers… les Offres de la Plateforme sans autorisation ». N'envoyer que notre propre phrase + lien = zone grise → **décision Hugo**.
Côté Leboncoin : robots.txt « It's forbidden to use search robots or other automatic methods to access Leboncoin.fr » ; newsroom leboncoingroupe.com ne parle pas des promos. **Aucune source officielle conforme.**
⚠ Signal à ne pas perdre : la promo est à **0,99 €** (pas 1 €), et plusieurs sources (R) disent qu'elle est **envoyée compte par compte** aux comptes éligibles → pas forcément universelle.

**Temps forts commerciaux (forme réactive)** — Prime Day : annonce officielle aboutamazon.eu le 02/06/2026 pour le 23/06 → **21 jours**, faisable en réactif (pas de RSS : surveiller la page). Prime Big Deal Days 6-7/10/2026 : annonce officielle non trouvée. French Days : aucune source officielle trouvée (seulement presse). Black Friday : déjà au catalogue. Dates 2025 non vérifiées.

**ouverture-ventes-sncf** — sncf-connect.com et groupe-sncf.com renvoient **403 DataDome** (robots.txt illisible). Aucune page officielle de dates trouvée ; seulement presse : ouvertures 28/01, 11/03 et 30/09/2026. Délai d'annonce non mesuré. **Rien rempli.**

**Jackpot FDJ** — confirmé sans flux public : robots `Disallow: /api/` et `/apigw/` ; le sitemap news ne donne que les résultats de tirage, pas le montant du jackpot. Seules des API tierces (Apify). **Non retenu.**

## Pistes écartées

- Vinted (frais de port offerts) : promo envoyée à certains comptes, pas universelle.
- Leboncoin / Vinted (alertes de recherche, favoris) : paramètre personnel.
- Uber Eats, Deliveroo, McDonald's : seul l'événement utile est le suivi de commande, qui est personnel.
- Temu, Shein : bruit avéré (plaintes UE) mais aucun événement unique utile.
- SNCF « alerte réservation » d'un train : paramètre (trajet).
- TGV Max / MAX JEUNE : paramètre (trajet).
- Ticketmaster (ouvertures de vente) : paramètre (artiste) ; `billetterie-concerts` existe.
- Nintendo eShop (liste de souhaits) : paramètre.
- Lidl/Aldi arrivages Parkside : stock par magasin.
- Prix carburant par station : paramètre (lieu) ; robots `Disallow: /api/`.
- Vaccination grippe/Covid : aucune appli à remplacer, déjà adressée.
- Dealabs « deal du moment » : flux, pas un événement.
- Statut Epic : technique, déjà notifié par le jeu.
- Volcan Réunion : doublon et couvert par FR-Alert.
- Jackpot FDJ : pas de flux, incitation au jeu.
- SMIC : doublon `smic-revalorisation`, aucune appli nommée.
- MaPrimeRénov' guichet : pas de calendrier officiel (déjà écarté).
- Prime Big Deal Days : pas d'annonce officielle trouvée.
- Décathlon / Temu (désabonnement) : pas d'événement, juste du bruit.
- Code BlaBlaCar −50 % : code ponctuel, pas d'événement récurrent.
- PC Games Radar, extension Chrome « Free games » : ce sont des concurrents de `epic-jeu-gratuit`, pas de nouvelles sources.
- Lettre Service-Public complète : doublon.

## Reste à faire avant implémentation

1. CGU non lues : PlayStation, BCE, Epic, Amazon, Xbox, CNC, Steam. Robots non lus : Xbox (Cloudflare), Steam, CNC, culture.gouv, Ouigo, Ryanair.
2. Sources officielles à trouver pour n°3, 4, 5, 10, 12-14, 16, 22-24 (aujourd'hui presse seulement).
3. 20 NOUVELLES + 5 QUASI = 25 lignes, au lieu de ≥ 25 NOUVELLES : une 2e passe 1 ciblée (avis Play Store lus directement, 14 applis restées « non vérifié ») peut compléter si tu le veux.
4. Décisions Hugo : Dealabs `/rss/nouveaux` vs CGU ; robots `Disallow: /api/` de data.economie.gouv.fr (touche `rappel-conso` existant).
