# Rapport de veille — 2026-07-25 (Robot 1, lecture seule)

*Run basé sur `node scripts/veille-readonly.js` (JSON généré à 02:00 UTC). 263 sources enabled, 31 combinaisons paramétrées. Schéma DB cohérent.*

## Résumé (proche du RAS)

1. **Aucune régression franche.** Toutes les `failing_sources` s'expliquent par des causes connues/attendues (clé API absente, anti-bot, throttling saisonnier, timeouts d'API tierces).
2. Seul point à garder à l'œil (niveau bas) : **`risque-secheresse` en 404 VigiEau récurrent et récent** (dernier échec 25/07 01:01), avec des combinaisons actives — possible souci d'endpoint, à confirmer par un humain.
3. **Vitalité PanneauPocket non évaluable ce run** : la section `panneaupocket_vitality` est **vide**, alors que les 19 cartes curées existent et sont enabled → angle mort de couverture à investiguer (voir section dédiée).
4. Reliquat attendu : **ligne orpheline `veille-artiste-spotify` toujours présente en base** (purge manuelle non faite), + **21 combos orphelins** (source_param_states sans abonnement) — décisions humaines, aucune action de ma part.
5. Schéma DB **cohérent** (`schema_check.ok = true`, 39 colonnes attendues, 0 manquante). Aucun bandeau migration.

---

## Cohérence schéma

`schema_check.ok = true` — 39 colonnes attendues, aucune manquante, aucun type inattendu. RAS. Pas de migration à signaler.

## Sources en échec (`failing_sources`)

Toutes rattachées à une cause connue ; aucune alerte haute.

| Source | Échecs 7j | Cause | Lecture |
|---|---|---|---|
| sncf-perturbations | 133 | `SNCF_API_KEY absente` | **Attendu** — clé non encore souscrite (liste de courses). Normal. |
| leboncoin-livraison | 132 | Blocage anti-bot (DataDome) | **Attendu** — scraper bloqué par vagues, documenté. Normal. |
| lancement-spatial | 53 | Timeout Launch Library (>10 s) | API tierce communautaire lente. Récurrent mais se rétablit. Signal bas. |
| ecowatt | 28 | HTTP 429 « appel trop fréquent » | **Attendu** — hors tension réseau (été), throttling, rejoué au cycle suivant. Normal. |
| vigicrues-departement | 16 | Timeout Vigicrues | Dernier échec **23/07** (2 j) — transitoire, pas de récidive récente. Pas d'alarme. |
| **risque-secheresse** | 12 | **404 VigiEau**, dernier **25/07 01:01** | **À surveiller (bas)** — récurrent ET récent, alors que 4 combos sont actifs (06/14/16/53). Possible évolution d'endpoint VigiEau/RegLeau. À confirmer par un humain. |
| indice-reference-loyers / ipc-alimentaire / prix-logements-anciens / inflation-insee / chomage-stats | 4–6 chacun | Timeout / HTTP 500 INSEE BDM | Instabilité transitoire de l'API INSEE BDM (publications définitives rejouées). Groupé, bas. |
| asteroide-frole-terre | 2 | Timeout JPL | Transitoire, mineur. |

## États figés (`stale_states`) — signal secondaire

Rien de suspect. Conformément au `caveat` du script, les `checked_at` anciens portent quasi exclusivement sur des **sources/combinaisons inactives** (write:false en still-inactive tant que l'étape B n'est pas déployée) = **bruit attendu**. Les entrées `active` figées (vigilance-meteo dépts, risque-secheresse, rappel-conso, iss-passages/gap) correspondent à des états stables non réécrits, non corroborés par un échec (hors risque-secheresse déjà traité ci-dessus). Aucune alarme.

## Jamais actives 90 j (`never_active_90d`)

RAS. La liste est composée d'événements **saisonniers hors saison** (Beaujolais, Black Friday, Perséides, Géminides, éclipse, soldes, fêtes religieuses…), de **pages de statut** qui ne s'allument que sur incident (Cloudflare, GitHub, npm, Railway…), et de **sources récemment ajoutées** (vagues de juillet). Rien d'anormal — pas de source « censée s'activer souvent et muette ».

## Collisions d'ordre d'affichage (`display_order_collisions`) — cosmétique

12 collisions, sans urgence (surtout dans la plage historique 40–59, socle statuts/événements) :
40, 42, 43, 50, 51 (×3), 52, 53, 54, 55, 56 (×3), 59, et **432** (`veille-artiste-spotify` + `veille-legifrance`).
Ré-échelonnement possible au fil de l'eau. **Note** : la collision 432 implique la ligne orpheline `veille-artiste-spotify` (cf. plus bas).

## TODO calendaires ≤ 60 jours (échéance ≤ ~2026-09-23)

- **`courses-mythiques.js` — septembre 2026** : config actuellement **vide**, TODO explicite « transcrire les dates officielles » daté de septembre 2026 → **tombe dans la fenêtre**. Renouvellement requis : transcrire les dates officielles (règle anti-hallucination : source consultée obligatoire, jamais de mémoire). **Seul item réellement dans les 60 jours.**

