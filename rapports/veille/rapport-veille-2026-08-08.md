# Rapport de veille — 2026-08-08

> Généré automatiquement par Robot 1 (LECTURE SEULE). Aucune modification de code ni de base n'a été effectuée.
> État de base : 266 sources enabled, 35 combinaisons paramétrées actives.

---

## Résumé

1. **Éclipse solaire dans 4 jours (12/08)** — source bien configurée, aucune action requise ; signal attendu.
2. **4 sources INSEE BDM en ECONNRESET** depuis le 04/08 (indice-reference-loyers, inflation-insee, ipc-alimentaire, chomage-stats) — instabilité réseau côté INSEE, sources trimestrielles/mensuelles peu urgentes.
3. **risque-secheresse** : 30 échecs (404 VigiEau), dernier le 05/08 — semble résolu par le commit récent « Fix risque-secheresse 404 nocturne ».
4. **lancement-spatial** : 53 timeouts récurrents — API Launch Library instable, fragile assumé.
5. **Slug orphelin `communaute`** : utilisé en base (carte chat-perdu) mais absent de la taxonomie ; la carte s'affiche avec le slug brut.
6. **panneaupocket_vitality vide** — section retournée vide par le script ; cause à investiguer manuellement.

---

## Sources en échec

### sncf-perturbations (132 échecs)
**Cause : `SNCF_API_KEY` absente de Railway.** Normal et attendu — documenté dans l'état projet comme variable « à configurer ». Aucune action code requise. Décision produit Hugo.

### lancement-spatial (53 échecs)
**Cause : Timeout API Launch Library (>10 000 ms).** Récurrent. L'état projet ne liste pas cette source parmi les FRAGILES déclarées mais le comportement est cohérent avec une API communautaire sans SLA. À surveiller : si les timeouts persistent plusieurs semaines supplémentaires, envisager de relever le TTL ou d'ajouter un repli. Aucune action urgente.

### risque-secheresse (30 échecs, dernier le 05/08 07:31)
**Cause : HTTP 404 VigiEau.** Le commit le plus récent du dépôt est intitulé « Fix risque-secheresse 404 nocturne + unicite deck_reports » (8497215). Les échecs se sont arrêtés le 05/08, soit avant la date du rapport. **Le fix semble avoir pris effet.** Mention à confirmer après un cycle complet de 24h post-déploiement.

### Famille INSEE BDM (4 sources, 24–26 échecs chacune, dernier le 04/08)
- `indice-reference-loyers` — ECONNRESET sur bdm.insee.fr (série 001515333)
- `inflation-insee` — ECONNRESET (série 011814133)
- `ipc-alimentaire` — ECONNRESET (série 011814676)
- `chomage-stats` — ECONNRESET (série 001688527)

**Cause probable : instabilité réseau côté serveurs INSEE BDM**, vraisemblablement un épisode ponctuel le 04/08 (les 4 sources échouent au même moment). Ces sources sont trimestrielles ou mensuelles — la donnée ne change pas à la journée. Pas d'urgence ; à surveiller pour voir si le poller reprend normalement lors du prochain cycle actif.

**`prix-logements-anciens` (25 échecs, HTTP 500, dernier le 02/08)** : même famille INSEE, erreur 500 côté serveur INSEE. Probablement la même vague d'instabilité. Non urgent.

### ecowatt (16 échecs, HTTP 429, dernier le 05/08)
**Cause : rate-limit RTE (HTTP 429).** Transitoire, attendu. Le poller log un message explicite « appel trop fréquent, prochain cycle ». Aucune action.

---

## Évenements imminents (≤ 7 jours) — TODO calendaires

