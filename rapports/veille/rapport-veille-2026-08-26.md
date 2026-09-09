# Rapport de veille — 2026-08-26

_Généré automatiquement le 2026-08-26 à 02h00 UTC. Lecture seule — aucune modification effectuée._

---

## Résumé

1. **`lancement-spatial` : 67 timeouts consécutifs** — l'API Launch Library est en échec prolongé depuis plusieurs semaines. À distinguer d'un pic transitoire.
2. **Slug orphelin `communaute`** — utilisé par `chat-perdu` et `chien-perdu`, absent de `server/categories.js`. Ces cartes affichent le slug brut au lieu d'un libellé.
3. **Grandes marées 2026 : dernière période codée = 27 oct** — la source sera dormante après cette date. TODO 2027 à traiter en octobre/novembre.
4. **Schéma cohérent** (ok=true, 58 colonnes, aucun missing).
5. **26 combos orphelins** en `source_param_states` (reliquat de désabonnements, purge = décision humaine).

---

## Cohérence schéma

`schema_check.ok === true` — 58 colonnes attendues présentes, aucun missing, aucun type_mismatch. RAS.

---

## Sources en échec (`failing_sources`)

### Pannes confirmées ou durables

**`lancement-spatial`** — 67 échecs, dernier : 2026-08-26T01:01. Message : _Timeout API Launch Library (>10000 ms)_. La source n'a jamais été activée depuis 90 jours (présente en `never_active_90d`). L'API externe (Launch Library 2 / ll2.thespacedevs.com) semble durablement lente ou indisponible depuis Railway. **À investiguer** : tester l'URL depuis un terminal Railway, envisager un timeout plus long ou un repli.

### Cause connue / attendue

**`sncf-perturbations`** — 131 échecs, `SNCF_API_KEY absente de l'environnement`. Documenté, clé à configurer manuellement sur Railway. Aucune action code requise.

### Timeouts transitoires (< 5 échecs, dernière occurrence ≥ 1 jour)

Ces sources ont 2–4 échecs récents par timeout de leur API de statut Statuspage/Helix. Pattern bruit normal pour des services tiers :

- **`ecowatt`** (4 échecs, dernier 2026-08-19) — timeout auth RTE. Dernier check vieux ; si stable depuis, RAS.
- **`statut-twitch`** (3 échecs, dernier 2026-08-25)
- **`statut-canva`** (2 échecs, dernier 2026-08-25)
- **`statut-gandi`** (2 échecs, dernier 2026-08-25)
- **`statut-grafana`** (2 échecs, dernier 2026-08-25)
- **`statut-proton`** (2 échecs, dernier 2026-08-25)

Cinq de ces six ont eu leurs échecs groupés le 25 août en fin d'après-midi, ce qui suggère un épisode réseau côté Railway ou un pic de latence global. Sans récurrence dans les 48h suivantes, pas d'alarme.

---

## États figés (`stale_states`)

Caveat appliqué : `checked_at` n'est rafraîchi que sur écriture. Une source `inactive` stable (still-inactive) garde un `checked_at` ancien — comportement **normal** jusqu'au déploiement de l'étape B.

La quasi-totalité des entrées stale sont des sources `inactive` sur des `source_states` (broadcast non paramétrées). C'est attendu et sans signification pour l'état réel du service.

**Exceptions méritant une mention :**

- **`vigilance-meteo` (9 combos, state=`active`)** avec `checked_at` du 14-19 juillet — ces combos sont tous présents dans `orphan_param_states` (plus aucun abonnement actif). L'état `active` figé est cosmétiquement gênant mais sans impact opérationnel.
- **`risque-secheresse` (4 combos, state=`active`)** — même situation : orphans, sans abonnés.
- **`rappel-conso` (2 combos, state=`active`)** — idem.

Purge : voir section **Combos orphelins**.

---

## Jamais actives depuis 90 jours (`never_active_90d`)

Longue liste (~170 entrées). L'essentiel est **normal** : sources saisonnières hors saison (`changement-heure`, `beaujolais-nouveau`, `black-friday`, `treve-hivernale`, `prime-noel`, `soldes-steam`, `geminides`…), sources de gamme large sans événement récent, ou sources récemment ajoutées.

**Signaux non-normaux :**

