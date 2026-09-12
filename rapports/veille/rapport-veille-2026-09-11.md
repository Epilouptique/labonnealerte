# Rapport de veille — 2026-09-11

**Robot 1 — Veilleur de maintenance (lecture seule).** Généré à partir de
`node scripts/veille-readonly.js` (`generated_at` : 2026-09-11T02:00:15Z).
Cadre : 267 sources *enabled*, 36 combinaisons paramétrées souscrites.

---

## Résumé

1. **Schéma DB cohérent** (`schema_check.ok = true`, 58 colonnes attendues, 0 manquante, 0 type inattendu) — pas de migration à prévoir.
2. **`lancement-spatial`** : 48 échecs sur 7 j, tous « Timeout API Launch Library (>10000 ms) » — API tierce lente/instable, à surveiller (signal bas).
3. **3 cartes PanneauPocket curées sans aucune alerte** (proxy `last_activated_at` nul) → candidates à décision humaine : `dechets-campagne-caux`, `dechets-la-saucelle`, `securite-gendarmerie-bayeux`.
4. **`grandes-marees`** : config datée épuisée après le 27 octobre 2026 → renouvellement (périodes coeff ≥ 100 pour 2027) requis dans la fenêtre 60 j.
5. **1 slug orphelin** en base absent de la taxonomie : `communaute` (affiché en libellé brut). Divers points cosmétiques (collisions `display_order`, 26 combos orphelins) sans urgence.

Le reste (`stale_states`, `never_active_90d`) est du bruit attendu, conforme au caveat du script.

---

## Cohérence schéma

`schema_check.ok = true` — RAS. Aucune colonne manquante, aucun `type_mismatch`.
Les colonnes `ref` JSONB (persistance anti-rétroactive) et le noyau typé
(`subscriptions.params`/`muted`, `sources.params_schema`, `source_*_states.ref`)
sont bien présents. **Aucune migration à lancer.**

## Sources en échec (`failing_sources`)

