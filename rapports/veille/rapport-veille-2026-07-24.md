# Rapport de veille — 2026-07-24

_Agent Robot 1 (lecture seule). Source : `node scripts/veille-readonly.js` (241 sources enabled, 23 combinaisons paramétrées). Aucune écriture hors ce rapport, aucun accès DB direct, aucun `runCycle`._

## Résumé (5 lignes max)

1. Aucune régression franche. Les 2 gros compteurs d'échec (`sncf-perturbations` 132, `leboncoin-livraison` 131) sont des causes **connues et attendues** (clé absente / DataDome) — pas d'action.
2. À surveiller (niveau bas) : `risque-secheresse` renvoie des **404 VigiEau** alors qu'elle a des combinaisons actives → possible changement d'endpoint, à confirmer.
3. Bruit transitoire : 4 sources INSEE BDM + `chomage-stats` ont timeout/500 en **une seule fenêtre** (23/07 ~16h30) — grappe transitoire côté INSEE, rien à faire.
4. `ecowatt` (HTTP 429 « appel trop fréquent ») et `lancement-spatial` / `vigicrues` (timeouts répétés) : à garder à l'œil, sans urgence.
5. Slugs orphelins : **aucun**. Collisions d'ordre d'affichage : cosmétiques (dont 1 nouvelle sur la vague 432). TODO calendaires ≤ 60 j : plusieurs échéances 2026 imminentes, aucune ne casse le produit.

---

## Sources en échec (`failing_sources`)

`failing_sources` fait foi. Tri par gravité réelle, pas par compteur.

