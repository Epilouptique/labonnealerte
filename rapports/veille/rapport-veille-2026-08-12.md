# Rapport de veille — 2026-08-12

_Généré par Robot 1 (lecture seule). Données : `node scripts/veille-readonly.js` à 08:15 UTC._
_Périmètre : 266 sources enabled, 36 combinaisons paramétrées actives._

---

## Résumé

5 points à retenir, aucun bloquant :

1. **`lancement-spatial` en timeout récurrent** (49 échecs) — API tierce Launch Library instable, à surveiller.
2. **`bitcoin-mouvement` en timeout récent** (5 échecs depuis le 11/08) — CoinGecko, peut être transitoire.
3. **Slug orphelin `communaute`** utilisé par la source `chat-perdu` (type `community`, créée 04/08) mais absent de la taxonomie serveur → la carte s'affichera avec le slug brut.
4. **26 combos orphelins** dans `source_param_states` (reliquats de désabonnements), purge à décider.
5. **Éclipse solaire AUJOURD'HUI** (12/08/2026) — carte configurée correctement, aucune action requise.

---

## Cohérence schéma

`schema_check.ok = true` — 56 colonnes attendues, 0 manquante, 0 type incorrect. **RAS.**

---

## Sources en échec (`failing_sources`)

| Source | Échecs (7j) | Dernier message | Diagnostic |
|---|---|---|---|
| `sncf-perturbations` | 133 | `SNCF_API_KEY absente` | **Normal** — variable non configurée sur Railway, documenté. Aucune régression. |
| `lancement-spatial` | 49 | `Timeout API Launch Library (>10000 ms)` | **À surveiller** — l'API tierce est instable mais le code est probablement sain. 49 échecs sur 7 jours = quasi-continu. Aucune activation depuis la création (90+ jours), corroboré par `never_active_90d`. |
| `bitcoin-mouvement` | 5 | `Timeout CoinGecko (>10000 ms)` | **Léger, récent** — dernière erreur 11/08 20h00. 5 échecs seulement, peut être une indisponibilité passagère de CoinGecko. À surveiller lors du prochain run. |

---

## États figés (`stale_states`) — signal secondaire

La majorité des entrées stale sont des sources **inactives** dont `checked_at` n'est plus mis à jour (comportement normal avant l'étape B). Aucune ne cumule les deux signaux d'alerte (failing + stale active).

Cas particulier : plusieurs `source_param_states` de `vigilance-meteo` apparaissent avec `state: active` et `checked_at` > 28 jours. Ces 9 combinaisons (dépts 31, 33, 35, 38, 44, 67, 74, 75, 83, 24, 13…) sont **toutes présentes dans `orphan_param_states`** — plus d'abonnement actif derrière elles. L'état figé s'explique par l'abandon de l'abonnement, pas par une panne. **Pas d'alarme.**

---

## Jamais actives depuis 90 jours (`never_active_90d`)

La liste est longue (~150 entrées) et principalement normale :

- **Sources saisonnières hors saison** : `beaujolais-nouveau`, `black-friday`, `changement-heure`, `geminides`, `treve-hivernale`, `saint-nicolas`, `carnavals`, `fetes-familiales`, `ouverture-peche`, etc. → normales.
- **Sources vague juillet** (ajoutées entre le 20 et le 24/07/2026) : encore trop récentes pour avoir déclenché.
- **Sources à config vide** : `courses-mythiques`, `billetterie-concerts`, `ouverture-ventes-sncf`, `tour-de-france-passage` → attendues muettes.
- **`sncf-perturbations`** : corroboré par `failing_sources` (clé absente) → attendue.
- **`lancement-spatial`** : corroboré par `failing_sources` (timeout) → potentiellement jamais activée à cause du blocage. À surveiller.
- **`bitcoin-mouvement`** : 5 échecs récents, mais le seuil M≥7,5 BTC n'a peut-être simplement pas été franchi. Normal.
- **`tache-echeance-glissante`** (type `user-task`, `enabled=false`) → normal, activation manuelle requise.
- **`chat-perdu`** (type `community`, créée 04/08/2026) → non mentionnée dans `etat-projet.md` ; nouveau type `community`. Aucun abonné apparent, muette depuis la création. Pas d'alarme mais à documenter dans l'état du projet si c'est une source de production.

---

## Collisions d'ordre d'affichage

