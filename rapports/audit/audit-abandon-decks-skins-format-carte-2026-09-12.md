# Audit ÉTAPE 1 — Abandon decks + skins + format carte (fil #9)

**Date : 2026-09-12** · Lecture seule, aucune modification de code.

## Préambule — base auditée

Cet audit est un **instantané du working tree au 12/09/2026**, changements non commités **inclus** (le `git status` d'ouverture montre des modifs d'autres sessions sur `site.js`, `forum.js`, plusieurs `.html`, et des fichiers non suivis `server/pages.js`, `server/partials/`). Les lignes citées valent pour cet état ; un `git pull`/rebase ultérieur peut les décaler.

**Constat structurant repéré d'emblée** : le HTML des cartes du kiosque **n'est jamais généré côté serveur**. `server/pages.js` et `server/partials/` ne contiennent **aucun** gabarit de carte. Toute la carte est produite par `public/js/cards.js` (`window.LBACards.cardHTML`) et pilotée par `site.js` / `list-view.js` / `decks.js`. Les seules occurrences de `.card` côté serveur sont hors-sujet (cartes de sujet **forum** dans `routes/forum.js`, `.card` d'un **email** dans `routes/subscribe.js`). Conséquence : le remplacement du format carte est un chantier **front pur** (JS + CSS), sans SSR à toucher.

Trois blocs ci-dessous (A decks, B skins, C format carte). Pour chacun : fichiers, routes, DB, UI, références croisées, puis la frontière **présentationnel ↔ logique métier** et les **points d'entrée actifs à masquer**. Aucune solution proposée — état des lieux seul.

---

## BLOC A — Système de DECKS

Recouvre : collections/decks officiels, decks perso UGC, catégories auto, points/classement/Top20, boutique, vue liste, adoption, fork, partage.

### A.1 Fichiers dédiés

**Serveur**
- `server/routes/decks.js` (~29 ko) — decks perso UGC (CRUD, items, partage, fork, adoption, report). Dédié.
- `server/routes/collections.js` (~17 ko) — decks officiels + adoption. Dédié.
- `server/routes/skins.js` (~7,5 ko) — boutique/points (détaillé au Bloc B).
- `server/points.js` — ledger de points + `getTop20Ids()` + `getRank()`. Dédié **mais invoqué par le flux d'abonnement de base** (voir A.6-C).

**Front (`public/js`)**
- `decks.js` (~55 ko) — SPA « Mes decks ».
- `collection-page.js` — page `/collection/:slug`.
- `deck-shared.js` — page `/deck/:token`.
- `boutique.js` — page boutique (Bloc B).
- `profile-decks.js` — decks publics d'un membre **sur le profil forum** (couplage A.6-A).
- `deck-stack.js` — composant `LBADeckStack` (tuile pile + ruban).
- `deck-motifs.js` — motifs/teintes de decks.
- `deck-add.js` — face « Ajouter à un deck » d'une carte.
- `list-view.js` (~30 ko) — vue liste (n'affiche pas les tuiles-deck ; central au Bloc C).

**Pages HTML** : `mes-decks.html`, `boutique.html`, `collection.html` (SSR), `deck.html` (SSR).

### A.2 Routes API

**`routes/decks.js`** — POST `/my-alerts/display-name` L113 *(pseudo public, sert AUSSI au forum — A.6-B)* · GET `/decks` L151 · POST `/decks` L183 *(award DECK_CREATED L214)* · GET `/decks/:id` L223 · PATCH `/decks/:id` L237 · DELETE `/decks/:id` L274 · POST `/decks/:id/items` L293 · DELETE `/decks/:id/items/:sourceId` L335 · POST `/decks/:id/share` L355 · POST `/decks/:id/unshare` L380 · **GET `/decks/shared/:token` L399 (LECTURE PUBLIQUE)** · POST `/decks/shared/:token/fork` L432 · POST `/decks/:id/adopt` L470 *(award ALERT_SUBSCRIBED L495/L505)* · POST `/decks/shared/:token/report` L522.

**`routes/collections.js`** — **GET `/collections` L46 (PUBLIC)** · **GET `/collections/:slug` L132 (PUBLIC)** · POST `/collections/:slug/adopt` L197 *(award DECK_ADOPTED L274, DECK_ADOPTED_BY_OTHERS L278, ALERT_SUBSCRIBED L245/258)* · DELETE `/collections/:slug/adopt` L292.

**Pages SSR (`server/index.js`)** — GET `/mes-decks` L229 · `/mes-decks/nouveau` L234 · `/boutique` L239 · `/deck/:token` L256 · `/collection/:slug` L299.

**Classement (`routes/myalerts.js`)** — POST `/my-alerts/leaderboard` L514 (opt-out) ; profil expose `points_balance`/`leaderboard_optout`/`rank` L245, L331, L355-358.

### A.3 Tables / colonnes DB (`server/db/init.sql`)

- `collections` CREATE L2077-2086 (`owner_subscriber_id` L2082, `visibility` L2083), index L2087.
- `collection_items` CREATE L2089-2095, index L2096 ; seeds officiels L2098-2259, L2866-2880.
- UGC : `share_token` L2271 (+ index unique L2272), `updated_at` L2274, `forked_from_name` L2276.
- `subscribers.display_name` L2280 (+ index unique lower L2281) — **pseudo public partagé forum**.
- `display_name_changes` CREATE L2285-2289.
- `deck_reports` CREATE L2294-2301 ; contrainte unicité L4644.
- `collections.tint` L2349 (+ UPDATE L2353-2359) ; `collections.categories` L3759 (+ backfill L3780-3802).
- `collection_adoptions` CREATE L3765-3771 (popularité).
- **Points** : `subscribers.points_balance` L3818 ; `points_ledger` L3822-3835 (+ index L3835/L3839) ; events documentés L3809-3811.
- **Classement** : `subscribers.leaderboard_optout` L3849 ; index leaderboard L3854-3856.
- **Skins/boutique** : `skins` L3870-3878 ; `user_skins` L3882-3888 ; `subscribers.equipped_dashboard_skin_id` L3892 ; `collections.equipped_skin_id` L3895 (détails Bloc B).
- **Couplage forum** : `collections.forum_slug` L4594 (+ index L4595) ; `forum_topics.deck_id` L4600 (+ index L4601) ; contrainte « une seule cible » source_id OU deck_id L4608 (A.6-A).

### A.4 Points d'entrée UI actifs (à masquer, Bloc E consolidé plus bas)

- `header.js` : `SHOP_LINK_HTML` (sac → `/boutique`) L50, injecté L288 et L349 ; menu « Mes decks » → `/mes-decks` L110.
- `index.html` : `#points-mount` L199-201 (rempli par profile.js) ; `#collections-shelf` **déjà `hidden`** L80-93 ; `#deck-tiles-src` L93 ; scripts deck L384-385, L398.
- `profile.js` : bloc « Mes points » sur `#points-mount` — solde L293-298, rang L300-306, opt-out L311-313, lien Boutique L316-318 ; lecture points_balance L435-437.
- `mobile-header.js` : **aucune** référence deck.

### A.5 Références croisées

- Montage routers `server/index.js` : imports L15-17, `app.use('/api', …)` L186-188 ; forum L380.
- CSS `site.css` (très dense) : décors deck-card L363-441, L652-657, L1484-1498 ; étage collections L2333-2430 ; deck partagé L2432-2443 ; mes decks L2445-2634 ; ajouter-à-un-deck L2554-2664 ; points `.pref-points` L2767-2768 ; **badge Top 20** `.deck-badge-top20` L2771-2773 ; célébration L2809 ; motif × teinte L2831-2906+ ; skins `.skin-*` L3960-4090+ (Bloc B).
- Imports scripts par page : `mes-decks.html` L46-58 ; `boutique.html` L74-86 ; `collection.html` L85-98 ; `deck.html` L88-101 ; `index.html` L377-401.

### A.6 Couplages forts / frontières floues (DOIVENT survivre)

- **(A) FORUM ↔ DECKS — le couplage le plus fort.** `routes/forum.js` lit directement `collections`/`collection_items`/`skins` et la colonne `forum_topics.deck_id` : résolution pseudo→source→deck L102-118, `resolveDeckId()` L176-179, SELECT topics joignant `collections` L290-301 & L562-569, href deck L321-326, route `/forum/deck/:slug` L501-540, cibles taguables L709-722, mentions @slug decks L730-762, page profil `/u/:pseudo` section « Ses decks » L794-825 (charge `profile-decks.js` L825), **GET `/api/forum/u/:pseudo/decks` L836-866** (lit `skins.asset_ref` via `equipped_skin_id` L843, compte topics via `deck_id` L850-852), compteur `/api/forum/deck/:slug/count` L888-892, création de sujet avec `deck_id` L917-941. → Un fichier « deck » (`profile-decks.js`) est requis par une page **forum** ; le forum **casse** si les tables decks disparaissent.
- **(B) PSEUDO public.** La route `POST /my-alerts/display-name` **vit dans `decks.js` L113** mais le pseudo signe **aussi** les messages de forum (`profile.js` L285 : « Signe vos messages du forum et vos decks partagés »). Logique pseudo mal rangée (dans le routeur decks) alors qu'elle sert le forum.
- **(C) POINTS ↔ abonnement d'alerte de base.** `award('ALERT_SUBSCRIBED', …)` est appelé depuis le **flux d'abonnement standard** : `routes/subscribe.js` L156, `routes/myalerts.js` L651 & L742 — pas seulement à l'adoption de deck. `server/points.js` est donc dans le chemin d'abonnement de base ; l'archivage des points touche ces appels.
- **(D) SKINS ↔ rendu des cartes.** Le catalogue `skins` mêle type `dashboard` (habillage des **cartes d'alerte** du kiosque, via `subscribers.equipped_dashboard_skin_id`) et type `deck` (tuiles). Frontière floue boutique-de-decks ↔ habillage-de-cartes (Bloc B).
- **(E) Grille du kiosque ↔ decks.** `site.js` `loadDecksIntoGrid()` L2829-2870 injecte les tuiles-deck **dans `#grid`** mêlées aux cartes ; adoption `/api/collections/:id/adopt` L2985-3002 ; `bindDeckSwitches()` L2976 ; ancien `loadCollections()` L3028-3059 (étagère off) ; **tri fusionné cartes+decks L1878-1879**. Retirer les decks touche le pipeline tri/filtre de la home.
- **(F) Ambiguïté « collection ».** « **Ma collection** » = filtre **FAVORIS** du kiosque (survit), distinct des decks/collections officielles. `server/index.js` L243-251 (redirection `/favoris`), `routes/api.js` L286-330 (favoris perso), `index.html` L180 `#acct-collection-count`. **Ne pas confondre les deux sens du mot.**
- **(G) `community-types.js`** : aucune référence deck/collection — **non couplé**.
- **(H) Sources classiques** : `collection_items.source_id` (FK L2091) pointe vers `sources`, mais `sources` n'a **aucune** dépendance retour vers les decks (hormis `sources.forum_slug`, partagé avec le forum, indépendant des decks).

---

## BLOC B — Système de SKINS de cartes

« 9 skins boutique » = **5 teintes full-art** (`fullart-ocean/braise/aurore/or/prisme`) + **4 structures** (`ecole-classique/arcane/assemblee/dresseur`), type `dashboard`. S'y ajoutent 4 skins de deck actifs (`ruban-blanc/bleu`, legacy `menthe/or-royal`), le skin `defaut` (cost 0), et 2 legacy désactivés (`aurore/nuit-etoilee`, `active=false`).

### B.1 Fichiers serveur

- `server/routes/skins.js` (189 l.) — **entièrement dédié**. En-tête L1-7.
- Montage : `server/index.js` L17 (`require`), L188 (`app.use('/api', skinsRouter)`), page `/boutique` L238-241.
- Aucun autre `server/skins*`. Les autres routeurs ne font que **lire** `asset_ref` (jointures, B.5).

### B.2 Routes API (`routes/skins.js`)

- GET `/api/skins` L17 (catalogue actif + `owned` + solde).
- POST `/api/skins/buy` L58 (achat atomique en points, transaction L76-123).
- POST `/api/skins/equip` L137 (équipe/déséquipe skin dashboard sur `subscribers`, ou skin deck sur `collections` via `collection_id`).

### B.3 Tables / colonnes DB (`init.sql`, bloc « Phase 3 » L3859-3993)

- `skins` L3870-3878 (`id`, `type` `'dashboard'|'deck'`, `name`, `cost`, `asset_ref`, `active`, `created_at`).
- `user_skins` L3882-3887 (PK `(subscriber_id, skin_id)`), index L3888.
- `subscribers.equipped_dashboard_skin_id` L3892-3893 (FK → skins, ON DELETE SET NULL).
- `collections.equipped_skin_id` L3895-3896 (FK → skins, ON DELETE SET NULL).
- Seeds/migrations du catalogue : L3901-3907, L3919, L3925, L3937-3940 (defaut), L3947-3951 (rubans), L3959-3966 (5 full-art), L3973-3979 (4 structures), L3991-3993 (accents).

### B.4 Assets

- **Aucun** fichier image/SVG externe. Les 9 skins sont **100 % CSS** (recolorations + restructurations), avec quelques SVG inline en data-URI dans le CSS (étoile pip Dresseur `site.css:4313` clair / `:4424` sombre).
- `deck-motifs.js` **non concerné** (motifs de fond par emoji) ; `deck-stack.js` générique (aperçu boutique mais pas propre aux skins).
- Fichiers de référence design hors build : `skins-reference.html`, `skins2-reference.html` (racine dépôt).

### B.5 Références CSS / JS

**CSS `site.css`** — ancrage ruban par structure L3141-3158 ; **radar full-art par défaut** (skin de base, PAS boutique) L3359-3415 (keyframes `fa-blip` 3376, `fa-ring` 3381) ; bloc « boutique de skins » à partir de L3554 ; liserés legacy L3633-3661 ; rubans L3663-3691 ; **teintes full-art `.skin-fullart-*` L3723-3846** ; **structures `.skin-ecole-classique/arcane/assemblee/dresseur` L3850-4477** (bloc massif, recto + 4 faces arrière L4445-4478) ; keyframes propres aux skins `sk-ec-*` 3974-3975, `sk-ar-turn` 4026, `sk-as-*` 4157-4158, `sk-dr-*` 4380/4436 ; `.deck-skin-inline` 2631-2634.

**JS qui applique une classe de skin** — `site.js` L2697 (`dashboard_skin` sur `#grid`), L2872-2874 (`deck_skin` sur `.deck-card`) ; `deck-shared.js` L66-67 ; `profile-decks.js` L44-46 ; **`holo.js` L6/L43-44 (effet nacré codé en dur sur `#grid.skin-dresseur`)** ; `decks.js` sélecteur d'apparence (`STATE.deckSkins` 20, `skinInlineHTML` 491-504, `equipSkin`→`/api/skins/equip` 744-756, `ensureSkins`→`/api/skins` 824-831) ; `boutique.js` (page entière).

**Serveur exposant `asset_ref` (jointures)** — `routes/myalerts.js:247` (`AS dashboard_skin`, exposé L360) ; `routes/decks.js:404` (`AS deck_skin`, exposé L420) ; `routes/collections.js:68` & `routes/forum.js:843` (`AS deck_skin`).

**Structure carte dépendante des skins (couplage B.7-2)** — `cards.js` émet la structure unique dont les skins dépendent : `.card-seal` ×2 (56-61), `FULLART_SVG` (104), `attacksHTML` Dresseur (497-517), `FOOT_HTML` (520-525), `.card-edge/.card-veil/.card-art` (620-625), `.card-edition` (644-648), `.card-stat` (660-661), `.card-fineprint` (673).

### B.6 Points d'entrée UI actifs (à masquer)

- **Page boutique** : route `index.js:239` ; `boutique.html` (`#shop-sec-dashboard` « Skins de cartes » L61, `#shop-sec-deck` « Skins de decks » L66) ; `boutique.js` (achat L198, équiper L213, retirer L226).
- **Header (sac)** : `header.js` L49-50 `SHOP_LINK_HTML` → `/boutique`.
- **Profil** : `profile.js` L315-320 (rangée « Boutique / Débloquez des skins »).
- **Sélecteur « Apparence » par deck** : `decks.js` bouton `.deck-appearance` L694, pastilles `.deck-skin-opt`, lien repli `/boutique` L494.

### B.7 Couplages forts / frontières floues

1. **Skins ↔ points (économie).** `skins/buy` décrémente `subscribers.points_balance` (`skins.js:100-105`) dans la même transaction que l'INSERT `user_skins`. `points_balance` est partagée avec tout « Le Point » ; commentaire `init.sql:3806` : le solde « ne servira qu'à débloquer des skins ». **Archiver les skins laisse `points_balance` sans débouché de dépense.**
2. **Skins ↔ structure DOM de `cards.js` (frontière floue et forte).** Les skins **ne sont pas des overlays isolés** : ils redéfinissent la structure unique émise par `cards.js` (`.card-seal`, `attacksHTML`, `.card-edition`, `.card-stat`, `.card-fineprint`, `FOOT_HTML`, `.fullart`). Ces éléments sont `display:none` par défaut et **n'existent dans `cards.js` QUE pour les skins** (ex. `FOOT_HTML` L520-525 : texte inventé « Signal / faiblesse le silence » propre au Dresseur, injecté dans **toutes** les cartes). Retirer les skins laisse ce markup mort.
3. **Radar recoloré vs skin de base.** Le radar calme (`fa-blip`/`fa-ring`, `.fullart`, L3359-3415) est le **rendu par défaut** (skin `defaut`, cost 0). Les teintes `fullart-*` ne font que recolorer ce même radar. **La frontière boutique ↔ carte-par-défaut passe DANS le même bloc CSS `.fullart`** — non séparable proprement.
4. **`holo.js` couplé à un skin nommé** : L44 teste `grid.classList.contains('skin-dresseur')` — effet JS branché en dur sur un id de skin.
5. **Débordement recto→verso** : les skins repeignent aussi les 4 faces arrière (`.card-back/.card-share-face/.card-deck-face/.card-task-face`, `site.css:4445-4478`).
6. **Substitution de vocabulaire fonctionnel par CSS** : le Dresseur remplace visuellement « Abonné »→« Attrapé », « En pause »→« Se repose » (`site.css:4361-4372`) via `.switch-label.on` piloté par le JS métier.
7. **Colonnes d'équipement dispersées** : l'état « équipé » vit sur **deux tables métier** (`subscribers.equipped_dashboard_skin_id`, `collections.equipped_skin_id`) relues par **4 routeurs non-skins** (myalerts, decks, collections, forum) qui jointent `skins.asset_ref`. Les FK `ON DELETE SET NULL` protègent les **données** mais pas les **sous-requêtes** `SELECT asset_ref FROM skins …` si la table disparaissait.

---

## BLOC C — Format CARTE recto/verso

**Rappel** : entièrement front (`cards.js` produit, `site.js`/`list-view.js`/`decks.js` pilotent). Aucun SSR de carte.

### C.1 Structure (`public/js/cards.js`)

- **`cardHTML(s, mode)` L838-873** : conteneur racine `.card.flip` L862 avec marqueurs de famille `data-source-id` (862), `data-subscribed/data-search/data-cats` (862-863), `data-card-type="community"`/`data-community-type`/`data-community-label` (852-860). **`.card-inner` L864** → enfants `frontFace` (865), `backFace` (866), `shareFace` (867), `taskFace` (868), `communityReportsFace` (869), `deckFace` (870).
- **Recto `frontFace` L527-676** (`.card-face.card-front` 619). Aiguillage d'action par type : linked 529, user-task 533, community 576, paramétré 595, broadcast 598. Sous-structure : `.card-art/.fullart/.card-veil` 623-624, `.card-edge` 625, `.card-toprow` 627 (like/share/add-deck/flip-btn 629-634), `.card-content` 637, `.community-recto` 643, `.card-textbox` 659, `.card-action` 668.
- **Verso info `backFace` L748-797** (`.card-face.card-back` 790, `.flip-back` 791, `forumBadge` 784-787).
- **3e face partage `shareFace` L811-818** (`.card-share-face`, `.flip-back` 814).
- **4e face deck `deckFace` L801-808** (`.card-deck-face`, `.flip-back` 804).
- **5e face tâches `taskFace` L726-746** (garde `type==='user-task'` + connecté 727 ; `.card-task-face.card-usertask-face` 741).
- **5e face communautaire `communityReportsFace` L368-388** (garde `isCommunity` + connecté 369 ; `.card-task-face.card-community-face` 375 ; `.community-report-toggle` 384).
- Sous-générateurs : `communityFace` 289-313 (formulaire création/adhésion), `communityReportItem` 337-360 (ligne signalement : `.community-found` 344, `.community-spot-toggle/-form` 346-352), `taskItem` 692-717 (`.task-remove` 696, `.task-done` 714), `paramFace` 390-495 (chips/picker/switch/mute), `paramControl` 199-252, `followSwitch` 265-273, `switchRow` 64-73.
- Discriminants métier : `isParam` 163, `isUserTask` 168, `isCommunity` 178, `communityCfg`/`COMMUNITY_FALLBACK` 185-190, `isGeoSchema`/`GEO_KEYS` 278-280.
- **`openParams` (volet) N'EST PAS dans `cards.js`** → il est dans `list-view.js` (C.3).
- Export `window.LBACards = {…}` L900-912.

### C.2 CSS (`public/css/site.css`)

- **Flip 3D** : `.card.flip` L415 (`perspective:1400px`), `.card-inner` L417-420 (`transform-style:preserve-3d; transition .5s`), **`.card.flipped .card-inner{transform:rotateY(180deg)}` L421**, `.card-face` 422-429 (`backface-visibility:hidden`), `.card-front` 430 + ratio `aspect-ratio:2/3` L441, `.card-back` 443-447 (`rotateY(180deg)`), masquage flip-btn 450, reduced-motion 451, `.flip-btn/.flip-back` 457-466.
- **Faces spécialisées** (toutes `absolute; inset:0; rotateY(180deg)` + affichage par classe `.face-*`) : `.card-share-face` 1474-1481, `.card-deck-face` 1485-1491, `.card-task-face` 1501-1507. Boutons masqués au verso : `.card-share` 1143-1145/1482, `.card-like` 1149-1161, `.card-add-deck` 2557-2569/2566.
- **Fond commun faces arrière + skins** 3498-3524 et 4450-4511.
- **Recto full-art / toprow / content** : `.card-toprow` 3432-3469, `.card-content` 3472-3495, `.card-front .fullart` 3353-3357, animation radar actif `.card-front:has(.state.active)` 3395-3409, `display:contents` 3702-3720.
- **Volet params / faces com/tâche** : `.param-*` 1818-1947, `.community-*` 536-602 & 1914-1930, `.task-*` 490-528.
- **Faces réutilisées dans le volet liste** : `.lrow-exp .card.in-list-exp …` 4678-4732 (réaffiche `.card-usertask-face`/`.card-community-face` via `.face-task` 4692-4714).
- **Ruptures mobiles** : `@media (max-width:620px)` (grille 1 colonne) L382, + 3524/3572/1532/1801/2792/4748-4752 (vue liste flex-wrap) ; `@media (max-width:640px)` 857-860 & 1442-1445 (footer/hero, **ne touchent pas au flip**). **Aucune media query ne désactive le flip sous 640px** : le retournement est actif à toutes tailles (commentaire `cards.js` 774 « le retournement fait office de popup partout »). `prefers-reduced-motion` neutralise transitions à de nombreux endroits (451, 403, 1204, 3409, 3549…).

### C.3 JS impliqué

- **`site.js` (handlers délégués — source de vérité)** : partage `.card-share` 124-153 (ajoute `.flipped.face-share` 152) ; flip info/retour 565-602 (`.flip-btn`→`flipped` 567-579, `.flip-back`→purge `face-*` 581-601) ; `.task-config` 765-774 (ouvre 5e face) ; like localStorage 157-168 ; abonnement `toggleConnected` 665-702 (POST `/api/my-alerts/toggle` 671), aiguillage switch 705-720 ; pause `toggleMute` 724-756 (POST `/api/my-alerts/toggle-mute`) ; user-task `.task-remove` 779-822 (DELETE `/api/user-tasks/:id`, reconstruit le recto 801-816), `markTaskDone` 826+ ; **communautaire 1018-1373** (`renderCommunityRecto` 1050-1090 avec rotation 10 s, `window.LBACommunity={load}` 1166, POST create/`/spot`/`/resolve`) ; tags verso cliquables 2484-2489.
- **`list-view.js` (projection, pas de logique dupliquée)** : `rowHTML` 70-125 ; `sync()` 146-200 ; **volet réel** `parkCardInto`/`unparkCard` 220-253 (déplace le **vrai nœud** de carte dans `.lrow-exp`), `fillExp`/`toggleKind` 274-301, **`openParams(row,id)` 349-382** (déplie la vraie carte, ouvre `.face-task` selon `.card-usertask-face` 369 / `.card-community-face` 371-379 → `LBACommunity.load`) ; handlers 384-527 (like/share/statut/corps/switch forwardés) ; discriminants alignés 46-64.
- **`decks.js` (aperçus)** : `LBACards.cardHTML(sc,'anon')` 325/781/932, `backFace` sobre 527-534, flip local 650-651/687-696 (site.js non chargé, cartes non-interactives).

### C.4 Gabarits HTML serveur

**Aucun.** `server/pages.js` : aucune occurrence `card-front`/`card-inner`/`cardHTML`. `server/partials/` = `footer.html` seul. `.card` serveur = forum (`routes/forum.js` 340/400/586/616) + email (`routes/subscribe.js` 58/71/78), hors-sujet. La carte est alimentée par du **JSON métier** (`/api/sources` avec champ `community` via `publicConfig` de `community-types.js`, `/api/my-alerts`, `/api/community-reports`).

### C.5 Frontière présentationnel ↔ logique métier (couplages)

**Habillage pur (remplaçable sans risque)** : tout le markup/CSS des faces — `.card-inner`, rotateY/perspective, `.card-front/.card-back`, `.card-share-face/.card-deck-face`, full-art, voile, skins.

**Logique imbriquée dans le rendu (à préserver)** :
1. **Sélecteurs de classe = contrat de câblage.** Tous les handlers délégués de `site.js`/`list-view.js` ciblent des **classes émises par `cards.js`** : `.card-like`, `.card-share`, `.flip-btn`, `.flip-back`, `.switch input`, `.param-mute`, `.param-follow-cb`, `.task-config`, `.task-remove`, `.task-done`, `.community-config`, `.community-report-toggle`, `.community-submit`, `.community-spot-toggle`, `.community-spot-submit`, `.community-found`, `.param-remove`, `.param-add`. Renommer une classe **casse le handler sans erreur visible**.
2. **Les classes de flip portent de l'état, pas que du style.** `.flipped`/`.face-task`/`.face-share`/`.face-deck` sont écrites par `site.js` (152, 573, 596, 773), **lues par la vue liste** (`openParams` ajoute `.face-task`, list-view 370/372) et par le CSS du volet (4692-4714). Une liste sans flip doit **réimplémenter l'ouverture des 5e faces** (tâches/signalements).
3. **`data-*` de famille = routage réseau.** `data-community-type` (858) → `communityTypeOf()` (site.js 1029) construit l'URL `/api/community-reports?type=…` ; `data-community-label` (859) → aria-labels ; `data-source-id` (862) = clé d'appariement carte↔ligne (list-view 33-39) et identité de tous les POST.
4. **La 5e face communautaire mêle rendu et cycle métier.** `communityReportsFace`/`communityFace`/`communityReportItem` (289-388) contiennent en dur les 3 variantes d'action selon `r.is_author`/`r.spotted` (341-353), l'expiration `dueFr(r.expires_at)` (339/357), le rayon depuis `communityCfg` (295-298). **Les boutons signaler/résoudre sont le seul point d'entrée vers `/spot` et `/resolve`.** Routes serveur : `routes/community-reports.js` GET 58, create/join 110, **POST `/:id/spot` 207**, **`/:id/extend` 271**, **`/:id/resolve` 308** ; expiration/dédup `community-reports-expire.js`, `community-types.js`.
   - **Écart notable** : la route **`/extend` (prolonger) existe côté serveur mais n'a AUCUN bouton dans le markup carte actuel** (`cards.js` n'émet pas `.community-extend` ; aucun fetch `/extend` dans `site.js`). La logique « prolonger » survit côté serveur mais **n'est pas exposée** par l'habillage — à traiter/décider lors du remplacement.
5. **`renderCommunityRecto` (site.js 1050-1090) réécrit le RECTO** (injecte `communityReportItem` + rotation `setInterval` 10 s, animations `.bd-slide-*`), couplé aux classes `.card-front .community-recto`/`.card-subtitle`/`.card-static-desc`. Un format sans « recto » doit décider du sort de ce carrousel.
6. **user-task : l'abonnement EST la création de tâche.** Le recto ne porte pas d'abonnement broadcast (167-168, 533-575) ; la souscription passe par `taskFace`/modale (`user-task-form.js`) ; `.param-mute` de pause vit sur le recto (566-574), retiré dynamiquement (807-808). Switch de liste réinterprété « actif = ≥1 tâche ET non muted » (list-view 87-89, 182-198, 443-477). Fort couplage entre présence de `.param-mute` dans le DOM et sémantique d'état.
7. **La vue liste déplace le NŒUD RÉEL de la carte** (`parkCardInto` 220-227) pour réutiliser les handlers natifs. C'est ce qui rend « la carte » indispensable même en liste : supprimer la carte-source **casse** le volet paramétré/tâche/communautaire de la vue liste sauf réécriture de `list-view.js`.
8. **Fraîcheur/état** : `communityInflight` (1120), `refreshCommunityReports` (1144), `LBASession.refreshAlerts()` après toggle/mute (677, 742) — déclenchés depuis les handlers de carte, indépendants de l'habillage.

### C.6 Accessibilité liée au format carte (perd son sens en liste)

- `.flip-btn` : `aria-label="En savoir plus"` (cards.js 633). `.flip-back` : `aria-label="Retour"`/`title` (376, 742, 791, 804, 814) — « Retour » n'a de sens qu'avec un retournement. `BACK_SVG` flèche retour (82-85). `.card-share` `aria-label="Partager"` (631) et `.card-add-deck` `aria-label="Ajouter à un deck"` (610-611) ouvrent des faces qui disparaîtraient.
- Décoratifs `aria-hidden`/`role=img` (skins) : `.card-seal` (60-61), `.card-edition` (648), `.card-stat` (661), `.card-attacks`/`.card-foot`/`.card-fineprint` (508, 521, 673), `badgeFor` (39).
- **Vocabulaire cible déjà présent dans `list-view.js`** : `.lrow-main` `aria-expanded` + `aria-label="Afficher le détail de …"` (105) ; `.flip-btn` de ligne `aria-label="En savoir plus (statut)"` (119, ouvre un accordéon, pas un flip). Modèle d'accessibilité « liste » déjà amorcé.
- Libellés d'action **métier** (à conserver, indépendants du format) : `communityReportItem` (344-348), `taskItem` (696, 714), switches (68, 269, 476-478, 569-571).

---

## BLOC D — Synthèse « présentationnel vs logique métier » (transverse)

**Purement présentationnel (à archiver/remplacer)** : tout le markup/CSS des faces recto/verso, le mécanisme flip (`.card-inner`, rotateY/perspective, `.face-*`), les 9 skins (100 % CSS + markup mort dédié dans `cards.js`), les tuiles-deck/étagères/boutique (HTML+CSS), le carrousel `renderCommunityRecto`.

**Logique métier qui DOIT survivre** :
- Cartes communautaires : routes `/community-reports` create/join/`/spot`/`/extend`/`/resolve`, `community-types.js`, `community-reports-expire.js`, dédup/expiration/seuil. Seul l'**habillage** de leurs faces change.
- user-task : `user-tasks*` (routes, cron d'échéance), `user-task-form.js`. Habillage à migrer.
- Sources classiques : `/api/sources`, `/api/my-alerts`, toggles abonnement/pause, poller — inchangés.
- Favoris (« Ma collection ») : `/api/favorites*` — inchangé (≠ decks).
- Forum : dépend de `collections`/`collection_items`/`deck_id`/`skins.asset_ref` (A.6-A) — survit mais **couplé aux tables decks/skins**.
- Points : `award('ALERT_SUBSCRIBED')` dans le flux d'abonnement de base (A.6-C) — dans le chemin même si les decks partent.

**Frontières NON nettes (à trancher avant archivage)** : (1) `points.js` sert decks **et** abonnements de base ; (2) route pseudo dans `decks.js` mais utilisée par le forum ; (3) `forum.js` lit en dur `collections`/`collection_items`/`deck_id`/`skins` ; (4) skins mêlent habillage-cartes (dashboard) et decks dans la même table/boutique ; (5) `site.js` fond les tuiles-deck dans la grille et le tri du kiosque ; (6) `points_balance`/`leaderboard_optout` portés par la table centrale `subscribers` ; (7) skins = markup dédié **injecté dans toutes les cartes** via `cards.js` (markup mort après retrait) ; (8) la vue liste déplace le **nœud réel** de la carte (dépend de l'existence de « la carte »).

---

## BLOC E — Points d'entrée utilisateur ACTIFS à masquer (consolidé)

Pour rendre decks + skins inaccessibles **sans supprimer le code** :

| # | Point d'entrée | Emplacement | Cible |
|---|---|---|---|
| 1 | Icône « sac » header | `header.js` L49-50 (`SHOP_LINK_HTML`), injecté L288 & L349 | `/boutique` |
| 2 | Menu « Mes decks » | `header.js` L110 | `/mes-decks` |
| 3 | Bloc « Mes points » (solde/rang/boutique) | `profile.js` L293-320 sur `#points-mount` (`index.html` L199-201) | points + `/boutique` |
| 4 | Lien « Boutique / Débloquez des skins » | `profile.js` L315-320 | `/boutique` |
| 5 | Tuiles-deck dans la grille | `site.js` `loadDecksIntoGrid()` L2829-2870 (appel L2819) | `#grid` |
| 6 | Étagère collections | `index.html` `#collections-shelf` L80-93 — **déjà `hidden`** | — |
| 7 | Sélecteur « Apparence » par deck | `decks.js` `.deck-appearance` L694, repli `/boutique` L494 | skins deck |
| 8 | Boutons boutique (acheter/équiper/retirer) | `boutique.js` L198/213/226 ; `boutique.html` `#shop-sec-*` L61/66 | `/api/skins/*` |
| 9 | Pages SSR | `index.js` `/mes-decks` L229, `/mes-decks/nouveau` L234, `/boutique` L239, `/deck/:token` L256, `/collection/:slug` L299 | routes de page |
| 10 | Badge Top 20 (forum/profil) | CSS `.deck-badge-top20` `site.css` L2771-2773 ; alimenté `getTop20Ids()` (`collections.js` L97, `decks.js` L413) | affichage classement |

**Attention** : la section « Ses decks » du **profil forum** (`forum.js` L794-825 + `profile-decks.js`) et le tag/mention @slug de deck dans le forum (A.6-A) sont aussi des points d'entrée visibles **mais imbriqués au forum** — leur masquage doit être décidé en même temps que le sort du couplage forum↔decks, pas traité comme un simple lien header.

---

## Réserves & données utilisateur (pour mémoire, non traité à cette étape)

- Données en base concernées par un futur archivage : `points_ledger`, `points_balance`, `user_skins`, `equipped_*_skin_id`, `collections`/`collection_items`/`collection_adoptions`, `deck_reports`, `display_name`/`display_name_changes`. Aucune n'est perdue tant qu'on ne DROP rien ; risques = jointures `skins.asset_ref` et lecture forum si tables retirées (détaillé A.6/B.7). **Le sort de ces données relève de l'ÉTAPE 2, non décidé ici.**
- `CACHE_VERSION` / service worker : réflexe de bump à prévoir à tout changement front de cette ampleur — **noté, non traité en ÉTAPE 1**.

---

*Fin de l'audit ÉTAPE 1. Aucune modification effectuée. Aucune solution proposée.*
