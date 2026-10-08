# ÉTAPE 3 — Incrément 1 (format bloc, familles simples) — diff à relire — fil #9

**Date : 2026-09-12** · Code écrit, **non commité** (relecture Hugo avant commit). Périmètre validé : broadcast + paramétré + linked ensemble (P4), coexistence bloc/carte legacy acceptée (P1).

## Fichiers touchés (3) — `git diff --stat` : +133 / −1
- `public/js/cards.js` (+79) — aiguillage + `renderBlock`.
- `public/js/site.js` (+21) — partage bloc → modale, handler `.ab-toggle`.
- `public/css/site.css` (+34) — styles `.alert-block` + bloc parqué en vue liste.
- **`public/js/list-view.js` : NON touché** (le volet fonctionne tel quel — voir §Q3).

## Décision technique P3 (tranchée en explorant)
Le bloc garde la classe **`.card`** (+ `.alert-block`) mais **sans** `.flip`/`.card-inner`/`.card-face`. Motif : `site.js` utilise `closest('.card')` dans ~25 handlers **et** le pipeline filtre/tri/pagination/reco cible `.card[data-cats]`, tout comme `gridCard()` de `list-view.js` (`.card[data-source-id]`). En gardant `.card`, **tout ce câblage fonctionne sans réécriture** ; le CSS flip (scopé `.flip`/`.card-inner`/`.card-face`) ne s'applique pas au bloc. `.card` = « item de kiosque » (pipeline) ; `.alert-block` = format bloc (vs ancien format flip).

## Ce que fait le diff
- **`cardHTML(s, mode)` devient un aiguillage** : `isCommunity || isUserTask` → `renderLegacyCard` (l'ancien corps, **renommé, inchangé**) ; sinon → `renderBlock`. Les familles complexes sont donc **strictement intactes** (incréments 2 et 3).
- **`renderBlock`** émet `<article class="card alert-block" …>` avec : `.ab-head` (état + ♥/partager/détails), `.ab-body` (titre + sous-titre + desc courte), `.ab-action` (switch / picker paramétré / lien partenaire), `.ab-detail[hidden]` (ex-verso : @forum_slug, desc longue, tags, auteur, lien forum). Réutilise les helpers existants (`stateFor`, `likeBtn`, `topRow`, `switchRow`, `subForm`, `paramFace`, `catLabel`, `forumLinkText`, `INFO_SVG`, `SHARE_SVG`) → **mêmes classes interactives** → handlers `site.js` inchangés.
- **`site.js`** : (1) `.card-share` sur un `.alert-block` → `LBAShare.openModal` (pas de face partage) ; (2) nouveau handler `.ab-toggle` → ouvre/ferme `.ab-detail` **en place** (`aria-expanded`, classe `ab-open`), aucun flip, aucun déplacement de nœud. Les cartes legacy gardent le flip.
- **`site.css`** : layout `.alert-block` (`ab-head`/`ab-body`/`ab-action`/`ab-detail`/`ab-toggle`) avec les tokens existants (`--muted`, `--amber`, `--line`) ; + règle du **bloc parqué** dans le volet liste (`.lrow-exp .card.alert-block.in-list-exp` : ne montre que `.ab-action`).

## Q3 — pourquoi `list-view.js` n'a pas bougé
`openParams` (param) appelle `parkCardInto(id, body)` → `gridCard('.card[data-source-id]')` trouve le bloc (il a `.card`) et le déplace dans `.lrow-exp-body`. Les branches `.card-usertask-face`/`.card-community-face` **ne matchent pas** un bloc → pas de « face » ouverte. Le picker paramétré vit dans `.ab-action` (toujours visible) → il s'affiche une fois parqué. `unparkCard` retire `flipped/face-*` (no-op) + réinitialise le sous-formulaire communautaire (absent) + **restaure la position** (inchangé). Le mécanisme de **déplacement de nœud est donc conservé** et fonctionne avec le bloc — conforme à Q3. La seule adaptation nécessaire est **CSS** (bloc parqué → n'afficher que l'action), déjà ajoutée.

## Validation déjà faite
- `node -c` OK (cards.js, site.js).
- Harnais de rendu (le même que le hotfix) sur **6 cas** : broadcast connecté/anon, linked, paramétré → **`.alert-block`** (avec `ab-detail`+`ab-toggle`, **sans** `card-face`, **sans** `showAdd`/`has-add`) ; communautaire, user-task → **`card flip`** legacy inchangé. **6/6 conformes.**

## Critères de validation AVANT incrément 2 (à confirmer par Hugo, en navigation)
1. Kiosque : les cartes simples s'affichent en **blocs 1 colonne**, lisibles (titre/état/desc/switch), détail replié.
2. `.ab-toggle` ouvre/ferme le détail **en place** (desc longue + tags + auteur + lien forum) ; `aria-expanded` bascule.
3. Partager (bloc) ouvre la **modale** LBAShare ; ♥ et switch/param fonctionnent comme avant.
4. **Vue liste** : une source **paramétrée** ouvre son picker via le volet (déplacement de nœud), retour à la grille à la bonne position.
5. **Non-régression** : communautaire & user-task **inchangés** (encore en cartes flip) ; filtres/recherche/pagination/reco OK (le bloc a `.card`).
6. Coexistence bloc + carte legacy dans `#grid` **acceptée** (P1) le temps des incréments.

## Réserves / à noter
- **CSS = première passe fonctionnelle** (layout + tokens existants). Le polish visuel (espacements fins, densité, cohérence mobile <620px) pourra être ajusté à ta relecture — dis-moi ce qui doit bouger.
- `renderCommunityRecto`, markup skin résiduel, CSS flip : **laissés inertes** (incréments 2/3/4).
- **Aucun commit** effectué. Sur ta validation (navigation + relecture du diff), on passe à l'incrément 2 (communautaire) — pas avant, pas d'enchaînement automatique.

*Fin du récap incrément 1.*
