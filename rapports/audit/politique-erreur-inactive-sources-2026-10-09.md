# Audit de politique : erreur de surveillance masquée en `inactive`

**Date :** 2026-10-09 · **Statut :** AUDIT, aucune source modifiée. Décision en attente de Hugo.

## Contexte

Quand `check()` d'une source **lève** une erreur, le poller journalise un incident `failed`
(surveillance en panne), **conserve l'état précédent** et ne notifie personne. Quand `check()`
**renvoie `inactive`** sur une erreur réseau/HTTP/timeout/parse, la panne est **masquée** : la carte
paraît « calme » alors qu'on ne sait plus rien. Le commit `42643a8` a posé la politique correcte sur
2 sources (`eruption-volcanique`, `pannes-hydro-quebec`) : **propager, ne pas avaler**.

Ci-dessous les **34 fichiers** restants qui avalent encore une erreur en `inactive` (sous-agent, lecture
réelle de chaque `check()`). « Assumé » = un commentaire justifie explicitement le choix ; « Oubli » =
aucune justification. Risque = conséquence pour l'utilisateur quand une panne RÉELLE est masquée (il
croit « rien à signaler » alors que la surveillance est aveugle). **Aucune de ces sources n'est modifiée.**

## Règle de lecture des recommandations

- **Propager** = aligner sur `42643a8` (throw sur réseau/HTTP non-ok/timeout/JSON invalide ; garder
  `inactive` UNIQUEMENT pour un vrai « rien à signaler » : 204/404/liste vide).
- **Propager + seuil** = cas où propager chaque 403/SSRF transitoire inonderait les incidents : garder
  `inactive` sur l'aléa isolé mais lever au bout de N échecs consécutifs (panne durable visible).
- Priorité par **risque** : une alerte de sécurité/danger masquée ≫ une info de confort retardée.

---

## Tier 1 — Risque ÉLEVÉ (une panne masquée peut faire RATER une alerte réelle)

