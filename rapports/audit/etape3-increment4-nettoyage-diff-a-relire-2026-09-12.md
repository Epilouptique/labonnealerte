# ÉTAPE 3 — Incrément 4 (nettoyage final du format carte) — diff à relire — fil #9

**Date : 2026-09-12** · Code écrit, **non commité** (relecture Hugo avant commit).
**Diff : 3 fichiers, +19 / −1834.** `public/js/cards.js`, `public/css/site.css`, `public/sw.js`.
**100 % front. Aucun changement de comportement** : `site.js`, `list-view.js`, `user-task-form.js` ne sont **pas** touchés — nettoyage pur (retrait de code/CSS mort). Les 3 familles migrées (broadcast/paramétré/linked, communautaire, user-task) et la **vue liste** re-validées par harnais après nettoyage.

---

## 1. cards.js — état constaté (avant → après) et retraits

### renderLegacyCard : code mort pur → retirée
- **Constat (preuve)** : `grep "renderLegacyCard"` → **un seul** hit de code (sa définition) + un commentaire ; `cardHTML()` faisait déjà `return renderBlock(...)` (incrément 3). Aucun appelant.
- **Action** : fonction retirée intégralement, avec toute la chaîne qu'elle **seule** consommait.

### Fonctions retirées (mortes après le retrait de renderLegacyCard — chaîne vérifiée par grep)
`frontFace`, `backFace`, `shareFace`, `taskFace`, `communityReportsFace` (les 5 faces flip) + `attacksHTML` et la constante `FOOT_HTML` (structures **skin « Dresseur »**, appelées uniquement par `frontFace`).

### Constantes retirées
- `FULLART_SVG` (motif full-art, uniquement `frontFace`), `PLUS_SVG` (icône « + deck », **déjà morte** depuis l'archivage decks ÉTAPE 2), `BACK_SVG` (flèche retour des faces ; **exportée mais inutilisée hors cards.js** — le seul hit externe, header.js, est un commentaire ; retirée de l'objet exporté).
- `badgeClassOf` (helper, unique usage dans `frontFace`).

### Markup skin résiduel (différé depuis ÉTAPE 2 Q4) — traité
- L'essentiel vivait **dans `frontFace`** (`.card-art`, `.card-veil`, `.card-edge`, `.card-content`, `.card-textbox`, `.card-action`, `.card-toprow`, `.card-edition`, `.card-stat`, `.card-fineprint`, `.fullart`) et **dans `attacksHTML`/`FOOT_HTML`** (`.card-attacks`, `.card-atk*`, `.card-pip`, `.card-dmg`, `.card-en`, `.card-foot`) → disparu **avec** ces fonctions.
- **Seule exception** vivant dans une fonction **conservée** : les 2 `<span class="card-seal">` (marques skin vides, `aria-hidden`) émis par `topRow()` — retirés à la main ; `topRow()` reste (utilisé par `renderBlock`).

### Conservées (partagées avec renderBlock ou exportées) — vérifié
`communityFace` (via `communityDetail`), `paramFace`, `taskItem`, `dueFr`, `communityReportItem` (exportée, consommée par site.js), `topRow`, `switchRow`, `subForm`, `likeBtn`, `badgeFor`, `stateFor`, etc. Constantes `INFO_SVG`/`SHARE_SVG`/`LIKE_SVG` (émises par le bloc / la vue liste) conservées et toujours exportées.

**Vérif runtime** : harnais Node → l'objet `LBACards` se construit sans `ReferenceError`, `BACK_SVG` n'est plus exporté ni consommé, les 3 familles rendent un `.card.alert-block` **sans aucun résidu flip/skin**.

---

## 2. site.css — retraits (1460 lignes, ~419 règles/sélecteurs)

**Méthode** : parser CSS par accolades (frontières de mot pour éviter les collisions — piège désamorcé : `.card-stat` ⊂ `.card-static-desc`, sélecteur du **bloc**, jamais retiré). Tout sélecteur portant un token **flip / face / décoration-recto / skin** est retiré ; les **groupes mixtes sont scindés** (le sélecteur générique est conservé). **Accolades équilibrées** après coup (1376/1376).