Annexe (au-delà de 60 j, pas d'alerte) :
- `tour-de-france-passage` + création `tdf-villes-etapes` — **octobre 2026** (annonce parcours 2027), transcription letour.fr/ASO obligatoire (~à 70+ j).
- `echeances-fiscales.js` — Taxe foncière papier 2026-10-15 / en ligne 2026-10-20 (fenêtre d'annonce J-7 ≈ 8 oct, > 60 j). Déjà codée pour 2026.
- `bison-fute.js` — `JOURS_2026` s'épuise au **2026-08-28** (dernière entrée) ; les journées classées d'automne (Toussaint) ne sont pas couvertes, TODO « début 2027 ». Hors fenêtre, mais à garder en tête.
- Nombreux `TODO 2027/2028` (fêtes mobiles, festivals, salons, CFE, bourses/CROUS…) : tous au-delà de 60 j.

## Slugs orphelins

RAS. Les 145 slugs réellement utilisés en base (`category_slugs`) sont **tous présents** dans la taxonomie fermée `server/categories.js` (GROUPS). Aucun slug ne s'affichera en brut. (L'inverse — slugs définis non utilisés — est normal, non signalé.)

## Vitalité PanneauPocket curée (Vague L) — ⚠️ non évaluable ce run

**Jeu curé identifié dynamiquement** (fichiers `server/sources/*.js` requérant `./lib/panneaupocket-veille` en mode broadcast — `makeCurated`/`createBroadcastSource`, hors `panneaupocket` et `ma-collectivite` paramétrés) : **19 cartes** —
- `makeCurated` (18) : eau-regie-metz, eau-provence-verte, eau-isle-dronne, eau-charles-chaigneau, eau-puisaye-forterre, eau-coteaux-lizon, dechets-saulieu, dechets-la-saucelle, dechets-campagne-caux, securite-gendarmerie-albi, securite-gendarmerie-bayeux, securite-gendarmerie-essarts, local-chablis, local-agly-fenouilledes, local-buech-devoluy, local-chabris-bazelle, agenda-luc-en-diois, cantine-a2m2v ;
- `createBroadcastSource` (1) : arrosage-canal-gap.

**Limite de méthode (à énoncer telle quelle)** : la base ne stocke aucune date de publication de panneau (colonne `ref` = couples `[panneauId, hash]` seulement). La « date du panneau le plus récent » n'est pas dérivable sans requêter PanneauPocket (interdit la nuit). Le seul proxy en base est `last_activated_at`, qui **sous-estime** la vitalité (panneaux hors filtre thématique ou cosmétiques → aucun événement alertable).

**Problème ce run** : la section `panneaupocket_vitality` du JSON est **vide (`[]`)** alors qu'elle est censée être émise « pour toutes les sources enabled non-linked ». **Aucune des 19 cartes curées n'a donc pu être évaluée.** Ce n'est pas une preuve de bonne santé — c'est un angle mort. Ces cartes ont été ajoutées les 21-24/07 ; il est probable qu'elles n'aient pas encore de ligne `source_states` peuplée, ou que la requête de vitalité les filtre involontairement. **À investiguer côté script** (proposé : un `LEFT JOIN` pour émettre aussi les cartes sans état, afin de repérer précisément celles à `last_activated_at` NULL). Rappel prospection : la famille gendarmerie est massivement dormante (~85 %), donc les 3 cartes `securite-gendarmerie-*` sont à re-vérifier en priorité dès que le proxy fonctionnera. **Aucune désactivation, aucune modification de `enabled`** de ma part.

## Combos orphelins & stabilité des ids `?panneau=`

- **Combos orphelins** (`orphan_param_states`) : **21 lignes** `source_param_states` dont plus aucun abonnement ne porte le couple `(source_id, params)` — reliquats de désabonnements. Échantillon : `iss-passages/gap`, `rappel-conso/{alimentation, bébés-enfants}`, `risque-secheresse/{06,14,16,53}`, `vigilance-meteo/{31,33,35,38,44,67,74,75,83,24,13,16,10,69}`. Purge = **décision humaine** (rappel : comparer les params jsonb via `IS NOT DISTINCT FROM`, pas `=`). Aucun `DELETE` de ma part.
- **Ligne orpheline `veille-artiste-spotify`** : toujours présente en base (apparaît dans `stale_states`, `never_active_90d` et la collision d'ordre 432) → la purge manuelle documentée dans l'état projet **n'a pas encore été exécutée**. Reste enabled sans code associé. Signalement seul.
- **Stabilité des ids `?panneau=`** (point de vigilance ouvert, consigné en tête de `ma-collectivite.js`) : si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme « nouveau ». Non mesurable sans fetch réseau (interdit). Reste un point de vigilance, sans alarme.

---

## BROUILLON — à valider par Hugo avant toute exécution

*Non validé, jamais exécuté par Robot 1. Deux pistes optionnelles, faible risque :*

1. **Corriger l'angle mort vitalité PanneauPocket** : dans `scripts/veille-readonly.js`, faire émettre `panneaupocket_vitality` via un `LEFT JOIN sources → source_states` (params IS NULL) pour inclure les cartes broadcast **sans** ligne d'état (`last_activated_at` NULL), afin que les 19 cartes curées soient réellement contrôlables. Objectif : remplacer un `[]` silencieux par des lignes « candidate à désactivation (décision humaine) ».
2. **`risque-secheresse` 404 VigiEau** : vérifier à la main l'endpoint VigiEau/RegLeau appelé (possible changement d'URL/paramètre côté API) — 12 échecs, dont un tout récent, sur une source à combinaisons actives. Aucune action DB ; simple diagnostic réseau côté humain.
