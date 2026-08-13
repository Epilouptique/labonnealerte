# Rapport de veille — 2026-08-06

> Robot 1 · LECTURE SEULE · 266 sources enabled · 35 combos paramétrés

---

## Résumé (5 lignes max)

1. **Panne durable INSEE BDM** : 5 sources économiques en ECONNRESET/HTTP 500 depuis le 2-4 août (indisponibilité serveur bdm.insee.fr, pas de code).
2. **risque-secheresse** : 34 échecs en base, dernier le 05/08 en journée — comportement attendu post-fix (cache vide au redémarrage Railway), pas de régression.
3. **PanneauPocket vitality** : script a renvoyé `[]` (exception silencieuse probable — jsonb_array_length sur ref objet, cf. section dédiée). Vitalité non mesurable ce soir.
4. **Slugs** : 1 slug orphelin (`communaute`) — source `community` utilise une catégorie absente de la taxonomie.
5. **TODO urgent** : `courses-mythiques` (config vide) à compléter début septembre à l'ouverture des inscriptions.

---

## Cohérence schéma

`schema_check.ok === true` — 56 colonnes attendues, 0 manquante, 0 type_mismatch. **RAS.**

---

## Sources en échec

### 🟡 Cause connue / attendue

| Source | Échecs | Dernier message | Diagnostic |
|--------|--------|-----------------|------------|
| `sncf-perturbations` | 133 | SNCF_API_KEY absente | Variable Railway à configurer — connue, documentée |
| `ecowatt` | 26 | HTTP 429 RTE | Rate limiting côté RTE, repli au cycle suivant — comportement normal |
| `vigicrues-departement` | 4 | Timeout API Vigicrues | Transitoire (1 incident sur 7 jours) — pas de signal |

### 🟠 À surveiller — indisponibilité INSEE BDM

5 sources frappées simultanément par ECONNRESET (2-4 août) ou HTTP 500 (2 août) :

- `indice-reference-loyers` — 36 échecs, dernier 04/08 12h34
- `inflation-insee` — 36 échecs, dernier 04/08 12h34
- `ipc-alimentaire` — 35 échecs, dernier 04/08 12h34
- `chomage-stats` — 32 échecs, dernier 04/08 12h33
- `prix-logements-anciens` — 34 échecs, dernier 02/08 15h31 (HTTP 500)

**Diagnostic** : indisponibilité simultanée sur `bdm.insee.fr` depuis le 2-4 août. Ces sources sont trimestrielles/mensuelles — aucune alerte manquée à court terme. Si la panne dure au-delà de la semaine prochaine, vérifier manuellement que bdm.insee.fr répond. Pas d'action code requise.

### 🟡 Post-fix risque-secheresse

`risque-secheresse` — 34 échecs, dernier 05/08 07h31 (404 VigiEau).

Le fix du 31/07 (commit b9828ee) gère les 404 par repli sur cache en mémoire. Les échecs enregistrés en base correspondent aux redémarrages Railway à cache vide : le premier appel déclenche un vrai 404, qui est propagé (normal — `if (!cache.byCode) throw err`). En journée courante, l'API répond ; le redémarrage du matin peut tomber sur la fenêtre de régénération VigiEau. **Pas de régression du code — comportement conforme au fix.** La source a des abonnés actifs (des combos non-orphelins existent donc le poller la teste réellement).

### 🟡 NOAA JSON invalide

- `aurores-france` — 10 échecs, dernier 02/08 09h00
- `tempete-solaire` — 8 échecs, dernier 31/07 00h02

API NOAA qui renvoie du JSON malformé ponctuellement. Connu comme source FRAGILE (documenté dans etat-projet.md). Derniers échecs datant d'il y a 4+ jours → peut-être revenu à la normale. À surveiller.

### 🟡 lancement-spatial

53 timeouts API Launch Library (>10 000 ms). API communautaire sans SLA — comportement attendu. Source documentée comme fragile.

---

## États figés en `active` (caveat stale_states)

18 combos `source_param_states` en état `active` avec `checked_at` datant de juillet.

