# Rapport de veille — 2026-08-25

_Généré par Robot 1 (lecture seule). Aucune modification de code, de base ou de fichier hors ce rapport._

---

## Résumé

1. **Schéma cohérent** — 58/58 colonnes présentes, aucune migration requise.
2. **4 sources en échec** : `sncf-perturbations` (clé absente, connu), `lancement-spatial` (timeout API tierce récurrent), `ecowatt` (timeout transitoire), `statut-gandi` (2 timeouts, seuil atteint tout juste).
3. **`panneaupocket_vitality` non disponible ce run** — bug silencieux dans le script (voir section dédiée) ; vitalité des cartes PP non évaluable ce soir.
4. **1 slug orphelin** : `communaute` présent en base mais absent de la taxonomie `server/categories.js`.
5. **26 combos orphelins** dans `source_param_states` — reliquats de désabonnements, purge = décision Hugo.

---

## Cohérence schéma

`schema_check.ok = true` — 58 colonnes attendues, 0 manquante, 0 type_mismatch. RAS.

---

## Sources en échec (`failing_sources`)

| Source | Échecs (7 j) | Dernier message | Analyse |
|---|---|---|---|
| `sncf-perturbations` | 131 | `SNCF_API_KEY absente de l'environnement` | **Connu et documenté.** Variable Railway non configurée. Aucune régression : la source a toujours été dans cet état. |
| `lancement-spatial` | 63 | `Timeout API Launch Library (>10000 ms)` | API Launch Library instable (timeouts fréquents documentés dans etat-projet comme FRAGILE). Comportement récurrent. À surveiller si le taux augmente. |
| `ecowatt` | 4 | `Timeout auth RTE (>10s)` | Dernier échec le 2026-08-19. Seuls 4 échecs sur 7 jours (seuil = 2 atteint, mais depuis plusieurs jours sans nouvel échec). Probablement transitoire. À confirmer au prochain run. |
| `statut-gandi` | 2 | `Timeout (status.gandi.net, >10000 ms)` | Exactement au seuil (2 échecs). Dernier échec : 2026-08-24. Timeout DNS/réseau isolé. Peu probable qu'il s'agisse d'une panne Gandi réelle. Niveau bas. |

---

## États figés (`stale_states`) — signal secondaire

Les entrées `active` stale dans `source_param_states` (vigilance-meteo ×11, iss-passages/gap, rappel-conso ×2, risque-secheresse ×4) **sont toutes présentes dans les combos orphelins** (section ci-dessous) : plus aucun abonnement actif ne les porte. `checked_at` n'est pas rafraîchi en still-inactive (caveat documenté). Bruit attendu, aucune alarme.

Les nombreuses entrées `inactive` datant du 14-15 juillet 2026 correspondent à la vague d'ajout de sources (init de `source_states` pour les nouvelles sources). Normal.

---

## Jamais actives depuis 90 jours (`never_active_90d`)

181 sources jamais passées `activated` depuis 90 jours. Base créée mi-juillet 2026 (toutes les sources ont moins de 45 jours en prod), donc la quasi-totalité est normale :

- Saisonnières muettes : `beaujolais-nouveau`, `geminides`, `black-friday`, `changement-heure`, `soldes`, `treve-hivernale`, `cheque-energie`, etc. — attendu hors saison.
- Clé absente : `sncf-perturbations` (SNCF_API_KEY), `ecowatt`/`ecogaz` (timeout RTE).
- Observation silencieuse assumée : `leboncoin-livraison` (DataDome, phase sonde).
- `doomname` (source externe) : vitalité dépend du partenaire — RAS si aucune plainte.
- `iss-passages` : FRAGILE (iss-api.fly.dev communautaire sans SLA) — normal de ne pas s'être activée si aucun passage n'a dépassé le seuil.

Rien d'anormalement muet parmi les sources cen sées s'activer souvent.

---

## Collisions `display_order`

