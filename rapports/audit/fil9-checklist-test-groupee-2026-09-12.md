# Fil #9 — Checklist de test groupée (format bloc, incréments 1→4) — à parcourir par Hugo

**Date : 2026-09-12** · À faire **en navigation réelle** sur la prod déployée (commit `1bbe3e7`, cache **v15**).
**Prérequis navigateur** : vider le cache / hard-reload (Ctrl+Shift+R), ou attendre la bascule du service worker `v15`. Si un asset semble ancien → purge Cloudflare (`site.css`/`cards.js` peuvent être en cache edge ~4 h).

Mon harnais (Node + Playwright) a déjà validé le **structurel** et l'**interactif de base** ; cette liste couvre ce qui n'est **pilotable qu'en navigation réelle** (données live, mobile, pipeline complet). Coche au fur et à mesure.

---

## A. Rendu par famille × vue × écran

| # | À vérifier | OK ? |
|---|---|---|
| A1 | **Broadcast** — vue **bloc**, desktop : titre/état/♥/partage/détails, switch d'abonnement | ☐ |
| A2 | **Paramétré** — vue bloc : picker (dép./région/commune), état de(s) instance(s) | ☐ |
| A3 | **Linked** — vue bloc : bandeau « Service partenaire » + bouton « Configurer sur … → » | ☐ |
| A4 | **Communautaire** — vue bloc : « Rien à signaler », bouton **Signaler**, switch, **aperçu du dernier signalement** (si ≥1) | ☐ |
| A5 | **User-task** — vue bloc : « Tâche personnelle » / « Tâche suivie », « + configurer », **switch pause si ≥1 tâche** | ☐ |
| A6 | Les 5 ci-dessus en **vue liste** (bascule liste) : ligne correcte, icônes ♥/partage/détails, switch de ligne cohérent | ☐ |
| A7 | Les 5 en **mobile** (largeur réelle téléphone), vue bloc **et** liste : pas de débordement, boutons cliquables | ☐ |

## B. Expand / collapse (`.ab-toggle`)

| # | À vérifier | OK ? |
|---|---|---|
| B1 | Broadcast/param/linked : ⓘ ouvre le détail (desc longue, tags, badge @forum), re-clic ferme | ☐ |
| B2 | Communautaire : ⓘ **et** « Signaler » ouvrent le détail (liste des signalements + formulaire) | ☐ |
| B3 | User-task : « + configurer » ouvre le détail (**gestion des tâches**) | ☐ |
| B4 | **Vue liste** : déplier une ligne de chaque famille → le volet montre le bon contenu ; fermeture → retour propre (carte reprend sa place) | ☐ |

## C. Actions clés par famille

| # | À vérifier | OK ? |
|---|---|---|
| C1 | **Broadcast/param** connecté : **abonnement** (switch) → e-mail de confirmation attendu ; **pause/reprise** | ☐ |
| C2 | **Param** : ajouter une instance (commune/dép.) → apparaît ; retirer une instance | ☐ |
| C3 | **Communautaire** : **Signaler** une disparition (commune + description) → création | ☐ |
| C4 | Communautaire : **« Je l'ai vu »** (où/quand) sur un signalement d'autrui ; **« Je l'ai retrouvé »** (auteur) → clôture | ☐ |
| C5 | **User-task** : **Créer** une tâche (modale) → apparaît dans le détail, état → « Tâche suivie », switch pause apparaît | ☐ |
| C6 | User-task : **« C'est fait ✓ »** → échéance recalculée ; **✕ supprimer** la dernière tâche → « Tâche personnelle », switch pause disparaît | ☐ |
| C7 | User-task : **pause/reprise** (switch) cohérent en vue bloc **et** reflété sur le switch de la vue liste | ☐ |
| C8 | **Lien e-mail de complétion** (token/cron) : un clic depuis un e-mail fonctionne toujours (serveur inchangé sur tout le fil) | ☐ |

## D. Partage

| # | À vérifier | OK ? |
|---|---|---|
| D1 | Bouton **partage** sur ≥1 famille → **modale** de partage (copier le lien / réseaux), pas de flip | ☐ |

## E. Non-régression pipeline (vue bloc **et** liste)

| # | À vérifier | OK ? |
|---|---|---|
| E1 | **Filtres catégories** : sélection → seules les bonnes cartes/lignes restent ; vue liste en miroir | ☐ |
| E2 | **Recherche** (nom/desc/tags, accents-insensible) : « tache » trouve « tâche » | ☐ |
| E3 | **Tri** : ordre attendu (liste = alphabétique) | ☐ |
| E4 | **Pagination** / « voir plus » : lots suivants, cohérence liste | ☐ |
| E5 | **Reco** (« pour toi ») : cartes recommandées, retrait d'une reco | ☐ |
| E6 | **Like** ♥ : bascule + compteur ; cohérence carte ↔ ligne liste | ☐ |

## F. Points de vigilance spécifiques fil #9

| # | À vérifier | OK ? |
|---|---|---|
| F1 | **Aucun résidu graphique** du format carte : nulle part de recto/verso, flip, motif full-art, sceaux/attaques/pied de « skin » | ☐ |
| F2 | **Aucun résidu skin** : pas de cadres/teintes de skins boutique, pas de bouton « boutique » | ☐ |
| F3 | **`note()` — CORRIGÉ (post-incrément 4)** : en **anonyme**, sur un **broadcast**, saisir un e-mail dans le champ inline et valider → le message « Vérifie tes emails ✉️ » (ou « Déjà inscrit ✓ ») **s'affiche dans le bloc, sans erreur console**. Idem sur une erreur réseau (« Réessaie plus tard ») et sur une instance **paramétrée** en échec. Plus aucun `null.appendChild`. | ☐ |
| F5 | **Lien e-mail de complétion de tâche** (`?task-confirmed=…`) : le clic ouvre désormais le **détail** de la carte (`.ab-detail`) et la tâche confirmée est **visible** (échéance à jour), carte remontée à l'écran. | ☐ |
| F4 | Console navigateur : **aucune erreur** JS pendant la navigation normale | ☐ |

---

## Ce qui est déjà couvert par mon harnais (rappel, pour éviter le doublon)
- Rendu structurel des 6 cas × 2 modes (12/12), 0 résidu flip/skin dans le HTML émis.
- Interactif : `.ab-detail` bascule none→flex, visibilité toggle/♥/partage/état/pause/config/task-zone, vue liste `.flip-btn` stylé (static), 0 erreur console **sur le harnais**.
- Ce que le harnais **ne** couvre **pas** (→ cette liste) : données live, e-mails réels, mobile réel, pipeline complet (filtres/tri/pagination/reco), flux modale de création, lien e-mail token/cron.

## Après cette checklist
Une fois parcourue et validée par toi, je produis le **rapport final du fil #9** (récap incréments 1→4, état déployé, dette restante actée : CSS decks + `note()` + handlers flip inertes site.js/list-view.js). Le fil sera alors clos.
