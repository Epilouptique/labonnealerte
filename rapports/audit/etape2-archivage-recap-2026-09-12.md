# ÉTAPE 2 — Archivage decks + skins : rapport récapitulatif (fil #9)

**Date : 2026-09-12** · Code écrit, **non commité / non poussé / non déployé** (Hugo relit le diff avant tout commit). Syntaxe validée (`node -c` sur les 13 fichiers partagés édités = OK). Aucune migration DB.

---

## 0. Deux décisions prises en cours d'écriture (à valider au diff)

1. **Nouveau fichier `server/favorites.js`** (non prévu dans la portée validée). **Raison technique impérative** : `routes/subscribe.js` (flux d'abonnement de BASE, survivant) importait `addFavorite` depuis `routes/collections.js` — archiver `collections.js` tel quel aurait **cassé le démarrage du serveur**. `addFavorite` étant un helper générique « abonnement = favori » (identique à un doublon déjà présent dans `myalerts.js`), je l'ai extrait dans `server/favorites.js` (survivant) et repointé `subscribe.js` + `myalerts.js` dessus (dédup au passage). Aucun rapport avec les decks.
2. **`site.js` : code deck laissé INERTE plutôt qu'excisé** (extension assumée de la portée §3.E, alignée sur ta logique Q3/Q4). Le bloc `loadDecksIntoGrid`/`bindDeckSwitches`/`reconcileReco` (~120 l.) est profondément imbriqué dans le pipeline reco/tri/modes-spéciaux. Plutôt qu'une excision risquée dans un fichier **réécrit intégralement à l'ÉTAPE 3**, j'ai **retiré son unique appel** (+ la ligne d'application du skin dashboard). Résultat : les fonctions existent encore mais ne sont **jamais appelées** → aucune tuile-deck, aucune classe émise. Retrait physique reporté à la réécriture site.js (ÉTAPE 3). **Voir §4 pour la preuve d'inertie.**

---

## 1. Fichiers déplacés (16) — `git mv` vers `_archive/fil9-decks-skins/`

Emplacement hors `public/` et hors montage/`express.static` → jamais chargé, requis, importé ni servi. Versionné git (récupérable), apparaît en **rename** dans le diff.

| Source | Destination |
|---|---|
| `server/routes/decks.js` | `_archive/fil9-decks-skins/server/routes/decks.js` |
| `server/routes/collections.js` | `_archive/fil9-decks-skins/server/routes/collections.js` |
| `server/routes/skins.js` | `_archive/fil9-decks-skins/server/routes/skins.js` |
| `public/js/decks.js` | `_archive/fil9-decks-skins/public/js/decks.js` |
| `public/js/collection-page.js` | idem |
| `public/js/deck-shared.js` | idem |
| `public/js/boutique.js` | idem |
| `public/js/profile-decks.js` | idem |
| `public/js/deck-stack.js` | idem |
| `public/js/deck-motifs.js` | idem |
| `public/js/deck-add.js` | idem |
| `public/js/holo.js` *(Q1)* | idem |
| `public/mes-decks.html` | `_archive/fil9-decks-skins/public/mes-decks.html` |
| `public/boutique.html` | idem |
| `public/collection.html` | idem |
| `public/deck.html` | idem |

**Note** : les fichiers archivés contiennent encore leurs `require('./collections')`, `require('../points')`, etc. — sans effet (jamais chargés). `decks.js` archivé garde une **copie** de l'ancienne route pseudo (inerte) ; la version vivante est dans `myalerts.js` (§2).

---

## 2. Retraits/ajouts ligne-à-ligne dans les fichiers PARTAGÉS (survivent)

### Nouveau — `server/favorites.js`
Module de 19 lignes exportant `addFavorite` (INSERT idempotent `ON CONFLICT DO NOTHING`). En-tête expliquant l'extraction.

### `server/routes/subscribe.js`
- Import `addFavorite` : `require('./collections')` → `require('../favorites')`.

### `server/routes/myalerts.js`
- Ajout de 3 imports : `addFavorite` (`../favorites`), `ensurePseudo` (`../pseudo`), `ugc` (`../ugc`).
- **Suppression** du doublon local `addFavorite` (fonction + commentaire).
- **Ajout** de la route `POST /api/my-alerts/display-name` (déplacée depuis `decks.js`), adaptée à `authenticate` ; logique identique (rate-limit 3/30 j, unicité 23505, `ensurePseudo` best-effort). Aucune logique deck.

### `server/index.js`
- Retrait des 3 `require` (`collections`/`decks`/`skins`) → commentaire.
- Retrait des 3 `app.use('/api', …)` correspondants → commentaire.
- Retrait des routes SSR `/mes-decks`, `/mes-decks/nouveau`, `/boutique` → commentaire.
- Retrait de la route SSR `/deck/:token` (bloc complet) → commentaire.
- Retrait de la route SSR `/collection/:slug` (bloc complet) → commentaire.
- **Conservé** : `escHtml`, `/favoris` (redirection), `/source/:id/statut`, tout le reste.

### `public/index.html`
- Retrait des `<script>` : `holo.js`, `deck-motifs.js`, `deck-stack.js`, `deck-add.js`.
- Retrait du bloc commenté `#collections-shelf` + `<div id="deck-tiles-src">` → commentaire une ligne.

### `public/favoris.html`
- Retrait des `<script>` : `deck-motifs.js`, `deck-stack.js`, `deck-add.js`.

### `public/js/favoris.js`
- Suppression `deckFavIds`/`deckFavSave`/`renderDeckFavorites` (fonctionnalité decks-favoris).
- Simplification du handler de clic → ne gère plus que le cœur des cartes-source (retrait favori « Ma collection »).
- `hasAny` : `.card, .deck-card` → `.card`.
- Retrait des 2 appels `await renderDeckFavorites()`.

### `public/js/site.js`
- Retrait de l'application du skin dashboard (`if (s.data.dashboard_skin) g.classList.add(...)`).
- Retrait de l'appel `loadDecksIntoGrid()`.
- **Laissé inerte** (Q3/§0.2) : corps de `loadDecksIntoGrid`/`bindDeckSwitches`/`reconcileReco`, `var decksData = []` (reste vide), gardes défensives `.deck-card`, bloc commenté `loadCollections`.

### `public/js/cards.js`
- Retrait du bouton `.card-add-deck` (`addBtn` → `''`, plus de `showAdd`).
- Retrait de `deckFace()` (émettait `.card-deck-face`) + de son appel dans `cardHTML`.
- **Laissé inerte** (Q4) : markup structurel skin (`.card-seal`, `attacksHTML`, `FOOT_HTML`, `.card-edition`, `.card-stat`, `.card-fineprint`) — invisible sans classe `.skin-*` sur un ancêtre (qui n'est plus jamais posée). Retrait reporté à l'ÉTAPE 3.

### `public/js/header.js`
- Retrait de `SHOP_LINK_HTML` (déf + entrée `shopLink` de `LBAHeader.ICONS` + injection dans `navRight`).
- Retrait de l'entrée de menu « Mes decks ».

### `public/js/profile.js`
- Retrait de la rangée « Boutique / Débloquez des skins ». **Bloc « Mes points » (solde/rang/opt-out) conservé intact** (REPONSE 2).

### `server/routes/forum.js` *(surgery d'affichage, logique interne conservée)*
- `slugBadge()` : branche deck → retour `''` (plus de badge deck sur les cartes de sujet).
- Route `/forum/deck/:slug` : supprimée.
- `/api/forum/taggables` : retrait des decks (requête + réponse).
- `/api/forum/mentionables` : retrait des decks (requête + réponse) ; **membres inchangés**.
- `resolveMentions()` : retrait de la requête decks → un `@slug` de deck reste en **texte brut**.
- `/u/:pseudo` : `decksSection` → `''` ; tableau `scripts` deck vidé.
- Routes `/api/forum/u/:pseudo/decks` et `/api/forum/deck/:slug/count` : supprimées.
- **Conservés** (logique interne, anti-crash) : `forum_topics.deck_id`, contrainte « une seule cible », `resolveDeckId()` (défini, plus appelé), gestion `deck_id` dans `POST /forum/t`.

### `public/js/forum.js` *(client)*
- Combobox de tag : retrait du groupe `deck` + message ajusté + `add(data.decks)` + branche `preDeck` + repli `{ sources: [] }`.
- Mentions : retrait du groupe `deck` + `add(d.decks)` + repli sans `decks`.
- Laissé inerte : `payload.deck_id` (jamais atteignable — aucune option deck sélectionnable).

### `server/auth-transport.js`
- Commentaire de doc : retrait des 4 fichiers archivés cités (`collection-page.js`, `deck-shared.js`, `deck-add.js`, `boutique.js`).

---

## 3. Données en base — AUCUNE modification (REPONSE 5)

Aucun DROP/DELETE/migration. Toutes les tables/colonnes decks/skins/points conservées. Après démontage, **plus aucune lecture de `skins.asset_ref`** (les 4 lecteurs sont archivés ou neutralisés : collections/decks archivés, `myalerts:dashboard_skin` retiré, `forum:deck_skin` retiré avec la route profil). `points_balance` reste alimenté par `award('ALERT_SUBSCRIBED')` (flux d'abonnement de base). Constantes `DECK_*` de `points.js` laissées inutilisées (non nettoyées, conforme).

**Classement/points** (REPONSE 2/§0) : `points.js` **intact**. `getRank` garde ses appelants (`myalerts.js`) → rang « Mon compte » inchangé. `getTop20Ids` devient dormante (appelants archivés). **Badge Top 20 supprimé** de fait (ses seules surfaces étaient les tuiles-deck) — REPONSE 3.

---

## 4. Preuve CSS-INERTE (condition stricte REPONSE 1)

Grep du **code actif** (hors `_archive/`) :
- `require()` d'un routeur archivé : **0** (seulement des commentaires).
- `<script src>` vers un fichier archivé dans `public/**/*.html` : **0**.
- Émetteurs de `.deck-card` / `.skin-*` / `deck-badge-top20` / `deck_skin` : **uniquement lignes 2850/2873/2874 de `site.js`, TOUTES à l'intérieur de `loadDecksIntoGrid` — fonction jamais appelée** (appel retiré ligne 2817). `decksData` reste `[]`. Aucun autre chemin actif n'émet ces classes.
- `dashboard_skin` (émission skin sur `#grid`) : **retiré**.

**Conclusion** : aucune classe deck/skin n'est jamais émise par un chemin **exécuté**. Le CSS deck/skin de `site.css` (laissé en place, non extrait — décision REPONSE 2) est donc totalement inerte et invisible. **Nuance transparente** : les 3 lignes d'émission subsistent physiquement dans le corps mort de `loadDecksIntoGrid` ; elles disparaîtront à la réécriture de `site.js` (ÉTAPE 3). Si tu préfères une excision physique immédiate de `loadDecksIntoGrid`, je peux la faire en complément.

---

## 5. CACHE_VERSION / Service Worker

- `public/sw.js` : `CACHE_VERSION` **`v13` → `v14`** (invalide les caches au déploiement).
- `PRECACHE` = `[OFFLINE_URL, '/favicon.svg', '/icons/icon-192.png']` : **aucun** fichier deck/skin précaché → **aucun risque de 404** SW au déplacement des fichiers. ✔ (vérifié)

---

## 6. Résidus / risques identifiés

- **`server/db/init.sql`** : commentaires citant `routes/decks.js`/`routes/skins.js` (L3776, 3881, 3929) — non touchés (pure doc historique du schéma, DB conservée).
- **`scripts/capture-decks-ribbon.js`** : script de capture hors runtime, laissé tel quel (jamais servi).
- **CSS `site.css`** : blocs deck/skin conservés inertes (poids mort jusqu'à l'ÉTAPE 3) — décision actée.
- **Topics forum existants tagués à un deck** : le badge deck ne s'affiche plus (`slugBadge` → `''`), le `deck_id` reste en base ; aucun crash de rendu (repli = pas de badge). ✔
- **`resolveDeckId`**, constantes `DECK_*`, `payload.deck_id` (client) : code interne conservé mais non atteignable — volontaire (anti-crash / éviter le churn), à nettoyer plus tard si souhaité.
- **Non exécuté par mes soins** : `git commit`, `git push`, `railway up`. À faire par Hugo après relecture. Bump `CACHE_VERSION` déjà inclus dans le lot.

---

## 7. Vérifications effectuées

- `node -c` sur les 13 fichiers partagés édités → **tous OK**.
- Grep : aucun `require`/`<script>` actif vers un fichier archivé.
- Grep : seuls émetteurs deck/skin restants = corps mort de `loadDecksIntoGrid`.
- `_archive/fil9-decks-skins/` contient bien les 16 fichiers (arborescence vérifiée).

---

*Fin du rapport. `/community-reports/:id/extend` reste non exposée (ARBITRAGE 3, hors ÉTAPE 3). Prochaine étape après relecture du diff : ÉTAPE 3 — cadrage du format liste de blocs.*