### Retiré « pour de vrai » (plus laissé inerte, contrairement à ÉTAPE 2)
- **Mécanisme flip** : `.card.flip`, `.card.flipped …`, `.card-inner`, `.card-face`, `.card-front …`, `.card-back …`, `perspective`/`transform-style`/`rotateY`/`backface-visibility` **des cartes**.
- **Faces** : `.card-share-face`, `.card-deck-face`, `.card-task-face`, `.card-community-face`, `.card-usertask-face`, `.flip-back`, et les anciennes règles list-view basées sur les faces (`.lrow-exp … .card-usertask-face`, `… .face-task .card-community-face`, etc.).
- **Décoration recto** (markup non émis) : `.fullart` (+ radar `.fa-*` préfixés), `.card-art/-veil/-edge/-content/-textbox/-action/-toprow`, `.card-attacks/-atk*/-pip/-dmg/-en/-foot/-seal/-edition/-stat/-fineprint`, `.card-add-deck`, `.has-add`, `.community-recto`.
- **Skins** : toute règle contenant `skin-` (classes `.skin-*` **et** `[class*="skin-"]`, le sélecteur boutique/deck de skins), y compris le squelette « boutique de skins » (phase 3).
- **@keyframes retirées (9)** : `fa-blip`, `fa-ring` (radar full-art) ; `sk-ec-seal`, `sk-ec-sweep`, `sk-ar-turn`, `sk-as-cost`, `sk-as-sym`, `sk-dr-en`, `sk-dr-en-dk` (skins).
- **10 wrappers `@media` devenus vides** supprimés.

### Groupes mixtes scindés (10) — le sélecteur générique est **conservé**
| Retiré | Conservé |
|---|---|
| `.flip-back`, `.flip-back:hover`, `.flip-back svg` (×4) | `.flip-btn`, `.flip-btn:hover`, `.flip-btn svg` |
| `.community-recto[hidden]` | `.card-subtitle[hidden]`, `.card-static-desc[hidden]` |
| `.card-front .card-top`, `.card-back .card-top` | `.src-head-top` |
| `.ds-face .card.flip` | `.ds-face .card` |
| `.deck-card … .flip-back`, `… .card-share-face`, `… .card-back` (×3) | `.deck-card … .card-like/.card-share/.flip-btn` |

