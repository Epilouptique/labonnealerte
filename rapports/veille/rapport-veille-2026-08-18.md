# Rapport de veille — 2026-08-18

## Résumé (5 lignes max)

1. **`statut-anthropic` — erreur de certificat SSL** : 6 échecs entre le 09 et le 14/08 ; aucun depuis 4 jours. L'URL `status.anthropic.com` renvoie un cert qui ne couvre que `*.statuspage.io`. Situation instable à surveiller, probablement un correctif côté Anthropic ou un endpoint à mettre à jour.
2. **`ecowatt` — timeouts auth RTE fréquents** : 8 échecs sur 7 jours (dernier : 16/08), ~1/jour. Intermittent mais persistant.
3. **`lancement-spatial` — timeouts Launch Library** : 46 échecs (source communautaire sans SLA), dernier en date du jour.
4. **`grandes-marees` — TODO 2027 à anticiper** : sans mise à jour du calendrier, la source sera dormante après le 27 octobre 2026.
5. **Slug `communaute` orphelin** : utilisé par `chat-perdu` et `chien-perdu` mais absent de la taxonomie `server/categories.js` — le libellé s'affichera en slug brut.

---

## Sources en échec

### Causes attendues / normales

- **`sncf-perturbations`** (130 échecs, dernier : 18/08) — `SNCF_API_KEY` absente de l'environnement Railway. Situation documentée (etat-projet.md § Points en suspens). Aucune régression : c'est une variable à configurer côté Railway, pas du code.

- **`bitcoin-mouvement`** (6 échecs, dernier : 17/08) — Timeout CoinGecko. Rate limiting probable sur l'IP Railway. Intermittent, pas de panne durable.

- **`aurores-france`** (2 échecs, dernier : 18/08) — JSON invalide renvoyé par l'API NOAA. Signal très bas (seuil = 2 sur 7 jours), transitoire. À surveiller sur le prochain run si le compteur monte.

### À surveiller

- **`risque-secheresse`** (9 échecs, dernier : 14/08) — 404 VigiEau. Un fix est visible dans les commits récents (« Fix risque-secheresse 404 nocturne »). Absence d'échec depuis le 14/08 (4 jours) semble confirmer le correctif. Plus de signal depuis ; à considérer comme résolu sauf réapparition.

- **`ecowatt`** (8 échecs, dernier : 16/08) — `Timeout auth RTE (>10s)`. Fréquence ~1/jour sur 7 jours, intermittent mais non négligeable. L'API RTE (OAuth2 client_credentials) peut être lente en heure creuse. Pas de panne totale ; à mentionner si la fréquence augmente.

- **`lancement-spatial`** (46 échecs, dernier : 18/08) — Timeout API Launch Library (source communautaire, sans SLA). Documentée comme fragile (etat-projet.md § FRAGILES). Pas d'action immédiate ; à consigner.

### Bug à corriger — `statut-anthropic`

6 échecs entre le 09 et le 14/08. Message : *"Hostname/IP does not match certificate's altnames: Host: status.anthropic.com. is not in the cert's altnames: DNS:*.statuspage.io, DNS:statuspage.io"*.

**Analyse** : `server/sources/statut-anthropic.js` utilise `statusHost: 'https://status.anthropic.com'`, ce qui construit l'URL `https://status.anthropic.com/api/v2/status.json`. Le certificat TLS reçu ne couvre que `*.statuspage.io`, non `status.anthropic.com`. Deux causes possibles :
1. Anthropic a migré son Statuspage vers un CDN mutualisé dont le cert ne couvre pas le sous-domaine custom → l'endpoint correct serait peut-être `https://anthropicstatus.com/api/v2/status.json`.
2. Problème transitoire côté Anthropic, résolu le 14/08 (aucun échec depuis 4 jours).

Aucune action automatique. Si le bug réapparaît, vérifier l'URL correcte de l'API Anthropic status et corriger `statusHost` dans le fichier source.

---

## États figés (stale_states)

Toutes les entrées stale sont en état `inactive` sur des sources inactives (saisonnières, dormantes, ou veille sans paramètre souscrit). Ce bruit est **attendu** tant que l'étape B (rafraîchissement de `checked_at` même en still-inactive) n'est pas déployée — cf. caveat du script.

