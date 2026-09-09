# Rapport de veille — 2026-08-27

Généré par Robot 1 (lecture seule) · 267 sources enabled · 36 combinaisons paramétrées

---

## Résumé (5 points saillants)

1. **Slug orphelin `communaute`** : utilisé par `chat-perdu` et `chien-perdu` en base, absent de `server/categories.js` — ces cartes s'affichent avec le slug brut plutôt qu'un libellé (correction simple).
2. **`lancement-spatial` en échec persistant** : 66 échecs sur 7 jours, timeout API Launch Library — l'API tierce semble instable ou dégradée de façon continue (double signal : aussi dans `never_active_90d`).
3. **Rentrée scolaire dans 5 jours** (1er sept) et **Journées du patrimoine** dans ~23 jours (19-20 sept) — sources configurées et prêtes, aucune action requise, simple rappel de vigilance.
4. **Collisions `display_order`** : 11 collisions dans la plage 40–59, cosmétique.
5. **26 combos orphelins** dans `source_param_states` — reliquats normaux, purge à décision humaine.

---

## Cohérence schéma

`schema_check.ok = true` — 58 colonnes attendues, 0 manquante, 0 type incorrect. **RAS.**

---

## Sources en échec (`failing_sources`)

### Cause connue — attendue

| Source | Échecs/7j | Message |
|--------|-----------|---------|
| `sncf-perturbations` | 131 | `SNCF_API_KEY absente de l'environnement` |

Situation documentée dans l'état du projet. Aucune action code requise ; la clé est à configurer sur Railway quand Hugo la détiendra.

### À surveiller — API tierce instable

| Source | Échecs/7j | Dernier échec |
|--------|-----------|---------------|
| `lancement-spatial` | 66 | 2026-08-26 22:01 UTC |

Message constant : `Timeout API Launch Library (>10000 ms)`. 66 échecs sur 7 jours = l'API répond systématiquement trop lentement ou est en panne partielle. La source est également dans `never_active_90d` (jamais activée depuis sa création le 21/07). Double signal : soit l'API est dégradée en continu depuis juillet, soit le timeout de 10 s est trop court pour cette API. À noter, pas d'alarme urgente — aucun abonné n'est floué, la source reste `inactive`.

### Épisode transitoire — bruit réseau

Les sources suivantes présentent 2–3 échecs, tous groupés autour du **2026-08-26 ~12:02 UTC** : `statut-gandi`, `statut-grafana`, `statut-twitch`, `statut-canva`, `statut-flyio`, `statut-proton`, `statut-pypi`, `statut-scaleway`, `statut-vimeo`. Même type d'erreur (timeout), même heure, sources indépendantes → épisode de latence réseau Railway, non un problème des APIs cibles. Seuil ≥ 2 atteint mécaniquement. **Pas d'alarme.**

---

## États figés (`stale_states`)

Conformément au caveat du script : `checked_at` n'est rafraîchi qu'en écriture. Une source ou combinaison restée `inactive` sans transition garde un `checked_at` ancien — c'est **normal**. La quasi-totalité des stales sont des sources inactives saisonnières.

Les quelques combinaisons en état `active` stale (vigilance-meteo dept 31/33/35/…, risque-secheresse, rappel-conso) figurent aussi dans `orphan_param_states` — ce sont des abonnements sans abonné actif, qui ne seront jamais recalculés. Pas de problème.

---

## Jamais actives depuis 90 jours (`never_active_90d`)

Liste de ~150 entrées, grande majorité **normale** :

- Saisonnières : `beaujolais-nouveau`, `black-friday`, `changement-heure`, `soldes-steam`, `geminides`, `treve-hivernale`, `saint-nicolas`, `prime-noel`, `cheque-energie`, `loi-montagne`, `saints-de-glace`, `carnavals`, `ouverture-peche`, `fete-des-lumieres`, etc. — aucune saison en cours.
- Récemment ajoutées encore sans abonné ou sans événement : `chat-perdu`, `chien-perdu`, `tache-echeance-glissante` (type `user-task`, logique propre).
- Cartes config vide non curationnées : `billetterie-concerts`, `courses-mythiques`, `ouverture-ventes-sncf`, `tour-de-france-passage`.

**Signal notable** : `lancement-spatial` est ici aussi (cf. section « En échec »). Double signal cohérent.

**`cyclones-outremer`** est dans `never_active_90d` (hors saison cyclonique en Atlantique, actuellement en pic de saison pour les Antilles/Guyane). Ce n'est pas forcément normal si la saison est active — mais le contrôle ne peut pas requeêter l'API DPVigilance (interdit). À noter comme point de vigilance humain : si des cyclones frappent les Antilles et que la source reste silencieuse, vérifier en journée.

---

## Collisions `display_order`

11 collisions dans la plage 40–59 (sources ajoutées en vagues successives sans renumérotation). Cosmétique uniquement — le tri d'affichage est stable côté tri applicatif. Voici les plus notables (triple collision) :

- `display_order=51` : `black-friday`, `soldes`, `statut-zoom` (3 sources)
- `display_order=56` : `eclipse-solaire`, `geminides`, `nuits-des-etoiles` (3 sources)

Proposition de rééchelonnement à décider par Hugo, sans urgence.

---

## TODO calendaires ≤ 60 jours (jusqu'au 26 octobre 2026)

### Événements imminents (source active bientôt ou actif maintenant)

