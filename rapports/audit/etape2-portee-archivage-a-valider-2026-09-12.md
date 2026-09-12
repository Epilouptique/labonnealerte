# ÉTAPE 2 — PORTÉE de l'archivage à valider AVANT diff — fil #9

**Date : 2026-09-12** · Re-vérification du working tree faite. **Aucun fichier déplacé, aucun code écrit à ce stade.** Ce document liste (1) les fichiers à déplacer, (2) les retraits ligne-à-ligne dans les fichiers partagés, (3) les garanties (CSS-inerte, SW), (4) les points de jugement à trancher. Après ton feu vert sur la **portée**, je produis le diff complet.

Mécanisme retenu (REPONSE 1) : **démontage complet + déplacement physique** des fichiers 100 % dédiés vers un dossier hors arborescence servie ; **retrait chirurgical** du code deck/skin dans les fichiers partagés ; **CSS laissé inerte** dans `site.css` (nettoyé à l'ÉTAPE 3), sous garantie qu'aucun JS actif n'émet plus les classes ciblées.

---

## 1. Destination d'archive proposée

**`_archive/fil9-decks-skins/`** à la **racine du dépôt**, en dehors de `public/` et de tout ce que `server/index.js` monte ou sert. Sous-arbre proposé reproduisant l'origine pour récupération lisible :
- `_archive/fil9-decks-skins/server/routes/…`
- `_archive/fil9-decks-skins/public/js/…`
- `_archive/fil9-decks-skins/public/…` (pages HTML)

Garanties : ce dossier n'est jamais `require()` (aucun montage dans `index.js`), jamais servi (`express.static('public')` ne le voit pas — il est hors `public/`), jamais référencé par un `<script>`. Reste versionné git (récupérable).

**À vérifier au diff** : qu'aucun outil annexe (scripts de build, `scripts/`, tests) ne référence ces chemins. Repéré : `scripts/capture-decks-ribbon.js` (script de capture d'écran hors runtime) référence le chantier deck-stack — **non servi, sans impact runtime** ; je le laisse tel quel sauf avis contraire.

---

## 2. Fichiers 100 % dédiés à DÉPLACER (source → destination)

### Serveur (routeurs entièrement dédiés)
| Source | Destination |
|---|---|
| `server/routes/decks.js` | `_archive/fil9-decks-skins/server/routes/decks.js` |
| `server/routes/collections.js` | idem |
| `server/routes/skins.js` | idem |

⚠️ **`decks.js` contient la route pseudo `POST /my-alerts/display-name` (L112-145) qui doit SURVIVRE** (REPONSE 4) → elle n'est PAS archivée, elle est **déplacée dans un module survivant** (voir §3.K) AVANT de bouger le fichier.

### Front (fichiers dédiés)
| Source | Destination |
|---|---|
| `public/js/decks.js` | `_archive/fil9-decks-skins/public/js/decks.js` |
| `public/js/collection-page.js` | idem |
| `public/js/deck-shared.js` | idem |
| `public/js/boutique.js` | idem |
| `public/js/profile-decks.js` | idem |
| `public/js/deck-stack.js` | idem |
| `public/js/deck-motifs.js` | idem |
| `public/js/deck-add.js` | idem |
| **`public/js/holo.js`** *(ajout proposé — voir Q1)* | idem |

### Pages HTML (dédiées)
| Source | Destination |
|---|---|
| `public/mes-decks.html` | `_archive/fil9-decks-skins/public/mes-decks.html` |
| `public/boutique.html` | idem |
| `public/collection.html` | idem |
| `public/deck.html` | idem |

