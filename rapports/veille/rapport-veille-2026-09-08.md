# Rapport de veille — 2026-09-08

*Robot 1 — veille de maintenance, LECTURE SEULE. Aucune modification effectuée.*
*Source de données : `node scripts/veille-readonly.js` (généré à 16:08 UTC). Sources enabled : 267 ; combinaisons paramétrées : 36.*

## Résumé (points saillants, par importance)

1. **Contrôle de vitalité PanneauPocket HORS SERVICE ce run** : la section `panneaupocket_vitality` est revenue **vide** à cause d'un bug du script de veille (`jsonb_array_length` appliqué à un `ref` non-tableau → toute la requête échoue silencieusement). La tâche (f) n'a donc **pas pu être réalisée**. Correctif proposé en fin de rapport (brouillon, à valider).
2. **Sources en échec** : rien de neuf de grave. `sncf-perturbations` (clé API absente = attendu), timeouts d'API tierces (`lancement-spatial`, `ecowatt`, `statut-gandi`). Seul point à surveiller : `statut-shopify` renvoie un **406 Not Acceptable** (rejet délibéré, pas un timeout).
3. **Slug orphelin** : `communaute` (cartes chat-perdu / chien-perdu) est utilisé en base mais absent de la taxonomie `server/categories.js`.
4. **Bruit attendu confirmé** : les 26 combos « orphelins » et les états `active` figés (vigilance-meteo, risque-secheresse, rappel-conso, iss-gap) sont **le même ensemble** — reliquats de désabonnements non purgés, non pollés donc `checked_at` ancien. Aucune alarme.
5. **TODO calendaires ≤ 60 j** : 3 configs déjà connues comme « vides / TODO » à renouveler avant le 2026-11-07 (`tour-de-france-passage`, `ouverture-ventes-sncf`, `prix-litteraires`).

Schéma DB : **cohérent** (`schema_check.ok = true`, 58 colonnes attendues, aucun manquant). Pas de bandeau migration.

---

## Vitalité PanneauPocket curée (tâche f) — CONTRÔLE INDISPONIBLE

La section `panneaupocket_vitality` du JSON est **vide (`[]`)**. Ce n'est pas « toutes les cartes vont bien » : c'est une **panne du contrôle lui-même**.

Cause identifiée (lecture de `scripts/veille-readonly.js`, requête `Q_PP_VITALITY`, l. 187-198) :

```sql
CASE WHEN ss.ref IS NULL THEN NULL
     ELSE jsonb_array_length(ss.ref) END AS ref_panneau_count
```

`jsonb_array_length()` **lève une erreur PostgreSQL** (`cannot get array length of a non-array`) dès que `ss.ref` est un **objet** JSON et non un tableau. Or certaines sources stockent `ref` sous forme d'objet (ex. `ondes-gravitationnelles` : `{seenConfirmed, alerted, corrected}` — cf. etat-projet.md). Une seule ligne de ce type suffit à faire échouer **toute** la requête, qui est enveloppée dans un `try/catch` renvoyant `[]` (l. 309-314). Résultat : la vitalité de **toutes** les cartes curées est masquée, sans erreur visible.

**Conséquence** : impossible ce run de repérer une carte curée « sans panneau depuis 90 j » candidate à désactivation. À corriger (brouillon plus bas) avant que ce contrôle serve à quelque chose.

### Jeu curé identifié (pour mémoire, à croiser une fois le script réparé)

Cartes broadcast curées (require de `lib/panneaupocket-veille`, hors `panneaupocket` et `ma-collectivite` paramétrées) — **19 cartes** :

- `arrosage-canal-gap` (via `createBroadcastSource`)
- **Eau (6)** : `eau-regie-metz`, `eau-provence-verte`, `eau-isle-dronne`, `eau-charles-chaigneau`, `eau-puisaye-forterre`, `eau-coteaux-lizon`
- **Déchets (3)** : `dechets-saulieu`, `dechets-la-saucelle`, `dechets-campagne-caux`
- **Gendarmerie (3)** : `securite-gendarmerie-albi`, `securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts`
- **Infos locales (4)** : `local-chablis`, `local-agly-fenouilledes`, `local-buech-devoluy`, `local-chabris-bazelle`
- **Divers (2)** : `agenda-luc-en-diois`, `cantine-a2m2v`