**Tous ces combos sont également dans `orphan_param_states`** (plus d'abonnés). C'est cohérent : sans abonné, le poller ne les recalcule plus → `checked_at` ne se rafraîchit pas. Comportement normal, aucun abonné réel ne reçoit d'alerte périmée. Pas d'alarme.

Sources concernées : `vigilance-meteo` (10 combos, dépts 31/33/35/38/44/67/74/75/83/24/13), `risque-secheresse` (4 dépts), `rappel-conso` (2 catégories), `iss-passages` (Gap).

---

## Jamais actives depuis 90 jours

201 sources — majoritairement :
- Sources saisonnières hors saison (black-friday, beaujolais, geminides, fetes-juives/musulmanes, elections, changement-heure, soldes-steam…) : **normal**.
- Sources en attente de clé ou bloquées (sncf-perturbations, lancement-spatial) : **normal/connu**.
- Sources à config vide (courses-mythiques, billetterie-concerts, ouverture-ventes-sncf, tour-de-france-passage…) : **attendu**.
- Sources à événement imminent (perseides 11-13 août, nuits-des-etoiles 7-9 août, eclipse-solaire 12 août, grandes-marees 13-15 août) : **normal** — elles s'activeront dans quelques jours.

Aucune anomalie identifiée dans cette liste.

---

## Collisions display_order

11 groupes de sources partagent le même `display_order` :

| Ordre | Sources |
|-------|---------|
| 40 | doomname, statut-github |
| 42 | statut-npm, statut-openai |
| 43 | statut-discord, statut-vercel |
| 50 | changement-heure, statut-twitch |
| 51 | black-friday, soldes, statut-zoom |
| 52 | perseides, statut-canva |
| 53 | beaujolais-nouveau, statut-dropbox |
| 54 | soldes-steam, statut-slack |
| 55 | aurores-france, cert-fr-alertes |
| 56 | eclipse-solaire, geminides, nuits-des-etoiles |
| 59 | echeances-fiscales, journees-patrimoine |

Cosmétique — l'affichage reste fonctionnel (tri stable par id en cas d'égalité). Aucune urgence.

---

## TODO calendaires ≤ 60 jours (avant le 2026-10-05)

### ⚠️ Action requise — courses-mythiques (début septembre)

**Fichier** : `server/sources/courses-mythiques.js`  
**Échéance** : septembre 2026 (ouverture des inscriptions)  
**Config** : tableau `COURSES = []` — **vide**. La source est activée mais ne génère aucun événement.  
**Action** : transcrire les dates officielles dès publication :
- Marathon de Paris 2027 : pressenti dim. 11 avril 2027 (Cadence, à confirmer)
- Semi de Paris 2027 : pressenti dim. 7 mars 2027
- Paris-Versailles 2027 : non annoncé (TODO distinct si date inscriptions séparée)

### Événements imminents dans les configs (aucune action code requise — à vérifier en prod)

| Échéance | Source | Notes |
|----------|--------|-------|
| 7-9 août | nuits-des-etoiles | Dans 1-3 jours, devrait s'activer |
| 11-13 août | perseides | Dans 5-7 jours |
| 12 août | eclipse-solaire | Dans 6 jours — événement phare |
| 13-15 août | grandes-marees | Dans 7 jours |
| 19 août | allocation-rentree-scolaire | Versement métropole — config OK |
| 28 août-7 sept | gastronomie (Foire de Châlons) | Vérifié dans config |
| 5-6 sept | braderie-lille | Source inactive, config à vérifier |
| 19-20 sept | journees-patrimoine | Source inactive, config à vérifier |
| 24 sept | entrepreneuriat-seniors (GO Entrepreneurs Lyon) | Config OK |
| 3-4 oct | bd-manga (Paris Manga) | Config OK |
| 2-12 oct | fete-science | Config 2026 présente |
| 5-12 oct | nobel-prix | Config à vérifier |

### Annexe — au-delà de 60 jours (mémo)

- **Bourses scolaires** (`bourses-scolaires.js`) : date limite 15 octobre 2026 — TODO 2027-2028 non urgente.
- **Bison Futé** (`bison-fute.js`) : TODO début 2027 — calendrier 2026 OK jusqu'en août.
- **Échéances fiscales** : TF octobre 2026, THRS décembre 2026 — TODO début 2027.
- **CFE entreprises** : 15 décembre 2026 — TODO 2027.
- **Fêtes chrétiennes** : TODO début 2028.
- **Grandes marées 2027** : TODO.

---

## Slugs orphelins

