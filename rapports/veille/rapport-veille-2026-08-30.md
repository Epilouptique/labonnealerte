# Rapport de veille — 2026-08-30

> Robot 1 · lecture seule · 267 sources enabled · 36 combos paramétrés

---

## Résumé (5 lignes)

1. **`lancement-spatial`** : 54 timeouts persistants API Launch Library — pas transitoire, surveillance requise.
2. **`aurores-france`** : JSON invalide NOAA depuis 28/08 — possible changement de format API.
3. **`courses-mythiques`** : config vide, TODO « septembre 2026 » déjà échu — action immédiate recommandée.
4. **5 cartes PanneauPocket curées jamais activées** (37 jours d'existence) — candidates à surveillance humaine.
5. **Slug `communaute`** utilisé en base mais absent de la taxonomie — libellé brut affiché.

Tout le reste : RAS ou situation normale documentée.

---

## Cohérence schéma

`schema_check.ok = true` — 58 colonnes attendues, 0 manquante, 0 désaccord de type. RAS.

**Note technique** : la section `panneaupocket_vitality` du JSON du script est revenue vide (`[]`), probablement suite à une exception silencieuse dans le script (la query sous-jacente fonctionne correctement — vérifiée par requête directe). Les données de vitalité présentées ci-dessous sont issues de cette requête directe, non du JSON du script. Ce bug de reporting mérite correction dans `scripts/veille-readonly.js`.

---

## Sources en échec

### Seuil ≥ 2 échecs sur 7 jours

| Source | Échecs | Dernier message | Diagnostic |
|---|---|---|---|
| `sncf-perturbations` | 128 | `SNCF_API_KEY absente de l'environnement` | **Normal** — clé Railway non configurée, documenté dans l'état du projet. À configurer quand Hugo dispose de la clé. |
| `lancement-spatial` | 54 | `Timeout API Launch Library (>10000 ms)` | ⚠️ **Persistant** — 54 échecs sur 7 jours. L'API Launch Library est communautaire (iss-api.fly.dev-like), aucun SLA. Ce volume de timeouts suggère une panne durable ou un changement d'infrastructure. À surveiller ; si ça persiste, envisager un repli. |
| `aurores-france` | 3 | `Réponse NOAA illisible (JSON invalide)` | ⚠️ **Suspect** — 3 échecs à partir du 28/08. La source est pourtant en `inactive` (état stale depuis juillet), donc aucun abonné alerté par erreur. Mais si le format JSON NOAA a changé, la source ne peut plus alerter. À investiguer. |
| `statut-gandi` | 4 | Timeout Statuspage | Transitoire — 4 échecs groupés, pattern Statuspage. Bruit réseau Railway probable. |
| `statut-grafana` | 4 | Timeout Statuspage | Idem — transitoire. |
| `statut-scaleway` | 4 | Timeout Statuspage | Idem. |
| `statut-twitch` | 4 | Timeout Statuspage | Idem. |
| `statut-canva` | 2 | Timeout Statuspage | Idem. |
| `statut-flyio` | 2 | Timeout Statuspage | Idem. |
| `statut-proton` | 2 | Timeout Statuspage | Idem. |
| `statut-pypi` | 2 | Timeout Statuspage | Idem. |
| `statut-vimeo` | 2 | Timeout Statuspage | Idem. |

Le cluster de timeouts Statuspage (8 sources, 2–4 échecs chacune) est vraisemblablement une perturbation réseau côté Railway ou un pic de latence des endpoints `/api/v2/status.json` — tous ont le même pattern de message. Pas de corrélation avec `failing_sources` côté fonctionnel.

---

## États figés (stale_states)

Total : 281 entrées stale. En `active` ou `pending` : 18.

**Caveat rappelé** : `checked_at` n'est rafraîchi que sur écriture (étape B non déployée). Un état `inactive` ancien est normal tant que la source reste muette. Ne signaler que les `active`/`pending` figés qui ne sont pas orphelins.

Les 18 états `active` stale (vigilance-meteo ×11, risque-secheresse ×4, rappel-conso ×2, iss-passages ×1) sont **tous présents dans `orphan_param_states`** — ce sont des combinaisons dont l'abonnement a été supprimé. Le poller ne les recalcule plus (plus de subscriber), donc leur état reste figé sur la dernière valeur. Comportement normal ; pas d'alarme. La purge des orphelins (décision humaine, cf. section dédiée) résoudrait ces états figés en même temps.

---

## Jamais actives (90 jours)

175 sources jamais passées `activated` depuis 90 jours. La quasi-totalité est normale :

- **Saisonnières attendues** : beaujolais-nouveau, black-friday, changement-heure, soldes-steam, geminides, saints-de-glace, perseides, vendredi-13, premier-avril, elections-france, loi-montagne, treve-hivernale… — hors saison, muettes par construction.
- **Clés API absentes** : sncf-perturbations (documenté), risque-avalanche (DPBRA, documenté dormant).
- **Observation silencieuse assumée** : leboncoin-livraison (DataDome, phase observation — check() renvoie toujours inactive).
- **Sources récentes** (< 90 j depuis création) : cyclones-outremer, meteo-forets, et la vague de sources créées fin juillet 2026.

Rien d'anormal à signaler parmi ces 175.

---

## Collisions d'ordre d'affichage

11 collisions cosmétiques (display_order partagé entre 2–3 sources) :

| Ordre | Sources |
|---|---|
| 40 | doomname / statut-github |
| 42 | statut-npm / statut-openai |
| 43 | statut-discord / statut-vercel |
| 50 | changement-heure / statut-twitch |
| 51 | black-friday / soldes / statut-zoom |
| 52 | perseides / statut-canva |
| 53 | beaujolais-nouveau / statut-dropbox |
| 54 | soldes-steam / statut-slack |
| 55 | aurores-france / cert-fr-alertes |
| 56 | eclipse-solaire / geminides / nuits-des-etoiles |
| 59 | echeances-fiscales / journees-patrimoine |

Ces collisions semblent provenir d'un rééchelonnement partiel lors de l'ajout des sources statut-*. L'ordre de tri est secondaire (l'affichage est principalement gouverné par le scoring de pertinence). À rééchalonner lors d'un prochain chantier init.sql, sans urgence.

