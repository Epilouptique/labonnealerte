# Rapport de veille — 2026-09-09

*Robot 1 — veilleur de maintenance (lecture seule). Source de données : `node scripts/veille-readonly.js`. Aucune écriture hors ce rapport.*

## Résumé

- **Schéma cohérent** (`schema_check.ok = true`, 58 colonnes attendues, 0 manquante, 0 type inattendu) — pas de migration en attente.
- **Aucune régression franche.** Les 5 sources en échec sont toutes des causes connues/attendues (clé API absente, throttle, timeouts tiers transitoires).
- **⚠️ Tâche (f) non réalisable ce run** : la section `panneaupocket_vitality` est revenue **vide** à cause d'un bug de la requête du script (voir section dédiée). La vitalité des cartes curées n'a **pas** pu être évaluée. Un brouillon de correctif est proposé.
- **1 point calendaire ≤ 60 j** : `grandes-marees` se tarit après le 27 oct. 2026 (renouvellement à prévoir).
- **1 slug orphelin** : `communaute` (cartes chat/chien-perdu) absent de la taxonomie `server/categories.js`.

Périmètre : 267 sources enabled, 36 combinaisons paramétrées.

---

## Cohérence schéma

RAS — `schema_check.ok = true`. Aucune colonne manquante ni type inattendu. Pas de bandeau migration.

## Sources en échec (`failing_sources`)

Toutes explicables, aucune régression de code :

| Source | Échecs 7 j | Dernier message | Analyse |
|---|---|---|---|
| `sncf-perturbations` | 129 | `SNCF_API_KEY absente de l'environnement` | **Cause connue** : la source attend sa clé API (var Railway non posée, déjà consignée dans l'état-projet). Normal, pas une panne. |
| `lancement-spatial` | 51 | `Timeout API Launch Library (>10000 ms)` | API tierce (Launch Library) lente/instable. Timeouts transitoires, échec → inactive proprement (jamais de faux positif). À surveiller si ça persiste, sans urgence. |
| `ecowatt` | 11 | `HTTP 429 (appel trop fréquent), prochain cycle` | Auto-throttle géré : la source réessaie au cycle suivant. Source hivernale, hors saison (cf. « jamais actives »). Bas niveau. |
| `statut-gandi` | 2 | `Timeout (status.gandi.net, >10000 ms)` | Transitoire (dernier échec 04/09). Sous le seuil de bruit. |
| `statut-shopify` | 2 | `HTTP 406 Not Acceptable (shopifystatus.com)` | Possible durcissement d'en-têtes côté Shopify. 2 échecs seulement → à re-regarder au prochain run si ça monte, pas d'action maintenant. |

## États figés (`stale_states`) — signal secondaire

Rien de suspect. La grande majorité sont des sources/combinaisons **inactives** avec `checked_at` ancien : c'est le **bruit attendu** décrit par le `caveat` (le `checked_at` n'est réécrit que sur écriture, pas en still-inactive). Aucune n'est corroborée par `failing_sources`.

Les quelques états `active` figés (`vigilance-meteo` dépts 13/16/24/31/33/35/38/44/67/74/75/83, `risque-secheresse` 06/14/16/53, `rappel-conso` alimentation & bébés-enfants, `iss-passages` gap) correspondent tous à des **combos orphelins** (plus aucun abonné — cf. section combos orphelins) : ce sont des reliquats, pas des alertes réellement figées côté utilisateur. Aucune alarme.

## Jamais actives 90 j (`never_active_90d`)

RAS. La liste est massivement composée de sources **saisonnières/événementielles** hors saison (soldes, black-friday, beaujolais, géminides, perséides, cérémonies, fêtes…), de **cartes statut** de services qui n'ont simplement pas eu d'incident, et de sources récentes. `ecowatt`/`ecogaz`/`tempo` (énergie hivernale) muettes en septembre = normal. Rien d'anormal (aucune source censée s'activer souvent et restée muette).

## Collisions d'ordre d'affichage (`display_order_collisions`)

