# Rapport de veille — 2026-07-23

_Robot 1 — maintenance, lecture seule. Source : `node scripts/veille-readonly.js`
(généré 2026-07-23T02:00Z). 234 sources enabled, 23 combinaisons paramétrées._

## Résumé (5 lignes max)

1. **risque-secheresse** : 404 VigiEau récurrent (9 échecs, dernier 23/07 01:31) **+** ses 4 combos actives (06/14/16/53) figées depuis le 19/07 → **seul signal corroboré** (échec + état actif figé). Niveau bas-moyen, à regarder.
2. Autres échecs = **causes connues/attendues** : sncf-perturbations (clé absente), leboncoin-livraison (DataDome) — normaux ; INSEE BDM ×5, Vigicrues, ecowatt (429), lancement-spatial = timeouts/limites d'API tierces, transitoires.
3. **TODO calendaire ≤ 60 j** : `courses-mythiques` (CONFIG VIDE, « TODO septembre 2026 : transcrire les dates »).
4. Collisions d'ordre d'affichage : 12 (cosmétique).
5. Slugs orphelins : **aucun**. Jamais-actives 90 j : toutes saisonnières/récentes → RAS.

---

## Sources en échec (≥ 2 échecs / 7 j)

| Source | Échecs | Dernier message | Lecture |
|---|---|---|---|
| sncf-perturbations | 134 | `SNCF_API_KEY absente` | **Normal** — clé attendue (liste de courses #5). |
| leboncoin-livraison | 133 | Blocage anti-bot (IP datacenter) | **Normal** — DataDome par vagues, scraper documenté. |
| lancement-spatial | 60 | Timeout Launch Library (>10 s) | API tierce lente, persistant. Niveau bas, à surveiller si ça dure. |
| ecowatt | 31 | HTTP 429 « appel trop fréquent » | Rate-limit EcoWatt. Niveau bas — vérifier la cadence si ça persiste. |
| vigicrues-05 | 12 | Timeout Vigicrues (>10 s) | Dernier échec 16/07 (>7 j). Source mono-dépt vraisemblablement supplantée par `vigicrues-departement`. |
| vigicrues-departement | 11 | Timeout Vigicrues (>10 s) | Timeouts tiers transitoires, dernier 23/07. |
| **risque-secheresse** | 9 | **VigiEau : 404** | **À regarder** — 404 (≠ timeout) + combos actives figées depuis 19/07. Voir brouillon ci-dessous. |
| indice-reference-loyers | 4 | Timeout INSEE BDM | Lot INSEE BDM échoué en bloc le 22/07 ~14:01 → lenteur passagère de l'API. |
| inflation-insee | 4 | Timeout INSEE BDM | idem. |
| ipc-alimentaire | 4 | Timeout INSEE BDM | idem. |
| prix-logements-anciens | 4 | Timeout INSEE BDM | idem. |
| chomage-stats | 3 | INSEE 500 | idem (même fenêtre). |

Aucune régression franche : hors risque-secheresse, tout est soit une cause
connue (clé/DataDome), soit un timeout/limite d'API tierce transitoire.

## États figés (`stale_states`) — signal SECONDAIRE

⚠️ Caveat du script : `checked_at` n'est rafraîchi que sur écriture ; une
source/combinaison **inactive** figée est **NORMALE** tant que l'étape B n'est
pas déployée. Ne sont retenus ci-dessous que les états `active` figés :

- **risque-secheresse** — combos 06/14/16/53 `active`, `checked_at` bloqué au
  19/07 14:01. **Corroboré** par les 404 en `failing_sources` → à vérifier.
- **vigilance-meteo** — 9 dépts `active` figés au 14/07 23:04 (31/33/35/38/44/67/74/75/83),
  + dépt 24 (15/07) et 13 (19/07). Non corroboré par un échec ; plausible en
  épisode de vigilance estivale persistant **ou** simple non-rafraîchissement
  d'un `still-active` (même mécanique que le caveat still-inactive). Niveau bas.
- **rappel-conso** — combos `alimentation` / `bébés-enfants` `active`, figées au
  19/07 14:01. Non corroboré ; bruit attendu. RAS.

Tout le reste des `stale_states` est `inactive` → bruit attendu, sans alarme.

## Jamais actives depuis 90 j (`never_active_90d`)

Rien d'anormal. Le parc a été créé à partir du 11/07/2026 (moins de 2 semaines),
donc « jamais active depuis 90 j » couvre presque tout le catalogue par
construction. Les entrées sont saisonnières (éclipse, Perséides, Beaujolais,
Black Friday, soldes, fêtes religieuses…), dormantes-clés (meteo-belgique/suisse,
cyclones OM) ou récemment ajoutées (veilles paramétrées, sources Québec/outre-mer).
Aucune source « censée s'activer souvent » n'est muette. RAS.

## Collisions d'ordre d'affichage — cosmétique

12 collisions, essentiellement dans la plage **40–59** où des `statut-*` (cloud)
partagent un `display_order` avec des sources saisonnières :

- 40 : doomname / statut-github · 42 : statut-npm / statut-openai · 43 : statut-discord / statut-vercel
- 50 : changement-heure / statut-twitch · 51 : black-friday / soldes / statut-zoom
- 52 : perseides / statut-canva · 53 : beaujolais-nouveau / statut-dropbox
- 54 : soldes-steam / statut-slack · 55 : aurores-france / cert-fr-alertes
- 56 : eclipse-solaire / geminides / nuits-des-etoiles · 59 : echeances-fiscales / journees-patrimoine
- 432 : veille-artiste-spotify / veille-legifrance (les deux plus récentes)

Sans urgence. Si un ré-échelonnement est souhaité, réattribuer une plage propre
aux `statut-*` (ex. décaler tout le bloc cloud au-dessus de 365, plage libre
selon la convention « nouvelle vague au-dessus de 365 »).

## TODO calendaires — échéances ≤ 60 jours (avant ~21/09/2026)

- **`courses-mythiques.js`** — CONFIG VIDE, commentaire « ⚠️ TODO **septembre 2026** :
  transcrire les dates officielles ». Action dans la fenêtre 60 j : à alimenter
  dès parution des calendriers 2026-2027 (Marathon/Semi de Paris, Paris-Versailles).

### Annexe — au-delà de 60 jours (pas d'alerte)

- `tour-de-france-passage.js` — CONFIG VIDE, « TODO octobre 2026 » (parcours 2027).
- `echeances-fiscales.js` — TF/THRS 2026 codées ; entrée 2027 = TODO début 2027.
- `bourses-scolaires.js` / `crous-dse.js` — campagnes 2026-2027 codées (date limite
  bourses 15/10/2026 déjà en base) ; TODO campagne 2027-2028.
- `cfe-entreprises.js` — échéance 15/12/2026 codée ; TODO 2027.
- `bison-fute.js` — calendrier 2026 en dur, « TODO début 2027 ».
- Nombreux `TODO 2027/2028` sur les sources événementielles (carnavals, cérémonies,
  festivals, fashion-week, fêtes religieuses, grands-anniversaires…) : toutes ont
  l'édition en cours codée et une recuration annuelle prévue — rien avant fin 2026.
- `parcoursup.js`, `ouverture-ventes-sncf.js`, `guide-michelin.js`,
  `ours-pyrenees.js`, `marathons-villes.js`, `traditions-locales.js` : TODO datés
  en attente de publication officielle (calendriers non parus), pas d'échéance
  ferme dans les 60 j.

## Slugs orphelins

**Aucun.** Les 132 slugs remontés par la base (`category_slugs`) sont tous
définis dans la taxonomie fermée `server/categories.js` (groupes `GROUPS`).
Vérification exhaustive faite. Des slugs définis mais non utilisés existent
(normal, non signalé).

---

## BROUILLON — à valider par Hugo avant toute exécution

> Non validé. Robot 1 n'exécute rien. Piste pour la seule anomalie corroborée.

**risque-secheresse — 404 VigiEau récurrent.** La source enchaîne des `404`
(≠ timeout) depuis plusieurs cycles, et ses combinaisons actives (dépts 06/14/16/53)
n'ont pas été réécrites depuis le 19/07. Hypothèses à écarter dans l'ordre, **en
dev / hors PROD** :

1. Vérifier à la main (navigateur ou `curl` depuis un poste, PAS depuis un agent)
   l'endpoint VigiEau/RegLeau appelé par `server/sources/risque-secheresse.js` :
   un 404 stable signale un changement de chemin/paramètre côté API (RegLeau a
   déjà remplacé Propluvia — un nouveau glissement d'URL est plausible).
2. Si l'URL a changé : corriger la constante d'endpoint dans le fichier source,
   tester en lecture, puis déployer selon la séquence habituelle.
3. Si l'API répond normalement à la main : 404 possiblement intermittent côté
   VigiEau (dépt sans arrêté ⇒ 404 au lieu de 200 vide ?) → vérifier que le code
   traite un 404 « pas de restriction » comme un état inactif, et non comme un échec.

Tant que ce point n'est pas tranché, aucune action automatique. Les autres
échecs (clés, DataDome, timeouts INSEE/Vigicrues/Launch Library, 429 EcoWatt)
ne justifient aucun correctif : causes connues ou transitoires.