### CONSERVÉ malgré une ressemblance (justifications)
- **`.flip-btn`** (base + `:hover` + `svg` + `.lrow-actions .flip-btn`) : **PAS mort** — la **vue liste** (`list-view.js:119`) émet un `<button class="flip-btn">` comme **icône partagée** (« En savoir plus/statut »), exactement comme `.card-like`/`.card-share`. `.lrow-actions .flip-btn` remet `position:static` (neutralise l'absolu de la base). *(Première passe du script l'avait retiré à tort : détecté au grep JS, corrigé, re-validé.)*
- **`@keyframes bd-slide-in`** : réutilisé par `.fav-title-label.bd-slide-in` (favoris) — commentaire du fichier « ne pas supprimer ». Conservé ; seules ses règles `.community-recto.bd-slide-in` partent.
- **`@keyframes sk-pulse`** + `.card.skeleton .sk` : « sk » = **skeleton loader**, pas skin. Conservé.
- **`.hd-av-front/-back`, `.hd-avatar-link`** (flip de l'avatar header) et **`.m-menu` perspective** (menu mobile) : composants distincts, aucun lien avec les cartes. Conservés.
- **`.tc-author/-dot/-replies`** : **forum topic-card**, homonyme fortuit du `.tc-*` full-art (jamais mis en token). Conservés.

### Sélecteurs signalés (hors périmètre incrément 4, **non retirés**)
- **CSS `.deck-card` / `.ds-*` / `.deck-*` / `.deck-skin-*`** : c'est le **système de decks** (archivé en ÉTAPE 2, CSS laissé inerte), **distinct** du mécanisme flip/skin visé ici et non listé dans le périmètre. Laissé en place, à traiter dans un balayage « CSS decks » dédié si tu le souhaites. *(Les fragments deck **combinés** à un token face/flip ont été scindés — cf. tableau — mais les règles deck autonomes restent.)*
- **Résidu mineur** : 4 déclarations inertes `.fa-c1..fa-c4 { --fa-op }` (variables du radar full-art, plus aucun élément ne les porte) laissées — retrait risquerait de toucher des règles `.card` voisines (`--fa-shift`) ; effet visuel nul. Signalé.

---

## 3. CACHE_VERSION bumpé
`public/sw.js` : **`v14` → `v15`** (nettoyage suffisamment lourd pour le justifier, contrairement aux incréments 1-3 additifs).

---

## 4. Grep exhaustif final (preuves)
- **Aucun sélecteur CSS actif** `skin-`/`fullart`/`card-front`/`card-back`/`card-inner`/`card-face` ne subsiste dans site.css (hors commentaires et hors `.deck-card` signalé). `.flip-back` : disparu (commentaires seuls).
- **JS/HTML actif** (hors `_archive`) : plus aucune émission de `.card-front/-back/-face/-inner`, de `class="card flip"`, de faces, de `.skin-*`, ni de `.community-recto`. `renderCommunityRecto`/`hydrateCommunityRecto` : disparus (commentaires seuls).

### Points signalés au grep (résidus **hors périmètre**, non traités ici)
1. **`site.js`/`list-view.js` conservent des handlers flip/face inertes** (`.flip-btn`/`.flip-back`/`face-*`/`flipped` : ex. `site.js:158`, `list-view.js:234/392-395`). **Ils ne matchent jamais un bloc** (un bloc n'a ni `.flip-btn` de carte, ni `.card-usertask-face`… ; le partage fait `return` sur `.alert-block` avant tout flip — vérifié `site.js:148-150`). C'est la **« dette list-view »** déjà reconnue au fil du chantier : délibérément **non démontée** en incrément 4 pour ne pas déstabiliser la vue liste. Le `.flip-btn` de la vue liste, lui, reste **fonctionnel et stylé**.
2. **⚠️ Bug latent PRÉ-EXISTANT (pas causé par l'incrément 4) — `note()` (`site.js:110`)** : `(card.querySelector('.card-content') || card.querySelector('.card-front')).appendChild(el)` → sur un **bloc** (ni `.card-content` ni `.card-front`), `null.appendChild` **lève une TypeError** quand un message est affiché (chemin **abonnement anonyme broadcast** : « Vérifie tes emails ✉️ »). Présent **depuis l'incrément 1** (les blocs n'ont jamais eu ces conteneurs), indépendant de ce nettoyage. **Non corrigé ici** (hors périmètre « retrait » ; un correctif = changement de comportement à valider). **Correctif suggéré (fil séparé)** : cibler `.ab-body` en repli. À ton arbitrage.

---

## 5. Harnais de validation (après nettoyage, sur le CSS + JS réels)
- **Structurel (Node, 6 familles × 2 modes) : 12/12** → `.card.alert-block`, **0 résidu** flip/skin.
- **Interactif (Playwright, site.css nettoyé chargé)** — mesuré :
  - Bloc : `display:flex`, en-tête flex ; **toggle 26×26, ♥ 36×26, partage 23×23, état 54×19** visibles ; `.ab-detail` = `none` fermé → `flex` ouvert ; desc longue / tags / badge forum visibles dans le détail.
  - Communautaire : bouton « Signaler » + switch visibles.
  - User-task : **pause 127×26**, « + configurer » 31 h ; détail → task-zone/« C'est fait ✓ »/« + une autre tâche » visibles.
  - **Vue liste** : `.flip-btn` **24×24 visible, `position:static`** (icône partagée intacte), ♥ 24×24.
  - **Artefacts flip résiduels dans le rendu : 0.** **0 erreur console.**

---

## 6. Aucun commit
Rien n'est commité/poussé/déployé. Sur ta validation (relecture + navigation rapide), on commit l'incrément 4 (`cards.js`, `site.css`, `sw.js`). Le format carte recto/verso + skins auront alors **entièrement** disparu du code servi. Restent, si tu le veux, deux fils **séparés** que je te signale ci-dessus : (a) balayage « CSS decks » (`.deck-card`/`.ds-*`), (b) correctif `note()` + retrait de la dette flip/face inerte dans site.js/list-view.js.

*Fin du récap incrément 4.*