---

## TODO calendaires ≤ 60 jours

Horizon : de ce jour (2026-08-30) jusqu'au 2026-10-29.

### ⚠️ Action immédiate

**`server/sources/courses-mythiques.js`** — config **VIDE**, commentaire : `TODO septembre 2026 : transcrire les dates officielles`. Dates mentionnées en commentaire : Marathon de Paris 2027 (pressenti dim. 11 avril), Semi de Paris 2027 (pressenti dim. 7 mars), Paris-Versailles 2027 (non annoncé). Le TODO vise l'ouverture des inscriptions, attendue autour de septembre 2026 — ce moment est maintenant. Hugo devrait vérifier si les inscriptions sont ouvertes et compléter le fichier.

### Échéances imminentes (source active, config à jour)

| Source | Échéance | Statut config |
|---|---|---|
| `braderie-lille` | 5–6 septembre 2026 **(dans 6 jours)** | ✅ Entrée 2026 présente |
| `journees-patrimoine` | 3e week-end de septembre = 19–20 sept 2026 | ✅ Calculée dynamiquement |
| `fete-science` | 2–12 octobre 2026 | ✅ Entrée 2026 présente (vérifiée fetedelascience.fr le 23/07) |
| `semaine-bleue` | 5–11 octobre 2026 | ✅ Entrée 2026 présente (semaine-bleue.org confirmé) |
| `grands-rendez-vous-sportifs` | Prix de l'Arc de Triomphe 4 oct. 2026 | ✅ Présent |
| `nobel-prix` | 5–12 octobre 2026 | ✅ Entrée 2026 présente |
| `echeances-fiscales` | TF papier 15 oct / ligne 20 oct 2026 | ✅ Entrée 2026 présente |

### Renouvellements à anticiper (au-delà de 60 jours — liste courte)

| Source | Horizon | Note |
|---|---|---|
| `bison-fute` | Début 2027 | TODO 2027 documenté — calendrier 2026 épuisé (dernier jour : 28 août 2026) |
| `echeances-fiscales` | Début 2027 | TODO 2027 documenté (TH secondaires déc. 2026 = 107 jours, hors fenêtre) |
| `allocation-rentree-scolaire` | Mi-août 2027 | TODO 2027 documenté |
| `courses-mythiques` | Dès confirmation officielle 2027 | Voir ci-dessus |
| `fete-science` | Avant 30/09/2027 | TODO documenté |
| `semaine-bleue` | À confirmer sur semaine-bleue.org | TODO documenté |
| `prime-noel` | 2027 | TODO documenté |

---

## Slugs orphelins

Croisement `category_slugs` (DB) × taxonomie `server/categories.js` :

**1 slug orphelin trouvé : `communaute`**

Ce slug est présent dans la colonne `categories` d'au moins une source en base, mais absent de toute entrée des `GROUPS` dans `server/categories.js`. L'API `/api/categories` ne le retournera donc pas, et le front affichera le slug brut `communaute` au lieu d'un libellé localisé.

Action suggérée : soit ajouter `'communaute'` à un groupe pertinent de `server/categories.js` (ex. `vie-locale` ou créer un groupe `communaute`), soit remplacer le slug par un équivalent existant sur la ou les sources concernées.

---

## Vitalité PanneauPocket curées (Vague L)

19 sources analysées (18 cartes vague L + arrosage-canal-gap). Données issues de requête directe (le script veille-readonly a retourné `[]` pour cette section — cf. note technique en tête de rapport).

### Toutes actives récemment (last_activated_at ≤ 90 j)

