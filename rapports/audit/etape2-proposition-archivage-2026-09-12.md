# ÉTAPE 2 — Proposition d'archivage (decks + skins) — fil #9

**Date : 2026-09-12** · Proposition à valider. **Aucun code écrit.** Options présentées, décisions laissées à Hugo.

Fait suite à l'audit ÉTAPE 1 (`rapports/audit/audit-abandon-decks-skins-format-carte-2026-09-12.md`) et intègre les **3 arbitrages** actés par Hugo (masquage forum total ; points/classement conservés hors boutique ; `/extend` non exposé, clos).

---

## 0. Correction factuelle préalable (change l'ARBITRAGE 2 en le simplifiant)

L'ARBITRAGE 2 supposait que `getTop20Ids`/`getRank` étaient « logées dans collections.js et decks.js, donc dans le périmètre archivé ». **Vérification faite, ce n'est pas le cas** :

- `getTop20Ids` et `getRank` sont **définies dans `server/points.js`** (L64 et L88), pas dans les routeurs decks. `points.js` **n'est pas dans le périmètre à archiver**.
- Leurs requêtes lisent **uniquement la table `subscribers`** (`points_balance`, `leaderboard_optout`, `display_name`). **Aucune** table `collections`/`collection_items`/`deck_*`. Elles survivent donc **par construction**, sans déplacement.
- `getRank` garde ses appelants intacts : `routes/myalerts.js` L331 et L528 (bloc « Mon compte ») — le **rang perso continue de fonctionner sans rien changer**.
- `getTop20Ids` n'a que **deux appelants**, tous deux dans le périmètre archivé : `collections.js:97` et `decks.js:413`. Après archivage, la **fonction reste exportée et intacte** dans `points.js` mais devient **non appelée** (dormante), car ses seules surfaces d'affichage (tuiles-deck, profil forum decks) disparaissent avec l'UI decks.

**Conséquence** : il n'y a **pas de fonction à sauver du périmètre archivé**. Le classement/points survit tel quel. La seule question réelle est le **sort d'affichage du badge Top 20** (traité en §4). Je propose quand même 2-3 options au §4 comme demandé, mais la réalité rend le sujet quasi nul.

---

## 1. Périmètre de masquage UI — Bloc E consolidé (avec les 3 arbitrages)