### Causes connues / attendues — aucune action
| Source | Éch. | Dernier message | Lecture |
|---|---|---|---|
| `sncf-perturbations` | 132 | `SNCF_API_KEY absente` | Attendu — clé non souscrite (liste de courses #5). Normal. |
| `leboncoin-livraison` | 131 | `Blocage anti-bot leboncoin (IP datacenter)` | Attendu — scraper DataDome « par vagues », documenté. Normal. |

### À surveiller (niveau bas)
| Source | Éch. | Dernier message | Lecture |
|---|---|---|---|
| `risque-secheresse` | 10 | `Réponse HTTP inattendue VigiEau : 404` | **Le seul point qui mérite un œil.** La source a des combinaisons **actives** (dépts 06/14/16/53). Un 404 (et non un timeout) sur VigiEau peut signaler un chemin d'API modifié. À confirmer sur la doc VigiEau/RegLeau. Pas de preuve de régression franche (des états actifs existent encore). |
| `lancement-spatial` | 55 | `Timeout API Launch Library (>10000 ms)` | Timeouts répétés sur API tierce. Intermittent, pas de clé en cause. À surveiller si le compteur continue de grimper. |
| `ecowatt` | 27 | `HTTP 429, appel trop fréquent` | Rate-limit RTE : le poller appelle trop souvent (hors saison EcoWatt, donc sans impact abonné). Vaudrait un espacement des appels si ça persiste — voir brouillon. |
| `vigicrues-departement` | 20 | `Timeout API Vigicrues (>10000 ms)` | Timeouts intermittents API officielle. Source active. Rien d'anormal pour une API publique chargée. |

### Bruit transitoire — aucune action
Grappe INSEE BDM, **tous en échec dans la même fenêtre le 23/07 vers 16h30** (+ `chomage-stats` en 500 le 22/07) → indisponibilité passagère côté INSEE, pas un défaut du code :
`indice-reference-loyers` (5), `inflation-insee` (5), `ipc-alimentaire` (5), `prix-logements-anciens` (5), `chomage-stats` (3).

---

## États figés (`stale_states`) — signal SECONDAIRE

⚠️ Caveat du script : `checked_at` n'est rafraîchi qu'en écriture ; un `checked_at` ancien sur une source/combinaison **inactive** est **normal** tant que l'étape B n'est pas déployée. La grande majorité des entrées listées sont des sources saisonnières/inactives → **bruit attendu, aucune alarme**.

Seul cas non-inactif à mentionner (niveau bas, non corroboré par `failing_sources`) :
- `vigilance-meteo` dépts **actifs** figés au 14/07 (31, 33, 35, 38, 44, 67, 74, 75, 83). Deux lectures possibles et non distinguables ici : soit vigilance réellement continue depuis le 14 (normal), soit combinaisons désabonnées non recalculées. `vigilance-meteo` n'est **pas** dans `failing_sources` → pas de suspicion de panne. À ignorer sauf réapparition.

---

## Jamais actives depuis 90 j (`never_active_90d`) — RAS

Liste entièrement explicable : événements saisonniers hors saison (Beaujolais, Perséides, Black Friday, éclipse, soldes, fêtes religieuses…), pages de statut cloud (pas de panne = jamais actif, c'est le but), sources dormantes en attente de clé (EcoWatt, Ecogaz, carburant, vigieau…) et sources récemment ajoutées (vague science du 23/07 : `veille-arxiv`, `eruption-volcanique`, `exoplanete-habitable`, `ondes-gravitationnelles`, `veille-artiste-deezer`, `hausse-tarif-streaming`). **Rien d'anormal.**

---

## Collisions d'ordre d'affichage (`display_order_collisions`) — cosmétique

12 collisions, sans urgence. Deux familles :
- **Plage 40–59** : chevauchements entre pages de statut cloud et sources saisonnières (ex. 51 = `black-friday` / `soldes` / `statut-zoom` ; 56 = `eclipse-solaire` / `geminides` / `nuits-des-etoiles`). Dette historique.
- **Plage 432** : `veille-artiste-spotify` / `veille-legifrance` — collision **récente** (vague en cours). Rappel convention : toute nouvelle vague prend une plage au-dessus de ~365 ; ici deux sources partagent 432.

Impact : ordre d'affichage non déterministe entre sources d'un même rang. Purement visuel. Ré-échelonnement possible mais non prioritaire.

---

## TODO calendaires ≤ 60 jours (≤ 2026-09-22)

Fenêtre 2026-07-24 → 2026-09-22. Aucune de ces échéances ne casse le produit (les sources restent justes jusqu'à leur date ; le risque est de rater la MAJ de l'édition suivante). Classé par imminence.

| Fichier | Nature | Échéance proche | Renouvellement à prévoir |
|---|---|---|---|
| `rentree-scolaire.js` | Rentrée élèves | **1 sept 2026** (imminent) | Date 2026 OK ; TODO 2027 dès parution de l'arrêté. |
| `allocation-rentree-scolaire.js` | Versement ARS | **5 & 19 août 2026** | Dates 2026 OK ; TODO 2027 à ajouter mi-août. |
| `braderie-lille.js` | Braderie de Lille | **5–6 sept 2026** | Édition 2026 OK ; 2027 plus tard. |
| `bison-fute.js` | Calendrier routier | samedis rouges/noirs jusqu'au **28 août 2026** | Config 2026 complète. TODO **calendrier 2027** (à insérer dès publication, début 2027). |
| `gastronomie-terroir.js` | Salons (Foire de Châlons) | **28 août – 7 sept 2026** | 2026 codé ; éditions 2027 à ajouter. |
| `grandes-marees.js` | Coeff ≥ 100 | **13–15 août**, **11–13 sept 2026** | 2026 OK jusqu'au 27/10 ; TODO périodes 2027 (SHOM/maree.info). |
| `nuits-des-etoiles.js` | AFA | **7–9 août 2026** | 2026 OK ; TODO édition 2027. |
| `perseides.js` | Pluie d'étoiles | **12–13 août 2026** | Calculé/stable — pas de renouvellement. |

Échéances **octobre 2026** (juste au-delà ou en limite de fenêtre, à préparer en septembre) : `nobel-prix` (5–12 oct), `fete-science` (2–12 oct), `semaine-bleue` (5–11 oct), `semaine-du-gout` (12–18 oct), `echeances-fiscales` (taxe foncière 15/20 oct), `bourses-scolaires` / `crous-dse` (limites mi-oct).

### Annexe — au-delà de 60 j, calculés ou API (aucune action)
`soldes`, `changement-heure`, `beaujolais-nouveau`, `black-friday`, `vendredi-13`, `premier-avril`, `journees-geek`, `smic-revalorisation`, `fetes-familiales`, `loi-montagne`, `treve-hivernale`, `journees-patrimoine` : **formules calculées**, pas de date en dur à renouveler. `vacances-scolaires`, `jours-feries`, `node-lts`, `soldes-steam` : **alimentés par API**. Fêtes religieuses (`fetes-chretiennes` jusqu'à 2027, `fetes-juives` jusqu'au printemps 2027, `fetes-musulmanes` 2027 prévisionnel), `carnavals`/`ceremonies`/`grands-festivals`/`nuits-de-la-lecture` (2027 codés) : échéances de renouvellement en **fin 2026 / 2027**, hors fenêtre.

---

## Slugs orphelins — AUCUN

Croisement des 141 slugs réellement utilisés en base (`category_slugs`) avec la taxonomie fermée définie dans **`server/categories.js`** (381 slugs déclarés) : **tous les slugs utilisés sont définis**. Aucune carte ne s'affichera avec un slug brut. (L'inverse — slugs définis mais non utilisés — est normal et non signalé.)

---

## BROUILLON — à valider par Hugo avant toute exécution

_Non validé. Non exécuté par l'agent. Pistes seulement._

1. **`risque-secheresse` → 404 VigiEau (prioritaire).** Vérifier manuellement l'URL/endpoint VigiEau appelée dans le code de la source vs la doc actuelle de l'API (RegLeau/VigiEau a déjà bougé une fois — Propluvia est mort). Si l'endpoint a changé, corriger l'URL. À faire hors production, sans `runCycle`.

2. **`ecowatt` → HTTP 429 « appel trop fréquent ».** Envisager d'espacer l'appel RTE (cache/backoff ou fréquence réduite) pour ne pas cogner le rate-limit à chaque cycle hors saison. Cosmétique tant qu'EcoWatt est hors saison, mais nettoie les logs.

3. **Collision `display_order` 432** (`veille-artiste-spotify` / `veille-legifrance`) : réattribuer un rang distinct à l'une des deux dans la plage haute (> 365), conformément à la convention « une vague = une plage au-dessus ».

_Fin du rapport._
