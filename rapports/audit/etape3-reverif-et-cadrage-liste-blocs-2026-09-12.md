# ÉTAPE 3 — Re-vérification (3a) + cadrage « liste de blocs » (3b) — fil #9

**Date : 2026-09-12** · Aucune modification de code (ni 3a ni 3b). Vérification factuelle + proposition avec arbitrages ouverts.

---

# ⛔ ÉTAPE 3a — Re-vérification ciblée

## 🔴 DIVERGENCE CRITIQUE — `cards.js` ne rend plus AUCUNE carte (bug déployé)

**Introduit par l'archivage ÉTAPE 2, présent dans le commit déployé `9397dfa`.**

- L'ÉTAPE 2 a retiré, dans `frontFace()`, la déclaration `var showAdd = …` (avec le bouton « + deck ») — **mais a laissé son usage** ligne 613 :
  `'<div class="card-face card-front' + (showAdd ? ' has-add' : '') + '">'`.
- `showAdd` n'est plus déclaré nulle part dans `frontFace` (seule autre occurrence : `var showAdd` ligne 831, **portée locale à `cardHTML`**, invisible depuis `frontFace`).
- Cette ligne est évaluée **pour chaque carte**, quel que soit le mode → **`ReferenceError: showAdd is not defined`** à chaque rendu.

**Preuves :**
- Empirique (harnais node stubbant `window`/`document`, chargeant le fichier réel) : `window.LBACards.cardHTML(source, 'connected')` → `RENDER ERROR: ReferenceError : showAdd is not defined`.
- Git : `git status` = cards.js **propre** ; `git show HEAD:public/js/cards.js` contient bien la ligne 613 fautive et le `var showAdd` uniquement en 831. Donc **disque = HEAD = commit `9397dfa` = déployé**.

**Portée de l'impact :** `frontFace` est appelé par `cardHTML` pour **toute** carte (kiosque, favoris, tous types, tous modes). Un `cardHTML` qui jette casse le rendu de la grille. **Le kiosque et /favoris ne rendent plus de cartes** dans cette version.

**Écart avec le recap ÉTAPE 2 :** le recap affirmait « bouton `.card-add-deck` retiré, `deckFace` retirée » — vrai — mais **omettait** que l'usage `showAdd` du `has-add` (ligne 613) et le `var showAdd` mort de `cardHTML` (ligne 831) subsistaient. Le retrait de `showAdd` était **incomplet**.

