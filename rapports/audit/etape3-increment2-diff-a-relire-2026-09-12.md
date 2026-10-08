# ÉTAPE 3 — Incrément 2 (format bloc, famille communautaire) — diff à relire — fil #9

**Date : 2026-09-12** · Code écrit, **non commité** (relecture Hugo avant commit). Migre `community` (chat-perdu, chien-perdu) vers le format bloc, même principe que l'incrément 1.

## Fichiers touchés (4) — `git diff --stat` : +118 / −62
- `public/js/cards.js` (+71/−…) — `renderBlock` rendu communautaire-aware + `communityDetail` + aiguillage (user-task = dernière famille legacy).
- `public/js/site.js` (net **−**) — `renderCommunityRecto` (rotation) → `renderCommunityPreview` (statique) ; ouverture du détail bloc pour « Signaler » et pour l'aperçu.
- `public/js/list-view.js` (+19) — `openParams`/`unparkCard` : branche bloc communautaire (le bloc n'a plus `.card-community-face`).
- `public/css/site.css` (+9) — `.community-preview` + override du bloc communautaire parqué (vue liste).

## Ce que fait le diff

### `cards.js`
- **Aiguillage** : `if (isUserTask(s)) return renderLegacyCard(s, mode); return renderBlock(s, mode);` → seul user-task reste en carte legacy (incrément 3). `community` passe au bloc.
- **`renderBlock` communautaire** : ordre `linked → community → param → broadcast` (une carte communautaire a un `params_schema` pour la commune mais n'est PAS un picker). État « Rien à signaler », action = bouton **« Signaler »** (`.community-config`) + switch d'abonnement. Marqueurs **`data-card-type="community"` / `data-community-type` (=`s.id`) / `data-community-label`** portés par la **racine du bloc** (P3 confirmé en implémentation, pas seulement en principe — voir §Validation).
- **Aperçu** : slot `.community-preview` dans `.ab-body` (rempli par site.js).
- **Détail** : `communityDetail(s, mode)` = `.community-list` + `.community-report-toggle` + `communityFace()` (formulaire) — **mêmes classes que l'ex-5e face** → handlers site.js réutilisés tels quels. Réservé au connecté (anonyme → `.ab-detail` = tags/forum, et « Signaler » → `/connexion`).

### `site.js`
- **`renderCommunityRecto` → `renderCommunityPreview`** (Q2) : rotation `setInterval` 10 s + animations `bd-slide-*` **supprimées**. Affiche le **dernier signalement** (le plus récent par `created_at`) + **compteur** en complément (« … · N au total »), `textContent` (aucune injection). Masqué si aucun signalement. `loadCommunityReports` appelle désormais `renderCommunityPreview`.
- **`openBlockDetail(card)`** (nouveau) : ouvre `.ab-detail` d'un bloc (no-op sur carte legacy). Appelé par le handler `.community-config` (« Signaler ») → ouvre le détail + charge la liste + révèle le formulaire (si l'utilisateur n'a pas déjà un signalement actif — gating inchangé).
- **`.ab-toggle`** : à l'ouverture d'un bloc `data-card-type="community"`, appelle `window.LBACommunity.load(blk)` (recharge la liste, comme l'ouverture de la 5e face avant).
- L'**hydratation eager** du kiosque (`querySelectorAll('.card[data-card-type="community"]') → loadCommunityReports`) est **inchangée** et fonctionne sur le bloc (qui porte l'attribut).

### `list-view.js` (vue liste — Q3 étendu au communautaire)
- **`openParams`** : nouvelle branche — si le nœud parqué est un **bloc** `data-card-type="community"`, on ouvre `.ab-detail` (`hidden=false` + `ab-open`) et on appelle `LBACommunity.load` (au lieu de `.card-community-face`/`face-task`, absents du bloc). Les branches legacy sont conservées (inertes après incrément 2).
- **`unparkCard`** : referme `.ab-detail` + réinitialise le sous-formulaire communautaire du bloc au retour dans la grille (symétrique du reset `.card-community-face`).

### `site.css`
- `.community-preview` (une ligne discrète, `--muted`).
- Override du bloc communautaire **parqué** : dans le volet on montre `.ab-detail` (liste + formulaire) et on masque `.ab-action` (le switch de la ligne + le report-toggle du détail suffisent) — sélecteur `[data-card-type="community"]` plus spécifique que la règle générique de bloc parqué (incrément 1).

## Validation par harnais

**Structurel (`cardHTML`, node)** — **7/7 conformes** : community connecté → bloc avec `data-card-type/community-type/community-label`, `.community-preview`, « Signaler » (`.community-config`), détail (`.community-list`/`.community-report-toggle`/`.community-form`) ; community **pas** de `card-inner`/`card-community-face`/`community-recto` ; community anonyme → bloc, « Signaler » → `/connexion`, **pas** de gestion communautaire dans le détail ; non-régression broadcast/param/linked = bloc, user-task = legacy flip.

**Interactif (Playwright, `cards.js`+`site.js`+`site.css`, fetch stubbé)** :
- **Aperçu statique** peuplé : « Dernier signalement : **Briançon — Chat noir · 2 au total** » (plus récent + compteur). ✅
- **Liste** : 2 items, boutons **« Je l'ai vu »** (80×28, visible) et **« Je l'ai retrouvé »** (116×28, visible). ✅
- **`.ab-toggle`** ouvre le détail + charge la liste. ✅
- **« Signaler »** : sans signalement de l'utilisateur → ouvre le détail **et révèle le formulaire** (report-toggle masqué) ; avec un signalement actif de l'utilisateur → ouvre le détail **sans** rouvrir le formulaire (gating 409 correct), report-toggle masqué par `syncCommunityToggle`. ✅
- **Cas vide** (aucun signalement) → aperçu **masqué**, liste = « Aucun signalement… ». ✅
- **Aucune erreur** (hors artefact de stub du harnais `LBACat.load`, sans rapport avec le code d'incrément). ✅

## Points à vérifier manuellement en navigation par Hugo
1. Kiosque connecté : carte communautaire en **bloc**, aperçu « Dernier signalement… » visible s'il y en a, « Signaler » + switch, ⓘ ouvre la liste + formulaire.
2. Flux complet : créer un signalement (commune) → confirmation + apparition dans la liste ; « Je l'ai vu » (Où/Quand) sur le signalement d'un autre ; « Je l'ai retrouvé » sur le sien → clôture.
3. **Vue liste** communautaire : déplier une carte communautaire → la liste + le formulaire s'ouvrent dans le volet ; fermeture → retour à la grille propre.
4. **Aucune rotation** ne doit plus se produire sur le recto (aperçu statique).
5. Non-régression : broadcast/param/linked (incrément 1) et user-task (encore legacy) inchangés.

## Réserves honnêtes
- **Vue liste communautaire** : la logique (`openParams`/`unparkCard`/CSS override) est implémentée et cohérente avec le chemin param déjà validé en prod, mais **je n'ai pas pu la piloter en direct** (le harnais ne monte pas toute la machinerie `#list`/`LBAKiosk`). Vérifiée **statiquement** + par cohérence avec l'incrément 1. À confirmer en prod comme pour l'incrément 1 (point 3 ci-dessus).
- **CSS = première passe** : les boutons d'action communautaires sont visibles et fonctionnels (mesurés), mais le rendu fin (densité de la liste, aperçu) pourra être ajusté — rien de cassé.
- `renderCommunityRecto`/`.community-recto`/`bd-slide-*` CSS deviennent **inertes** (plus émis) — retrait au nettoyage de l'incrément 4, comme convenu.

## Aucun commit
Rien n'est commité/poussé/déployé. Sur ta validation (relecture du diff + navigation), on commit l'incrément 2, puis (après ton feu vert séparé) on passe à l'incrément 3 (user-task). Pas d'enchaînement automatique.

*Fin du récap incrément 2.*