- **`lancement-spatial`** — jamais actif ET en échec répété depuis plusieurs semaines. Voir section sources en échec.
- **`ecowatt`** — service saisonnier (hiver). Dormant en été, normal.
- **`doomname`** — source externe partenaire, aucun événement DoomName depuis la mise en prod. Normal.
- **`tache-echeance-glissante`** (`user-task`) et **`veille-agenda`** — en cours de déploiement ou usage limité. Normal.
- **`chat-perdu`**, **`chien-perdu`** (`community`, créées en août 2026) — nouvelles, sans activation depuis leur création. Normal à ce stade.

---

## Collisions d'ordre d'affichage (`display_order_collisions`)

11 collisions dans la plage 40–59, par paires ou triplets. Cosmétique — l'ordre de tri DB (alphabétique sur id) prend le relais, aucune carte n'est masquée. Rééchellonner si l'ordre affiché dans le kiosque s'avère incohérent visuellement.

Collisions :

| Order | Sources |
|-------|---------|
| 40 | `doomname`, `statut-github` |
| 42 | `statut-npm`, `statut-openai` |
| 43 | `statut-discord`, `statut-vercel` |
| 50 | `changement-heure`, `statut-twitch` |
| 51 | `black-friday`, `soldes`, `statut-zoom` |
| 52 | `perseides`, `statut-canva` |
| 53 | `beaujolais-nouveau`, `statut-dropbox` |
| 54 | `soldes-steam`, `statut-slack` |
| 55 | `aurores-france`, `cert-fr-alertes` |
| 56 | `eclipse-solaire`, `geminides`, `nuits-des-etoiles` |
| 59 | `echeances-fiscales`, `journees-patrimoine` |

---

## TODO calendaires ≤ 60 jours (échéance avant 2026-10-25)

### ⚠️ Dans la fenêtre — vérifier que les dates sont correctement codées

| Source | Fichier | Événement | Date(s) | Statut |
|--------|---------|-----------|---------|--------|
| **Grandes marées** | `server/sources/grandes-marees.js` | Coeff ≥ 100 | 11–13 sept 2026 | Codée ✓ |
| **Journées du patrimoine** | `server/sources/journees-patrimoine.js` | 3e week-end septembre | 19–20 sept 2026 | Calculé dynamiquement ✓ |
| **Bison Futé** | `server/sources/bison-fute.js` | Dernier jour rouge 2026 | 2026-08-28 | Codé ✓ (dans 2 jours) |
| **Fête de la science** | `server/sources/fete-science.js` | Édition 2026 | 2–13 oct 2026 | Codée ✓ |
| **Semaine Bleue** | `server/sources/semaine-bleue.js` | 1re semaine complète octobre | ~5–11 oct 2026 | TODO 2027 noté, 2026 supposément codée |
| **Taxe foncière** | `server/sources/echeances-fiscales.js` | Délai papier | 2026-10-15 | Codée ✓ |

Ces échéances sont toutes dans le code ; aucune action immédiate requise sauf vérification de `semaine-bleue.js` (le fichier annonce un TODO 2027 mais ne détaille pas les dates 2026 — à re-vérifier que la date 2026 est bien posée).

### Au-delà de 60 jours (pour mémoire)

