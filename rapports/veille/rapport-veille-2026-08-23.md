# Rapport de veille — 2026-08-23

_Généré par Robot 1 (lecture seule) · 267 sources enabled · 36 combinaisons paramétrées_

---

## Résumé

1. **`lancement-spatial` — 57 échecs sur 7 jours** : l'API Launch Library timeout quasi-systématiquement. Signal réel, à investiguer.
2. **Vitalité PanneauPocket curée indisponible** : le script `veille-readonly.js` absorbe silencieusement une erreur PG (`jsonb_array_length` appliqué à un JSONB-objet) → la section `panneaupocket_vitality` retourne `[]`. Bogue du script (cf. section dédiée).
3. **Slug orphelin `communaute`** : utilisé en base par `chat-perdu` et `chien-perdu`, absent de la taxonomie `server/categories.js` → libellé brut affiché dans l'UI.
4. `sncf-perturbations` (130 échecs) et `leboncoin-livraison` : états connus, attendus, rien à signaler.
5. Schéma cohérent (`schema_check.ok = true`). 11 collisions d'ordre cosmétiques. Pas de TODO calendaire urgent (≤ 60 j) non configuré.

---

## Sources en échec

### 🔴 `lancement-spatial` — 57 échecs, signal réel

`"Timeout API Launch Library (>10000 ms)"` · dernier échec : 2026-08-23T03:01 (ce matin).

57 échecs sur 7 jours = en quasi-échec permanent. L'API communautaire [Launch Library](https://ll.thespacedevs.com/) semble instable ou avoir changé de comportement. À confirmer manuellement (hors périmètre Robot 1). Si la situation persiste : envisager d'augmenter le timeout, ou de basculer sur l'endpoint de secours si documenté dans la source.

### 🟡 `ecowatt` — 4 échecs (seuil atteint)

`"Timeout auth RTE (>10s)"` · dernier échec : 2026-08-19 (4 jours sans incident depuis). Probablement transitoire. À surveiller au prochain run ; si aucun nouvel échec, RAS.

### 🟡 `statut-twitch` — 2 échecs (au seuil)

`"Timeout (https://status.twitch.tv/api/v2/status.json, >10000 ms)"` · dernier échec : 2026-08-20. Transitoire probable.

### ✅ `sncf-perturbations` — 130 échecs, ATTENDU

`"SNCF_API_KEY absente de l'environnement"` — documenté dans l'état projet (points en suspens). Rien à faire côté code ; la clé est à configurer dans Railway quand disponible.

---

## États figés (stale_states)

Bruit attendu dans l'ensemble : le `checked_at` n'est rafraîchi que sur écriture (`still-inactive` ne rafraîchit pas, étape B non déployée). Les ~130 entrées `inactive` en stale sont normales.

Seule attention : 9 combinaisons `vigilance-meteo` apparaissent en `state: active` avec `checked_at` mi-juillet. Elles sont **toutes présentes dans `orphan_param_states`** (désabonnements passés) — leur état figé est donc normal, il n'y a aucun abonné actif derrière.

---

## Jamais actives (90 jours)