| Source | last_activated_at | ref_panneau_count |
|---|---|---|
| agenda-luc-en-diois | 2026-08-29 | 2 |
| arrosage-canal-gap | 2026-08-26 | 3 |
| dechets-saulieu | 2026-08-26 | 14 |
| eau-charles-chaigneau | 2026-08-17 | 3 |
| eau-coteaux-lizon | 2026-08-28 | 30 |
| eau-isle-dronne | 2026-08-19 | 14 |
| eau-provence-verte | 2026-08-19 | 2 |
| eau-regie-metz | 2026-08-26 | 4 |
| local-agly-fenouilledes | 2026-08-26 | 9 |
| local-buech-devoluy | 2026-08-26 | 3 |
| local-chablis | 2026-08-06 | 9 |
| local-chabris-bazelle | 2026-08-29 | 55 |
| securite-gendarmerie-albi | 2026-08-17 | 2 |
| securite-gendarmerie-essarts | 2026-08-24 | 13 |

Ces 14 cartes sont vivantes — aucune action requise.

### Candidates à surveillance humaine (last_activated_at = null)

Ces 5 cartes n'ont **jamais** déclenché d'alerte. Elles existent depuis le 24/07/2026 (37 jours). La règle des 90 jours n'est pas encore atteinte, mais la situation mérite d'être suivie.

| Source | ref_panneau_count | Interprétation |
|---|---|---|
| **cantine-a2m2v** | 0 | Aucun panneau en base — entité peut-être inactive sur PanneauPocket, ou filtre trop strict |
| **dechets-campagne-caux** | 1 | 1 panneau connu, jamais alertable (hors filtre thématique) |
| **dechets-la-saucelle** | 7 | 7 panneaux connus, aucun alertable |
| **eau-puisaye-forterre** | 4 | 4 panneaux connus, aucun alertable |
| **securite-gendarmerie-bayeux** | 3 | 3 panneaux connus, aucun alertable |

**Rappel de méthode (limite à énoncer)** : `last_activated_at` est un proxy qui sous-estime la vitalité — une entité publiant des panneaux hors filtre thématique ou cosmétiques reste vivante sans produire d'événement alertable. Ces cartes peuvent très bien être publiantes mais thématiquement hors-cible. **Jamais de désactivation automatique** — décision humaine uniquement, à confirmer via l'app PanneauPocket.

**Amélioration suggérée** : persister la date du dernier panneau vu (alertable ou non) dans `ref`, en parallèle des `[panneauId, hash]` existants. Cela permettrait un proxy de vitalité brute sans fetch réseau nocturne. Non implémenté ici.

---

## Combos orphelins & stabilité des ids `?panneau=`

### Combos orphelins

**26 lignes** `source_param_states` sans abonnement actif. Échantillon : vigilance-meteo (×12 départements), risque-secheresse (×4 depts), rappel-conso (×2 catégories), ma-collectivite (×5 URLs PanneauPocket), iss-passages/gap (×1). Ces lignes sont des reliquats de désabonnements. La purge est une décision humaine — aucun DELETE par ce robot.

Note : les états `active` figés depuis juillet 2026 sur vigilance-meteo et risque-secheresse (cf. section stale_states) correspondent exactement à ces orphelins — le poller ne les recalcule plus faute de subscriber.

### Stabilité des ids `?panneau=`

Point de vigilance ouvert (consigné en tête de `server/sources/ma-collectivite.js`) : si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme « nouveau ». Ce risque ne peut pas être mesuré sans fetch réseau (interdit la nuit). Aucun incident constaté en base à ce jour — à surveiller si des faux positifs « nouveau panneau » sont remontés par des abonnés.

---

## BROUILLON — à valider par Hugo avant toute exécution

### Fix aurores-france (JSON NOAA invalide)

**Non validé — à investiguer d'abord manuellement.**

Le message d'erreur `Unexpected non-whitespace character after JSON at position 6819` suggère que la réponse NOAA n'est plus du JSON pur (peut-être du JSONP, une page HTML d'erreur, ou un trailing garbage). Avant de corriger le code :

1. Vérifier manuellement l'endpoint NOAA utilisé dans `server/sources/aurores-france.js` pour observer la réponse réelle.
2. Si le format a changé, adapter le parseur (ex. JSON.parse après nettoyage, ou changement d'endpoint).
3. Si c'est transitoire (CDN flaky), attendre quelques jours — 3 échecs sur 7 jours ne justifie pas encore de correctif.

### Slug communaute — ajout à la taxonomie

**Non validé.** Si Hugo confirme que le slug `communaute` est intentionnel :

```js
// Dans server/categories.js, ajouter 'communaute' au groupe pertinent.
// Exemple dans le groupe 'vie-locale' :
'vie-locale': ['vie-locale', 'fetes', 'local', 'communaute', ...]
// ou dans un nouveau micro-groupe si le slug mérite sa propre entrée.
```

Alternativement, identifier quelle(s) source(s) portent `communaute` en base et remplacer par un slug taxonomisé existant (`vie-locale`, `local`, etc.).

### courses-mythiques — renseigner les dates 2027

**Non validé — action éditoriale Hugo.** Vérifier sur les sites officiels (Schneider Electric Marathon de Paris, HOKA Semi de Paris, etc.) si les inscriptions 2027 sont ouvertes et compléter le tableau `DATES` dans `server/sources/courses-mythiques.js`.