| Événement | Date | État |
|---|---|---|
| **Bison Futé — chassé-croisé** | **08/08 (aujourd'hui)** | Config 2026 OK |
| Nuits des étoiles (dernier jour) | 09/08 | Config 2026 OK |
| **Éclipse solaire partielle** | **12/08** | Config 2026 OK |
| Grandes marées (coeff 102) | 13–15/08 | Config 2026 OK |
| Bison Futé — retours | 15/08 | Config 2026 OK |

### TODO calendaires dans 8–60 jours

| Événement | Échéance | Renouvellement requis |
|---|---|---|
| Allocation rentrée scolaire (Réunion/Mayotte) | 05/08 — déjà passé | — |
| Allocation rentrée scolaire (métropole) | 19/08 | — |
| Bison Futé — retours | 28/08 | — |
| Rock en Seine | 26–30/08 | — |
| Braderie de Lille | 05–06/09 | — |
| Rentrée scolaire | 01/09 | — |
| Fête de la science | 02–12/10 | — |
| Semaine Bleue | 05–11/10 | — |

Toutes les configurations 2026 sont en place. Les TODO 2027 (bison-fute, echeances-fiscales, nuits-des-etoiles, grandes-marees, braderie-lille, rentree-scolaire, fete-science, semaine-bleue) sont hors fenêtre 60 jours ; aucune urgence aujourd'hui.

**Attention particulière — grandes-marees** : le commentaire en tête du fichier rappelle que « sans mise à jour, la source reste dormante après octobre 2026 ». La période du 27/10 est la dernière entrée 2026. Le renouvellement 2027 devra être fait avant fin octobre 2026 ; hors fenêtre 60j aujourd'hui, mais à noter.

---

## Slug orphelin

**`communaute`** est présent dans `category_slugs` (utilisé en base par la source `chat-perdu`, type `community`, display_order 500) mais **absent de `server/categories.js` (GROUPS)**. Résultat : la carte s'affiche avec le libellé brut `communaute` au lieu d'un libellé localisé comme « Communauté ».

Ce slug devrait être ajouté à la taxonomie. Proposition (non exécutée, décision Hugo) :
```
// À ajouter dans GROUPS, par exemple dans 'vie-locale' ou dans un groupe dédié :
'communaute': ['communaute', ...]
// Et dans SPECIAL si l'on veut un libellé exact :
'communaute': 'Communauté'
```

---

## Schéma base de données

`schema_check.ok === true` — 56 colonnes attendues, aucune manquante, aucun type incorrect. **RAS.**

---

## Vitalité PanneauPocket curées (Vague L)

La section `panneaupocket_vitality` est **retournée vide** par le script (`[]`). Deux causes possibles :

1. Les 18 cartes curées de la vague L sont identifiées comme `type = 'linked'` dans la base, et le script les filtre (sa clause `WHERE type NOT IN ('linked', ...)`) — auquel cas la vitalité ne peut être mesurée par cet outil. À vérifier : `SELECT id, type FROM sources WHERE display_order BETWEEN 443 AND 460;`
2. Le script n'arrive pas à croiser les sources `require('./lib/panneaupocket-veille')` + `makeCurated` avec les données de la base (faux négatif de détection).

**Conséquence** : le contrôle de vitalité des cartes curées (« panneau depuis > 90 jours → candidate à désactivation ») n'a **pas pu être effectué ce cycle**. La décision de désactivation reste de toute façon humaine ; aucune urgence immédiate signalée. À investiguer côté Hugo pour corriger le script ou la requête.

**Point de vigilance permanent (inchangé)** : la stabilité des ids `?panneau=` à l'édition d'un panneau PanneauPocket ne peut être vérifiée sans fetch réseau (interdit la nuit). Une modification de panneau peut apparaître comme « nouveau ». Consigné en tête de `server/sources/ma-collectivite.js`.

---

## Combos orphelins & ids `?panneau=`

**26 lignes orphelines** dans `source_param_states` (abonnements désabonnés dont l'état reste en base). Exemples : `ma-collectivite` sur 5 URLs d'Oze/Valserres/AMR/Veynes/La-Bâtie-Vieille, `iss-passages` (ville=gap — ancienne notation string avant migration vers coords), `rappel-conso` (2 catégories), `risque-secheresse` (4 dépts), `vigilance-meteo` (13 dépts). Ces lignes sont des reliquats de tests/développement. Aucune urgence ; la purge est une décision humaine, ne jamais exécuter de DELETE.

**Stabilité ids `?panneau=`** : point de vigilance ouvert, non mesurable sans fetch réseau.

---

## Collisions d'ordre d'affichage (cosmétique)

11 collisions détectées aux ordres 40, 42, 43, 50, 51, 52, 53, 54, 55, 56, 59. Ces chevauchements résultent de l'ajout de nouvelles sources dans des plages occupées. Aucun impact fonctionnel ; tri secondaire par id en vigueur. Un ré-échelonnement peut être planifié sans urgence.

---

## États figés (bruit attendu)

La grande majorité des `stale_states` (checked_at > 7 jours) sont des sources en `state: inactive` — elles n'ont pas été ré-écrites car `decideTransition` retourne `still-inactive` (`write: false`). C'est le comportement normal documenté dans le caveat du script. Seules les entrées corroborées par `failing_sources` méritent attention (citées ci-dessus).

**Exceptions notées** : plusieurs combos `vigilance-meteo` avec `state: active` et `checked_at` au 14–19/07. Ces états figés en `active` correspondent à des épisodes de vigilance météo survenus début juillet, dont les abonnements ont depuis été désabonnés (ils figurent aussi dans `orphan_param_states`). Pas de faux positif en cours : le poller ne calcule plus ces combos sans abonnement actif.

---

## Sources jamais actives depuis 90 jours (sélectif)

La quasi-totalité des `never_active_90d` correspond à des sources saisonnières inactives hors de leur saison (changement-heure, beaujolais-nouveau, geminides, treve-hivernale, nuits-de-la-lecture, black-friday, saint-nicolas, carnavals…), des sources paramétrées en config vide (billetterie-concerts, courses-mythiques, ouverture-ventes-sncf…), ou des sources structurellement jamais actives (ecogaz — hors tension réseau, ecowatt — hors risque). **Tout cela est normal.**

Un seul item légèrement notable : **`lancement-spatial`** (jamais activé, en échec continu pour timeout). Si la source ne parvient jamais à se connecter, elle ne peut pas s'activer même en cas de lancement réel. Le timeout récurrent (cf. section Sources en échec) est le vrai sujet.

---

*Fin du rapport. Aucune modification de fichier source, de base de données, ni de configuration n'a été effectuée.*