**Ajout re-vérifié : `holo.js`** — effet holographique **exclusivement** pour `#grid.skin-dresseur` (`holo.js` L20 early-return si pas fine-pointer, L44 `return` si `#grid` n'a pas `.skin-dresseur`). 100 % skin → candidat naturel à l'archive. Chargé uniquement par `index.html:381`. **→ Q1.**

---

## 3. Retraits ligne-à-ligne dans les fichiers PARTAGÉS (survivent)

> Numéros de ligne = working tree au 12/09 ; **re-confirmés au moment du diff** (le tree bouge). Regroupés par fichier.

### A. `server/index.js`
- L15-17 : retirer les 3 `require('./routes/{collections,decks,skins}')`.
- L186-188 : retirer les 3 `app.use('/api', …Router)`.
- L228-235 : retirer les routes SSR `/mes-decks` et `/mes-decks/nouveau`.
- L238-240 : retirer la route SSR `/boutique`.
- L256-… (`/deck/:token`, SELECT collections L259) : retirer la route SSR.
- L298-303 (`/collection/:slug`, SELECT collections L303) : retirer la route SSR.
- **Ajout** : monter la nouvelle route pseudo si son module d'accueil l'exige (voir §3.K — a priori aucun nouveau montage si accueil = myalerts, déjà monté).

### B. `public/index.html`
- L384 `<script src="/js/deck-motifs.js">` · L385 `deck-stack.js` · L398 `deck-add.js` → retirer.
- L381 `<script src="/js/holo.js" defer>` → retirer **si Q1 = oui**.
- Bloc `#collections-shelf` L80-93 (déjà `hidden`) + `#deck-tiles-src` L93 : retirer le markup mort.

### C. `public/favoris.html` *(page qui SURVIT)*
- L56 `deck-motifs.js` · L57 `deck-stack.js` · L60 `deck-add.js` → retirer.

### D. `public/js/favoris.js` *(SURVIT — contient une fonctionnalité deck-favoris à retirer)*
- Retirer `deckFavIds`/`deckFavSave` (L25-29), `renderDeckFavorites` (L34-…), les appels `await renderDeckFavorites()` (L189, L210), le handler « cœur de tuile-deck » (L91-107, la branche `.deck-card[data-deck-tile]`), et la prise en compte `.deck-card` dans `hasAny` (L84, L108). **Conserver** toute la logique favoris de sources (« Ma collection »).

### E. `public/js/site.js` *(SURVIT)*
Retraits **durs** (émetteurs de classes deck/skin + entrées deck) :
- L2697 `if (s.data.dashboard_skin) g.classList.add(s.data.dashboard_skin);` → retirer (émet `.skin-*` sur `#grid`). *(recoupe le chantier format-carte)*
- L2819 appel `loadDecksIntoGrid();` + toute la fonction `loadDecksIntoGrid()` (≈ L2829-2921) → retirer (émet `.deck-card`, `deck-badge-top20`, `deck_skin`).
- `bindDeckSwitches()` (≈ L2976-…) → retirer.
- `loadCollections()` (≈ L3028-3059, déjà désactivée) → retirer.
- Commentaire/hook d'exposition « pour collection-page.js / deck-shared.js » L241 → ajuster (ces pages sont archivées).

Retraits **doux** (à trancher — Q3) : les ~15 gardes défensives `if (…closest('.deck-card')) return;` (L132, 252, 338, 422, 443, 508-514, 576, 591, 708, 768, 782, 842, 1272, 1288, 1301, 1315, 1358) et les sélecteurs de tri `.deck-card[data-deck-tile]` (L422, 443, 2923, 2937). **Après retrait des émetteurs, plus aucun `.deck-card` n'est créé** → ces gardes ne matchent plus rien (inertes, sans risque). Les retirer = churn dans un fichier que l'ÉTAPE 3 réécrit. **→ Q3.**

### F. `public/js/cards.js` *(SURVIT — cœur du rendu carte)*
Retraits **durs** (fonctionnalité DECK) :
- Bouton `.card-add-deck` (≈ L607-611) + logique `has-add` associée → retirer (deck-add.js archivé).
- `deckFace()` (≈ L801-808, émet `.card-deck-face`) + son appel dans `cardHTML` (≈ L870) → retirer.
- Le lien `forumLinkText` (L123) est **PARTAGÉ** cartes-source + deck-stack : **conserver** (utilisé par les cartes de source survivantes) ; seul l'appelant deck-stack disparaît.

Retraits **skin** (markup structurel skin-only : `.card-seal`, `attacksHTML`, `FOOT_HTML`, `.card-edition`, `.card-stat`, `.card-fineprint`) — **à trancher (Q4)** : ce markup est `display:none` par défaut (inerte sans classe `.skin-*` sur un ancêtre, ce qui n'arrive plus après retrait de E/L2697). Le retirer honore « aucune trace » ; le garder est sans effet visible et l'ÉTAPE 3 réécrit `cards.js`. **→ Q4.**

### G. `public/js/header.js` *(SURVIT)*
- L49-50 `SHOP_LINK_HTML` (déf) + injections L288 et L349 → retirer (lien sac/boutique).
- L110 entrée menu « Mes decks » → retirer.

### H. `public/js/profile.js` *(SURVIT)*
- L315-320 rangée « Boutique / Débloquez des skins » → retirer.
- **Conserver** le bloc « Mes points » (solde L293-298, rang L300-306, opt-out L311-313) — REPONSE 2 : intact, sans mention boutique/skins.

### I. `server/routes/forum.js` *(SURVIT — surgery d'AFFICHAGE deck, ARBITRAGE 1)*
Retirer les **surfaces utilisateur** deck, en gardant la **logique interne** (resolveDeckId, `deck_id`, contrainte « une seule cible ») pour ne pas casser :
- Section « Ses decks » du profil : `decksSection` (L803-806) → retirer (coquille + bouton).
- Tableau de scripts du profil (L825) : retirer `deck-motifs.js`, `deck-stack.js`, `profile-decks.js` (garder `cards.js`).
- Route API `GET /api/forum/u/:pseudo/decks` (L836-866, lit `skins.asset_ref` L843) → démonter.
- Compteur `GET /api/forum/deck/:slug/count` (L888-892) → démonter.
- Route page `GET /forum/deck/:slug` (L501-540) → démonter/masquer.
- Cibles taguables « deck » en création de sujet (L709-722) → retirer l'option deck de l'UI.
- Mentions `@slug` de deck (L730-762) → ne plus rendre les mentions deck (rendu neutre du texte).
- **À garder** : `resolveDeckId()` (L176-179), le `deck_id` sur `forum_topics`, la contrainte L4608, et le rendu des topics existants → **repli d'affichage à prévoir** pour un topic déjà rattaché à un deck (ne pas planter). **Détail sensible à cadrer au diff.**

### J. `public/sw.js` *(SURVIT)*
- L10 `CACHE_VERSION = 'v13'` → **bump `'v14'`**.
- `PRECACHE` (L16) = `[OFFLINE_URL, '/favicon.svg', '/icons/icon-192.png']` : **aucun** fichier deck/skin précaché → **aucun risque de 404** au déplacement. ✔ (vérifié)

### K. Déplacement de la route pseudo (REPONSE 4)
- Extraire de `server/routes/decks.js` : `POST /my-alerts/display-name` (L112-145) **vers `server/routes/myalerts.js`** (accueil recommandé : déjà monté sur `/api`, déjà consommateur du pseudo via le profil, déjà importe `authenticate`/`getRank`).
- Dépendances à porter dans myalerts.js : `ensurePseudo` (`require('../pseudo')`), `ugc` (validateDisplayName — vérifier s'il est déjà importé dans myalerts), table `display_name_changes` (rate-limit 3/30j, SQL inline, aucune dépendance de module). Adapter le helper d'auth au style de myalerts.js.
- **Aucune** logique deck n'accompagne ce déplacement (seulement le pseudo public). **→ Q5** (accueil myalerts OK ?).

### L. `server/auth-transport.js` *(commentaires seulement)*
- L36-41 : commentaires de doc citant `collection-page.js`, `deck-shared.js`, `deck-add.js`, `boutique.js` (fichiers archivés). **Aucun code**, pure doc. Proposition : mettre à jour le commentaire. Sans impact runtime. **→ inclus si tu veux la propreté doc, sinon laissé.**

---

## 4. Fichiers partagés confirmés SANS retrait nécessaire

- `server/community-types.js` : **aucune** occurrence deck/skin/points (grep = 0). Intact.
- `server/routes/community-reports.js` : aucune logique deck/skin. Intact.
- `public/js/list-view.js` : aucune fonctionnalité deck ; unique trace = `classList.remove(…, 'face-deck')` L234 (défensif, inerte). **Aucun retrait requis** (option cosmétique : retirer `'face-deck'` de la liste — négligeable).
- `server/points.js` : **intact** (REPONSE 2). `getTop20Ids` devient dormante (appelants archivés) mais reste exportée ; `getRank` garde ses appelants (myalerts). Constantes `DECK_*` laissées inutilisées (non nettoyées, conforme).

---

## 5. Garantie CSS-INERTE (condition stricte de la REPONSE 1)

Le CSS deck/skin reste dans `site.css` mais devient **invisible** car **plus aucun JS actif n'émet les classes ciblées**. Émetteurs recensés et neutralisés :

| Classe CSS | Émetteur(s) | Sort |
|---|---|---|
| `.skin-*` (sur `#grid`) | `site.js:2697` (`dashboard_skin`) | retiré (§3.E) |
| `.skin-*` (sur `.deck-card`) | `site.js` loadDecksIntoGrid `deck_skin` L2873 | retiré (§3.E) |
| `.skin-*` (deck partagé/profil) | `deck-shared.js` L66-67, `profile-decks.js` L44-46 | archivés |
| `.deck-card` | `site.js` loadDecksIntoGrid, `favoris.js` renderDeckFavorites, `deck-stack.js` | retirés/archivés |
| `deck-badge-top20` | `site.js:2850`, `decks.js` | retiré/archivé |
| `.card-deck-face` | `cards.js` deckFace | retiré (§3.F) |
| `.deck-stack` | `deck-stack.js` | archivé |

**Vérification proposée au diff** (à consigner dans le rapport final) : `grep -rn "skin-\|deck-card\|card-deck-face\|deck-badge-top20\|deck-stack" public/js` **restreint aux fichiers survivants** ne doit renvoyer que des **lectures/gardes défensives** (`closest('.deck-card')`, `classList.remove('face-deck')`), **jamais une émission** (`classList.add`, `class="deck-card"`, template string créant l'élément). C'est la preuve formelle d'inertie.

---

## 6. Données en base — aucune modification (REPONSE 5)

Aucun DROP/DELETE/migration. Tables/colonnes conservées : `collections`, `collection_items`, `collection_adoptions`, `deck_reports`, `display_name`/`display_name_changes`, `skins`, `user_skins`, `equipped_dashboard_skin_id`, `equipped_skin_id`, `points_ledger`, `points_balance`, `leaderboard_optout`, `forum_topics.deck_id`. Après démontage : **plus aucune lecture** de `skins.asset_ref` (les 4 lecteurs disparaissent : collections/decks archivés, `myalerts:247` neutralisé §3.E, `forum:843` démonté §3.I). FK `ON DELETE SET NULL` = filet résiduel. `points_balance` reste alimenté par le flux d'abonnement de base (`award('ALERT_SUBSCRIBED')`).

---

## 7. Vérifications restantes à faire AU MOMENT DU DIFF (traçabilité)

1. `grep require('./collections')` / `require('../collections')` : confirmer que **seul** `decks.js` importe les helpers de collections (`resolveInstances`, `recomputeDeckCategories`, `addFavorite`) — sinon un survivant en dépend et il faut les reloger. *(À ce stade, seul decks.js L11 repéré.)*
2. Re-confirmer les numéros de ligne (working tree mouvant).
3. Repli d'affichage forum pour un topic rattaché à un `deck_id` (§3.I).
4. `addFavorite` : `collections.js` l'exporte et `decks.js`/l'adoption l'utilisent ; vérifier qu'aucun flux d'abonnement survivant (subscribe.js/myalerts.js) n'en dépend (a priori non — ils ont leur propre `addFavorite`/INSERT favorites).

---

## 8. Points de jugement à trancher AVANT le diff

- **Q1 — `holo.js`** : l'archiver comme fichier 100 % skin (recommandé) ? Ou le garder (il ne s'active jamais sans `.skin-dresseur`, donc inerte de fait) ?
- **Q2 — Emplacement d'archive** : `_archive/fil9-decks-skins/` à la racine te convient-il ? (hors `public/`, hors montage, hors static)
- **Q3 — Gardes défensives `.deck-card` dans `site.js`** : les retirer (propreté « aucune trace ») ou les laisser inertes (moins de churn, l'ÉTAPE 3 réécrit site.js) ? *(Je penche pour « laisser », car inertes et fichier bientôt réécrit.)*
- **Q4 — Markup structurel skin dans `cards.js`** (`.card-seal`, `attacksHTML`, `FOOT_HTML`, `.card-edition`, `.card-stat`, `.card-fineprint`) : le retirer maintenant (cohérent « aucune trace ») ou le laisser inerte jusqu'à la réécriture ÉTAPE 3 ? *(Je penche pour « retirer maintenant » afin d'honorer la garantie d'inertie sans dépendre du CSS ; mais c'est du churn dans un fichier réécrit — ton arbitrage.)*
- **Q5 — Accueil route pseudo** : `myalerts.js` te convient-il comme destination de `POST /my-alerts/display-name` ?
- **Q6 — Commentaires doc `auth-transport.js`** (L36-41 citant des fichiers archivés) : les mettre à jour dans ce lot, ou laisser ?

---

Dès ton feu vert sur cette **portée** (et tes réponses Q1-Q6), je produis le **diff complet** puis le **rapport récapitulatif** (fichiers déplacés, retraits par fichier, preuve CSS-inerte, CACHE_VERSION/sw.js, résidus/risques). Je ne déplace/n'édite rien avant.

*Fin du document de portée. Aucune modification effectuée.*