**Correctif (une ligne, NON appliqué — voir Q0) :** ligne 613 → `'<div class="card-face card-front">'` (retirer `+ (showAdd ? ' has-add' : '')`), et supprimer le `var showAdd` mort ligne 831. La classe CSS `has-add` ne sert plus (le « + » deck n'existe plus).

> ⚠️ À vérifier côté prod par Hugo : si le kiosque affiche encore des cartes en ligne, c'est un cache (SW/HTTP/CDN) servant l'ancien `cards.js` ; le bump `CACHE_VERSION v14` finira par pousser le fichier fautif à tous. **À corriger même si l'écran paraît OK.**

## 3a-a) `deckFace()` et références résiduelles decks/skins dans `cardHTML/frontFace/backFace`
- `deckFace()` : **retirée** (fonction + appel dans `cardHTML`) — conforme au recap. `card-deck-face` n'est plus émise.
- Bouton `.card-add-deck` : `addBtn` figé à `''` — conforme.
- **Résidus signalés** : (1) le bug `showAdd` ci-dessus ; (2) commentaire périmé `cards.js` ~607-611 décrivant l'ordre « ♥·partage·**+deck**·i » et « card-add-deck » comme classe conservée — obsolète ; (3) `var showAdd` mort dans `cardHTML` (831). Aucun autre appel deck/skin dans `frontFace`/`backFace`.
- Markup structurel skin (`.card-seal`, `attacksHTML`, `FOOT_HTML`, `.card-edition`, `.card-stat`, `.card-fineprint`) : **présent, inerte** (laissé en Q4 de l'ÉTAPE 2, à retirer à la réécriture). Conforme.

## 3a-b) `site.js` : `loadDecksIntoGrid` inerte + pipeline de tri
- `loadDecksIntoGrid()` : **définie mais jamais appelée** (appel retiré). `bindDeckSwitches`/`reconcileReco` : définies, appelées **uniquement** depuis `loadDecksIntoGrid` → mortes. Conforme au recap.
- `var decksData = []` (L1808) : **reste vide** (jamais peuplé). 
- **Tri fusionné cartes+decks** (`computeSpecialIds`, L1872-1889, ex-« 1878-1879 » de l'ÉTAPE 1) : lit `decksData` → `decksL = []` → la fusion `cards.concat(decks)` ne prend que des cartes. **Aucun effet de bord** : modes « Nouveautés »/« Populaires » opèrent sur les cartes seules. Les sélecteurs `.deck-card[data-deck-tile]` (tri/filtre) ne matchent plus rien → inertes. **Sain.**

## 3a-c) `list-view.js` : volet inchangé
- `parkCardInto` (L220), `unparkCard` (L228), `openParams` (L349) : **présents et intacts**. Le mécanisme déplace toujours le **nœud réel** de la carte dans `.lrow-exp` et ouvre `.face-task` pour user-task/communautaire.
- Seule trace deck = `p.card.classList.remove(…, 'face-deck')` (L234) : défensif, inerte (`face-deck` n'est plus jamais posée). **Fonctionne** sur cartes classiques/communautaires/user-task.
- ⚠️ **MAIS** : la vue liste projette/déplace des cartes rendues par `cardHTML` — donc **elle est aussi cassée par le bug `showAdd`** tant qu'il n'est pas corrigé (pas de carte source à déplacer).

## 3a-d) Synthèse des divergences
1. 🔴 **CRITIQUE** : `showAdd` non défini → `cardHTML` jette → rendu cassé (déployé). Écart avec le recap ÉTAPE 2 (retrait `showAdd` incomplet).
2. 🟡 Mineur : `var showAdd` mort (cards.js 831) + commentaire périmé (607-611).
3. ✅ Reste conforme : `deckFace` retirée, `loadDecksIntoGrid` inerte sans effet de bord, volet list-view intact.

**Rien d'autre ne diverge** de l'audit ÉTAPE 1 / recap ÉTAPE 2 sur la structure carte.

---

# 📐 ÉTAPE 3b — Cadrage du format « liste de blocs » (proposition, arbitrages ouverts)

> Trait de design actuel conservé (typo, couleurs, esprit). Premier essai : **un bloc = une alerte = une ligne, 1 colonne**. Pas de refonte graphique, pas de multi-colonnes ici. `/extend` reste non exposée.

## 1. Structure DOM/CSS minimale (remplace `.card-inner` + faces)
Proposition de squelette (un seul niveau, pas de `.card-inner`, pas de `rotateY`/`perspective`, pas de `.card-face`) :

```
<article class="alert-block" data-source-id data-card-type? data-community-type? data-community-label? data-cats data-subscribed data-search>
  <div class="ab-head">        état (.state) · titre · contrôles (♥ · partager · détails)
  <div class="ab-body">        sous-titre + description (toujours visible OU zone repliable, cf. §2)
  <div class="ab-action">      switch d'abonnement / param-row / pause (.param-mute) / bouton Signaler|Configurer
  <div class="ab-detail" hidden?> zone « verso » : détails longs, tags, forum, liste tâches/signalements (cf. §2/§5/§9)
</article>
```
- Conteneur : `.alert-list { display:flex; flex-direction:column; gap:… }` (1 colonne). Le bloc est **auto-contenu** (aucune hypothèse sur ses voisins) → §6.
- Les classes interactives **inchangées** (`.card-like`, `.card-share`, `.switch input`, `.param-mute`, `.task-config`, `.community-config`, …) sont **portées par le bloc** → les handlers délégués de `site.js` continuent de fonctionner sans réécriture (ils ciblent des classes, pas la structure de face).
- Disparaissent : `.card-inner`, `.card-face`, `.card-front/.card-back/.card-share-face/.card-deck-face/.card-task-face`, `.flip-btn`, `.flip-back`, la bascule `.flipped`/`.face-*`.

## 2. Restitution de l'info « verso » sans volet caché — OPTIONS (à trancher, Q1)
- **A. Tout visible dans le bloc** : détails toujours affichés. + simple, zéro interaction ; − blocs longs, liste moins scannable, gros contenu communautaire encombrant.
- **B. Expand/collapse inline** *(recommandé par défaut)* : un bouton « Détails » révèle `.ab-detail` dans le bloc (`aria-expanded`). Reprend le vocabulaire déjà amorcé par `list-view.js` (accordéon). + liste scannable + détail à la demande, **pas de déplacement de nœud** ; − gérer l'état ouvert/fermé.
- **C. Page de détail séparée** : `/source/:id/statut` existe déjà ; le bloc ne porte qu'un lien. + liste très légère, deep-link ; − navigation hors liste, lourd pour les actions rapides (signaler/abonner).
- **Hybride plausible** : B pour le détail léger (description longue, tags, forum) ; C ou zone dédiée pour le contenu lourd (formulaire de signalement communautaire). **Ouvert.**

## 3. Transposition des marqueurs de famille (sélection par attribut, jamais par id)
- `data-source-id`, `data-card-type`, `data-community-type`, `data-community-label`, `data-cats`, `data-subscribed`, `data-search` : **portés par la racine `.alert-block`** (comme aujourd'hui sur `.card`).
- `communityTypeOf()` (site.js) lit `data-community-type` → **inchangé** : il suffit que le sélecteur passe de `.card[data-community-type]` à `.alert-block[data-community-type]` (ou une classe commune conservée). Le routage vers `/api/community-reports?type=…` **ne dépend pas** de la structure recto/verso — il ne dépend que de l'attribut. **Aucune régression réseau.**
- Les ex-marqueurs de face `.card-community-face` / `.card-usertask-face` → deviennent **des modificateurs de bloc** : `data-card-type="community"` / `"user-task"` (déjà présents) + une **sous-zone** `.ab-community` / `.ab-tasks` dans `.ab-detail`/`.ab-action`. Plus de classe de « face ». Sélection par `data-card-type` / `data-community-type`.

## 4. Sort du volet `list-view.js` (parkCardInto/unparkCard/openParams) — OPTIONS (Q3)
Aujourd'hui le volet **déplace le nœud réel** de la carte pour réutiliser les handlers. Si le bloc EST déjà la ligne, il n'y a plus de « carte source » distincte à déplacer.
- **A. Dissoudre le volet dans le bloc** *(recommandé)* : le bloc est la ligne ; `openParams` devient « déplier `.ab-detail` de CE bloc » (toggle de classe/`hidden`), **sans déplacement de nœud**. Les handlers de `site.js` restent délégués sur le conteneur `.alert-list` et ciblent les classes du bloc. → `parkCardInto`/`unparkCard` **supprimés** ; `list-view.js` se réduit à la gestion d'expand/collapse (ou fusionne dans site.js). Impact : simplification nette, mais touche `site.js` + `list-view.js` ensemble.
- **B. Garder un `list-view` mince** qui ne fait qu'ouvrir/fermer `.ab-detail` (pas de déplacement). Moins de churn immédiat, mais conserve deux fichiers pour une responsabilité désormais triviale.
- **Implication commune** : puisque le bloc porte déjà tous les contrôles, la distinction « vue cartes » vs « vue liste » du fil précédent **disparaît de fait** (il n'y a plus qu'un seul rendu : la liste de blocs). À confirmer avec Hugo que `view-mode.js` (bascule cartes/liste) n'a plus de raison d'être. **Ouvert.**

## 5. Sort de `renderCommunityRecto` (carrousel signalements, rotation 10 s) — OPTIONS (Q2)
Aujourd'hui injecté dans le **recto** avec rotation `setInterval` 10 s.
- **A. Aperçu statique** *(recommandé)* : afficher le/les **dernier(s) signalement(s)** dans une sous-zone du bloc (ex. `.ab-community`), sans rotation ; « voir tout » déplie la liste complète (§2-B). + lisible, sans timer ; − pas d'effet « ça vit ».
- **B. Ticker inline léger** : conserver une rotation mais en ligne (pas de flip). + dynamisme ; − complexité, accessibilité (contenu qui bouge).
- **C. Tout dans la zone détail** : aperçu = compteur + « N signalements », le détail/formulaire dans `.ab-detail`.
- Question ouverte à Hugo : **garder ou non la rotation automatique** (a priori non, mais à confirmer). La **logique métier** (fetch `/api/community-reports`, `LBACommunity.load`, dédup inflight) est réutilisée telle quelle, seul le contenant change.

## 6. Découplage minimal pour layouts futurs (sans sur-architecturer) — §point 6
- Conteneur `.alert-list` en **flex column** aujourd'hui ; pour ne pas fermer la porte : exposer **une seule** variable CSS `--alert-cols: 1` et écrire `.alert-list { display:grid; grid-template-columns: repeat(var(--alert-cols), 1fr); }`. Passer à 2/3 colonnes plus tard = changer la variable (via media query ou préférence), **sans toucher au bloc**.
- **Condition** : le bloc doit être **auto-contenu et sans hypothèse de largeur/voisinage** (pas de `aspect-ratio:2/3` hérité de la carte, hauteur dictée par le contenu). C'est le seul découplage à garantir maintenant. **Ne pas** construire de système de layouts configurable.

## 7. Accessibilité — §point 7
- Les `aria-label` de flip perdent leur sens : `.flip-btn` « En savoir plus » → devient le **bouton d'expansion** `aria-expanded` + `aria-controls` vers `.ab-detail`, libellé « Afficher le détail de {nom} » (généralisation du pattern déjà présent dans `list-view.js` : `.lrow-main` `aria-expanded` + « Afficher le détail de… »). `.flip-back` « Retour » **disparaît** (plus de face à quitter).
- `BACK_SVG` / vocabulaire « Retour » : à retirer du nouveau markup.
- **À conserver** (indépendants du format) : libellés d'action métier (`Signaler`, `communityReportItem`, `taskItem`, switches d'abonnement/pause).
- **À revoir, pas déplacer tel quel** : tout `aria-label` qui décrit un « retournement » ou une « face ».

## 8. Responsive mobile-first — §point 8
- Rupture actuelle **620px** (grille → 1 colonne) : dans le nouveau format, le bloc est **déjà 1 colonne** partout → sur mobile, pas de changement de nombre de colonnes, seulement une **condensation interne** du bloc (empiler `.ab-head`/`.ab-action`, réduire paddings). Reprendre les ajustements `<620px` que `list-view.js`/CSS appliquaient déjà à la vue liste (flex-wrap des contrôles).
- Conséquence : pour ce premier essai, **desktop et mobile partagent la même ossature 1 colonne** (plus simple, cohérent avec « peu d'alertes à la fois » → bloc lisible).

## 9. Point de vigilance user-task — §point 9
Rappel ÉTAPE 1 (C.5-6) : « l'abonnement EST la création de tâche » et `.param-mute` (pause) porte une **sémantique d'état** lue par le switch de liste (`actif = ≥1 tâche ET non muted`).
- Dans le bloc : le **switch pause `.param-mute`** reste dans `.ab-action` (comme sur le recto actuel) → sa présence/état dans le DOM est **préservée**, donc la logique de `site.js`/`list-view.js` qui lit `.param-mute` continue de fonctionner **sans changement de contrat**.
- La **5e face tâches** (liste des tâches, `.task-remove`, `C'est fait ✓`) → migre dans `.ab-detail`/`.ab-tasks` (zone dépliable §2), **mêmes classes** → handlers `site.js` inchangés.
- Le bouton « + configurer » (`.task-config`) → reste dans `.ab-action`, ouvre `.ab-detail` (au lieu de flip vers la 5e face). **Même classe**, câblage à ré-orienter (ouvrir la zone au lieu de flipper) — c'est le seul point où un handler `site.js` change de comportement (ouvrir un panneau au lieu d'ajouter `.flipped.face-task`).
- **Explicite** : la sémantique « pause » survit car `.param-mute` reste un vrai `<input type="checkbox">` dans le bloc ; on ne la déplace pas dans une face cachée.

---

## Points ouverts nécessitant une réponse de Hugo (avant toute implémentation)

- **Q0 — 🔴 Hotfix `showAdd`** : appliquer **immédiatement** le correctif une ligne (retirer `(showAdd ? ' has-add' : '')` + le `var showAdd` mort) pour rétablir le rendu des cartes en prod, ou l'absorber dans la réécriture `cards.js` de l'ÉTAPE 3 ? *(Recommandé : hotfix immédiat — le kiosque est cassé dans le commit déployé, indépendamment de l'ÉTAPE 3.)*
- **Q1 — Restitution du « verso »** : tout visible / **expand-collapse inline (recommandé)** / page de détail séparée / hybride ? (§2)
- **Q2 — `renderCommunityRecto`** : garder la rotation 10 s / **aperçu statique (recommandé)** / tout en zone détail ? (§5)
- **Q3 — Volet `list-view`** : **dissoudre parkCardInto dans le bloc + handlers délégués (recommandé)** ou garder un list-view mince ? Et corollaire : `view-mode.js` (bascule cartes/liste) a-t-il encore un sens s'il n'y a plus qu'un seul rendu ? (§4)
- **Q4 — Emplacement du contenu lourd** (formulaire de signalement communautaire, liste de tâches) : inline dans le bloc / zone dépliable / page de détail ? (§2/§5/§9)
- **Q5 — Portée du premier lot d'implémentation** : réécrire `cardHTML` en bloc pour **toutes** les familles d'un coup (classique, param, community, user-task, linked), ou par incréments (classique d'abord, puis community/user-task) ?

Aucune décision prise à ma main : chaque option ci-dessus attend ton arbitrage. Aucun code écrit (3a ni 3b).

*Fin du rapport ÉTAPE 3a+3b.*