11 groupes de collisions (dont une triple : `black-friday/soldes/statut-zoom` à l'ordre 51, et `eclipse-solaire/geminides/nuits-des-etoiles` à l'ordre 56). Cosmétique : l'ordre d'affichage est identique pour ces sources, ce qui peut produire un tri instable. Proposition : rééchelonner les ordres 40–59 (séquence actuelle saturée par l'arrivée des nouvelles sources). Pas d'urgence.

---

## TODO calendaires ≤ 60 jours (avant 2026-10-24)

Parcours de `server/sources/` — toutes les configurations des échéances suivantes sont **en place** pour 2026 :

| Échéance | Date | Fichier | État |
|---|---|---|---|
| Dernier Bison Futé rouge 2026 | 2026-08-28 | `bison-fute.js` | Configuré. TODO 2027 mentionné. |
| Braderie de Lille | 5-6 sept | `braderie-lille.js` | Configuré. TODO 2027. |
| Roch Hachana | 12 sept | `fetes-juives.js` | Configuré. |
| Yom Kippour | 21 sept | `fetes-juives.js` | Configuré. |
| Journées du Patrimoine | 19-20 sept | `journees-patrimoine.js` | Configuré (à vérifier). |
| Équinoxe d'automne | 23 sept | `fetes-laiques.js` | Configuré. |
| Semaine Bleue | 5-11 oct | `semaine-bleue.js` | Configuré. TODO 2027. |
| Fête de la Science | 2-12 oct | `fete-science.js` | Configuré. TODO 2027 (non annoncé). |
| Prix Nobel | 5-12 oct | `nobel-prix.js` | Configuré. TODO 2027. |
| Taxe Foncière (papier) | 15 oct | `echeances-fiscales.js` | Configuré. |
| Taxe Foncière (en ligne) | 20 oct | `echeances-fiscales.js` | Configuré. |

**Aucune configuration manquante** dans la fenêtre de 60 jours. Les TODO 2027 sont tous explicitement hors urgence (« à faire début 2027 »).

**Au-delà de 60 jours (annexe sans alerte)** : Taxe d'Habitation Résidences Secondaires (15/20 déc), Beaujolais Nouveau (3e jeudi nov), Black Friday (27 nov), changement d'heure (25 oct — J+61, hors fenêtre), Nuits de la Lecture (janv 2027), grande soldes (janv 2027).

---

## Slugs orphelins (tâche c)

Croisement `category_slugs` (DB) vs taxonomie fermée `server/categories.js` (GROUPS) :

**1 slug orphelin identifié : `communaute`**

Ce slug est utilisé par au moins une source en base mais n'est pas défini dans les `GROUPS` de `server/categories.js`. Conséquence : l'interface affiche `communaute` comme label brut au lieu d'un libellé localisé. Pas de carte cassée, uniquement un affichage dégradé.

> Correction proposée (à valider) : ajouter `'communaute'` dans le groupe approprié de `server/categories.js`, par exemple dans `'vie-locale'` ou `'solidarite'`, avec un accent si souhaité (`communauté`).

---

## Vitalité PanneauPocket curée (tâche f) — non disponible ce run

**La section `panneaupocket_vitality` est retournée vide (`[]`) par le script.**

Le code `Q_PP_VITALITY` contient `jsonb_array_length(ss.ref)` dans un `CASE WHEN ss.ref IS NULL THEN NULL ELSE jsonb_array_length(ss.ref) END`. Or, certaines sources (ex. `ondes-gravitationnelles`) stockent dans `ref` un **objet JSONB** `{seenConfirmed, alerted, corrected}` et non un tableau. `jsonb_array_length` appliqué à un objet lève une erreur PostgreSQL (« cannot get array length of a non-array »). Le `try/catch` avale l'erreur et retourne `[]` silencieusement.

**Conséquence** : la vitalité des 19 cartes PanneauPocket curées (arrosage-canal-gap + vague L) n'est **pas évaluable** ce run.

**Correctif proposé** (à valider par Hugo, non exécuté) :

```sql
-- Remplacer dans Q_PP_VITALITY :
CASE WHEN ss.ref IS NULL THEN NULL
     WHEN jsonb_typeof(ss.ref) = 'array' THEN jsonb_array_length(ss.ref)
     ELSE NULL END AS ref_panneau_count
```

Cela permettrait de distinguer proprement les sources à `ref` tableau (PanneauPocket) de celles à `ref` objet (ondes, veille-page, etc.) sans erreur.

---

## Combos orphelins & stabilité ids `?panneau=` (tâche g)

### Combos orphelins

**26 lignes `source_param_states`** sans abonnement actif correspondant (reliquats de désabonnements) :

- `iss-passages` : 1 combo (`ville: gap`)
- `ma-collectivite` : 5 URLs (Ozé, Valserres, AMR-05, Veynes, La Bâtie-Vieille)
- `rappel-conso` : 2 catégories (`bébés-enfants`, `alimentation`)
- `risque-secheresse` : 4 départements (06, 14, 16, 53)
- `vigilance-meteo` : 14 départements (31, 33, 35, 38, 44, 67, 74, 75, 83, 24, 16, 10, 69, 13)

Comportement normal pour des désabonnements. La purge est une **décision humaine** — aucun `DELETE` exécuté.

À noter : le combo `rappel-conso` / `categorie: bébés-enfants` contient une chaîne double-encodée (`bébés` → `bÃ©bÃ©s`), indice d'un bug d'encodage UTF-8 lors d'un abonnement passé. Pas de conséquence active (combo orphelin), mais à garder en tête si ce cas réapparaît.

### Stabilité des ids `?panneau=`

Point de vigilance ouvert (documenté en tête de `server/sources/ma-collectivite.js`) : si PanneauPocket régénère les ids de panneau à l'édition, une modification apparaîtrait comme « nouveau ». Impossible à mesurer sans fetch réseau (interdit). Aucun incident signalé. Vigilance maintenue.

---

## BROUILLON — à valider par Hugo avant toute exécution

### Fix `Q_PP_VITALITY` dans `scripts/veille-readonly.js`

**Non validé — ne pas exécuter.**

Remplacer dans la constante `Q_PP_VITALITY` (ligne ~190) :

```js
// Avant
CASE WHEN ss.ref IS NULL THEN NULL
     ELSE jsonb_array_length(ss.ref) END           AS ref_panneau_count,

// Après
CASE WHEN ss.ref IS NULL THEN NULL
     WHEN jsonb_typeof(ss.ref) = 'array' THEN jsonb_array_length(ss.ref)
     ELSE NULL END                                 AS ref_panneau_count,
```

Cela corrige l'erreur silencieuse qui vide `panneaupocket_vitality` et permet au prochain run d'évaluer réellement la vitalité des 19 cartes curées.

### Slug orphelin `communaute`

Identifier quelle(s) source(s) utilisent ce slug en base (`SELECT id, categories FROM sources WHERE 'communaute' = ANY(categories)`) puis décider du groupe dans `server/categories.js`. Pas d'urgence opérationnelle (affichage dégradé uniquement).
