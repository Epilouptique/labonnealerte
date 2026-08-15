# Rapport de veille — 2026-08-14

> Généré à 02:00 UTC · 266 sources enabled · 36 combos paramétrées actives

---

## Résumé

3 points à traiter, niveau bas à moyen :

1. **`lancement-spatial`** — 50 timeouts consécutifs sur l'API Launch Library (panne durable probable, à surveiller).
2. **Slug orphelin `communaute`** — utilisé par `chat-perdu` mais absent de `server/categories.js` : la carte s'affiche avec le slug brut au lieu d'un libellé.
3. **TODO calendaire prioritaire** — `grandes-marees` n'a **pas** de données 2027 (TODO explicite dans le fichier) ; la source sera muette après octobre 2026 si non mise à jour. Aucun autre TODO urgent < 60 jours.

Aucune migration manquante. Aucune carte PanneauPocket curée en alerte. Schéma cohérent.

---

## Sources en échec (`failing_sources`)

| Source | Échecs (7 j) | Dernier message | Évaluation |
|--------|-------------|-----------------|------------|
| `sncf-perturbations` | 133 | `SNCF_API_KEY absente` | **Normal** — clé non configurée sur Railway, documenté |
| `lancement-spatial` | 50 | `Timeout API Launch Library (>10 000 ms)` | ⚠️ **À surveiller** — 50 timeouts consécutifs depuis plusieurs jours suggèrent une panne API durable, pas un pic isolé |
| `bitcoin-mouvement` | 7 | `Timeout CoinGecko (>10 000 ms)` | **Probablement transitoire** — CoinGecko rate-limite les IP datacenter périodiquement ; 7 échecs sur 7 jours sans bloc complet = instabilité normale |
| `ecowatt` | 4 | `HTTP 429 (appel trop fréquent)` | **Normal** — EcoWatt rate-limite ponctuellement, le code gère le repli au cycle suivant |
| `risque-secheresse` | 2 | `Réponse HTTP inattendue VigiEau : 404` | **Niveau bas** — seuil minimum (2 échecs). VigiEau retourne des 404 occasionnels en dehors de la saison de sécheresse ; croiser avec les prochains cycles |

### `lancement-spatial` — détail

50 échecs consécutifs (dernier : 2026-08-14 00:01 UTC) signale une dégradation persistante de l'API Launch Library (thespacedevs.com). Ce n'est pas un timeout isolé. Aucune mise à jour du README de l'API n'est consultable sans accès réseau. **À vérifier manuellement** : si l'endpoint `/2.2.0/launch/upcoming/` répond à nouveau dans quelques jours, pas d'action. Sinon, envisager un fallback ou une désactivation temporaire.

---

## États figés (`stale_states`) — bruit attendu

La quasi-totalité des ~150 entrées stale sont des sources **inactive** dont `checked_at` remonte à mi-juillet 2026. C'est le comportement documenté (étape B non déployée : `still-inactive` ne rafraîchit pas `checked_at`). Aucune source inactive stale n'est corroborée par `failing_sources`, sauf les cas traités ci-dessus.

Deux entrées méritent une mention anodine :
- `vigilance-meteo` (9 départements) : état `active` avec `checked_at` mi-juillet. Ces abonnements apparaissent comme **orphelins** (cf. § Combos orphelins) — leur état actif daté est donc un reliquat de test, pas une alerte en cours.
- `grandes-marees` : état `inactive`, `checked_at` 2026-07-14. La grande marée 13-15 août (coeff 102) a débuté hier. La source n'est pas dans `failing_sources`, le poll est actif. L'état `inactive` persistant depuis juillet s'explique par l'absence d'écriture (`still-inactive`) entre la fin de la dernière période et aujourd'hui. **Le poll du 14 ou 15 août devrait écrire `active` et rafraîchir `checked_at`** — à vérifier dans le prochain rapport si ce n'est pas le cas.

---

