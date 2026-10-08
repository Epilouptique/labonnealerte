# ÉTAPE 3 — Cadrage « liste de blocs » MIS À JOUR (Q1–Q5 intégrés) — fil #9

**Date : 2026-09-12** · Supersède la partie **3b** du rapport `etape3-reverif-et-cadrage-liste-blocs-2026-09-12.md` (la partie 3a — re-vérif — et le hotfix Q0 restent valides et clos). **Aucun code d'implémentation écrit.** Proposition pour validation, avec le point Q3 détaillé.

Décisions Hugo intégrées : **Q1** verso = expand-collapse inline · **Q2** communautaire = aperçu statique (rotation retirée) · **Q3** volet `parkCardInto`/`unparkCard`/`openParams` **CONSERVÉ** et adapté (pas dissous ; `view-mode.js` reste en usage) · **Q4** contenu lourd = zone dépliable (même logique que Q1) · **Q5** implémentation par incréments, broadcast d'abord.

Cadre : trait de design conservé, pas de refonte graphique. Premier essai : **1 alerte / ligne / 1 colonne**. `/community-reports/:id/extend` reste non exposé (clos).

---

## 1. Structure DOM/CSS du bloc (remplace `.card.flip` / `.card-inner` / les faces)

Un seul niveau, pas de `.card-inner`, pas de `rotateY`/`perspective`, pas de `.card-face`, pas de bascule `.flipped`/`.face-*`. Zone dépliable **`.ab-detail`** intégrée (Q1/Q4) :

```
<article class="alert-block"
         data-source-id  data-card-type?  data-community-type?  data-community-label?
         data-cats  data-subscribed  data-search>
  <div class="ab-head">     <!-- toujours visible : état (.state) · titre (topRow) · contrôles -->
     .state …                 (broadcast/param : idle|active ; user-task/community : « task » neutre)
     .card-icons              ♥ (.card-like) · partager (.card-share) · bouton détails (.ab-toggle)
  </div>
  <div class="ab-body">     <!-- toujours visible : sous-titre + description courte + APERÇU statique (Q2) -->
  </div>
  <div class="ab-action">   <!-- toujours visible : switch d'abonnement / .param-row / .param-mute (pause) /
                                  bouton « Signaler » (.community-config) | « + configurer » (.task-config) -->
  </div>
  <div class="ab-detail" hidden>  <!-- DÉPLIABLE (Q1/Q4) : description longue, tags, auteur forum,
                                       liste complète des signalements + formulaire (community),
                                       liste des tâches + « C'est fait ✓ » (user-task) -->
  </div>
</article>
```

- Conteneur : `.alert-list { display:grid; grid-template-columns: repeat(var(--alert-cols,1), 1fr); gap:… }` → 1 colonne aujourd'hui (§6).
- **Classes interactives INCHANGÉES** (`.card-like`, `.card-share`, `.switch input`, `.param-mute`, `.param-add/remove`, `.task-config`, `.community-config`, `.community-report-toggle`, `.community-spot-*`, `.community-found`, `.community-submit`) → portées par le bloc → **les handlers délégués de `site.js` continuent de fonctionner sans réécriture** (ils ciblent des classes/attributs, jamais la structure de face).
- **Nouveau** : `.ab-toggle` (remplace `.flip-btn`) ouvre/ferme `.ab-detail` ; **plus de `.flip-back`** (plus de face à quitter).
- CSS : les blocs `.card.flip`/`.card-face`/faces/skins de `site.css` deviennent inertes au fil des incréments (retrait différé, cf. Q4 ÉTAPE 2) ; on ajoute un bloc `.alert-block` neuf.

## 2. Restitution du « verso » — expand-collapse inline (Q1, verrouillé)

Description longue + tags + auteur forum vivent dans **`.ab-detail`**, masqué par défaut, révélé par `.ab-toggle` (`aria-expanded`). La vue de base reste « une ligne, tout de suite » ; le détail s'ouvre **sans quitter la liste**, sans page séparée, sans face cachée. Un seul mécanisme d'expand/collapse pour TOUT ce qui était au verso ou en 5e face (cohérent avec Q4).

## 3. Marqueurs de famille (sélection par attribut, jamais par id)

