# Rapport de veille — 2026-09-07 (Robot 1, lecture seule)

## Résumé (points saillants, par importance)

1. **Schéma cohérent** (`schema_check.ok = true`, 58 colonnes attendues, 0 manquante) → pas de migration à prévoir.
2. **Sources en échec : rien d'anormal, sauf 2 à surveiller au niveau bas** — `lancement-spatial` (50 échecs, timeouts répétés Launch Library) et `statut-shopify` (406 récurrent). Le reste = causes attendues (`SNCF_API_KEY` absente) ou timeouts transitoires d'API tierces.
3. **1 slug orphelin : `communaute`** (sources `chat-perdu` / `chien-perdu`) — absent de la taxonomie `server/categories.js` → tag non résolu en libellé.
4. **Vitalité PanneauPocket curée : contrôle non concluant** ce run — la section `panneaupocket_vitality` du JSON est **vide**. Aucune carte flaggée, mais l'absence de données mérite vérification (cf. section dédiée).
5. **Bruit attendu** : 26 combos orphelins, 11 collisions d'ordre d'affichage (cosmétique), nombreux `checked_at` anciens sur états inactifs/orphelins — tous **normaux**.

Métriques : 267 sources enabled, 36 combinaisons paramétrées souscrites.

---

## Cohérence schéma
`schema_check.ok = true` — 58 colonnes attendues, aucune manquante, aucun type inattendu. RAS.