| Source | Échecs 7 j | Dernier message | Lecture |
|---|---|---|---|
| `sncf-perturbations` | 130 | `SNCF_API_KEY absente de l'environnement` | **Cause connue / attendue.** La source attend la clé SNCF (documenté dans l'état projet). Pas une régression. |
| `lancement-spatial` | 48 | `Timeout API Launch Library (>10000 ms)` | **À surveiller (bas).** Échecs récurrents sur une API tierce gratuite (Launch Library). Latence/instabilité côté fournisseur ; pas d'erreur applicative apparente. Si ça persiste, envisager un timeout plus large ou une source de repli. |
| `ecowatt` | 14 | `EcoWatt : appel trop fréquent (HTTP 429)` | **Bas / hors-saison.** Throttling RTE ; EcoWatt est un signal hivernal, muet en cette saison. Le 429 est absorbé (« prochain cycle »). Dernier échec 09/09. À revoir si le 429 persiste à l'entrée de l'hiver. |
| `statut-gandi` | 2 | `Timeout (status.gandi.net, >10000 ms)` | Transitoire (2 occurrences). Bruit. |
| `statut-scaleway` | 2 | `Timeout (status.scaleway.com, >10000 ms)` | Transitoire (2 occurrences). Bruit. |

## États figés (`stale_states`) — signal secondaire

Conformément au `caveat` du script (`checked_at` non rafraîchi en still-inactive),
les entrées `inactive` à `checked_at` ancien sont **NORMALES** et non signalées.

Les seules entrées `active` figées (vigilance-meteo dépts 13/24/31/33/35/38/44/67/74/75/83,
risque-secheresse 06/14/16/53, rappel-conso alimentation/bébés-enfants, iss-passages gap —
toutes figées à juillet) sont **entièrement expliquées** : ce sont des **combos orphelins**
(cf. section dédiée) — plus aucun abonnement ne les porte, donc elles ne sont jamais
re-vérifiées et leur `checked_at` reste figé. Aucune corroboration avec `failing_sources`.
**Pas d'alarme.**

## Jamais actives 90 j (`never_active_90d`) — 166 entrées

Aucune anomalie. La quasi-totalité relève de causes normales :
- **Événementiel saisonnier hors saison** : soldes, black-friday, beaujolais, carnavals, fêtes (laïques/musulmanes/gourmandes/familiales), astro (géminides, aurores, astéroïde), élections, prime-noël, trève-hivernale, semaine-bleue, nobel-prix…
- **Pages de statut cloud** : par nature muettes tant qu'il n'y a pas d'incident (statut-npm, -railway, -figma, -reddit, -zoom, -canva, -dropbox, -datadog, etc.).
- **Sources paramétrées / veille d'état sans abonné** : veille-page/stock/entreprise/boamp/emploi/twitch/legifrance/arxiv, crypto-seuil, pollens, catnat-commune, eau-potable-commune, hausse-tarif-operateur… (rien à calculer sans souscription).
- **Sources récemment ajoutées / déclenchées par l'utilisateur** : `chat-perdu`, `chien-perdu`, `tache-echeance-glissante`.

Les 3 cartes curées PanneauPocket sans `last_activated_at` y figurent aussi
(cohérent avec la section « Vitalité PanneauPocket » ci-dessous).

## Collisions d'ordre d'affichage (`display_order_collisions`) — cosmétique

11 collisions, quasi toutes entre une carte événementielle et une page de statut :
`40` (doomname / statut-github), `42` (statut-npm / statut-openai),
`43` (statut-discord / statut-vercel), `50` (changement-heure / statut-twitch),
`51` (black-friday / soldes / statut-zoom), `52` (perseides / statut-canva),
`53` (beaujolais-nouveau / statut-dropbox), `54` (soldes-steam / statut-slack),
`55` (aurores-france / cert-fr-alertes), `56` (eclipse-solaire / geminides / nuits-des-etoiles),
`59` (echeances-fiscales / journees-patrimoine).

Sans urgence. Un ré-échelonnement des `display_order` par tranche libre lèverait
l'ambiguïté d'ordre de tri, mais l'impact est purement cosmétique.

## TODO calendaires (échéances ≤ 60 j, avant le 2026-11-10)

**Renouvellement requis dans la fenêtre :**
- **`grandes-marees`** — dernière période configurée : 27 octobre 2026 ; commentaire en tête : « Sans mise à jour, la source reste dormante après octobre 2026 ». Transcrire les périodes coeff ≥ 100 de 2027 (maree.info / SHOM) **avant fin octobre** pour éviter une dormance.

**Échéances événementielles ≤ 60 j — configurations DÉJÀ présentes (aucune action) :**
- `fete-science` : 2–12 oct 2026 (config 2026 vérifiée présente).
- `nobel-prix` : 5–12 oct 2026 (présent).
- `rdv-tech` : Ubuntu 26.10 le 15 oct 2026 (présent).
- `bourses-scolaires` : date limite 15 oct 2026 (campagne 2026-2027 présente).
- `gastronomie-terroir` : Sommet de l'Élevage 6–9 oct, Salon du Chocolat 28 oct–1 nov 2026 (présents).
- `cfe-entreprises` : échéance 15 déc 2026 (≈ 95 j, hors fenêtre ; config présente).

**Annexe — renouvellements au-delà de 60 j** (pour mémoire, aucune urgence) :
la très grande majorité des sources datées portent un « TODO 2027 » / « TODO début 2027 »
/ « TODO 2028 » : bison-fute, echeances-fiscales, elections-france (présidentielle 2027,
en attente du décret de convocation), festival-livre-paris, fashion-week, fete-des-lumieres,
carnavals, ceremonies, festivals-musique, grandes-causes, fetes-* (mobiles), crous-dse,
parcoursup, fiscalite-quebec, education-quebec, etc. À traiter en début 2027, hors périmètre 60 j.

## Slugs orphelins (`category_slugs` vs `server/categories.js`)

Taxonomie fermée localisée : **`server/categories.js`** (`VALID_SLUGS` dérivé de `GROUPS`).

- **1 orphelin** : `communaute` — présent en base (utilisé par au moins une source),
  **absent de la taxonomie**. Conséquence : la carte affichera un libellé dérivé
  du slug brut (« Communaute », sans accent, sans groupe de filtrage). À corriger
  soit en ajoutant `communaute` (label « Communauté ») à un groupe de `categories.js`
  (ex. `vie-locale` ou `autre`), soit en réaffectant la source à un slug existant
  (`communaute` ressemble à `solidarite`/`social`/`vie-locale`).

L'inverse (slugs définis mais non utilisés) est normal et n'est pas signalé.

## Vitalité PanneauPocket curée (Vague L)

Jeu curé identifié dynamiquement (fichiers `server/sources/*.js` appelant
`makeCurated`/`createBroadcastSource` sur `lib/panneaupocket-veille`, hors
`panneaupocket`/`ma-collectivite` paramétrées) = **19 cartes broadcast**.

⚠️ **Limite de méthode (rappel)** : la base ne stocke aucune date de publication de
panneau (`ref` = couples `[panneauId, hash]`). Le seul proxy est `last_activated_at`
(dernier panneau *alertable*), qui **sous-estime** la vitalité (panneaux hors filtre
thématique ou cosmétiques ne comptent pas). Aucune interrogation PanneauPocket faite
(interdit la nuit).

**Candidates à désactivation — décision humaine (jamais automatique) :**

| Carte | `last_activated_at` | Panneaux suivis (`ref`) | Lecture |
|---|---|---|---|
| `dechets-campagne-caux` | *aucun* | 1 | Jamais d'événement alertable. `ref` = 1 panneau suivi → la carte lit bien la page, mais rien de thématique n'a jamais déclenché. À confirmer via l'appli PanneauPocket. |
| `dechets-la-saucelle` | *aucun* | 7 | 7 panneaux suivis, jamais d'alerte. Idem : proxy sous-estimant, mais absence totale d'alerte sur une famille (déchets) qui devrait bouger → à vérifier. |
| `securite-gendarmerie-bayeux` | *aucun* | 3 | Famille gendarmerie massivement dormante (~85 % — cf. état projet). 3 panneaux suivis, aucune alerte. À re-vérifier en priorité. |

**Autres cartes curées : vitalité OK** (dernier panneau alertable récent) —
`arrosage-canal-gap` (0 j), `eau-coteaux-lizon`/`eau-charles-chaigneau`/`eau-provence-verte`/
`local-chabris-bazelle`/`cantine-a2m2v` (0–1 j), `local-chablis`/`local-agly-fenouilledes`/
`eau-puisaye-forterre`/`eau-regie-metz`/`eau-isle-dronne`/`local-buech-devoluy`/`agenda-luc-en-diois` (2–8 j),
`dechets-saulieu` (16 j), `securite-gendarmerie-albi` (24 j), `securite-gendarmerie-essarts` (4 j).

**Proposition d'amélioration (non implémentée)** : le proxy `last_activated_at`
étant structurellement sous-estimant, persister dans `ref` la **date du dernier
panneau vu** (nouveau OU modifié, indépendamment du filtre thématique) donnerait
une vraie mesure de vitalité sans requête réseau supplémentaire au moment de la
veille. À arbitrer par Hugo.

## Combos orphelins & stabilité des ids `?panneau=`

- **Combos orphelins (`orphan_param_states`)** : **26** lignes `source_param_states`
  dont plus aucun abonnement ne porte le couple `(source_id, params)` — reliquats de
  désabonnements. Échantillon : combos `vigilance-meteo` (dépts 10/13/16/24/31/33/35/38/44/67/69/74/75/83),
  `risque-secheresse` (06/14/16/53), `rappel-conso` (alimentation, bébés-enfants),
  `iss-passages` (gap), `ma-collectivite` (5 URLs 05xxx). Ce sont ces mêmes lignes qui
  apparaissent « active figée » en juillet dans `stale_states` (elles ne sont plus
  re-vérifiées). **Purge = décision humaine ; aucun `DELETE` effectué.**

- **Stabilité des ids `?panneau=`** (point de vigilance ouvert, consigné en tête de
  `server/sources/ma-collectivite.js`) : si PanneauPocket régénère les ids de panneau
  à l'édition, une simple modification apparaîtrait comme un panneau « nouveau ».
  Non mesurable sans fetch réseau (interdit) → **point de vigilance ouvert**, sans alarme.

---

*Rapport en lecture seule. Aucune écriture hors ce fichier, aucune requête SQL directe,
aucun `runCycle()`, aucune migration, aucun appel réseau vers les sources.*
