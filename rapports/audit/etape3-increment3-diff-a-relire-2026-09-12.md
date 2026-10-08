# ÉTAPE 3 — Incrément 3 (format bloc, famille user-task) — diff à relire — fil #9

**Date : 2026-09-12** · Code écrit, **non commité** (relecture Hugo avant commit). Migre `user-task` (dernière famille legacy) vers le format bloc. **100 % front** — aucun fichier serveur, table `user_tasks`, cron, ni route de complétion par token touché (confirmé par `git status`).

## Fichiers touchés (5) — `git diff --stat` : +77 / −21
- `public/js/cards.js` (+58/−…) — branche user-task dans `renderBlock` + `data-card-type="user-task"` + aiguillage → **toutes** les familles en bloc.
- `public/js/site.js` (+12/−3) — `.task-config` ouvre `.ab-detail` (bloc) ; déscopage `.card-front` dans `task-remove`.
- `public/js/list-view.js` (+6) — `openParams` : branche bloc user-task.
- `public/js/user-task-form.js` (+…/−…) — déscopage `.card-front`/`.card-task-face` dans `appendTask` (création de tâche).
- `public/css/site.css` (+9) — bloc user-task parqué (montre `.ab-detail`) + `task-zone { margin-top:0 }`.

## Point de vigilance central (sémantique de pause) — comment elle survit
« L'abonnement EST la création de tâche » : **pas de switch broadcast** pour cette famille. Dans le bloc :
- **État** `.state.task` (« Tâche suivie » si ≥1 tâche, sinon « Tâche personnelle ») dans `.ab-head`.
- **`data-subscribed`** = `1` dès ≥1 tâche (formule renforcée : `!!s.subscribed || hasInstances || (isUserTask && hasTask)`), car `list-view.js` `sync()` lit `actif = data-subscribed==='1' && (!.param-mute || .param-mute.checked)`.
- **`.param-mute-row`** (interrupteur de PAUSE) rendu **uniquement s'il y a ≥1 tâche**, dans **`.ab-action`** (toujours visible, jamais dans une face cachée). Son `.param-mute` (checked = actif, décoché = pause) est lu **tel quel** par `list-view.js` et piloté par `toggleMute()` (site.js) **sans changement** (ce handler était déjà déscopé de `.card-front`).
- **`.task-config`** (« + configurer ») ouvre `.ab-detail` (via `openBlockDetail`) où vit la **gestion des tâches** (`.task-zone` : `taskItem`s + bouton de création), au lieu de flipper vers la 5e face.

## Déscopage `.card-front` (la « dette list-view » — traitée sans l'aggraver)
Deux handlers faisaient de la chirurgie DOM sur des sélecteurs `.card-front`/`.card-task-face` qui **n'existent pas** dans le bloc → sans adaptation, la création/suppression de tâche aurait laissé le bloc dans un état incohérent. Corrigé en **déscopant** (une seule `.state.task`/`.param-mute-row`/`.task-zone` par carte → sélecteur non ambigu) :
- `site.js` `task-remove` : `.card-front .param-mute-row` → `.param-mute-row` ; `.card-front .state.task` → `.state.task`.
- `user-task-form.js` `appendTask` : `.card-task-face .task-zone` → `.task-zone` ; `.card-front .state.task` → `.state.task` ; `.card-front .task-config` → `.task-config` ; `.card-front .param-mute-row` → `.param-mute-row`.
Sûr : après cet incrément il n'y a **plus aucune carte legacy user-task** (toutes en bloc), et ces handlers ne s'exécutent QUE pour user-task (donc jamais d'ambiguïté avec le `.state.task` d'un bloc communautaire).

## Validation par harnais

**Structurel (`cardHTML`, node) — 19/19 conformes** : bloc + `data-card-type="user-task"` ; `data-subscribed=1` avec tâche / `=0` sans ; état « Tâche suivie »/« Tâche personnelle » ; `.param-mute-row` présent (coché non-muted / décoché muted, label « Abonné »/« En pause ») **seulement** avec ≥1 tâche ; `.task-zone` (task-item + « + une autre tâche »/« Créer ma tâche ») ; **pas** de flip/face ; anonyme → « + configurer » `/connexion` + pas de task-zone ; non-régression broadcast/community.

**Interactif (Playwright, fetch stubbé)** :
- `.param-mute` (pause) **visible** dans `.ab-action` (185×26). ✅
- `.task-config` ouvre `.ab-detail` → **task-zone visible**, tâche + « C'est fait ✓ ». ✅
- Actions **visibles** : « C'est fait ✓ » (93×30), ✕ retrait (19×17), « + une autre tâche » (135×30). ✅
- **`task-remove` de la dernière tâche** (valide le déscopage) → 0 tâche, **pause retirée**, **état « Tâche personnelle »**, **`data-subscribed=0`**, bouton → « Créer ma tâche ». ✅
- **0 erreur** (hors artefact stub `LBACat`, sans rapport avec le code d'incrément). ✅

## Points à vérifier manuellement en navigation par Hugo
1. Kiosque connecté : carte user-task en **bloc** (état, « + configurer », switch pause si ≥1 tâche).
2. **Création** d'une tâche (modale) → apparition dans `.ab-detail`, état → « Tâche suivie », switch pause qui apparaît (c'est le chemin `appendTask`, validé par symétrie avec `task-remove` mais **à confirmer en navigation** — voir réserve).
3. **Suppression** (✕) de la dernière tâche → retour « Tâche personnelle », switch pause disparu.
4. **« C'est fait ✓ »** → échéance mise à jour (route serveur `/confirm` inchangée).
5. **Pause/reprise** (switch) → cohérent en vue bloc ET reflété sur le switch de la **vue liste**.
6. **Vue liste** user-task : déplier → gestion des tâches dans le volet ; fermeture → retour propre.
7. **Lien email de complétion** (token, cron) : inchangé — à confirmer qu'un clic depuis un email fonctionne toujours (rien touché côté serveur).
8. Non-régression incréments 1 et 2.

## Réserves honnêtes
- **`appendTask` (création via modale)** : non piloté en direct de bout en bout (flux modale). Utilise **exactement les mêmes sélecteurs déscopés** que `task-remove` (prouvé fonctionnel), et le bloc contient bien `.task-zone`/`.state.task`/`.task-config`/`.param-mute-row` aux bons endroits (structurel). Symétrie validée → à confirmer en navigation (point 2).
- **Vue liste user-task** : `openParams`/CSS implémentés et cohérents avec les chemins param (incrément 1) et communautaire (incrément 2) déjà validés en prod ; **non pilotée en direct** (harnais sans `#list`/`LBAKiosk`). À confirmer en prod (point 6).
- **CSS première passe** : tout est visible et fonctionnel (mesuré) ; densité/espacements ajustables plus tard.
- Le markup skin résiduel de `cards.js` et le CSS flip deviennent **totalement inertes** après cet incrément (plus aucune famille legacy) → retrait à l'**incrément 4** (nettoyage final + bump `CACHE_VERSION`).

## Aucun commit
Rien n'est commité/poussé/déployé. Sur ta validation (relecture + navigation), on commit l'incrément 3. Les **3 familles principales** seront alors migrées ; restera l'incrément 4 (nettoyage), à traiter à ta convenance.

*Fin du récap incrément 3.*