**1 orphelin** : slug `communaute` présent dans la base (source `community`, display_order 500, categories `ARRAY['communaute']`) mais **absent de la taxonomie** `server/categories.js`.

La source `community` s'affichera avec le slug brut `communaute` au lieu d'un libellé traduit dans les filtres du kiosque.

**Résolution suggérée** (non exécutée) : ajouter `'communaute'` dans le groupe approprié de `server/categories.js` (probablement `vie-locale` ou `solidarite`), avec libellé « Communauté ».

---

## Vitalité PanneauPocket curée (Vague L)

**Script a renvoyé `panneaupocket_vitality: []`** — exception silencieuse attrapée.

**Cause probable** : la requête `Q_PP_VITALITY` appelle `jsonb_array_length(ss.ref)`, qui lève une erreur Postgres si `ref` est un JSONB objet (non-tableau) plutôt qu'un tableau. Or certaines sources (ex. `ondes-gravitationnelles`) stockent leur `ref` comme `{seenConfirmed, alerted, corrected}` — format objet, pas array. Cette ligne unique dans un LEFT JOIN fait échouer toute la requête, qui tombe dans le `catch` → `[]`.

**Limitation à énoncer** : la vitalité des 18 cartes broadcast curées (vague L) n'a **pas pu être mesurée ce soir**. Aucun `last_activated_at` ni `ref_panneau_count` disponible.

**Correction suggérée pour `scripts/veille-readonly.js`** (non exécutée) :
```sql
-- Remplacer :
CASE WHEN ss.ref IS NULL THEN NULL
     ELSE jsonb_array_length(ss.ref) END AS ref_panneau_count
-- Par :
CASE WHEN ss.ref IS NULL THEN NULL
     WHEN jsonb_typeof(ss.ref) = 'array' THEN jsonb_array_length(ss.ref)
     ELSE NULL END AS ref_panneau_count
```

**Point de vigilance ouvert** (inchangé) : si PanneauPocket régénère les ids de panneaux à l'édition, une simple modification apparaîtrait comme « nouveau » dans la dédup. Non mesurable sans fetch réseau (interdit la nuit).

---

## Combos orphelins & ids `?panneau=`

**26 combos orphelins** dans `source_param_states` (abonnements résiliés, états non purgés) :

| Source | Combos orphelins (exemples) |
|--------|-----------------------------|
| `vigilance-meteo` | 12 combos (dépts 31, 33, 35, 38, 44, 67, 74, 75, 83, 24, 16, 10, 69, 13) |
| `risque-secheresse` | 4 combos (dépts 06, 14, 16, 53) |
| `ma-collectivite` | 5 URLs PanneauPocket (oze, valserres, amr-05, veynes, la-batie-vieille) |
| `rappel-conso` | 2 catégories (bébés-enfants, alimentation) |
| `iss-passages` | 1 (gap) |

Total : 26 lignes. La purge est une décision humaine — jamais de DELETE par le robot.

**Stabilité des ids `?panneau=`** : point de vigilance documenté en tête de `server/sources/ma-collectivite.js`. Non mesurable sans requête réseau (interdit). Signalé comme point de surveillance ouvert.

---

## BROUILLON — à valider par Hugo avant toute exécution

### Fix `scripts/veille-readonly.js` — jsonb_typeof guard

**Objectif** : corriger la requête `Q_PP_VITALITY` pour éviter que `jsonb_array_length` échoue sur un JSONB objet (cas ondes-gravitationnelles et autres sources avec ref non-tableau).

**Fichier** : `scripts/veille-readonly.js`, ligne ~192 (dans `Q_PP_VITALITY`).

```sql
-- Avant :
CASE WHEN ss.ref IS NULL THEN NULL
     ELSE jsonb_array_length(ss.ref) END AS ref_panneau_count

-- Après :
CASE WHEN ss.ref IS NULL THEN NULL
     WHEN jsonb_typeof(ss.ref) = 'array' THEN jsonb_array_length(ss.ref)
     ELSE NULL END AS ref_panneau_count
```

Ce correctif est **non urgent** (ne touche que le script de veille, pas la prod), mais permettra de mesurer la vitalité PanneauPocket lors du prochain run.

**Slugs orphelins** : ajouter `'communaute'` dans `server/categories.js`, groupe `vie-locale` ou `solidarite`.

> ⚠️ Ce brouillon est **non validé**. Hugo décide de l'exécution.