Cosmétique, sans urgence — 11 collisions, toutes entre une source événementielle et une carte statut cloud (rangées 40, 42, 43, 50, 51, 52, 53, 54, 55, 56, 59). Ex. `40 = doomname + statut-github`, `51 = black-friday + soldes + statut-zoom`, `56 = eclipse-solaire + geminides + nuits-des-etoiles`. Un ré-échelonnement des `display_order` des cartes statut est possible si l'ordre visuel gêne, mais rien de bloquant.

## TODO calendaires ≤ 60 jours (fenêtre 09/09 → 08/11/2026)

**À renouveler dans la fenêtre :**

- **`grandes-marees`** — la dernière période codée est le **27 oct. 2026** ; le fichier indique lui-même « *Sans mise à jour, la source reste dormante après octobre 2026* ». **Renouvellement à faire avant fin octobre** : transcrire les périodes coeff ≥ 100 de 2027 (TODO déjà en tête de fichier).

**Config vide / échéance déjà passée (bas niveau, pré-existant) :**

- **`courses-mythiques`** — config vide, TODO « septembre 2026 » déjà échu ; source dormante tant que les dates 2027 ne sont pas transcrites. Non bloquant (déjà connu dans l'état-projet).
- **`ouverture-ventes-sncf`** — config vide ; prochaine ouverture (fêtes/hiver 2026-2027) non encore annoncée officiellement → rien à coder pour l'instant.

**Événements datés DANS la fenêtre mais déjà correctement configurés** (aucune action, la source se déclenchera) : `nobel-prix` (5-13 oct), `grands-prix-gastronomie` (50 Best 4 nov), `grands-salons` (Mondial Auto 12-18 oct, SIAL 17-21 oct, MIF Expo 12-15 nov), `gastronomie-terroir` (Sommet Élevage 6-9 oct, Salon du Chocolat 28 oct-1 nov), `patrimoine-nature` (Jour de la Nuit 10 oct, Salon Patrimoine 29 oct-1 nov), `grands-rendez-vous-sportifs` (Arc de Triomphe 4 oct, Route du Rhum 1 nov), `entrepreneuriat-seniors` (GO Lyon 24 sept, BIG Bpifrance 8 oct), `fetes-laiques` (Halloween 31 oct), `echeances-fiscales` (taxe foncière octobre).

**Annexe (au-delà de 60 j, TODO déjà consignés en tête de fichier, aucune alerte)** : `bison-fute` (JOURS_2026 → TODO calendrier 2027, se tarit au 31/12), `echeances-fiscales`/`cfe-entreprises` (échéances 2027), `parcoursup`/`crous-dse`/`bourses-scolaires` (sessions/campagnes 2027), `carnavals`/`ceremonies`/`nuits-de-la-lecture`/`rdv-gaming`/`japan-expo`/`nobel-prix`/`prime-noel`/`cheque-energie`/`grandes-causes` et autres récurrences annuelles.

## Slugs orphelins (tâche c)

Croisement `category_slugs` (145 slugs utilisés en base) vs taxonomie fermée de **`server/categories.js`** (337 slugs définis).

- **1 orphelin : `communaute`** — utilisé en base (cartes `chat-perdu` / `chien-perdu`, groupe Communauté) mais **absent de la taxonomie** `GROUPS` de `server/categories.js`. Conséquence : là où le libellé lisible est dérivé de la taxonomie, ce tag risque de s'afficher en slug brut / sans libellé propre. À corriger en ajoutant `communaute` (ou `communaute` → label « Communauté ») à un groupe de `categories.js`.

*(L'inverse — slugs définis mais non utilisés — est normal et non signalé.)*

## Vitalité PanneauPocket curée (tâche f) — ⚠️ NON MESURABLE CE RUN

La section `panneaupocket_vitality` du JSON est **vide (`[]`)**, alors que la requête vise toutes les sources enabled non-linked (~250). Ce n'est pas « tout va bien » : la requête a **échoué et a été avalée** par son `try/catch`.

**Cause identifiée** (lecture du script) : `Q_PP_VITALITY` calcule `jsonb_array_length(ss.ref)` avec un `CASE` qui ne garde que le cas `ref IS NULL`. Or au moins une source enabled stocke `ref` sous forme d'**objet JSON** et non de tableau (ex. `ondes-gravitationnelles` : `{seenConfirmed, alerted, corrected}` — forme documentée dans l'état-projet). `jsonb_array_length` lève alors *« cannot get array length of a non-array »*, ce qui fait **échouer toute la requête** → `[]`.

**Conséquence** : impossible ce run d'évaluer le `last_activated_at` des 18 cartes curées (vague L) + `arrosage-canal-gap`. Le jeu curé reste identifiable en lecture (fichiers `server/sources/*.js` qui `require ./lib/panneaupocket-veille` via `makeCurated`) :

> `eau-regie-metz`, `eau-provence-verte`, `eau-isle-dronne`, `eau-charles-chaigneau`, `eau-puisaye-forterre`, `eau-coteaux-lizon`, `dechets-saulieu`, `dechets-la-saucelle`, `dechets-campagne-caux`, `securite-gendarmerie-albi`, `securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts`, `local-chablis`, `local-agly-fenouilledes`, `local-buech-devoluy`, `local-chabris-bazelle`, `agenda-luc-en-diois`, `cantine-a2m2v`, plus `arrosage-canal-gap` (broadcast, 1re du genre).

Ces cartes dépendent d'un tiers qui peut cesser de publier — leur vitalité **doit** être revérifiée (la famille gendarmerie est massivement dormante). **Correctif du script requis avant de pouvoir statuer** (brouillon ci-dessous). Rappel de méthode : même corrigée, la mesure repose sur `last_activated_at`, un proxy qui **sous-estime** la vitalité (panneaux hors filtre thématique ou cosmétiques ne produisent aucun événement) ; toute « candidate à désactivation » resterait une **décision humaine** à confirmer via l'appli PanneauPocket. Jamais de désactivation automatique.

## Combos orphelins & ids `?panneau=` (tâche g)

- **Combos orphelins** (`orphan_param_states`) : **26** lignes `source_param_states` dont plus aucun abonnement ne porte le couple `(source_id, params)` — reliquat de désabonnements. Échantillon : `vigilance-meteo` (dépts 10/13/16/24/31/33/35/38/44/67/69/74/75/83), `risque-secheresse` (06/14/16/53), `rappel-conso` (alimentation, bébés-enfants), `iss-passages` (gap), `ma-collectivite` (5 URLs 05). Purge = **décision humaine**, aucun `DELETE` par le robot.
- **Stabilité des ids `?panneau=`** (point de vigilance ouvert, consigné en tête de `server/sources/ma-collectivite.js`) : si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme « nouveau ». Non mesurable sans fetch réseau (interdit la nuit) — signalé, sans alarme.

---

## BROUILLON — à valider par Hugo avant toute exécution

*Ce brouillon décrit un correctif possible. Il n'est PAS validé et n'a PAS été appliqué par le robot (lecture seule).*

**Objet** : rendre la requête `Q_PP_VITALITY` de `scripts/veille-readonly.js` robuste aux `ref` non-tableau, pour que la tâche (f) redevienne mesurable.

Dans `scripts/veille-readonly.js`, remplacer la garde du `CASE` :

```sql
-- avant :
CASE WHEN ss.ref IS NULL THEN NULL
     ELSE jsonb_array_length(ss.ref) END AS ref_panneau_count

-- après (ne compte que si ref est réellement un tableau JSON) :
CASE WHEN jsonb_typeof(ss.ref) = 'array' THEN jsonb_array_length(ss.ref)
     ELSE NULL END AS ref_panneau_count
```

Ainsi les sources dont `ref` est un objet (ex. `ondes-gravitationnelles`) renvoient `NULL` pour ce champ au lieu de faire planter toute la requête, et la vitalité des cartes curées redevient calculable. `scripts/veille-readonly.js` reste un script de lecture seule (SELECT uniquement). À relancer ensuite pour produire une vraie évaluation de la tâche (f).