11 collisions de `display_order` détectées (cosmetiques) :

| Ordre | Sources en collision |
|---|---|
| 40 | `doomname`, `statut-github` |
| 42 | `statut-npm`, `statut-openai` |
| 43 | `statut-discord`, `statut-vercel` |
| 50 | `changement-heure`, `statut-twitch` |
| 51 | `black-friday`, `soldes`, `statut-zoom` |
| 52 | `perseides`, `statut-canva` |
| 53 | `beaujolais-nouveau`, `statut-dropbox` |
| 54 | `soldes-steam`, `statut-slack` |
| 55 | `aurores-france`, `cert-fr-alertes` |
| 56 | `eclipse-solaire`, `geminides`, `nuits-des-etoiles` |
| 59 | `echeances-fiscales`, `journees-patrimoine` |

Sans urgence. Un ré-échelonnement pourrait être proposé lors du prochain chantier init.sql.

---

## TODO calendaires ≤ 60 jours

Fenêtre : 12/08/2026 → 11/10/2026.

### ⚡ Imminents (< 7 jours)

| Source | Fichier | Échéance | Note |
|---|---|---|---|
| `eclipse-solaire` | `eclipse-solaire.js` | **12/08/2026 (AUJOURD'HUI)** | Éclipse partielle, config en place. Aucune action. |
| Grandes marées | `grandes-marees.js` (à vérifier) | **13-15/08/2026** | Dans 1-3 jours. Vérifier que la config couvre cette fenêtre. |
| Assomption | `fetes-chretiennes.js` | **15/08/2026** | Config présente (`{ date: '2026-08-15' }`). Aucune action. |
| Allocation rentrée scolaire | `allocation-rentree-scolaire.js` | **~19/08/2026** | Vérifier la date exacte codée en dur dans le source. |

### 📅 Dans 8-60 jours

| Source | Fichier | Échéance | Note |
|---|---|---|---|
| `festivals-musique` (Rock en Seine) | `festivals-musique.js` | **26-30/08/2026** | Config à vérifier. |
| `rentree-scolaire` | `rentree-scolaire.js` | **1er sept 2026** | Classique, config normalement en place. |
| `braderie-lille` | `braderie-lille.js` | **5-6/09/2026** | Config à vérifier. |
| `fetes-juives` | `fetes-juives.js` | **12/09 (Roch Hachana), 21/09 (Yom Kippour)** | Config présente. Aucune action. |
| `journees-patrimoine` | `journees-patrimoine.js` | **19-20/09/2026** | Config à vérifier. |
| `fetes-laiques` | `fetes-laiques.js` | **23/09 (Équinoxe automne)** | Config présente. Aucune action. |
| `fete-science` | `fete-science.js` | **2-12/10/2026** | À vérifier dans le fichier source. |
| `semaine-bleue` | `semaine-bleue.js` | **5-11/10/2026** | À vérifier. |
| `nobel-prix` | `nobel-prix.js` | **5-12/10/2026** | Documenté dans etat-projet.md. Config à vérifier. |

### 📌 Hors fenêtre 60 jours (rappel court)

- `echeances-fiscales` : Taxe foncière 15/10 (papier) / 20/10 (online) — config présente.
- `bison-fute` : **⚠️ TODO début 2027** — le calendrier 2026 est en place ; la config 2027 devra être renouvelée dès publication officielle (commentaire dans `bison-fute.js` ligne 17).
- `echeances-fiscales` : TODO 2027 (dates TF/THRS non encore publiées par DGFiP).

---

## Slugs orphelins

Taxonomie de référence : `server/categories.js` (exportée par `/api/categories`).

**1 slug orphelin identifié :**

| Slug | Présent en base | Dans la taxonomie | Source concernée |
|---|---|---|---|
| `communaute` | ✅ | ❌ | `chat-perdu` (type `community`, créée 04/08/2026) |

La carte `chat-perdu` utilise le slug `communaute`, absent de la liste fermée côté serveur. Sur le front, `LBACat.label('communaute')` retombera sur le fallback : affichage du slug brut `communaute` au lieu d'un libellé. À ajouter dans la taxonomie si la source est destinée à rester.

Aucun autre slug orphelin détecté parmi les 146 slugs en base.

---

## Vitalité des cartes PanneauPocket curées (tâche f)

**Jeu curé identifié dynamiquement** (fichiers `server/sources/*.js` qui `require('./lib/panneaupocket-veille')` avec `makeCurated` ou `createBroadcastSource`, hors `panneaupocket.js` et `ma-collectivite.js`) :

19 sources : `arrosage-canal-gap` + 18 cartes vague L (`agenda-luc-en-diois`, `cantine-a2m2v`, `dechets-campagne-caux`, `dechets-la-saucelle`, `dechets-saulieu`, `eau-charles-chaigneau`, `eau-coteaux-lizon`, `eau-isle-dronne`, `eau-provence-verte`, `eau-puisaye-forterre`, `eau-regie-metz`, `local-agly-fenouilledes`, `local-buech-devoluy`, `local-chablis`, `local-chabris-bazelle`, `securite-gendarmerie-albi`, `securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts`).

**`panneaupocket_vitality` du JSON : tableau vide** — le script n'a remonté aucune donnée de vitalité pour ces sources.

**⚠️ Limite de méthode (à rappeler) :** La base ne stocke aucune date de publication de panneau — la colonne `ref` contient uniquement des couples `[panneauId, hash]`. La « date du panneau le plus récent » n'est pas dérivable sans interroger PanneauPocket, ce qui est interdit la nuit. Le seul proxy disponible est `last_activated_at` (dernier panneau nouveau ou modifié *alertable*), qui sous-estime la vitalité (panneaux hors filtre thématique ou cosmétiques ne génèrent pas d'événement). L'absence d'entrées dans `panneaupocket_vitality` peut indiquer que toutes ces sources ont `last_activated_at = NULL` (jamais alerté) ou que le script n'a pas pu les discriminer.