Aucune de ces cartes n'apparaît dans `failing_sources`, et leurs `source_states` sont `inactive` avec des `checked_at` récents (fin août → début septembre) : rien qui signale une carte morte, mais **ce n'est pas une mesure de vitalité** (cf. limite de méthode déjà documentée : le proxy `last_activated_at` sous-estime, et il n'est de toute façon pas calculé ce run). La famille gendarmerie reste la plus à risque (dormance ~85 % côté PanneauPocket) — à re-vérifier en priorité par un humain via l'appli une fois le script réparé.

---

## Cohérence schéma (tâche e)

`schema_check.ok = true` — schéma cohérent, rien à signaler.

---

## Sources en échec (tâche a)

| Source | Échecs (7 j) | Dernier message | Lecture |
|---|---|---|---|
| `sncf-perturbations` | 130 | `SNCF_API_KEY absente de l'environnement` | **Cause connue/attendue** : clé jamais souscrite (var Railway à poser). Pas une régression. |
| `lancement-spatial` | 53 | `Timeout API Launch Library (>10000 ms)` | API tierce communautaire lente/instable. Récurrent mais non bloquant ; à surveiller si ça persiste. |
| `ecowatt` | 11 | `Timeout API EcoWatt (>10000 ms)` | Timeout transitoire ; source hivernale hors saison. Bas niveau. |
| `statut-gandi` | 2 | `Timeout (status.gandi.net, >10000 ms)` | Transitoire, au seuil. RAS. |
| `statut-shopify` | 2 | `HTTP 406 Not Acceptable (shopifystatus.com)` | **À surveiller** : un 406 est un rejet délibéré (pas un timeout) — l'endpoint peut avoir changé de politique (en-tête `Accept` requis, anti-bot). À vérifier si ça se répète. |

---

## États figés & combos orphelins (tâches a-secondaire & g)

Le signal `stale_states` est presque entièrement du **bruit attendu** : la quasi-totalité des entrées sont `inactive` (normal, cf. caveat — `checked_at` non rafraîchi en still-inactive).

Les seules entrées `active` figées (vigilance-meteo dépts 31/33/35/38/44/67/74/75/83/24/13, risque-secheresse 06/14/16/53, rappel-conso alimentation & bébés-enfants, iss-passages gap) **coïncident exactement** avec les **26 combos orphelins** (`orphan_param_states.count = 26`) : ce sont des lignes `source_param_states` que **plus aucun abonnement ne porte** (reliquats de désabonnements). N'étant plus souscrites, elles ne sont plus pollées → `checked_at` ancien. **Aucune alarme** : c'est cohérent et attendu.

- **Combos orphelins : 26.** Purge = décision humaine (jamais de DELETE par le robot). Si Hugo veut nettoyer : cibler `source_param_states` sans abonnement correspondant.

---

## Jamais actives sur 90 j (tâche a)

168 sources jamais `activated` depuis 90 j. **RAS** : ensemble cohérent avec le catalogue — pages de statut (`statut-*`) qui tombent rarement en panne, événements saisonniers hors saison (Beaujolais, Black Friday, Géminides, prix littéraires…), sources paramétrées qui ne s'activent qu'à la souscription, et types non-veille (`chat-perdu`/`chien-perdu` = `community`, `tache-echeance-glissante` = `user-task`). Rien d'anormal (aucune source « censée s'activer souvent » et muette).

---

## Collisions d'ordre d'affichage (tâche a) — cosmétique

11 collisions de `display_order`, principalement entre pages de statut et événements saisonniers :

`40` (doomname / statut-github) · `42` (statut-npm / statut-openai) · `43` (statut-discord / statut-vercel) · `50` (changement-heure / statut-twitch) · `51` (black-friday / soldes / statut-zoom) · `52` (perseides / statut-canva) · `53` (beaujolais-nouveau / statut-dropbox) · `54` (soldes-steam / statut-slack) · `55` (aurores-france / cert-fr-alertes) · `56` (eclipse-solaire / geminides / nuits-des-etoiles) · `59` (echeances-fiscales / journees-patrimoine).

Sans urgence. Un ré-échelonnement des `display_order` réglerait l'affaire si le rendu gêne.

---

## Slugs orphelins (tâche c)