- `echeances-fiscales` : Taxe d'habitation résidences secondaires 2026-12-15 → codée.
- `grandes-marees` : dernière entrée 2026 = 27 oct, puis **source dormante**. TODO 2027 à traiter avant fin oct.
- `bison-fute` : TODO début 2027 → renouveler le calendrier dès publication Bison Futé.
- `nobel-prix` : TODO 2027 → semaine 5–12 oct 2027, à confirmer sur nobelprize.org.
- `braderie-lille` : TODO 2027 (édition 2026 = 5–6 sept, déjà passée).
- `rentree-scolaire` : TODO 2027 (arrêté à paraître).
- `fete-science` : TODO 2027 (dates non annoncées à l'écriture).
- `semaine-bleue` : TODO 2027 (dates non annoncées).

---

## Slugs orphelins (tâche c)

**1 orphelin identifié.**

Le slug **`communaute`** est utilisé dans `server/db/init.sql` pour les sources `chat-perdu` (display_order 500) et `chien-perdu` (display_order 501), mais il est **absent de `server/categories.js`** (ni dans un groupe GROUPS, ni dans SPECIAL). Conséquence : le libellé affiché sera le slug brut `"communaute"` au lieu d'un label français.

**Correction suggérée** (décision Hugo) : ajouter `'communaute'` dans le groupe `'animaux'` ou `'vie-locale'` de `server/categories.js`, ou dans une entrée SPECIAL dédiée `'communaute': 'Communauté'`.

---

## Vitalité des cartes PanneauPocket curées (tâche f)

**Jeu curé identifié** : 19 fichiers `server/sources/*.js` qui `require('./lib/panneaupocket-veille')` et appellent `makeCurated(…)` ou `createBroadcastSource(…)` en broadcast :

- **6 eau** : `eau-regie-metz`, `eau-provence-verte`, `eau-isle-dronne`, `eau-charles-chaigneau`, `eau-puisaye-forterre`, `eau-coteaux-lizon`
- **3 déchets** : `dechets-saulieu`, `dechets-la-saucelle`, `dechets-campagne-caux`
- **3 gendarmerie** : `securite-gendarmerie-albi`, `securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts`
- **4 infos locales** : `local-chablis`, `local-agly-fenouilledes`, `local-buech-devoluy`, `local-chabris-bazelle`
- **1 agenda** : `agenda-luc-en-diois`
- **1 cantine** : `cantine-a2m2v`
- **+ `arrosage-canal-gap`** (`createBroadcastSource` avec filtre thématique)

**Résultat du script** : `panneaupocket_vitality: []` — le script n'a retourné aucune entrée pour ce jeu.

**Limite de méthode** (à rappeler) : la base ne stocke aucune date de publication de panneau ; `last_activated_at` est le seul proxy (dernier panneau alertable en base). Sans accès réseau à PanneauPocket (interdit la nuit), impossible de dériver la date du panneau le plus récent. Le proxy sous-estime la vitalité (panneaux hors filtre thématique ou cosméties n'incrémentent pas `last_activated_at`).

En l'absence de données dans `panneaupocket_vitality`, aucune carte ne peut être qualifiée de « candidate à désactivation » sur la base de ce run. **Suggestion** : persister la date du dernier panneau vu (hors filtre thématique) dans la colonne `ref` de `source_states` lors de chaque poll, pour disposer d'un proxy plus complet à l'avenir.

---

## Combos orphelins & stabilité ids `?panneau=` (tâche g)

### Combos orphelins

**26 lignes orphelines** dans `source_param_states` (aucun abonnement actif ne porte le couple `(source_id, params)` correspondant). Détail du sample :

| Source | Params | État |
|--------|--------|------|
| `iss-passages` | `{ville: "gap"}` | **active** ⚠️ |
| `ma-collectivite` | Oze, Valserres, AMR 05, Veynes, La Bâtie-Vieille (5 URLs) | inactive |
| `rappel-conso` | `alimentation`, `bébés-enfants (hors alimentaire)` | **active** |
| `risque-secheresse` | dépts 06, 14, 16, 53 | **active** |
| `vigilance-meteo` | dépts 10, 13, 16, 24, 31, 33, 35, 38, 44, 67, 69, 74, 75, 83 | mixte |

Note : `iss-passages {ville: gap}` est en state `active` mais orphan — plus aucun abonnement ne porte ce combo. L'état actif figé est cosmétiquement intéressant mais n'a aucun impact opérationnel (personne ne reçoit d'alerte pour cette combinaison).

**Purge = décision humaine** : ces 26 lignes sont des reliquats de désabonnements. Aucun `DELETE` n'a été effectué.

### Stabilité des ids `?panneau=`

Point de vigilance ouvert (consigné en tête de `server/sources/ma-collectivite.js`) : si PanneauPocket régénère les ids de panneau à l'édition d'un panneau, une modification apparaîtrait comme « nouveau » panneau — le mécanisme anti-rétroactif déduplicant sur id ne l'absorberait pas. Ce risque ne peut être mesuré sans fetch réseau (interdit). Aucune alarme — signalement maintenu comme point de vigilance ouvert.

---

_Fin du rapport. Aucune modification de code, base, config ou git n'a été effectuée._