Rendre decks + skins-boutique inaccessibles **sans supprimer la logique/donnée serveur**. Tableau complet (les 10 points de l'audit + les ajouts forum de l'ARBITRAGE 1 + la nuance points de l'ARBITRAGE 2) :

| # | Point d'entrée | Emplacement | Sort |
|---|---|---|---|
| 1 | Icône « sac » header | `header.js` L49-50, L288, L349 | **Masquer** (skins/boutique) |
| 2 | Menu « Mes decks » | `header.js` L110 | **Masquer** (decks) |
| 3 | Lien « Boutique / Débloquez des skins » (profil) | `profile.js` L315-320 | **Masquer** (boutique) |
| 4 | Bloc « Mes points » (solde/rang) | `profile.js` L293-313 | **CONSERVÉ** (ARBITRAGE 2) — sans mention boutique/skins |
| 5 | Tuiles-deck dans la grille | `site.js` `loadDecksIntoGrid()` L2829-2870 (appel L2819) | **Masquer** (decks) |
| 6 | Étagère collections | `index.html` `#collections-shelf` L80-93 | Déjà `hidden` — confirmer neutralisation |
| 7 | Sélecteur « Apparence » par deck | `decks.js` `.deck-appearance` L694, repli `/boutique` L494 | **Masquer** (skins deck) |
| 8 | Boutons boutique (acheter/équiper/retirer) | `boutique.js` L198/213/226 ; `boutique.html` `#shop-sec-*` L61/66 | **Masquer** (boutique) |
| 9 | Pages SSR | `index.js` `/mes-decks` L229, `/mes-decks/nouveau` L234, `/boutique` L239, `/deck/:token` L256, `/collection/:slug` L299 | **Démonter** (decks/boutique) |
| 10 | Badge Top 20 | CSS `.deck-badge-top20` `site.css` L2771-2773 ; via `getTop20Ids()` | Disparaît avec les surfaces deck (voir §4) |
| **11** | **Application du skin dashboard sur les cartes** | `myalerts.js:247` (`AS dashboard_skin`, exposé L360) → `site.js:2697` (`classList.add`) | **Neutraliser** (skins ; recoupe le chantier format-carte) |
| **12 (ARB.1)** | **Section « Ses decks » du profil forum** | `routes/forum.js` L794-825 + `public/js/profile-decks.js` | **Masquer** (route/section forum) |
| **13 (ARB.1)** | **Tag/mention @slug de deck dans le forum** | `routes/forum.js` cibles taguables L709-722, mentions @slug L730-762 | **Masquer** (aucun « deck » visible en forum) |
| **14 (ARB.1)** | **Route API decks du profil forum** | `routes/forum.js` GET `/api/forum/u/:pseudo/decks` L836-866, compteur `/api/forum/deck/:slug/count` L888-892, route page `/forum/deck/:slug` L501-540 | **Démonter/masquer** (surfaces publiques deck) |

**Rappel ARBITRAGE 1** : la **donnée et la logique serveur interne** qui empêchent le forum de casser restent en place et fonctionnelles — `forum_topics.deck_id`, la contrainte « une seule cible » `source_id` OU `deck_id` (init.sql L4608), `resolveDeckId()`. Seul **l'affichage utilisateur** disparaît intégralement (decks compris). Concrètement : on ne masque pas la colonne `deck_id` ni la contrainte ; on retire les **surfaces** (section profil, tags, routes publiques deck du forum). Point de vigilance : vérifier qu'aucun **topic existant déjà rattaché à un deck** ne provoque une erreur de rendu une fois ces surfaces retirées (repli d'affichage à confirmer lors du code).

**Rappel ARBITRAGE 3** : `/community-reports/:id/extend` reste **non exposée**. Ne pas ajouter de bouton « prolonger » — ni ici, ni au cadrage ÉTAPE 3.

---

## 2. Mécanisme d'archivage — 3 options (avantages / inconvénients)

Contrainte commune : **code non supprimé, récupérable ; plus exécuté ni accessible en usage normal ; pas de demi-mesure** (ARBITRAGE 1 : abandon, pas suspension). Couches à neutraliser : routes SSR + routeurs API (`index.js`), fichiers JS front référencés par `<script>`, blocs CSS de `site.css`, points d'entrée UI (tableau §1), pages HTML dédiées.

### Option A — Feature-flag serveur unique, désactivé par défaut
Un module `server/features.js` exporte `{ decks:false, skins:false }` ; `index.js` conditionne chaque `app.use`/`app.get` au flag ; le flag est propagé au front (variable globale injectée en SSR ou petit endpoint) et chaque point d'entrée UI teste le flag.
- **+** Réversibilité instantanée (flip du flag) ; aucun fichier déplacé ; un seul point de vérité ; diff modéré.
- **−** Le code reste **chargé/montable** (contraire à « abandon net ») ; il faut câbler CHAQUE point d'entrée sur le flag, front inclus (canal flag→front à créer) ; risque d'oubli silencieux d'une surface ; les fichiers JS restent servis sauf conditionnement du `<script>`. **Sémantiquement une suspension déguisée**, pas un abandon — en tension avec l'ARBITRAGE 1.

### Option B — Démontage dur + archivage physique dans `_archive/`
Déplacer les fichiers **dédiés** (`routes/decks.js`, `routes/collections.js`, `routes/skins.js`, `public/js/{decks,collection-page,deck-shared,boutique,profile-decks,deck-stack,deck-motifs,deck-add}.js`, `public/{mes-decks,boutique,collection,deck}.html`) vers `server/_archive/` et `public/_archive/` (hors montage, hors `express.static`). Retirer les `app.use`/`app.get` de `index.js`, les `<script>`/blocs HTML des pages survivantes, extraire les blocs CSS deck/skin de `site.css` vers `public/_archive/decks-skins.css` (non chargé), retirer les points d'entrée UI.
- **+** **Abandon net** : plus rien monté, chargé, ni téléchargé par le navigateur (gain perf) ; aucun code mort actif ; aligné sur « pas de demi-mesure » ; récupérable via git + dossier `_archive/`.
- **−** Le plus invasif ; nombreux points de retrait ; **extraction CSS délicate** (un seul gros `site.css`, blocs deck/skin **entrelacés** avec le format carte — cf. B.7-2/3 : le radar `.fullart` et les faces partagent des sélecteurs) → risque de casse visuelle sur ce qui survit ; réversibilité = revert git (moins « flip » que A).

### Option C — Hybride : démontage des surfaces, fichiers laissés en place (non référencés)
Retirer les `app.use`/`app.get`, les `<script>`/HTML, les points d'entrée UI **exactement comme B**, mais **laisser les fichiers `.js` sur disque** (juste plus référencés/servis via `<script>`), avec un en-tête de commentaire `// ARCHIVÉ fil #9 (12/09/2026) — non monté, non référencé`. Pour le CSS : **laisser les blocs deck/skin en place dans `site.css`** — ils deviennent **inertes** dès que les classes (`.card.flip` skins, `.deck-*`, `.skin-*`) ne sont plus émises par le front archivé, **sans** tenter l'extraction risquée.
- **+** Abandon net **côté utilisateur** (rien d'accessible/monté) ; **évite l'extraction CSS dangereuse** ; diff surtout fait de retraits de montage/référence (lisible, faible risque) ; fichiers récupérables sans fouiller `_archive/`.
- **−** Fichiers « morts » restent dans l'arborescence (moins propre que `_archive/`) ; **CSS mort conservé dans `site.css`** (poids, mais neutralisé par le chantier format-carte qui réécrira ce fichier) ; un `<script>` pourrait être re-référencé par inadvertance.

### Recommandation (non imposée)
**Option C** paraît le meilleur compromis pour CE codebase : elle réalise l'abandon net réclamé (ARBITRAGE 1) tout en **contournant le seul vrai piège technique** — l'extraction CSS d'un `site.css` où decks/skins/format-carte sont **entrelacés**. Le nettoyage CSS profond a de toute façon vocation à être fait par le **chantier format-carte** (qui réécrit le rendu et le CSS des cartes), pas par l'archivage. **B** reste défendable si Hugo veut un `_archive/` explicite et accepte le risque CSS. **A** est déconseillée (suspension, pas abandon).
**Sous-décision à trancher séparément** : que fait-on du CSS deck/skin — laissé inerte dans `site.css` (C), ou extrait vers un fichier archivé (B) ? Je recommande « laissé inerte, nettoyé par le chantier format-carte ».

---

## 3. Sort des données en base (aucune perte silencieuse)

**Principe proposé : ne rien DROP, ne rien DELETE.** Toutes les tables/colonnes restent en place, simplement **plus lues par aucune UI survivante**. Tables/colonnes concernées : `collections`, `collection_items`, `collection_adoptions`, `deck_reports`, `display_name_changes`, `skins`, `user_skins`, `subscribers.equipped_dashboard_skin_id`, `collections.equipped_skin_id`, `points_ledger` (events `DECK_*` historiques), `subscribers.points_balance`/`leaderboard_optout`, `display_name`, `forum_topics.deck_id`.

Ce qui reste **lu** après archivage (à traiter) :
- `skins.asset_ref` était lu par 4 routeurs. Deux disparaissent (collections, decks). Restent : `myalerts.js:247` (`dashboard_skin`, appliqué sur `#grid` par `site.js:2697`) → **à neutraliser** avec l'archivage skins (point #11) ; `forum.js:843` (`deck_skin` dans la requête « Ses decks ») → disparaît avec le démontage de cette route (point #14). Après ça, **plus aucune** lecture de `skins.asset_ref`.
- `subscribers.display_name` reste lu (pseudo forum) — **normal, doit survivre** ; la route qui l'écrit (`decks.js:113`) est dans un fichier archivé → **à déplacer** (voir §5, frontière B).

**Risques si on laisse tel quel (à connaître, pas à corriger sauf mention)** :
- Aucune perte de données. Les FK `equipped_*_skin_id ON DELETE SET NULL` protègent même si un jour on purgeait `skins`.
- `points_balance` reste crédité par le flux d'abonnement de base (`award('ALERT_SUBSCRIBED')`, `subscribe.js:156`, `myalerts.js:651/742`) — **classement toujours alimenté**, conforme ARBITRAGE 2.
- Les constantes `DECK_*` de `POINTS` (points.js L15-20) deviennent inutilisées (aucun appel `award('DECK_*')` après archivage). **Inoffensif** — je propose de **ne pas y toucher** (ARBITRAGE 2 : ne pas nettoyer points.js).
- Seul risque de rendu : un topic forum encore rattaché à un `deck_id` après masquage des surfaces deck — à couvrir par un repli d'affichage (§1, point #12/#14).

**Pas de migration DB nécessaire pour l'archivage** (aucun schéma modifié : on ne fait que cesser de lire). Si Hugo voulait un jour marquer un statut « archivé » en base, ce serait un chantier distinct, séquence stricte habituelle — **hors périmètre ici**.

---

## 4. Sort de `getTop20Ids`/`getRank` et du badge Top 20 (ARBITRAGE 2)

Rappel du §0 : rien n'est à sauver du périmètre archivé, les deux fonctions vivent dans `points.js` (survit) et ne lisent que `subscribers`. Options demandées :

- **Option 1 (recommandée) — ne rien faire.** `getRank` garde ses appelants (`myalerts.js`) → rang « Mon compte » **intact**. `getTop20Ids` reste exportée dans `points.js`, **dormante** (ses appelants deck disparaissent). Le **badge Top 20 cesse de s'afficher** car ses seules surfaces (tuiles-deck, profil forum decks) sont masquées — cohérent, puisque « Top 20 » n'avait de surface que sur des affichages deck. Aucune ligne de code à déplacer.
- **Option 2 — réafficher le Top 20 ailleurs (nouvelle surface non-deck).** Si Hugo veut conserver un badge Top 20 **visible** (ex. sur le profil forum public à côté du pseudo, indépendamment des decks), il faudrait câbler `getTop20Ids()` sur cette nouvelle surface. **C'est une petite fonctionnalité neuve, hors archivage** — à ouvrir en fil séparé si désiré.
- **Option 3 — ne rien changer à `points.js` du tout, y compris les constantes.** (Complément d'Option 1.) Laisser `DECK_*` dans `POINTS` inutilisé plutôt que « nettoyer », conformément à l'ARBITRAGE 2. Recommandé.

**À trancher par Hugo** : le badge Top 20 **disparaît-il** avec les surfaces deck (Option 1, défaut naturel), ou veut-il une **nouvelle surface** d'affichage (Option 2, fil séparé) ?

---

## 5. Frontières non-nettes à trancher **avant** de coder l'archivage

Ces couplages (audit Bloc D) nécessitent une décision, sinon le code casse ou un fichier « decks » reste requis par un survivant :

- **(B) Route pseudo public dans un fichier archivé.** `POST /my-alerts/display-name` vit dans `decks.js:113` mais **sert le forum** (signe les messages). Si `decks.js` est archivé, cette route disparaît → **casse le renommage de pseudo forum**. → **Décision requise** : déplacer cette route (+ helpers `display_name_changes`, `ensurePseudo`) vers un module survivant (`routes/myalerts.js` ou `routes/forum.js`) avant/pendant l'archivage. Je proposerai le point d'accueil au moment du code si Hugo valide le principe.
- **(A/E) `loadDecksIntoGrid` et le tri fusionné.** `site.js` fond les tuiles-deck dans `#grid` et le **tri commun cartes+decks** (L1878-1879). Retirer les tuiles doit **laisser le tri des cartes d'alerte intact** — à vérifier finement (ce fichier recoupe le chantier format-carte).
- **(D/#11) Skin dashboard appliqué au kiosque.** `myalerts.js:247` → `site.js:2697` applique une classe de skin sur `#grid`. Neutraliser côté skins **recoupe** le chantier format-carte (qui supprime le format carte skinné). → Cohérence à assurer entre archivage skins et refonte carte.
- **(Forum/ARB.1) Repli d'affichage des topics rattachés à un deck** — cf. §1 #12/#14.

---

## 6. CACHE_VERSION / Service Worker (réflexe projet)

- L'archivage **modifie JS/CSS/HTML** et **retire des `<script>`** → **bump de `CACHE_VERSION` obligatoire** (réflexe déjà documenté dans le projet) pour forcer la mise à jour SW chez les clients.
- **Point de vigilance à vérifier lors du code** : si `public/sw.js` **précache une liste de fichiers explicite** incluant des fichiers deck/skin (`decks.js`, `boutique.js`, `deck-stack.js`, etc.), retirer ces fichiers (Option B) ou cesser de les référencer (Option C) **sans mettre à jour la liste de précache ferait échouer l'install du SW** (404 sur un asset précaché). → Auditer la liste de précache de `sw.js` **avant** de retirer/déplacer, ajuster + bump `CACHE_VERSION` dans le même lot.
- Option C (fichiers laissés sur disque, non déplacés) **réduit ce risque** : les fichiers restent servis même si non référencés par `<script>`, donc un précache résiduel ne 404 pas — argument de plus pour C.

---

## 7. Ce qui N'EST PAS touché (garde-fous)

- **Système de points/classement** : `points.js`, `points_ledger`, `points_balance`, `leaderboard_optout`, `getRank`, badge Top 20 (fonction). **Aucune modification** au-delà du retrait du lien/section boutique (ARBITRAGE 2). Pas de pause, pas de nettoyage.
- **Cartes communautaires** : toute la logique métier (`community-types.js`, `community-reports-expire.js`, routes create/join/`/spot`/`/extend`/`/resolve`). Seul l'habillage migrera (chantier format-carte, ÉTAPE 3).
- **`/extend`** : reste non exposée (ARBITRAGE 3). **Ne reviendra pas** au cadrage ÉTAPE 3.
- **Sources classiques, favoris (« Ma collection »), forum (logique interne), poller** : inchangés.

---

## Questions de validation avant tout code

1. **Mécanisme d'archivage** : Option A (flag), **B** (`_archive/` + extraction CSS), ou **C** (démontage des surfaces, fichiers laissés inertes) ? *(Je recommande C.)*
2. **CSS deck/skin** : laissé inerte dans `site.css` et nettoyé par le chantier format-carte (C), ou extrait maintenant vers un fichier archivé (B) ? *(Je recommande « laissé inerte ».)*
3. **Badge Top 20** : disparaît avec les surfaces deck (Option 1, défaut), ou nouvelle surface d'affichage à créer en fil séparé (Option 2) ?
4. **Route pseudo public** (`display-name`) : d'accord pour la **déplacer** vers un module survivant (myalerts ou forum) plutôt que la perdre avec `decks.js` ? *(Nécessaire pour ne pas casser le renommage forum.)*
5. **Données en base** : d'accord pour tout **conserver tel quel** (aucun DROP/DELETE, aucune migration) ?

Je n'écris aucun code d'archivage avant ton feu vert sur ces points.

---

*Fin de la proposition ÉTAPE 2. Aucune modification de code effectuée.*