Croisement `category_slugs` (145 slugs réellement utilisés en base) × `VALID_SLUGS` (337 slugs définis dans `server/categories.js`) :

- **`communaute`** — utilisé en base (cartes `chat-perdu` / `chien-perdu`, catégorie « Communauté ») mais **absent de la taxonomie** `categories.js`. La carte affichera le slug brut au lieu d'un libellé, et le slug n'apparaît pas comme filtre du kiosque. À ajouter à un groupe de `GROUPS` (p. ex. un groupe `vie-locale` ou `autre`), avec éventuellement une entrée `SPECIAL`/`ACCENTS` pour le libellé « Communauté ».

Aucun autre orphelin. (L'inverse — slugs définis mais non utilisés — est normal, non signalé.)

---

## TODO calendaires ≤ 60 jours (tâche b) — fenêtre 2026-09-08 → 2026-11-07

Configs datées codées en dur nécessitant un **renouvellement humain** dans la fenêtre :

| Fichier | Échéance | Besoin |
|---|---|---|
| `server/sources/tour-de-france-passage.js` | TODO octobre 2026 | Config parcours **vide** ; transcrire département→dates du parcours 2027 dès publication `letour.fr`. (Déjà noté « config vide TODO oct » dans etat-projet.) |
| `server/sources/ouverture-ventes-sncf.js` | « revérifier début septembre 2026 » | Config **vide** ; ajouter la date d'ouverture des ventes hiver 2026-2027 dès qu'elle est publiée. |
| `server/sources/prix-litteraires.js` | TODO annuel automne | Ajouter le jour exact du **Goncourt des lycéens 2026** (proclamation fin novembre) une fois annoncé. |

Ces trois sont des **TODO déjà connus** (config vide côté produit), pas des régressions. Aucun n'empêche le fonctionnement des autres sources.

Événements datés qui se déclencheront **automatiquement** dans la fenêtre (aucune action code) : Journées du patrimoine (19-20 sept), Fête de la science (2-12 oct), Nobel (5-12 oct), Semaine du goût (12-18 oct), Semaine Bleue (5 oct), taxe foncière (15-20 oct), prix littéraires d'automne (29 oct → 4 nov), trêve hivernale (1er nov), changement d'heure (31 oct).

**Annexe (au-delà de 60 j, pour mémoire)** : `bison-fute.js` (calendrier 2026 épuisé, TODO 2027 à préparer avant janvier), `beaujolais-nouveau` (17 nov), `fete-des-lumieres` (5-8 déc), `echeances-fiscales` taxe d'habitation résidences secondaires (15-20 déc), `saint-nicolas` (6 déc), + nombreux TODO 2027 (fete-science, nobel, semaine-du-gout, braderie-lille, rentree-scolaire, cheque-energie, fetes religieuses…).

---

## Stabilité des ids `?panneau=` (tâche g) — point de vigilance ouvert

Rappel : si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme « nouveau ». Non mesurable sans requête réseau (interdite la nuit). **Point de vigilance ouvert**, sans alarme.

---

## BROUILLON — à valider par Hugo avant toute exécution

*Ce brouillon n'est PAS exécuté par le robot. Il ne concerne QUE le script de veille en lecture seule, jamais la base ni le code applicatif.*

**Objet** : réparer le contrôle de vitalité PanneauPocket (`scripts/veille-readonly.js`), rendu inopérant par un `ref` non-tableau.

Remplacer, dans `Q_PP_VITALITY`, le calcul de `ref_panneau_count` par une variante qui ne lève pas d'erreur sur un `ref` objet :

```sql
CASE WHEN jsonb_typeof(ss.ref) = 'array'
     THEN jsonb_array_length(ss.ref)
     ELSE NULL END AS ref_panneau_count
```

Ainsi une source à `ref` objet (ex. `ondes-gravitationnelles`) renvoie simplement `NULL` au lieu de faire échouer toute la requête. Après ce correctif, relancer `node scripts/veille-readonly.js` permettra enfin d'exercer la tâche (f) sur les 19 cartes curées ci-dessus.

Secondairement (moins urgent) : ajouter le slug `communaute` à la taxonomie `server/categories.js` (dans un `GROUPS[...]`), pour que les cartes chat-perdu/chien-perdu affichent un libellé propre. — *modification de code applicatif : hors périmètre du robot, à faire par Hugo dans un commit dédié.*
