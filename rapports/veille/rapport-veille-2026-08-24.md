# Rapport de veille — 2026-08-24

> Généré par Robot 1 (lecture seule). Aucun fichier modifié en dehors de ce rapport.
> Contexte : 267 sources enabled, 36 combinaisons paramétrées actives.

---

## Résumé (5 lignes max)

1. **`lancement-spatial` — 62 timeouts consécutifs** sur 7 jours : l'API Launch Library semble durablement dégradée. À surveiller en priorité.
2. **Slug orphelin `communaute`** : utilisé en base par `chat-perdu` et `chien-perdu`, absent de la taxonomie `server/categories.js` → libellé brut affiché au lieu d'un label.
3. **`panneaupocket_vitality` toujours vide** : bug silencieux dans `scripts/veille-readonly.js` (voir §F). La vitalité des 19 cartes curées n'est pas mesurable automatiquement pour l'instant.
4. `sncf-perturbations` en échec continu (clé API absente) — situation connue et documentée.
5. `grandes-marees` : dernière entrée codée le 27 oct 2026 (dans 64 jours) — la source se silenciera ensuite, TODO 2027 à anticiper.

---

## Sources en échec

| Source | Nb échecs | Dernier message | Diagnostic |
|---|---|---|---|
| `sncf-perturbations` | 129 | "SNCF_API_KEY absente de l'environnement" | **Connu.** Variable Railway non posée. Pas une panne — rien à faire côté code. |
| `lancement-spatial` | 62 | "Timeout API Launch Library (>10000 ms)" | **⚠️ À surveiller.** 62 échecs consécutifs depuis au moins 7 jours. L'API Launch Library (ll.thespacedevs.com) est publique et sans SLA. Peut être un accès temporairement fermé côté datacenter Railway ou une dégradation de l'API. À vérifier manuellement lors d'une session. |
| `ecowatt` | 4 | "Timeout auth RTE (>10s)" | **Transitoire probable.** Seulement 4 échecs, dernier le 2026-08-19. Le portail RTE est parfois lent à l'auth OAuth. Pas d'alarme. |

---

## États figés (signal secondaire)

Nombreuses lignes `stale_states` avec `checked_at` antérieur à 48 h, toutes en état `inactive`. Comportement **normal** tant que l'étape B (refresh `checked_at` même en `still-inactive`) n'est pas déployée. Ces entrées ne sont pas corroborées par `failing_sources` et ne constituent pas une alerte.

Exception notable : neuf combos `vigilance-meteo` apparaissent à la fois en `stale_states` (état `active`, `checked_at` du 14-19 juillet) et dans les **combos orphelins** (§G). Leur état actif date d'une période antérieure au désabonnement ; le poller ne les recalcule plus, ce qui est correct.

---

## TODO calendaires ≤ 60 jours (jusqu'au 23 octobre 2026)

Toutes les dates listées ci-dessous sont **déjà codées** dans les sources concernées. Aucun renouvellement de config n'est requis avant le 23 octobre 2026.

| Source | Fichier | Échéance | Statut |
|---|---|---|---|
| Bison Futé | `bison-fute.js` | 28/08/2026 (dans 4 j) | Dernier jour JOURS_2026. La source se silenciera ensuite. **TODO 2027** noté dans le fichier ; renouvellement en début 2027 dès publication du PDF Bison Futé. Pas urgent maintenant. |
| Braderie de Lille | `braderie-lille.js` | 5-6 sept 2026 (dans 12 j) | Déjà codée. TODO 2027 dans le fichier. |
| Nouvelles du prélèvement à la source | `echeances-fiscales.js` | 1er sept 2026 (dans 8 j) | Calcul récurrent `new Date(year, 8, 1)` — aucune action. |
| Grandes marées | `grandes-marees.js` | 11-13 sept 2026 (dans 18 j) | Codée. |
| Journées du patrimoine | *(codée via calendar-factory)* | 19-20 sept 2026 (dans 26 j) | Vérification code non faite dans ce run (source déjà en prod selon etat-projet.md). |
| Bourses scolaires | `bourses-scolaires.js` | 15 oct 2026 (dans 52 j) | `CAMPAGNES[2026]` présent. |
| Taxe foncière | `echeances-fiscales.js` | 15/20 oct 2026 (dans 52/57 j) | `ECHEANCES[2026]` présent. |
| Paris Manga & Sci-Fi | `bd-manga-evenements.js` | 3-4 oct 2026 (dans 40 j) | Codé. |
| Made in Asia Brussels | `bd-manga-evenements.js` | 17-18 oct 2026 (dans 54 j) | Codé. |

### Annexe — TODOs au-delà de 60 jours (liste courte, sans alerte)