## Sources en échec (`failing_sources`)
| Source | Échecs (7 j) | Dernier message | Lecture |
|---|---|---|---|
| `sncf-perturbations` | 130 | `SNCF_API_KEY absente` | **Attendu** — clé jamais posée, source dormante en attente d'abonnement RTE/SNCF. Aucune action. |
| `lancement-spatial` | 50 | `Timeout API Launch Library (>10 s)` | **À surveiller (bas)** — volume élevé et récurrent (dernier 06/09). API tierce lente/instable. Si ça persiste, envisager un timeout plus long ou un repli. |
| `ecowatt` | 6 | `Timeout auth RTE (>10 s)` | Attendu/transitoire — auth RTE intermittente ; source par ailleurs hors saison (pas de tension réseau l'été). |
| `statut-gandi` | 4 | `Timeout status.gandi.net` | Transitoire. |
| `statut-scaleway` | 3 | `Timeout` | Transitoire. |
| `statut-shopify` | 2 | `406 Not Acceptable` | **À surveiller (bas)** — un 406 n'est pas un timeout : possible durcissement d'en-tête/UA côté Shopify. À revoir si ça se répète. |
| `aurores-france`, `statut-proton`, `statut-twitch` | 2 | Timeouts | Transitoires. |

## États figés (`stale_states`) — signal SECONDAIRE
Conformément au `caveat` : `checked_at` n'est rafraîchi qu'à l'écriture ; un `checked_at` ancien sur une source/combinaison **inactive** est **normal**. Rien à signaler côté inactifs.

Les entrées `active` figées (juillet) — `vigilance-meteo` dépts 13/16/24/31/33/35/38/44/67/74/75/83, `risque-secheresse` 06/14/16/53, `rappel-conso` alimentation/bébés-enfants, `iss-passages` gap — sont **entièrement expliquées par `orphan_param_states`** : ces combinaisons n'ont plus d'abonné, donc le poller ne les recalcule pas (pas d'écriture → `checked_at` gelé). Bruit attendu, aucune corroboration avec `failing_sources`.

## Jamais actives 90 j (`never_active_90d`)
Liste longue mais **sans anomalie** : quasi exclusivement des sources saisonnières hors saison (soldes, Beaujolais, Géminides, Black Friday, prix Nobel, fêtes, échéances fiscales…), des statuts cloud silencieux (pas de panne = normal), et des sources récemment ajoutées. À noter sans alarme :
- `doomname` (externe, projet frère) et `ecowatt`/`ecogaz`/`tempo` (énergie, pas de tension réseau l'été) : silence normal.
- `gog-jeu-offert` : jamais activée depuis le 14/07 — à garder à l'œil si un jeu gratuit GOG passe inaperçu, mais rien de probant.

Aucune source « censée s'activer souvent et muette » identifiée.

## Collisions d'ordre d'affichage (`display_order_collisions`)
11 collisions (orders 40, 42, 43, 50, 51, 52, 53, 54, 55, 56, 59), typiquement un statut cloud face à un événement saisonnier (ex. 51 : `black-friday` / `soldes` / `statut-zoom`). **Purement cosmétique.** Un ré-échelonnement des `display_order` est possible mais sans urgence.

## TODO calendaires ≤ 60 jours (fenêtre 2026-09-07 → 2026-11-06)
La plupart des sources datées portent bien leurs **dates 2026**, qui se déclencheront correctement dans la fenêtre (fête de la science 2-12 oct, semaine bleue 5-11 oct, prix littéraires fin oct-début nov, Nobel 5-12 oct, bourses scolaires échéance 15 oct, fashion week 28 sept-6 oct, grandes marées 27 oct, etc.) — **c'est nominal, pas un problème**. Les renouvellements (ajout des dates 2027) sont marqués « début 2027 » dans les fichiers = **au-delà de 60 jours**.

**Seul point de vigilance réel :**
- **`server/sources/bison-fute.js`** — le tableau `JOURS_2026` est **épuisé** (dernière journée classée : 28/08/2026). La source est donc de fait muette jusqu'au chargement du calendrier 2027 (TODO « début 2027 »). Pas d'échéance dans les 60 j, mais à ne pas oublier avant les migrations hivernales / prochain pic de trafic.

Annexe (au-delà de 60 j, pour mémoire) : `cheque-energie` (31/12), `prime-noel` (16/12), `fete-des-lumieres` (5-8/12), `grandes-causes`/Téléthon (4-5/12), `geminides` (13-14/12), `fetes-juives`/Hanoucca (5-12/12), cérémonies & carnavals 2027. Tous avec TODO de renouvellement déjà présents.

## Slugs orphelins (`category_slugs` vs `server/categories.js`)
Croisement des 145 slugs utilisés en base avec la taxonomie fermée (`VALID_SLUGS`) :

- **`communaute` → ORPHELIN.** Utilisé par `chat-perdu` (order 500) et `chien-perdu` (order 501) (`init.sql:4692`/`4716`, `ARRAY['communaute']`), mais **absent de `categories.js`**. Conséquence : le tag ne matche aucune catégorie/filtre du kiosque et n'a pas de libellé dédié (rendu approximatif « Communaute », sans accent). À corriger côté Hugo : soit ajouter `communaute` à la taxonomie (probablement dans le groupe `vie-locale` ou `solidarite`), soit re-taguer ces 2 sources sur un slug existant (ex. `local` / `solidarite`).

Tous les autres slugs en base sont définis dans la taxonomie. (Les slugs définis mais non utilisés sont normaux et non listés.)

## Vitalité PanneauPocket curée (Vague L)
Jeu curé identifié dynamiquement (18 cartes `makeCurated` + `arrosage-canal-gap`, moteur `lib/panneaupocket-veille.js`) :
`eau-regie-metz`, `eau-provence-verte`, `eau-isle-dronne`, `eau-charles-chaigneau`, `eau-puisaye-forterre`, `eau-coteaux-lizon`, `dechets-saulieu`, `dechets-la-saucelle`, `dechets-campagne-caux`, `securite-gendarmerie-albi`, `securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts`, `local-chablis`, `local-agly-fenouilledes`, `local-buech-devoluy`, `local-chabris-bazelle`, `agenda-luc-en-diois`, `cantine-a2m2v`, `arrosage-canal-gap`.

⚠️ **Limite de méthode (à énoncer telle quelle)** : la base ne stocke aucune date de publication de panneau (`ref` = couples `[panneauId, hash]`) ; la « date du panneau le plus récent » n'est pas dérivable sans requêter PanneauPocket (interdit la nuit). Le seul proxy en base est `last_activated_at`, qui **sous-estime** la vitalité.

**Ce run : contrôle NON concluant.** La section `panneaupocket_vitality` du JSON est renvoyée **vide (`[]`)**. Aucune carte curée ne peut donc être évaluée ni flaggée « candidate à désactivation » ce soir. Ce n'est pas un feu vert : c'est une **absence de mesure**. Deux hypothèses à départager par Hugo (hors périmètre nuit) :
1. le script `veille-readonly.js` n'émet pas (ou filtre à zéro) le proxy `last_activated_at` pour ces sources ;
2. requête de vitalité non peuplée en base.

Recommandation (déjà consignée dans l'état projet) : persister la date du dernier panneau dans `ref` donnerait un vrai proxy de vitalité, plus fiable que `last_activated_at`. **Aucune modification de `enabled` par Robot 1**, jamais.

## Combos orphelins & stabilité des ids `?panneau=`
- **Combos orphelins (`orphan_param_states`) : 26.** Lignes `source_param_states` sans abonnement correspondant (reliquat de désabonnements : `vigilance-meteo` sur ~12 dépts, `ma-collectivite` sur 5 URLs 05, `risque-secheresse` 4 dépts, `rappel-conso` 2 catégories, `iss-passages` gap, `qualite-air` 05, `github-release` vercel/next.js, `hausse-tarif-streaming` netflix). Purge = **décision humaine** ; aucun `DELETE` par Robot 1. Sans conséquence fonctionnelle (ces lignes ne notifient personne).
- **Stabilité des ids `?panneau=`** (point de vigilance ouvert, non mesurable sans fetch réseau interdit) : si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme « nouveau ». Non mesurable la nuit — signalé comme vigilance, sans alarme.

---

## BROUILLON — à valider par Hugo avant toute exécution

> **Non validé, non exécuté par Robot 1.** Correctif proposé pour le slug orphelin `communaute` (tâche c). Deux options mutuellement exclusives :
>
> **Option A — ajouter le slug à la taxonomie** (`server/categories.js`, groupe `vie-locale` ou `solidarite`) :
> ```js
> // dans GROUPS['vie-locale'] (ou 'solidarite'), ajouter 'communaute'
> // + éventuel libellé dans SPECIAL : 'communaute': 'Communauté'
> ```
>
> **Option B — re-taguer les 2 sources** sur un slug existant (`init.sql`, lignes ~4692 et ~4716) :
> ```sql
> -- remplacer ARRAY['communaute'] par un slug défini, ex. ARRAY['local'] ou ARRAY['solidarite']
> ```
>
> À trancher selon l'intention produit (garder une catégorie « communauté » dédiée = Option A ; rattacher à l'existant = Option B). Migration `init.sql` requise dans les deux cas si la base doit être ré-alignée.