Large liste normale : sources saisonnières (beaujolais, changement d'heure, black friday, geminides, carnavals, saint-nicolas…), sources récemment ajoutées (vague juillet/août), sources paramétrées sans usage (domaine-disponibilite, crypto-seuil, veille-emploi…). Rien d'anormal.

`doomname` (externe, jamais actif) : normal, dépend des conditions chez DoomName.

---

## Collisions d'ordre d'affichage

11 collisions cosmétiques. Exemples : `doomname/statut-github` @ 40, `black-friday/soldes/statut-zoom` @ 51, `eclipse-solaire/geminides/nuits-des-etoiles` @ 56. Sans impact fonctionnel ; un ré-échelonnement peut être fait au prochain fil si jugé utile.

---

## TODO calendaires (≤ 60 jours)

Toutes les sources avec des événements dans les 60 jours ont leurs données configurées pour 2026. Pas de mise à jour urgente.

| Source | Prochaine échéance | Statut |
|--------|-------------------|--------|
| `grandes-marees` | 11-13 sept (19 j) · 27 oct | ✅ configurée 2026 |
| `braderie-lille` | 5-6 sept (13 j) | ✅ configurée 2026 |
| `journees-patrimoine` | 19-20 sept (27 j) | ✅ configurée 2026 |
| `fete-science` | 2-12 oct (40 j) | ✅ configurée 2026 |
| `semaine-bleue` | 5-11 oct (43 j) | ✅ configurée 2026 |
| `nobel-prix` | 5-12 oct (43 j) | ✅ configurée 2026 |
| `grands-rendez-vous-sportifs` | Arc de Triomphe 4 oct (42 j) | ✅ configurée 2026 |
| `semaine-du-gout` | 12-18 oct (50 j) | ✅ configurée 2026 |
| `echeances-fiscales` | TF 15/20 oct (53/58 j) | ✅ configurée 2026 |

**Annexe (> 60 jours, sans alarme)** : `bison-fute` TODO 2027, `allocation-rentree-scolaire` TODO 2027, `rentree-scolaire` TODO 2027, `grandes-causes` TODO Sidaction/Pièces Jaunes 2027, `grandes-marees` TODO 2027, `rdv-gaming` TODO 2027.

---

## Slug orphelin

**`communaute`** — présent en base (sources `chat-perdu` et `chien-perdu` de type `community`) mais **absent** de la taxonomie `server/categories.js`. Ces cartes s'afficheront avec le slug brut `communaute` en guise de libellé de catégorie au lieu d'un label lisible.

Correction : ajouter `'communaute'` dans le groupe pertinent de `server/categories.js` (ex. groupe `'vie-locale'` ou un nouveau groupe `'communaute'`), avec un `SPECIAL` si le label doit être différent du slug capitalisé.

---

## Cohérence schéma

`schema_check.ok = true` — 58 colonnes attendues, 0 manquante, 0 type mismatch. **RAS.**

---

## Vitalité PanneauPocket curée

### ⚠️ Données de vitalité indisponibles ce run — bogue script

La section `panneaupocket_vitality` retourne `[]` non pas parce que toutes les curées sont saines, mais parce que la requête SQL échoue silencieusement :

```sql
CASE WHEN ss.ref IS NULL THEN NULL
     ELSE jsonb_array_length(ss.ref) END AS ref_panneau_count
```

`jsonb_array_length()` lève une erreur PG lorsque `ss.ref` est un **objet JSONB** (pas un tableau) — cas de plusieurs sources non-PanneauPocket qui stockent `{"seenConfirmed": [...], "alerted": [...], "corrected": [...]}` (ex. `ondes-gravitationnelles`). Le `try/catch` absorbe l'erreur et laisse la valeur par défaut `[]`.

**Correction suggérée (à valider par Hugo, jamais appliquée par Robot 1)** :
```sql
CASE WHEN ss.ref IS NULL THEN NULL
     WHEN jsonb_typeof(ss.ref) = 'array' THEN jsonb_array_length(ss.ref)
     ELSE NULL END AS ref_panneau_count
```

### Jeu curé identifié (19 sources `makeCurated`/`createBroadcastSource`)

Via grep `require('./lib/panneaupocket-veille')`, hors `panneaupocket.js` et `ma-collectivite.js` :

`arrosage-canal-gap`, `cantine-a2m2v`, `dechets-campagne-caux`, `dechets-la-saucelle`, `dechets-saulieu`, `eau-charles-chaigneau`, `eau-coteaux-lizon`, `eau-isle-dronne`, `eau-provence-verte`, `eau-puisaye-forterre`, `eau-regie-metz`, `local-agly-fenouilledes`, `local-buech-devoluy`, `local-chablis`, `local-chabris-bazelle`, `securite-gendarmerie-albi`, `securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts`, `agenda-luc-en-diois`.

Toutes apparaissent dans `stale_states` avec `state: inactive` et des `checked_at` récents (entre fin juillet et 22 août) — elles sont régulièrement pollées. L'état inactif signifie qu'aucun panneau alertable n'a été détecté depuis leur création. Sans données `last_activated_at` (bogue script), il est impossible de distinguer "entité vivante mais hors-filtre" de "entité silencieuse". 

**Rappel de la limite de méthode** : la base ne stocke aucune date de publication de panneau ; `last_activated_at` n'est mis à jour qu'en cas de panneau nouveau/modifié **alertable** (dans le filtre thématique). Une entité qui publie mais dont tous les panneaux passent hors-filtre resterait indéfiniment invisible à ce proxy. Confirmer la vitalité de chaque entité nécessite un humain qui ouvre l'appli PanneauPocket.

**Priorité de vérification manuelle** (famille gendarmerie, massivement dormante ~85 % selon l'état projet) : `securite-gendarmerie-albi`, `securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts`.

---

## Combos orphelins & stabilité des ids `?panneau=`

**Combos orphelins** : 26 entrées `source_param_states` sans abonnement actif derrière. Sources concernées : `vigilance-meteo` (12), `risque-secheresse` (4), `ma-collectivite` (6), `iss-passages` (1), `rappel-conso` (2), `hausse-tarif-streaming` (1). Reliquats de désabonnements — normal. Purge = décision humaine.

**Stabilité des ids `?panneau=`** : point de vigilance ouvert (documenté en tête de `server/sources/ma-collectivite.js`). Si PanneauPocket régénère les ids à l'édition d'un panneau, une modification apparaîtrait comme « nouveau ». Non mesurable sans fetch réseau (interdit la nuit). À garder en tête.

---

## BROUILLON — À valider par Hugo avant toute exécution

### Fix `panneaupocket_vitality` dans `scripts/veille-readonly.js`

Non urgente (le reste du script fonctionne), mais à corriger pour que les prochains runs disposent de données de vitalité.

Dans `Q_PP_VITALITY` (vers la ligne 187), remplacer :
```sql
         CASE WHEN ss.ref IS NULL THEN NULL
              ELSE jsonb_array_length(ss.ref) END           AS ref_panneau_count,
```
par :
```sql
         CASE WHEN ss.ref IS NULL OR jsonb_typeof(ss.ref) <> 'array' THEN NULL
              ELSE jsonb_array_length(ss.ref) END           AS ref_panneau_count,
```

### Ajout de `communaute` à la taxonomie `server/categories.js`

Ajouter dans le groupe `'animaux'` (ou créer un groupe `'communaute'`) le slug `'communaute'`, et si le label doit être "Communauté" (accent), l'ajouter à l'objet `SPECIAL` :
```js
'communaute': 'Communauté',
```
Puis l'inclure dans le tableau d'un groupe existant (ex. `'vie-locale'`) ou dans un nouveau groupe.
