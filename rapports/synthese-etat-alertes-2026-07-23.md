# LaBonneAlerte — Synthèse de l'état des alertes (2026-07-23)

> Document de référence autonome pour l'ouverture d'un nouveau fil de travail.
> Données extraites du code (`server/db/init.sql`, `server/sources/*`) et de la base
> de production (lecture seule) le 2026-07-23. Aucune donnée de mémoire.

---

## 0. Note de lecture importante : code vs base de production

Deux états coexistent et **ne sont pas identiques** :

- **Base de production (live)** : **234 sources `enabled`** (55 paramétrées, 179 broadcast).
- **Code (`init.sql`, état cible)** : **240 sources** — la base est **en retard** sur les dernières vagues.
  Les migrations ne sont **pas** lancées automatiquement ; les INSERT récents attendent le prochain `migrate.js`.

Concrètement, **7 sources sont dans le code mais pas encore en base** (Deezer, streaming, arXiv,
éruptions, exoplanètes, rétractations, ondes gravitationnelles), et **1 source doit être retirée de
la base** (`veille-artiste-spotify`, dont le fichier est déjà supprimé mais dont la ligne DB subsiste).
Ce rapport décrit **l'état cible du code** (la référence pour la suite), en signalant cet écart.

---

## 1. Résumé exécutif

- **~240 sources d'alerte actives** (état cible du code), dont **~55 paramétrées** (l'utilisateur choisit
  un département / une commune / un mot-clé / une URL…) et le reste en **broadcast** (une alerte pour tous).
- **Ce cycle de travail (21–23 juillet 2026) a ajouté ou refondu ~56 sources** (display_order ≥ 384) et,
  surtout, **plusieurs briques d'architecture réutilisables**.
- **Axes principaux de la vague :**
  1. **Géolocalisation fine** — sources par **région**, par **département**, et surtout par **commune**
     (résolveur nom → INSEE et nom → coordonnées).
  2. **« Veille d'état imprévisible » (cœur de cible)** — un motif générique : surveiller un état qui
     peut changer sans calendrier (page web, stock, entreprise, marché public, niveau de rivière, cours
     crypto, offre d'emploi, chaîne Twitch, texte au Journal Officiel…), toujours avec **anti-rétroactif**.
  3. **Intégrations d'API externes** — pattern **OAuth2 client_credentials** consolidé (RTE, France
     Travail, Twitch, Légifrance) + intégrations sans clé (Deezer, arXiv, Atmo France, NASA, GraceDB…).
  4. **Thème science** — fête de la science, anniversaires scientifiques, et 5 vraies alertes
     scientifiques (arXiv, volcans, exoplanètes habitables, rétractations, ondes gravitationnelles).
- **Refonte structurelle majeure** : le front des sources paramétrées est passé de **mono-champ** à
  **multi-champs**, débloquant les sources à plusieurs paramètres (ex. seuil + cible).

---

## 2. Changements structurels / architecture (réutilisables par les futures vagues)