**Recommandation :** Pour évaluer la vitalité réelle (notamment les 3 cartes gendarmerie, identifiées dans `etat-projet.md` comme issues d'une famille majoritairement dormante à ~85 %), une vérification humaine via l'application PanneauPocket reste nécessaire. Aucune désactivation automatique ici.

**Point de vigilance ouvert :** Stabilité des ids `?panneau=` à l'édition d'un panneau (consigné en tête de `server/sources/ma-collectivite.js`) — si PanneauPocket régénère les ids à l'édition, une modification apparaîtrait comme « nouveau panneau ». Impossible à mesurer sans fetch réseau ; à surveiller par observation des alertes réelles.

---

## Combos orphelins & ids `?panneau=`

**26 lignes orphelines** dans `source_param_states` (aucun abonnement actif derrière ces combinaisons) :

- 13 × `vigilance-meteo` (dépts 31, 33, 35, 38, 44, 67, 74, 75, 83, 24, 16, 10, 69, 13)
- 6 × `ma-collectivite` (URLs PanneauPocket — Oze, Valserres, AMR-05, Veynes, La Bâtie-Vieille + ASA Canal de Gap)
- 4 × `risque-secheresse` (dépts 06, 14, 16, 53)
- 2 × `rappel-conso` (catégories `bébés-enfants (hors alimentaire)`, `alimentation`)
- 1 × `iss-passages` (param `gap` — ancienne forme avant migration vers coordonnées)

Ces 26 lignes sont des reliquats normaux de désabonnements. La purge est une décision humaine ; aucun `DELETE` exécuté ici.

**Stabilité ids `?panneau=`** : point de vigilance documenté, non mesurable sans appel réseau. Voir ci-dessus.

---

## BROUILLON — À valider par Hugo avant toute exécution

### Correctif 1 — Slug `communaute` manquant dans la taxonomie

Ajouter `communaute` à `server/categories.js` pour que la carte `chat-perdu` s'affiche correctement dans le kiosque. Exemple de libellé : `{ slug: 'communaute', label: 'Communauté', group: 'social' }`.

**À valider** : position dans la taxonomie, libellé exact, groupe d'appartenance. Non exécuté par Robot 1.

### Correctif 2 — Purge des 26 combos orphelins

Si la base est jugée suffisamment propre pour une purge, exécuter manuellement dans psql :

```sql
-- VÉRIFIER avant d'exécuter : s'assurer que aucun abonnement n'existe pour ces combinaisons
-- Exemple pour iss-passages / ville=gap :
DELETE FROM source_param_states
WHERE source_id = 'iss-passages' AND params = '{"ville":"gap"}'::jsonb;
-- [... répéter pour chaque combo orphelin]
```

**À valider** : décision humaine, aucun DELETE exécuté ici.