- **Grandes marées** : dernière entrée 27 oct 2026. Dormante ensuite. TODO 2027 à faire avant novembre 2026 idéalement (`grandes-marees.js` l. 3 : "TODO 2027 : transcrire les périodes depuis maree.info / SHOM").
- **Bison Futé 2027** : calendrier annuel PDF, renouvellement début 2027.
- **Allocation rentrée scolaire 2027** : TODO daté dans `allocation-rentree-scolaire.js` — dès publication CAF (mi-août 2027).
- **Bourses scolaires 2027-2028** : `CAMPAGNES[2027]` vide, TODO dans le fichier — dès parution circulaire de rentrée.
- **Angoulême / Comic Con 2027** : non annoncés, TODO dans `bd-manga-evenements.js`.

---

## Slugs orphelins

**1 slug orphelin trouvé** : `communaute`

- Présent en base dans les catégories des sources `chat-perdu` et `chien-perdu` (type `community`, display_order 500-501).
- **Absent de la taxonomie** définie dans `server/categories.js` (aucun groupe ne le contient).
- Conséquence front : `LBACat.label('communaute')` renvoie le slug brut (`'communaute'`) au lieu d'un libellé traduit. Les cartes s'affichent avec le tag brut.

### Brouillon de correctif (§BROUILLON)

> Voir la section BROUILLON en bas du rapport.

---

## Cohérence schéma

`schema_check.ok = true` — 58 colonnes vérifiées, aucun `missing`, aucun `type_mismatch`. **RAS.**

---

## Vitalité PanneauPocket curée (Vague L)

### Jeu curé identifié

19 fichiers `server/sources/*.js` utilisant `makeCurated` ou `createBroadcastSource` depuis `./lib/panneaupocket-veille` (hors `panneaupocket` et `ma-collectivite` paramétrées) :

`agenda-luc-en-diois`, `arrosage-canal-gap`, `cantine-a2m2v`, `dechets-campagne-caux`, `dechets-la-saucelle`, `dechets-saulieu`, `eau-charles-chaigneau`, `eau-coteaux-lizon`, `eau-isle-dronne`, `eau-provence-verte`, `eau-puisaye-forterre`, `eau-regie-metz`, `local-agly-fenouilledes`, `local-buech-devoluy`, `local-chablis`, `local-chabris-bazelle`, `securite-gendarmerie-albi`, `securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts`.

### Données de vitalité indisponibles — bug script

**`panneaupocket_vitality` = `[]`** (tableau vide), résultat du chemin `catch(e) → []` dans `scripts/veille-readonly.js`. La requête `Q_PP_VITALITY` échoue silencieusement.

**Cause probable identifiée** : la requête contient `jsonb_array_length(ss.ref)` dans un `CASE WHEN ss.ref IS NULL`. Or, ce `CASE` protège contre `NULL` mais pas contre un `ref` de type JSONB **objet** (non-tableau). Les sources du Lot 1 de persistance (`ondes-gravitationnelles`, `rappel-conso`…) stockent leur `ref` sous forme d'objet `{seenConfirmed, alerted, corrected}` — `jsonb_array_length` sur un objet lève une erreur PostgreSQL, capturée silencieusement.

**Limite de méthode à énoncer** : sans cette query, `last_activated_at` (le seul proxy en base) n'est pas accessible. La date du panneau le plus récent n'est de toute façon pas dérivable sans requêter PanneauPocket (interdit la nuit).

### Proxy secondaire via stale_states

Toutes les cartes curées apparaissent en `inactive` dans `stale_states`. Les plus anciennes `checked_at` non corroborées par `failing_sources` :

| Carte | Dernier checked_at | Interprétation |
|---|---|---|
| `dechets-campagne-caux` | 2026-07-24 (31 j) | Inactive, pas en échec — attendu |
| `securite-gendarmerie-bayeux` | 2026-07-24 (31 j) | Idem |
| `eau-puisaye-forterre` | 2026-07-24 (31 j) | Idem |
| `cantine-a2m2v` | 2026-07-24 (31 j) | Idem |
| `dechets-la-saucelle` | 2026-07-24 (31 j) | Idem |

Ces sources ne sont pas en échec (`failing_sources` vide pour elles) : `still-inactive` répété, `checked_at` non mis à jour — comportement attendu (caveat étape B).

Aucune carte curée ne peut être qualifiée de « candidate à désactivation » sur la base des seules données disponibles (proxy `last_activated_at` inaccessible ce run). La vérification humaine via l'application PanneauPocket reste la seule voie fiable.

**Proposition d'amélioration** : corriger `Q_PP_VITALITY` dans `scripts/veille-readonly.js` pour protéger `jsonb_array_length` contre les JSONB non-tableau :
```sql
CASE WHEN ss.ref IS NULL OR jsonb_typeof(ss.ref) <> 'array' THEN NULL
     ELSE jsonb_array_length(ss.ref) END AS ref_panneau_count
```