**Exception** : 9 combos `source_param_states` en état **`active`** avec des `checked_at` > 30 jours — il s'agit en réalité d'**états orphelins** (plus d'abonnement associé) déjà comptabilisés dans la section g. Aucune alarme.

---

## TODO calendaires — échéances ≤ 60 jours (18/08 → 17/10/2026)

| Échéance | Source | Fichier | Action |
|---|---|---|---|
| **19 août 2026** (demain) | Allocation rentrée scolaire — métropole + Antilles/Guyane | `allocation-rentree-scolaire.js` | RAS — la source est armée, elle déclenchera normalement |
| **26-30 août 2026** | Rock en Seine | `festivals-musique.js` | RAS — date confirmée en code |
| **26-30 août 2026** | gamescom (rdv-gaming) | `rdv-gaming.js` | RAS — date en code |
| **1er septembre 2026** | Rentrée scolaire | `rentree-scolaire.js` | RAS |
| **5-6 septembre 2026** | Braderie de Lille | `braderie-lille.js` | RAS — TODO 2027 noté |
| **11-13 septembre 2026** | Grandes marées (coeff 102) | `grandes-marees.js` | RAS — date en code |
| **19-20 septembre 2026** | Journées du patrimoine | `journees-patrimoine.js` | Dates calculées dynamiquement — à vérifier sur le site officiel si la source reste muette fin septembre |
| **2-12 octobre 2026** | Fête de la science | `fete-science.js` | RAS — TODO 2027 documenté |
| **5-12 octobre 2026** | Prix Nobel | `nobel-prix.js` | RAS — TODO 2027 documenté |
| **5-11 octobre 2026** | Semaine Bleue | `semaine-bleue.js` | RAS — TODO 2027 documenté |
| **15 oct. (papier) / 20 oct. (en ligne)** | Taxe foncière | `echeances-fiscales.js` | RAS — dates dans la fenêtre ; TODO 2027 noté |

### ⚠️ À traiter début 2027 (hors fenêtre, pour mémoire)

- `grandes-marees.js` : **sans mise à jour 2027, la source devient dormante après le 27 octobre 2026** (TODO explicite en tête du fichier).
- `bison-fute.js` : TODO 2027 — calendrier annuel en dur, valide pour 2026 mais non reconduit.
- `echeances-fiscales.js`, `braderie-lille.js`, `semaine-bleue.js`, `nobel-prix.js`, `fete-science.js` : TODOs 2027 documentés dans chaque fichier.

---

## Slugs orphelins

Un slug présent en base (dans `category_slugs`) est **absent** de la taxonomie définie dans `server/categories.js` :

| Slug | Sources concernées | Conséquence |
|---|---|---|
| **`communaute`** | `chat-perdu`, `chien-perdu` | Affiché avec le slug brut « communaute » au lieu d'un libellé (ex. « Communauté ») |

**Correction proposée** (non exécutée) : ajouter `'communaute'` à un groupe dans `GROUPS` de `server/categories.js` — par exemple dans `vie-locale` ou dans un groupe `communaute` dédié, selon ce que Hugo préfère. Cosmétique ; basse priorité.

---

## Cohérence schéma

`schema_check.ok === true` (58 colonnes attendues, aucune manquante, aucun type incorrect). RAS.

---

## Vitalité PanneauPocket curées (vague L)

`panneaupocket_vitality: []` — aucune carte curée ne dépasse le seuil de 90 jours sans activation. Normal : les 18 cartes de la vague L ont été créées le 24-25 juillet 2026, soit ~25 jours d'ancienneté ; aucune n'a encore atteint la fenêtre de 90 jours.

**Limite de méthode** (rappel) : `last_activated_at` sous-estime la vitalité réelle — un panneau modifié hors filtre thématique ou cosmétiquement n'y est pas reflété. La prochaine vérification significative sera à la mi-octobre 2026 (~85 jours). Les cartes gendarmerie (`securite-gendarmerie-albi`, `-bayeux`, `-essarts`) restent en priorité à re-vérifier manuellement via l'appli PanneauPocket au passage des 90 jours (env. 22 octobre), conformément au signalement etat-projet.md (famille gendarmerie massivement dormante à ~85 %).

---

## Combos orphelins & stabilité des ids `?panneau=`

**26 combos orphelins** dans `source_param_states` (reliquats de désabonnements). Détail de l'échantillon :
- 13 combos `vigilance-meteo` (déptos 31, 33, 35, 38, 44, 67, 74, 75, 83, 24, 16, 10, 69, 13)
- 5 combos `ma-collectivite` (URLs villages des Hautes-Alpes : Oze, Valserres, AMR-05, Veynes, La Bâtie-Vieille)
- 4 combos `risque-secheresse` (déptos 06, 14, 16, 53)
- 2 combos `rappel-conso` (catégories alimentation, bébés-enfants)
- 1 combo `iss-passages` (ville=gap, état `active` — ex-abonné)

Volume attendu après 1 mois de prod sur une base de test + premiers abonnés. La purge est une décision humaine ; aucun `DELETE` par cet agent.

**Stabilité des ids `?panneau=`** : point de vigilance ouvert. Si PanneauPocket régénère les ids à l'édition d'un panneau, une simple modification apparaîtrait comme « nouveau ». Non mesurable sans fetch réseau (interdit la nuit) — à surveiller via l'interface PanneauPocket si des doublons d'alertes sont signalés.

---

## Collisions display_order (cosmétique)

11 collisions, toutes cosmétiques. Celles à 3 sources :

| Ordre | Sources |
|---|---|
| 51 | black-friday, soldes, statut-zoom |
| 56 | eclipse-solaire, geminides, nuits-des-etoiles |

Les autres sont à 2 sources. Sans impact produit ; rééchellonnement à planifier lors d'un prochain fil de maintenance.

---

*Run effectué le 2026-08-18 à 07h31 UTC. 267 sources enabled, 36 combos paramétrés. Agent en lecture seule — aucun fichier modifié hormis ce rapport.*