| Source | Fichier | Échéance | Statut |
|--------|---------|----------|--------|
| `bison-fute` | `server/sources/bison-fute.js` | 28 août 2026 (demain) | Dernier jour rouge 2026 (vendredi retours) — source active jusqu'au 28/08, puis dormante jusqu'à 2027. |
| `rentree-scolaire` | `server/sources/rentree-scolaire.js` | 1er septembre 2026 | Annonce déjà configurée, prête à s'activer dans 5 jours. |
| `journees-patrimoine` | `server/sources/journees-patrimoine.js` | ~19-20 septembre 2026 | Calculé dynamiquement (3e week-end de sept.), aucune action requise. |
| `grandes-marees` | `server/sources/grandes-marees.js` | 11–13 septembre 2026 | Prochaine grande marée (coeff 102), configurée. |
| `fete-science` | `server/sources/fete-science.js` | 2–12 octobre 2026 | Édition 2026 vérifiée le 23/07/2026. TODO 2027 à faire avant le 30/09/2027. |
| `semaine-bleue` | `server/sources/semaine-bleue.js` | 5–11 octobre 2026 | Dates 2026 confirmées. TODO 2027 à faire à l'annonce sur semaine-bleue.org. |
| `nobel-prix` | `server/sources/nobel-prix.js` | 5–12 octobre 2026 | Semaine Nobel 2026 configurée. TODO 2027 depuis nobelprize.org. |
| `echeances-fiscales` | `server/sources/echeances-fiscales.js` | TF : 15–20 octobre 2026 | Taxe foncière dans ~50 jours. THRS décembre hors fenêtre. |

### Renouvellement requis prochainement (juste hors fenêtre — annexe)

| Source | Fichier | Échéance | Note |
|--------|---------|----------|------|
| `grandes-marees` | `server/sources/grandes-marees.js` | Fin oct. 2026 | Dernier coeff ≥ 100 de 2026 : 27 oct. (61 jours). **TODO 2027** : transcrire les périodes depuis maree.info avant fin octobre, sinon la source sera dormante tout 2027. |
| `bison-fute` | `server/sources/bison-fute.js` | Début 2027 | **TODO début 2027** : remplacer `JOURS_2026` par le calendrier officiel 2027. |
| `echeances-fiscales` | `server/sources/echeances-fiscales.js` | Début 2027 | **TODO 2027** : dates PAS encore annoncées à l'exploration (19/07/2026). Ajouter dès publication DGFiP. |

---

## Slugs orphelins (tâche c)

**Un slug orphelin détecté** : `communaute`

Présent dans `category_slugs` (donc utilisé par au moins une source en base) mais **absent de la taxonomie fermée** définie dans `server/categories.js` (fichier `GROUPS`). Les sources concernées sont `chat-perdu` et `chien-perdu` (type `community`, catégorie `communaute`).

Conséquence : `LBACat.label('communaute')` retourne `'communaute'` (slug brut), faute d'entrée dans `CATEGORIES`. Le libellé affiché dans le filtre catégories, les cards, etc. sera le slug nu.

**Correction suggérée (non exécutée)** : ajouter `'communaute'` dans le groupe `'animaux'` (ou créer un groupe `'communaute'`) dans `server/categories.js`, avec le label `'Communauté'`.

---

## Vitalité des cartes PanneauPocket curées (tâche f)

**20 sources** identifiées via `require('./lib/panneaupocket-veille')` + `makeCurated`/`createBroadcastSource` (19 curées vague L + `arrosage-canal-gap`).

La section `panneaupocket_vitality` du JSON est **vide (`[]`)**, ce qui indique qu'aucune carte curée ne satisfait le critère d'alerte (`last_activated_at` NULL ou > 90 jours) selon le proxy disponible en base.

⚠️ **Limite de méthode à rappeler** : `last_activated_at` sous-estime la vitalité réelle (seuls les panneaux *alertables* selon le filtre thématique mettent à jour ce champ — un panneau hors-thème ou sans modification de fond ne déclenche rien). La date du panneau le plus récent sur la page PanneauPocket n'est pas dérivable sans fetch réseau (interdit la nuit). **Le proxy disponible dit « RAS » ; une confirmation humaine via l'appli PanneauPocket reste la seule vérification fiable.**

Aucune carte curée ne déclenche de recommandation de désactivation sur la base des données en base.

---

## Combos orphelins & stabilité des ids `?panneau=` (tâche g)

### Combos orphelins

**26 lignes** `source_param_states` sans abonnement correspondant. Exemples tirés du sample :

- `vigilance-meteo` × 12 départements (31, 33, 35, 38, 44, 67, 74, 75, 83, 24, 16, 10, 69, 13)
- `risque-secheresse` × 4 départements (06, 14, 16, 53)
- `rappel-conso` × 2 catégories
- `iss-passages` × Gap
- `ma-collectivite` × 5 URLs (Oze, Valserres, AMR-05, Veynes, La Bâtie-Vieille)

Ce sont des reliquats de désabonnements (testeurs, comptes de développement). **Purge à décision humaine uniquement** — jamais de DELETE automatique.

### Stabilité des ids `?panneau=`

Point de vigilance ouvert documenté en tête de `server/sources/ma-collectivite.js` : si PanneauPocket régénère les ids de panneau à l'édition, une modification apparaîtrait comme « nouveau » panneau au lieu d'une mise à jour. Ce risque ne peut être mesuré sans fetch réseau (interdit). **Signalé comme point de vigilance ouvert, sans alarme.**

---

## BROUILLON — à valider par Hugo avant toute exécution

### Fix slug `communaute` (non urgent, cosmétique)

```js
// Dans server/categories.js, ajouter 'communaute' dans le groupe animaux
// (ou créer un groupe dédié) :

'animaux': ['animaux', ..., 'communaute'],

// ET ajouter dans SPECIAL si le libellé auto ne convient pas :
'communaute': 'Communauté',
```

**Ce brouillon n'est pas exécuté par Robot 1. À valider et appliquer par Hugo.**