- `data-source-id`, `data-card-type`, `data-community-type`, `data-community-label`, `data-cats`, `data-subscribed`, `data-search` : **portés par la racine `.alert-block`** (comme sur `.card` aujourd'hui).
- `communityTypeOf()` (site.js) lit `data-community-type` → **inchangé** ; le sélecteur passe de `.card[data-community-type]` à `[data-community-type]` (attribut, agnostique de la structure). Le routage `/api/community-reports?type=…` **ne dépend pas** du recto/verso.
- Les ex-faces `.card-community-face` / `.card-usertask-face` → deviennent des **sous-zones** de `.ab-detail` : `.ab-community` / `.ab-tasks`, discriminées par `data-card-type` (`"community"` / `"user-task"`) sur le bloc. Plus aucune classe de « face », aucune sélection par id en dur.

## 4. `renderCommunityRecto` → aperçu statique (Q2, verrouillé)

- **Retiré** : la rotation automatique (`setInterval` 10 s, animations `.bd-slide-*`) — c'était une réponse à la contrainte d'espace de la carte, sans objet en liste.
- **Remplacé par** un **aperçu statique** dans `.ab-body` : proposition = **le dernier signalement** (commune + « repéré à … » abrégé) OU, si plusieurs, un compteur simple « N signalements près de chez vous ». Forme exacte à confirmer, mais **sans timer, sans contenu qui bouge**.
- Le **détail complet** (tous les signalements + le formulaire de signalement) vit dans `.ab-detail` / `.ab-community` (Q1/Q4). La logique métier (fetch `/api/community-reports`, `LBACommunity.load`, dédup inflight, `is_author`, expiration) est **réutilisée telle quelle** — seul le contenant change. `renderCommunityRecto` est remplacé par un `renderCommunityPreview` statique + le remplissage de `.ab-community` à l'ouverture.

## 5. 🔧 Q3 — Volet `list-view.js` CONSERVÉ et adapté (le point le plus délicat)

**Rappel du mécanisme actuel** (vérifié dans le code, `list-view.js`) : la vue liste (`#list`, lignes `.lrow`) est une **projection** des cartes de `#grid` (source de vérité). Pour montrer le détail actionnable d'une ligne, `openParams` **déplace le NŒUD RÉEL de la carte** dans le volet de la ligne :
- `parkCardInto(id, body)` (L220) : `gridCard(id)` trouve la carte dans `#grid`, mémorise `parent`+`nextSibling`, ajoute `.in-list-exp`, **`body.appendChild(card)`** (le volet `.lrow-exp-body`). Un `MutationObserver` (`watchParked`) resynchronise le switch de la ligne à chaque mutation de la carte.
- `openParams(row, id)` (L349) : `toggleKind(row,'params',…)` crée le volet, `parkCardInto` y déplace la carte, puis **révèle la 5e face** via `c.classList.add('face-task')`, en discriminant `c.querySelector('.card-usertask-face')` vs `.card-community-face` (et, pour community, rappelle `LBACommunity.load(c)`).
- `unparkCard()` (L228) : retire `flipped/face-*`, réinitialise le sous-formulaire communautaire, **remet la carte à sa position d'origine** (`insertBefore(card, next)`), déconnecte l'observer.

**Ce qui doit rester identique** (Q3 = conserver la flexibilité structurelle) :
- Le **déplacement de nœud réel** (source de vérité unique par-source, handlers déjà câblés, `MutationObserver` de resync). `gridCard`, `parkedCard{card,parent,next}`, `watchParked`, la restauration de position, l'accordéon « une seule ligne ouverte » : **inchangés dans leur principe**.

**Ce qui change (adaptation au nouveau DOM)** — précisément :

| Point | Aujourd'hui (carte) | Nouveau (bloc) |
|---|---|---|
| Nœud déplacé | `.card[data-source-id]` | **`.alert-block[data-source-id]`** — mais `gridCard()` sélectionne déjà par **attribut** `data-source-id`, donc **agnostique** : il trouvera le bloc sans changement de sélecteur (à confirmer que `gridCard` n'ajoute pas `.card` en dur — sinon le passer en `#grid [data-source-id="…"]`). |
| Cible du déplacement | `.lrow-exp-body` | **inchangée** (`.lrow-exp-body`) |
| Révélation du détail | `c.classList.add('face-task')` (montre la 5e face) | **`c.classList.add('ab-open')`** (ou `c.querySelector('.ab-detail').hidden=false`) → ouvre la **zone dépliable** du bloc, PAS une face |
| Discrimination famille | `.card-usertask-face` / `.card-community-face` | **`c.getAttribute('data-card-type')`** === `'user-task'` / `'community'` → on ouvre la sous-zone `.ab-tasks` / `.ab-community` de `.ab-detail` |
| Refetch community | `LBACommunity.load(c)` | **inchangé** (même appel, même endpoint) |
| Fermeture (`unparkCard`) | retire `flipped/face-*` + reset `.community-form/.community-report-toggle/.community-list` | **retire `ab-open`** + reset des **mêmes** sous-éléments communautaires (mêmes classes) ; restauration de position **inchangée** |
| CSS du volet | `.lrow-exp .card.in-list-exp {…}` (ré-affiche faces) | **`.lrow-exp .alert-block.in-list-exp {…}`** : bloc affiché avec `.ab-detail` ouvert ; on **masque le `.ab-toggle`** du bloc parqué (redondant, le volet est déjà « ouvert ») |
| `MutationObserver` | observe `data-subscribed/checked/class` | **inchangé** (les mêmes attributs mutent sur le bloc) |

**Articulation avec l'expand-collapse « en place » (Q1)** : le bloc possède **une seule** zone `.ab-detail`. Elle est ouverte de **deux façons** selon la vue :
- **Vue blocs** (`#grid`, défaut) : `.ab-toggle` ouvre `.ab-detail` **en place** (le bloc ne bouge pas).
- **Vue liste** (`#list`) : `openParams` **déplace** le bloc dans la ligne puis ouvre `.ab-detail` (mécanisme parkCardInto conservé).
→ **Une seule structure de détail**, deux déclencheurs. Pas de duplication de contenu. C'est ce qui rend l'adaptation propre : `openParams` cesse de « flipper vers une face » et se contente d'**ouvrir la zone dépliable** du nœud déplacé.

**Conséquence sur `view-mode.js`** : conservé (Q3). La bascule blocs/liste reste ; son rôle peut évoluer (les deux vues sont désormais des variantes de « liste » à densités différentes), mais **rien à archiver**.

**Risque résiduel à surveiller (à valider en implémentation)** : aujourd'hui `openParams` s'appuie sur le fait que `taskFace()/communityReportsFace()` ne rendent RIEN en anonyme (garde-fou : sinon volet vide). Dans le bloc, l'équivalent est : `.ab-tasks`/`.ab-community` **ne sont peuplées qu'en connecté** ; en anonyme, `.ab-detail` ne contient que le détail générique (description longue/tags) et l'action reste « + configurer »/« Signaler » → `/connexion`. À préserver explicitement.

## 6. Découplage minimal multi-colonnes (sans sur-architecturer)

- `.alert-list { grid-template-columns: repeat(var(--alert-cols,1), 1fr); }` — **une seule** variable, défaut 1. Passer à 2/3 colonnes plus tard = redéfinir `--alert-cols` (media query ou préférence), **sans toucher au bloc**.
- **Condition unique à garantir** : le bloc est **auto-contenu**, sans hypothèse de largeur/voisinage (pas d'`aspect-ratio:2/3` hérité de la carte ; hauteur dictée par le contenu). Ne **pas** construire de système de layouts.
- **Compatibilité volet (Q3)** : parkCardInto déplace un bloc auto-contenu → il s'affiche correctement quel que soit `--alert-cols` (dans le volet, il est en pleine largeur de ligne). Le node-move reste valide en multi-colonnes → c'est bien la « flexibilité structurelle » que Hugo veut préserver.

## 7. Accessibilité

- `.flip-btn` « En savoir plus » → **`.ab-toggle`** avec `aria-expanded` + `aria-controls="…-detail"`, libellé « Afficher le détail de {nom} » (généralise le pattern déjà présent sur `.lrow-main` de `list-view.js`).
- `.flip-back` « Retour » + `BACK_SVG` : **supprimés** (plus de face à quitter).
- **Conservés** (indépendants du format) : libellés d'action métier (`Signaler`, `communityReportItem`, `taskItem`, switches abonnement/pause).
- **À revoir, pas déplacer tel quel** : tout `aria-label` évoquant un « retournement » / une « face ».

## 8. Responsive mobile-first

- Rupture **620px** reprise : le bloc étant **déjà 1 colonne partout**, mobile ≠ changement de colonnes → seulement **condensation interne** (`.ab-head`/`.ab-action` empilés, paddings réduits), en reprenant les ajustements `<620px` que la vue liste applique déjà (flex-wrap des contrôles).
- Pour ce premier essai, **desktop et mobile partagent l'ossature 1 colonne**.

## 9. user-task — la sémantique d'état survit (point de vigilance)

- Le **switch pause `.param-mute`** (checkbox réel) reste dans **`.ab-action`** (toujours visible), comme sur le recto actuel → sa présence/état dans le DOM est **préservée** → la logique `site.js`/`list-view.js` qui lit `.param-mute` (« actif = ≥1 tâche ET non muted ») fonctionne **sans changement de contrat**.
- La **liste des tâches** (`.task-remove`, `C'est fait ✓`) → migre dans **`.ab-detail`/`.ab-tasks`** (dépliable), **mêmes classes** → handlers `site.js` inchangés.
- Le bouton **`.task-config`** (« + configurer ») reste dans `.ab-action` ; **seul changement de comportement** : il ouvre `.ab-detail` (via le même chemin que `.ab-toggle`) au lieu d'ajouter `.flipped.face-task`. C'est le seul handler `site.js` dont l'action change (ouvrir un panneau au lieu de flipper).
- « L'abonnement EST la création de tâche » : inchangé (la souscription passe toujours par la modale `user-task-form.js` et la présence de `.param-mute`).

---

## 10. Q5 — Découpage de l'implémentation par incréments

### Incrément 1 — Famille **broadcast / simple** (socle)
**But** : valider la structure `.alert-block`, l'expand-collapse `.ab-detail`, les handlers délégués, et le **volet adapté (Q3)** sur le cas le plus simple.

**Périmètre — familles couvertes** : broadcast simple, paramétré (`isParam`), et `linked` (rendu lien, sans détail actionnable). **PAS** community, **PAS** user-task (incréments 2 et 3).

**Fichiers touchés** :
- `public/js/cards.js` : la branche broadcast/param/linked de `cardHTML`/`frontFace`/`backFace` → émet `.alert-block` (head/body/action/`.ab-detail`) au lieu de `.card.flip`+faces. `shareFace` → contenu de partage déplacé (modale existante `LBAShare`, inchangée). `.ab-toggle` remplace `.flip-btn`.
- `public/js/site.js` : le handler `.flip-btn`/`.flip-back` → `.ab-toggle` (ouvre/ferme `.ab-detail` en place) ; le handler `.card-share` inchangé (modale). Aucun autre changement (like/switch/param délégués sur classes inchangées).
- `public/js/list-view.js` : `openParams` → ouvre `.ab-detail` (`ab-open`) au lieu de `.face-task` ; `unparkCard` → ferme `.ab-detail` ; `gridCard` → sélection par attribut `data-source-id` (vérifier qu'aucun `.card` en dur ne subsiste). **Uniquement pour les blocs broadcast/param** à ce stade.
- `public/css/site.css` : nouveau bloc `.alert-block` (+ `.ab-*`) + `.lrow-exp .alert-block.in-list-exp`. Le CSS carte/flip **laissé inerte** (retrait à l'incrément final).

**Fichiers NON touchés à ce stade** : `community-*` (routes serveur, `community-types.js`), `user-tasks*`, `favoris.js`/`favoris.html` (ils réutilisent `LBACards.cardHTML` → hériteront du bloc automatiquement pour le broadcast), `forum.js`, tout le back-end.

**Coexistence pendant la transition (à trancher — point ouvert P1)** : tant que community/user-task ne sont pas convertis, `cardHTML` émet **`.alert-block`** pour broadcast/param/linked et **encore `.card.flip`** pour community/user-task. `#grid` contient alors un **mélange** bloc + carte. `openParams` doit brancher : bloc → ouvrir `.ab-detail` ; carte legacy → `.face-task` (code actuel conservé le temps de la transition). Acceptable et sûr (chaque famille validée séparément), mais visuellement hétérogène 2–3 incréments durant. *Alternative : convertir les 3 familles en un seul gros incrément — écarté par Q5.*

**Critère de validation avant incrément 2** :
1. Harnais de rendu (le même que le hotfix) : `cardHTML` broadcast/param/linked rend sans erreur, structure `.alert-block` conforme.
2. En navigation manuelle : liste 1 colonne, expand-collapse OK, ♥/partage/switch/param fonctionnels, **vue liste** (parkCardInto) ouvre le détail broadcast/param correctement, retour à `#grid` à la position d'origine.
3. Aucune régression sur community/user-task (encore en cartes legacy).
4. Diff relu et validé par Hugo.

### Incrément 2 — Famille **communautaire**
`.alert-block` + `.ab-community` (aperçu statique Q2 dans `.ab-body`, liste+formulaire dans `.ab-detail`), `renderCommunityRecto` → `renderCommunityPreview` + remplissage à l'ouverture, `openParams` branché sur `data-card-type="community"`. Fichiers : cards.js (branche community), site.js (bloc community 1018-1373 réorienté du recto vers `.ab-community`), list-view.js (discrimination community), site.css. Back-end **intact**. Validation analogue + non-régression signaler/résoudre.

### Incrément 3 — Famille **user-task**
`.alert-block` + `.ab-tasks` (liste des tâches dans `.ab-detail`, `.param-mute` dans `.ab-action`), `.task-config` ouvre `.ab-detail`. Fichiers : cards.js (branche user-task), site.js (handlers task, réorientés), list-view.js, site.css. `user-task-form.js` (modale) **inchangé**. Validation + non-régression pause/tâches/« C'est fait ✓ ».

### Incrément 4 — Nettoyage final
Retrait du CSS carte/flip inerte de `site.css`, du markup skin résiduel de `cards.js` (Q4 ÉTAPE 2), des branches legacy `.face-task` de `openParams`, du commentaire périmé `card-add-deck`. Bump `CACHE_VERSION`. Validation : plus aucune trace `.card-inner`/`.card-face`/flip dans le code actif.

---

## Points ouverts nécessitant une réponse de Hugo (avant implémentation de l'incrément 1)

- **P1 — Coexistence transitoire** (§10) : accepter le **mélange bloc + carte legacy** dans `#grid` pendant les incréments 1→3 (chaque famille migrée et validée séparément), ou préférer un basculement famille-par-famille **gated** (drapeau) pour éviter l'hétérogénéité visuelle ? *(Recommandé : accepter la coexistence — plus simple, cohérent avec Q5 « par incréments ».)*
- **P2 — Forme de l'aperçu communautaire statique (Q2)** : dernier signalement (commune + lieu abrégé) vs compteur simple « N signalements » ? *(Recommandé : dernier signalement s'il existe, sinon rien ; le compteur en repli.)*
- **P3 — `gridCard`/sélecteur** : confirmer qu'on peut faire porter au bloc les **mêmes classes interactives** (`.card-like`, `.card-share`, etc.) sans conserver la classe racine `.card` — les handlers `site.js` ciblent ces classes internes, pas `.card` racine, donc a priori OK ; à valider à l'incrément 1. *(Pas une décision produit, une vérif technique — je la ferai en explorant avant de coder l'incrément 1.)*
- **P4 — Portée de l'incrément 1** : le périmètre proposé (broadcast + param + linked ensemble) te convient-il, ou veux-tu broadcast **seul** d'abord (param/linked en incrément 1bis) ?

Aucune décision prise à ma main. Aucun code d'implémentation écrit. Sur validation de ce cadrage — **en particulier P1 et le mécanisme Q3 (§5)** — j'explore puis propose le diff de l'incrément 1 pour relecture, sans enchaîner sur l'incrément 2 sans ton feu vert.

*Fin du cadrage mis à jour.*