### 2.1 Refonte front multi-champs (sources paramétrées)
Avant ce cycle, le front (`public/js/cards.js`, `public/js/site.js`) ne rendait et ne collectait
**qu'un seul champ** du `params_schema`. La refonte rend **un contrôle par champ** (`fields.map`) et
collecte tous les contrôles au submit, avec **rétrocompatibilité totale** (un schéma à 1 champ produit
exactement le rendu d'avant).
- **En bénéficient** : toute source dont `params_schema` a plusieurs descripteurs — ex. `crypto-seuil`
  (paire + seuil), `veille-hydrometrie` (station + seuil).
- **Pour une future source multi-champs** : déclarer plusieurs objets dans `params_schema`
  (chaque `{key,label,type,…}`) ; le front et `validateParams` (server/params.js) itèrent déjà dessus.
  Types de champ supportés : `enum`, `string`, `number`, `commune`, `commune-coords`.

### 2.2 Résolveur commune → INSEE / coordonnées (`server/sources/lib/commune-insee.js`)
Créé ce cycle. Convertit un **nom de commune saisi** en valeur canonique **à la souscription** (jamais au
poll), via l'API publique `geo.api.gouv.fr` :
- `resolveCommuneInsee(nom, dept)` → **code INSEE** (désambiguïsation par département). Type de champ `commune`.
- `resolveCommuneCoords(nom, dept)` → **{lat, lon}** encodées `"lat|lon|nom"`. Type de champ `commune-coords`.
- Caches mémoire **permanents** (la correspondance ne change jamais), cache secondaire INSEE→nom pour l'affichage.
- **Réutilisable** par toute future source à granularité commune : déclarer un champ `type:'commune'` ou
  `'commune-coords'` ; la résolution est branchée dans `server/routes/myalerts.js` (toggle-param).
- **Sources qui l'utilisent** : `eau-potable-commune`, `catnat-commune` (INSEE) ; `iss-passages` (coords).

### 2.3 Pattern « veille d'état imprévisible » avec anti-rétroactif systématique
Motif désormais standard pour toute alerte sans calendrier prévisible :
1. **Un identifiant stable** par item (id arXiv, CID Légifrance, DOI, `pl_name`, `superevent_id`, hash de page…).
2. **1er cycle = amorçage SANS alerte** : on mémorise l'ensemble courant comme référence (pas de remontée
   d'historique antérieur à la souscription).
3. **Cycles suivants** : seul un identifiant **jamais vu** déclenche.
4. **Dégradation silencieuse** : tout échec réseau/format → `inactive`, jamais de fausse alerte, jamais de crash.
- **Réutilisable** tel quel. **Limite connue** : le cache est en **mémoire** → un redémarrage ré-amorce la
  référence (on peut manquer un item apparu pendant l'arrêt, jamais en inventer un — direction sûre).

### 2.4 Pattern OAuth2 client_credentials (4 implémentations éprouvées)
Gestionnaire de token en cache mémoire, renouvelé 5 min avant expiration, jamais ré-authentifié par appel.
Deux variantes : identifiants **dans l'en-tête** (Basic Auth, ex. RTE) ou **dans le corps** (France Travail,
Twitch, Légifrance) ; Twitch exige en plus l'en-tête `Client-Id` sur chaque appel.
| Fichier | Créé | Service |
|---|---|---|
| `server/rte-auth.js` | avant ce cycle (11/07) | RTE (EcoWatt / Tempo) |
| `server/francetravail-auth.js` | **ce cycle (21/07)** | France Travail |
| `server/twitch-auth.js` | **ce cycle (21/07)** | Twitch Helix |
| `server/legifrance-auth.js` | **ce cycle (22/07)** | Légifrance / PISTE |
- **Pour une future intégration OAuth2** : cloner le fichier le plus proche (corps vs en-tête), adapter
  `TOKEN_URL`, `scope`, et les noms de variables d'environnement.

### 2.5 Libs de hash-diff (veille « Bison Futé » : on ne lit jamais le contenu, on compare un hash)
- `server/sources/lib/hash-diff-html.js` (**créé ce cycle**) — extrait le texte visible d'une page, neutralise
  les séquences dynamiques (« denoise »), puis hashe. Utilisé par `veille-page`, `veille-stock`, `hausse-tarif-streaming`.
- `server/sources/lib/hash-diff-pdf.js` (**créé ce cycle**) — même principe pour un PDF. Utilisé par
  `hausse-tarif-operateur` (grilles tarifaires FAI).
- **Réutilisable** pour toute « surveillance de changement » où l'on ne veut pas interpréter le contenu.

### 2.6 Autres conventions consolidées
- **`server/safe-fetch.js`** (pré-existant, étendu ce cycle avec `safeFetchJson`) — récupération anti-SSRF
  (IP privées interdites, pas de redirection, taille/temps plafonnés) pour toute **URL fournie par l'utilisateur**.
  Les sources à URL fixe de confiance utilisent `node-fetch` directement.
- **Attribution des sources dans le message** — quand une licence l'exige, la mention doit être **visible dans
  la notification** (ex. « Source : Atmo France / AASQA » sur `qualite-air` et `pollens`), pas seulement en commentaire.
- **Mécanisme de correction d'alerte** — `ondes-gravitationnelles` implémente une **rétractation** : si un
  événement déjà signalé est ensuite invalidé (label `ADVNO`), un message de correction est émis.

---

## 3. Inventaire des sources actives (par thématique)

> `[N]` = **nouveau ou refondu ce cycle** (display_order ≥ 384, ou modification structurelle notable).
> `P` = paramétrée, `B` = broadcast. Liste non exhaustive au niveau des ~180 sources broadcast historiques
> (statuts de services, fêtes, échéances…) : les familles sont résumées.

### 3.1 Géographie — région / département
- **Vigilance météo** (P) — vigilance Météo-France par département.
- **Qualité de l'air** (P) `[N]` — indice ATMO ≥ 4/6 par département (Atmo France).
- **Pollens & allergies** (P) `[N]` — taxon à risque élevé par département (Atmo France).
- **Vagues-submersion** (P) `[N]` — vigilance submersion littorale par département.
- **Restrictions d'eau / Risque sécheresse** (P) — arrêtés sécheresse (Vigieau).
- **Niveau de rivière** (P) `[N]` — hydrométrie (station + seuil).
- **Séismes près d'un département** (P) — complément du broadcast national.
- **Ours des Pyrénées** (P) `[N]` — observations/prédations par zone.

### 3.2 Géographie — ville / commune (granularité fine, résolveur INSEE)
- **Eau potable (commune)** (P) `[N]` — dernier contrôle sanitaire non conforme (Hub'Eau).
- **Catastrophe naturelle (commune)** (P) `[N]` — arrêté CatNat sur la commune.
- **Traditions & fêtes locales** (P) `[N]` — événements traditionnels par commune.
- **Marathons des grandes villes** (P) `[N]` — grandes courses urbaines.
- **Passage de l'ISS** (P) `[N modifié]` — passage visible au-dessus d'une **commune libre** (auparavant un
  enum de 16 villes ; désormais n'importe quelle commune via coordonnées).

### 3.3 Veille d'état imprévisible (« cœur de cible »)
- **Veille de page** (P) `[N]` — changement d'une page web (hash-diff).
- **Veille de stock** (P) `[N]` — retour en stock / rupture (heuristique best-effort, limitée sur les SPA).
- **Veille d'entreprise** (P) `[N]` — nouvel événement légal sur une entreprise.
- **Veille marchés publics** (P) `[N]` — nouvel avis BOAMP par mot-clé.
- **Seuil de prix crypto** (P) `[N]` — franchissement d'un seuil (paire + seuil).
- **Veille offres d'emploi** (P) `[N]` — nouvelles offres France Travail (mot-clé + département).
- **Chaîne Twitch en direct** (P) `[N]` — passage en direct d'une chaîne (batch Helix).
- **Veille juridique (Légifrance)** (P) `[N]` — nouveau texte au Journal Officiel par mot-clé.
- **Veille arXiv** (P) `[N]` — nouveau **preprint** par mot-clé (mention « pas encore relu par les pairs »).
- **Surveillance de domaine** (P) `[N]` — disponibilité d'un nom de domaine.
- **Réputation d'un domaine** (P) `[N]` — présence sur liste de menaces (URLhaus).
- **Grille tarifaire opérateur (FAI)** (P) `[N]` — changement de grille tarifaire (hash-diff PDF, 7 opérateurs).

### 3.4 Science (thème dédié)
- **Fête de la science** (B) `[N maj]` — édition 2026 confirmée (2–12 oct., « Saveurs savantes »).
- **Grands anniversaires** (B) `[N maj]` — +3 jalons scientifiques (Voyager 1 50 ans 2027, FIV/Louise
  Brown 50 ans 2028, pénicilline/Fleming 100 ans 2028).
- **Prix Nobel** (B) / **Prix Turing** (B) — semaines d'annonces.
- **Éruption volcanique** (B) `[N]` — nouvelle activité éruptive (rapport hebdo Smithsonian/USGS).
- **Exoplanète habitable** (B) `[N]` — nouvelle exoplanète potentiellement habitable (NASA, sous-ensemble rare).
- **Rétractation scientifique** (B) `[N]` — nouvel article rétracté (Retraction Watch via Crossref).
- **Onde gravitationnelle** (B) `[N]` — détection confirmée LIGO/Virgo/KAGRA (+ correction si rétractée).
- **Astronomie** (B) — rendez-vous du ciel, éclipses, pluies d'étoiles (Perséides, Géminides…), aurores,
  lancements spatiaux, astéroïde au plus près, tempête solaire, séisme mondial majeur.

### 3.5 Consommation / vie pratique
- **Prix de l'alimentation (IPC)** (B) `[N]`, **Prix de l'immobilier ancien** (B) `[N]`,
  **Actualités service-public** (B) `[N]`, **Alertes UFC-Que Choisir** (B) `[N]`,
  **Alertes ANSM (médicaments)** (B) `[N]`, **Tarif streaming** (P) `[N]` (Netflix/Deezer, hash-diff).
- Historique : rappels produits, taux du Livret A, échéances fiscales, IRL, inflation INSEE, chômage.

### 3.6 Culture / sorties
- **Nouvel album** (P) `[N]` — sortie d'album d'un artiste suivi (Deezer, **remplace Spotify**).
- **Grands concerts** (B) `[N]`, **Semaines de la mode** (B) `[N]`, **Conventions manga** (B) `[N]`.
- Historique : festivals de musique, Japan Expo, prix littéraires, théâtre, arts visuels, BD & manga,
  journées du patrimoine, carnavals, Fête des Lumières.

### 3.7 Échéances administratives / social
- `[N]` : **Actualisation France Travail**, **Recensement citoyen (16 ans)**, **CFE des entreprises**,
  **Bourses collège & lycée**, **Crous / DSE**, **Parcoursup**, **Versement CAF**, **Revalorisation des aides**,
  **Revalorisation retraites**, **Barèmes auto**.
- Historique : échéances impôts, allocation de rentrée, prime de Noël, « ce qui change au 1er ».

### 3.8 International / outre-mer / expatriés
- `[N]` **Commémorations outre-mer** (P), **Saison cyclonique** (B), **Soldes outre-mer** (P),
  **Tours cyclistes outre-mer** (B).
- Historique : Québec (festivals, fiscalité, sport, société, école), Francophonie, fêtes nationales.

### 3.9 Familles broadcast historiques (résumé)
- **Statuts de services** (~40 sources B) — pannes GitHub, Cloudflare, npm, OpenAI, Discord, Vercel,
  Anthropic, Railway, Slack, Zoom, PyPI, Supabase, etc.
- **Fêtes & calendrier** (B) — fêtes chrétiennes/musulmanes/juives/laïques, changement d'heure, jours fériés & ponts.
- **Bons plans** (B) — Epic/GOG jeu gratuit, soldes, Black Friday, soldes Steam, Beaujolais nouveau.
- **Énergie / transports** (B/P) — EcoWatt, Ecogaz, carburant, SNCF, Bison Futé, loi montagne.

---

## 4. Sources écartées ou en pause (déjà tranché — ne pas y revenir sans raison)

| Source / idée | Statut | Raison |
|---|---|---|
| **veille-artiste-spotify** | **Abandonnée** → remplacée par Deezer | Durcissement du Developer Mode Spotify (fév. 2026) : Premium requis + 5 test-users max. Fichier supprimé ; **ligne DB à nettoyer** au prochain passage. |
| **sfr-box** (FAI) | Écartée | Doublon SHA-256 avec `sfr-red-mobile` ; page `www.sfr.fr` bloquée. |
| **WHO Disease Outbreak News** | Écartée | Flux RSS mort (404) + hors-thème (santé vs science). |
| **Exoplanètes — flux non filtré** | Écartée au profit du sous-ensemble « habitable » | ~236 confirmations/an = firehose ; on ne garde que les petites planètes en zone tempérée (~31, rares). |
| **Rétractation — variante par mot-clé** | Non implémentée (broadcast général retenu) | La v2 ne permet pas de souscrire un champ optionnel vide. Évolution possible : source paramétrée dédiée. |
| **Streaming phase 2** (Spotify/Disney+/YouTube/Apple TV+/Canal+/Prime Video) | TODO documenté, non activé | Pages tarifs en SPA / anti-bot → nécessiteraient un rendu headless. |
| **Marie Curie** (anniversaire) | Écartée | Aucun jalon rond (50/100/150) dans la fenêtre 2026-2028 (vérifié). |
| **Four Colors / Dolly** (anniversaires) | Écartées | Anniversaire rond 2026 déjà passé au moment de l'ajout (23/07) → jamais activables. |

---

## 5. Dette technique / points de vigilance connus

- **Migration DB en attente** — 7 sources récentes (Deezer → ondes gravitationnelles) et le retrait de
  Spotify ne sont **pas encore en base**. À appliquer via `migrate.js` (fait par l'humain, pas par l'agent).
- **Cache anti-rétroactif en mémoire** — perdu au redémarrage sur toutes les veilles d'état
  (`veille-page`, `veille-arxiv`, `retraction-article`, `ondes-gravitationnelles`, `crypto-seuil`,
  `hausse-tarif-operateur`, `eau-potable-commune`, `catnat-commune`, `veille-emploi`, `veille-entreprise`…).
  Conséquence : après un redéploiement, un item apparu pendant l'arrêt peut être manqué (jamais de faux positif).
  Amélioration possible : persister la référence en base.
- **Sources fragiles à surveiller** — `iss-passages` (API communautaire `iss-api.fly.dev`, sans SLA) et
  `pollens` (dispositif Atmo France récent, décret mars 2026, format WFS à surveiller).
- **Heuristiques best-effort** — `veille-stock` et `hausse-tarif-streaming` sont peu fiables sur les sites
  100 % JavaScript (le contenu est chargé après le HTML brut). Documenté dans le message et les commentaires.
- **GVP (volcans)** — le WAF renvoie 403 sur l'en-tête `Accept: application/rss+xml` et sur le User-Agent
  par défaut ; contournement en place (UA navigateur, sans en-tête `Accept`). Throttling par IP possible.
- **Rétractation d'ondes gravitationnelles** — la correction ne couvre que les événements encore présents
  dans la fenêtre des 20 plus récents (suffisant en pratique).
- **Granularité** — `seismes-departement` utilise un rayon fixe autour du centroïde départemental
  (quelques faux positifs/négatifs de bordure, filet broadcast national conservé).
- **Hooks de test** — quelques sources exposent un `_test` (caches internes) et `ondes-gravitationnelles`
  un paramètre d'injection sur `check(injected)` ; sans effet en production (le poller les ignore), à retirer si souhaité.
- **TODO calendaires datés** — `fete-science` (édition 2027 à ajouter dès annonce, avant le 30/09/2027),
  `grands-anniversaires` (recuration annuelle), `nobel-prix`, `evenements-astro`.

---

## 6. Clés API / comptes externes en production

> Aucune valeur de clé/secret n'est incluse. Statut au 2026-07-23.

| Service | Auth | Variables d'env. | Statut |
|---|---|---|---|
| **France Travail** | OAuth2 client_credentials | `FRANCETRAVAIL_*` | ✅ Fonctionnel (testé en conditions réelles). |
| **Twitch Helix** | OAuth2 + `Client-Id` | `TWITCH_CLIENT_ID/SECRET` | ✅ Fonctionnel (testé, ex. chaîne Zerator). |
| **Légifrance / PISTE** | OAuth2 client_credentials | `LEGIFRANCE_CLIENT_ID/SECRET` | ✅ **Fonctionnel** — testé de bout en bout en production le 23/07/2026 (token réel + appel réel `/consult/lastNJo`, réponse JORF réelle). Le blocage initial venait d'une confusion sur le portail PISTE (identifiants pris dans « API Keys » au lieu de « Identifiants Oauth ») ; corrigé et redéployé. |
| **RTE** (EcoWatt/Tempo) | OAuth2 (Basic header) | `RTE_CLIENT_ID/SECRET` | ✅ Fonctionnel (pré-existant). |
| **Météo-France — Vigilance** (métropole + outre-mer) | Clé API | `METEOFRANCE_VIGILANCE_API_KEY`, `METEOFRANCE_VIGILANCE_URL`, `..._OM_URL` | ✅ Fonctionnel si clé présente ; sinon source silencieuse. |
| **Météo-France — Feux de forêt** | Clé API | `METEOFRANCE_FORETS_API_KEY`, `..._URL` | ✅ Fonctionnel si clé présente. |
| **Météo-France — Avalanches (BRA)** | Clé API | `METEOFRANCE_DPBRA_API_KEY` | ✅ Fonctionnel si clé présente. |
| **Météo-France — Cyclones outre-mer** | Clé API | `METEOFRANCE_API_KEY` | ✅ Fonctionnel — flux ZIP via `METEOFRANCE_API_KEY` + `METEOFRANCE_VIGILANCE_OM_URL`, activée 25/07/2026 (`cyclones-outremer`). |
| **SNCF** (perturbations) | Clé API | `SNCF_API_KEY` | ✅ Fonctionnel si clé présente. |
| **URLhaus** (abuse.ch) | **Clé Auth requise** | `URLHAUS_AUTH_KEY` | ✅ Fonctionnel (abuse.ch impose désormais une clé d'authentification) ; sans clé → source silencieuse. |
| **Atmo France** (WFS) | Aucune | — | ✅ Fonctionnel, sans clé (qualité air + pollens). |
| **Deezer** | Aucune | — | ✅ Fonctionnel, sans clé (API publique). |
| **arXiv** | Aucune | — | ✅ Fonctionnel, sans clé (throttle ~1 req/3 s respecté). |
| **NASA Exoplanet Archive** (TAP) | Aucune | — | ✅ Fonctionnel, sans clé. |
| **Smithsonian GVP** (volcans) | Aucune (UA requis) | — | ✅ Fonctionnel (UA navigateur, throttling IP possible). |
| **GraceDB** (LIGO/Virgo/KAGRA) | Aucune | — | ✅ Fonctionnel, sans clé. |
| **Crossref** (Retraction Watch) | Aucune (UA « polite » recommandé) | — | ✅ Fonctionnel, sans clé. |
| **Hub'Eau / Vigieau / geo.api.gouv.fr / BOAMP / EMSC / USGS / NOAA SWPC / Launch Library / JPL CNEOS** | Aucune | — | ✅ Fonctionnels, sans clé (données publiques françaises et internationales). |

> Note : `IPLOCATE_APIKEY` (géoloc IP pour le pré-remplissage de profil) et `VAPID_*` (push web) sont des
> clés de **plateforme**, pas de sources d'alerte. Certaines sources Météo-France délèguent la récupération à
> un module partagé, mais chaque flux (vigilance, forêts, avalanches, cyclones) a **sa propre clé**.

---

*Fin du rapport. Source de vérité : le code (`server/db/init.sql`, `server/sources/*`). En cas de doute
sur l'état live, interroger la base en lecture seule (voir `scripts/veille-readonly.js`).*