---

## Combos orphelins & stabilité des ids `?panneau=`

### Combos orphelins

**26 combos orphelins** au total (lignes `source_param_states` sans abonnement correspondant). Détail par source :

- `vigilance-meteo` : 12 combos (dépts 10, 13, 16×2, 24, 31, 33, 35, 38, 44, 67, 69, 74, 75, 83) — états `active` ou `inactive`, tous antérieurs à 2026-08-01. Reliquats de désabonnements.
- `ma-collectivite` : 5 combos (URLs Hautes-Alpes : Oze, Valserres, AMR 05, Veynes, La Bâtie-Vieille) — inactifs, désabonnés.
- `risque-secheresse` : 4 combos (dépts 06, 14, 16, 53) — actifs lors du dernier poll (juillet), désabonnés depuis.
- `rappel-conso` : 2 combos (alimentation, bébés-enfants) — idem.
- `iss-passages` : 1 combo (gap) — actif.

Aucune action requise. La purge est une décision humaine.

### Stabilité des ids `?panneau=`

Point de vigilance documenté en tête de `server/sources/ma-collectivite.js` : si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme « nouveau panneau » dans la dédup `ref`. Impossible à mesurer sans fetch réseau (interdit). Signalé comme point de vigilance ouvert, sans alarme.

---

## Collisions d'ordre d'affichage

11 collisions cosmétiques sur `display_order` 40-59. Signalées sobrement :

| Ordre | Sources |
|---|---|
| 40 | doomname, statut-github |
| 42 | statut-npm, statut-openai |
| 43 | statut-discord, statut-vercel |
| 50 | changement-heure, statut-twitch |
| 51 | black-friday, soldes, statut-zoom *(triplet)* |
| 52 | perseides, statut-canva |
| 53 | beaujolais-nouveau, statut-dropbox |
| 54 | soldes-steam, statut-slack |
| 55 | aurores-france, cert-fr-alertes |
| 56 | eclipse-solaire, geminides, nuits-des-etoiles *(triplet)* |
| 59 | echeances-fiscales, journees-patrimoine |

Pas d'impact fonctionnel. Un ré-échelonnement (ex. +0.5 sur l'intrus de chaque paire) peut être fait à l'occasion.

---

## Jamais actives depuis 90 jours

Longue liste attendue. Rien d'anormal :
- Sources **saisonnières** : `beaujolais-nouveau`, `changement-heure`, `soldes-steam`, `geminides`, `soldes`, `treve-hivernale`, `loi-montagne`, `black-friday`, etc.
- Sources **dormantes clé manquante** : `sncf-perturbations` (SNCF_API_KEY), `ecowatt` (RTE timeouts).
- Sources **veille d'état imprévisible** : normalement inactives tant qu'aucun changement n'est détecté (`veille-page`, `veille-stock`, `hausse-tarif-operateur`, etc.).
- Sources **récentes** : `chat-perdu`, `chien-perdu` (community, signalements utilisateurs) — muettes car aucun signalement actif.
- `doomname` : external, dépend du site doomname.com — normale.
- `lancement-spatial` : en échec (voir §Sources en échec).

---

## Decks signalés

`suspended_decks` = `[]` — aucun deck suspendu. RAS.

---

## BROUILLON — À valider par Hugo avant toute exécution

> ⚠️ CE BLOC EST UN BROUILLON NON VALIDÉ. Aucune modification n'a été effectuée. À lire, corriger si besoin, puis exécuter manuellement.

### 1. Ajouter le slug `communaute` à la taxonomie (`server/categories.js`)

Dans `server/categories.js`, dans le groupe `vie-locale` (ou créer un groupe `communaute` dédié), ajouter `'communaute'` :

Option A — dans `vie-locale` :
```js
'vie-locale': ['vie-locale', 'fetes', 'local', ..., 'mairie', 'communaute'],
```

Option B — nouveau groupe :
```js
'communaute': ['communaute', 'animaux-perdus', 'entraide'],
```
(à placer avant `'autre'`)

Et dans `SPECIAL` ou `ACCENTS` si le label automatique (`'Communaute'`) n'est pas satisfaisant :
```js
const SPECIAL = {
  ...,
  'communaute': 'Communauté',
};
```

### 2. Corriger le bug de `Q_PP_VITALITY` dans `scripts/veille-readonly.js`

Remplacer :
```sql
CASE WHEN ss.ref IS NULL THEN NULL
     ELSE jsonb_array_length(ss.ref) END AS ref_panneau_count,
```
par :
```sql
CASE WHEN ss.ref IS NULL OR jsonb_typeof(ss.ref) <> 'array' THEN NULL
     ELSE jsonb_array_length(ss.ref) END AS ref_panneau_count,
```
(ligne ~191 du fichier)