| source | type d'erreur avalée | comportement actuel | assumé / oubli | risque utilisateur | recommandation |
|---|---|---|---|---|---|
| `tempo` | HTTP non-ok, réseau, parse | `inactive` silencieux | **Assumé** (l.32) | Élevé : rate un **jour rouge EDF Tempo** → surcoût/consommation mal planifiée | **Propager** (le silence ≠ « pas de jour rouge ») |
| `vigilance-submersion` | exception générique | `inactive` | Oubli | Élevé : submersion marine non signalée | **Propager** |
| `cyclones-outremer` | réseau/parse | `inactive` (log) | Oubli | Élevé : cyclone outre-mer manqué | **Propager** |
| `meteo-belgique` | exception → tous combos | `combos.map(inactive)` | Oubli | Élevé : vigilance météo masquée | **Propager** |
| `meteo-quebec` | idem | `combos.map(inactive)` | Oubli | Élevé | **Propager** |
| `meteo-europe` | erreur par flux pays | `inactive` par pays | Oubli | Élevé | **Propager** (par flux) |
| `meteo-forets` | erreur au chargement | `inactive` | **Assumé** (l.195) | Élevé : risque feu de forêt masqué | **Propager** (le filet « ne jamais remonter » va à l'encontre de la politique) |
| `indice-uv` | exception → tous combos | `combos.map(inactive)` | Oubli | Moyen-élevé : UV extrême non signalé | **Propager** |
| `veille-hydrometrie` | exception par station | `inactive` par station | Oubli | Élevé : montée des eaux manquée | **Propager** (par station) |
| `domaine-securite` | timeout/5xx/401-403/JSON | `inactive` silencieux | **Assumé** (l.127) | Élevé : compromission domaine non vue ; **403/401 = clé invalide**, panne durable masquée | **Propager** (au moins 401/403/5xx ; garder inactive sur timeout isolé) |
| `veille-twitch` | réseau pur / 5xx | `combos.map(inactive)` (auth déjà propagée) | Partiel/Assumé | Moyen | **Propager + seuil** (auth OK déjà) |

## Tier 2 — Risque MOYEN (info utile, enjeu conso/argent, retard gênant mais pas dangereux)

| source | type d'erreur avalée | comportement actuel | assumé / oubli | risque utilisateur | recommandation |
|---|---|---|---|---|---|
| `crypto-seuil` | exception réseau/HTTP | prix null → `inactive` | Oubli | Moyen : seuil crypto manqué | **Propager** |
| `taux-de-change` | exception → tous combos | `combos.map(inactive)` | Oubli | Moyen : variation de change manquée | **Propager** |
| `hausse-tarif-streaming` | exception par service | `inactive` par service | Oubli | Moyen : hausse de prix manquée | **Propager** (par service) |
| `hausse-tarif-operateur` | réseau/403/format/pdf | `inactive` silencieux | **Assumé** (l.287) | Moyen : hausse opérateur manquée ; 403 = panne durable | **Propager + seuil** |
| `veille-artiste-deezer` | exception albums | `inactive` par combo | Oubli | Moyen : sortie d'album manquée | **Propager** (par combo) |
| `youtube-chaine` | résolution chaîne / 404 | `inactive` (réseau/5xx déjà propagés) | **Assumé** (l.219-221) | Moyen : nouvelle vidéo manquée si résolution tombe durablement | **Propager + seuil** sur échec de résolution persistant |
| `github-release` | erreur par dépôt | cache-ou-`inactive` | Oubli (404 géré à part) | Moyen : release manquée si pas de cache | **Propager** quand pas de cache |
| `iss-passages` | erreur par combo | cache-ou-`inactive` | Oubli | Faible-moyen | **Propager** quand pas de cache |
| `veille-legifrance` | lot du jour indispo → combos | `combos.map(inactive)` | Oubli | Moyen : texte réglementaire manqué | **Propager** |
| `lib/release-factory` (crates/packagist/rubygems…) | réseau sans cache → **omis** ; 404 → `inactive` | cache-ou-omission | Partiel/Assumé (404 l.6) | Moyen : release manquée ; l'omission silencieuse est pire qu'un incident | **Propager** quand pas de cache |
| `lib/rss-alerte` (plusieurs sources « alerte RSS ») | HTTP/timeout par flux ; tous morts → `inactive` | best-effort | **Assumé** (l.82) | Moyen-élevé selon la source branchée | **Propager** si TOUS les flux échouent |
| `lib/panneaupocket-veille` (`ma-collectivite`, PanneauPocket) | réseau/parse/SSRF/4xx-5xx | `inactive` silencieux | **Assumé** (l.140) | Moyen-élevé : alerte municipale manquée | **Propager + seuil** (403 anti-bot fréquent → seuil) |

## Tier 3 — Risque FAIBLE (information de confort/curiosité, non urgente)

| source | type d'erreur avalée | comportement actuel | assumé / oubli | risque utilisateur | recommandation |
|---|---|---|---|---|---|
| `exoplanete-habitable` | exception générique | `inactive` | Oubli | Faible | Propager de préférence (visibilité monitoring) ; faible urgence |
| `ondes-gravitationnelles` | exception générique | `inactive` | Oubli | Faible | idem |
| `retraction-article` | exception générique | `inactive` | Oubli | Faible | idem |
| `veille-arxiv` | exception par mot-clé | `inactive` par mot-clé | Oubli | Faible | idem (par mot-clé) |
| `veille-boamp` | exception par mot-clé | `inactive` par mot-clé | Oubli | Faible-moyen (marchés publics) | Propager de préférence |
| `veille-entreprise` | exception par SIREN | `inactive` par SIREN | Oubli | Faible-moyen | Propager de préférence |
| `veille-emploi` | exception mot-clé/dép. | `inactive` | Oubli | Faible | Propager de préférence |
| `veille-stock` | exception par URL | `inactive` par URL | Oubli | Faible-moyen (réappro produit) | Propager de préférence |
| `veille-rss` | réseau/SSRF/HTTP | `inactive` silencieux | **Assumé** (l.50) | Faible-moyen | **Propager + seuil** (SSRF/403 attendus) |
| `veille-page` | 403 anti-bot/timeout/SSRF | `inactive` silencieux, réessai rapproché | **Assumé** (l.99) | Faible-moyen | **Propager + seuil** (403 anti-bot normal → seuil, pas chaque passage) |
| `veille-agenda` | réseau/SSRF/4xx-5xx/volume | `inactive` silencieux | **Assumé** (l.202) | Faible | **Propager + seuil** |

---

## Synthèse

- **34 sources** avalent une erreur en `inactive`. **~26 « francs »** (masquage pur), **8 cas
  limites** signalés (`veille-twitch`, `youtube-chaine`, `github-release`, `iss-passages`,
  `veille-artiste-deezer`, `lib/rss-alerte`, `lib/release-factory`, + motif cache-ou-inactive).
- **13 ont un commentaire qui ASSUME le choix** (`tempo`, `domaine-securite`, `hausse-tarif-operateur`,
  `meteo-forets`, `veille-agenda`, `veille-rss`, `veille-page`, `youtube-chaine`, `lib/rss-alerte`,
  `lib/panneaupocket-veille`, `lib/release-factory`, `veille-twitch` partiel) ; **~21 n'ont aucune
  justification → oubli probable**.
- **Priorité de correction = Tier 1** (sécurité/danger/argent masqués : `tempo`, les `meteo-*`,
  `vigilance-submersion`, `cyclones-outremer`, `veille-hydrometrie`, `domaine-securite`, `meteo-forets`).
- Nuance importante : pour les sources à **403 anti-bot / SSRF fréquents** (`veille-page`, `veille-rss`,
  `panneaupocket`, `veille-agenda`), propager CHAQUE aléa inonderait les incidents → **« Propager +
  seuil »** (lever après N échecs consécutifs) plutôt que throw immédiat.
- **Hors liste** (déjà conformes) : `qualite-air`, `pollens` (corrigés fil #9bis), et ~24 sources qui
  propagent déjà (`ecowatt`, `carburant`, `sncf-perturbations`, `vigieau`, `vigicrues-*`,
  `cert-fr-alertes`, fabriques `statuspage`/`meteoalarm`/`atmo`/`vigilance`…). `risque-secheresse` sert
  un cache périmé (ni masquage ni throw).

**Aucune source de ce tableau ne sera modifiée avant ton accord**, source par source si tu veux
procéder par tiers.