## Sources jamais actives depuis 90 jours

La liste est longue (~170 sources) mais **entièrement normale** : sources saisonnières hors-saison (beaujolais, black-friday, changement-heure, soldes, etc.), sources récemment ajoutées (vague 21-24 juillet), sources sans clé API (sncf, risque-avalanche), sources paramétrées sans abonnés actifs (veille-page, veille-stock, etc.).

Aucune source ne présente d'anomalie réelle : toutes les sources qui **devraient** s'activer souvent sont absentes de cette liste (séismes-france, vigilance-meteo, cert-fr-alertes, écowatt par exemple n'y figurent pas ou s'y trouvent pour raison connue).

---

## TODO calendaires — échéances ≤ 60 jours (avant le 13/10/2026)

### Urgent — action à planifier

| Source | Fichier | Échéance | Nature |
|--------|---------|----------|--------|
| `grandes-marees` | `server/sources/grandes-marees.js` | **Après le 27/10/2026** | ⚠️ TODO 2027 explicite : « transcrire les périodes de coeff ≥ 100 depuis maree.info / SHOM. Sans mise à jour, la source reste dormante après octobre 2026. » Pas urgent aujourd'hui, mais à traiter **avant mi-octobre** pour la prochaine saison de marées. |

### Dans les 60 jours — dates déjà codées, aucune action requise

Les sources suivantes ont des événements dans la fenêtre, avec leurs dates correctement codées :

- **`bison-fute`** : samedi 15 août (`rouge` retours, demain) + vendredi 28 août (`rouge` retours) — codés dans `JOURS_2026`. TODO 2027 : à renseigner début 2027, hors fenêtre.
- **`allocation-rentree-scolaire`** : 19 août 2026 (dans 5 jours) — date figée dans le source.
- **`rentree-scolaire`** : 1er sept 2026 (dans 18 jours).
- **`braderie-lille`** : 5-6 sept 2026 (dans 22 jours).
- **`grandes-marees`** : 11-13 sept (dans 28 jours), 27 oct (hors fenêtre 60 j) — périodes 2026 codées.
- **`journees-patrimoine`** : 19-20 sept 2026 (dans 36 jours).
- **`fete-science`** : 2-12 oct 2026 (dans 49 jours).
- **`semaine-bleue`** : 5-11 oct 2026 (dans 52 jours).
- **`nobel-prix`** : 5-12 oct 2026 (dans 52 jours).
- **`echeances-fiscales`** : TF online 20/10 (dans 67 jours, légèrement hors fenêtre mais proche). TODO 2027 : à renseigner début 2027.
- **`eclipse-solaire`** : 12/08 hier — source a dû passer `active`. Prochaine entrée : 2027-08-02 (hors 60 j).

### Au-delà de 60 jours — rappel annexe

`echeances-fiscales` TF 15 oct / THRS 15 déc, `bison-fute` 2027, `echeances-fiscales` PAS 2027, ISS Next Fest 19-26 oct, Hellfest 27 juin 2027, Japan Expo 8-11 juil 2027, Festival du Livre Paris 16-18 avr 2027.

---

## Slugs orphelins (tâche c)

**1 orphelin confirmé : `communaute`**

Ce slug est utilisé par la source `chat-perdu` (`type: community`, categories = `['communaute']`) mais **n'est défini dans aucun groupe** de `server/categories.js`. En conséquence, la carte `chat-perdu` s'affiche avec le libellé brut `communaute` au lieu d'un label localisé dans le kiosque et le filtrage par catégorie.

Tous les autres slugs de la liste `category_slugs` (146 entrées) ont été croisés avec les groupes de `server/categories.js` : ils y sont présents (directement dans un groupe ou dans SPECIAL/ACCENTS).

**Action suggérée (décision Hugo)** : ajouter `communaute` à un groupe approprié (ex. `'vie-locale'`) ou créer un groupe `'communaute'` dédié si d'autres cartes communautaires sont prévues.

---

## Cohérence schéma (tâche e)

`schema_check.ok = true` — 58 colonnes attendues, 0 manquante, 0 type_mismatch. **RAS.**

---

## Vitalité PanneauPocket curée (tâche f)

Le script retourne `panneaupocket_vitality: []` — aucune entrée émise pour les sources broadcast non-linked. Les 19 cartes curées (18 vague L + `arrosage-canal-gap`) sont toutes enabled et leur `checked_at` dans `stale_states` confirme une activité récente (la plus ancienne : `securite-gendarmerie-bayeux` au 24/07, soit 21 jours). Aucune n'atteint le seuil de 90 jours depuis `last_activated_at`.

**Limite de méthode à garder en tête** : `last_activated_at` ne reflète que les panneaux *alertables* (filtre thématique). Un panneau hors-thème ou cosmétique ne génère aucun événement ; la source peut sembler vivante alors que l'entité publie peu de contenu pertinent. Confirmation possible uniquement par consultation manuelle de l'app PanneauPocket.

Cartes à surveiller en priorité (famille gendarmerie, historiquement ~85 % de dormance) : `securite-gendarmerie-albi` (checked_at 31/07), `securite-gendarmerie-bayeux` (24/07), `securite-gendarmerie-essarts` (12/08). Aucune ne dépasse 90 jours pour l'instant.

---

## Combos orphelins & stabilité des ids `?panneau=` (tâche g)

**26 combos orphelins** dans `source_param_states` sans abonnement correspondant. Échantillon représentatif :

- `vigilance-meteo` × 13 départements (31, 33, 35, 38, 44, 67, 74, 75, 83, 24, 16, 10, 69, 13) — reliquat de tests de charge ou d'abonnements annulés. États principalement `active`, checked_at mi-juillet 2026.
- `ma-collectivite` × 5 URL (Oze, Valserres, AMR-05, Veynes, La Bâtie-Vieille) — tests terrain de la vague PanneauPocket.
- `iss-passages` × 1 (`gap`, état `active`, checked_at 23/07).
- `rappel-conso` × 2 catégories (bébés-enfants, alimentation) — états `active`.
- `risque-secheresse` × 4 départements (06, 14, 16, 53) — états `active`.

**Décision Hugo requise** pour toute purge (DELETE interdit ici). Le volume (26) est gérable. Les états `active` sur des combos orphelins sont des reliquats de session, pas des alertes en cours.

**Stabilité des ids `?panneau=`** : point de vigilance ouvert documenté dans `server/sources/ma-collectivite.js`. Si PanneauPocket régénère les ids à l'édition d'un panneau, une modification apparaît comme « nouveau ». Ce mécanisme ne peut être mesuré sans appel réseau (interdit la nuit). Aucune alarme, vigilance maintenue.

---

## Collisions d'ordre d'affichage

11 collisions dans la zone `display_order` 40-59 (création vague juillet — ordres non ré-échelonnés lors des ajouts). Purement cosmétique. Aucune urgence.

<details>
<summary>Détail des collisions</summary>

| Ordre | N | Sources |
|-------|---|---------|
| 40 | 2 | doomname, statut-github |
| 42 | 2 | statut-npm, statut-openai |
| 43 | 2 | statut-discord, statut-vercel |
| 50 | 2 | changement-heure, statut-twitch |
| 51 | 3 | black-friday, soldes, statut-zoom |
| 52 | 2 | perseides, statut-canva |
| 53 | 2 | beaujolais-nouveau, statut-dropbox |
| 54 | 2 | soldes-steam, statut-slack |
| 55 | 2 | aurores-france, cert-fr-alertes |
| 56 | 3 | eclipse-solaire, geminides, nuits-des-etoiles |
| 59 | 2 | echeances-fiscales, journees-patrimoine |

</details>

---

## Decks suspendus

Aucun deck suspendu (`suspended_decks: []`). RAS.
