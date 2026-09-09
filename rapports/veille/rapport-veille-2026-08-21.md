# Rapport de veille — 2026-08-21

_Robot 1 · Veilleur de maintenance (lecture seule) · généré le 21/08/2026 à 09:00 heure Paris_
_Script : `node scripts/veille-readonly.js` · Sources enabled : 267 · Combos paramétrés : 36_

---

## Résumé (5 lignes)

1. **`statut-anthropic` : erreur TLS réelle** — le certificat de `status.anthropic.com` ne couvre pas ce domaine (`*.statuspage.io` uniquement). La source échoue systématiquement ; la corriger probablement exige de pointer vers le vrai sous-domaine Statuspage.
2. **`lancement-spatial` : 50 timeouts consécutifs** — l'API Launch Library est structurellement instable. À surveiller ; envisager un timeout plus long ou un repli.
3. **Slug orphelin `communaute`** — utilisé par `chat-perdu` et `chien-perdu` en base, absent de `server/categories.js`. Ces deux cartes affichent le slug brut au lieu d'un libellé humain.
4. **Vitalité PanneauPocket curée non mesurable ce run** — `panneaupocket_vitality` est vide (requête silencieusement échouée ou 0 lignes). Point aveugle.
5. Schéma base : cohérent (`ok: true`). 26 combos orphelins (reliquats normaux). 11 collisions de display_order cosmétiques.

---

## a) Sources en échec (`failing_sources`)

| Source | Échecs | Cause | Verdict |
|--------|--------|-------|---------|
| `sncf-perturbations` | 128 | `SNCF_API_KEY absente de l'environnement` | ✅ Normal — variable d'env non configurée, documenté dans l'état projet (TODO Hugo). |
| `lancement-spatial` | 50 | Timeout API Launch Library (>10 s) | ⚠️ **Panne durable** — 50 échecs sur 7 jours, API communautaire sans SLA. À surveiller ; si toujours à >30 échecs semaine prochaine, envisager timeout élargi ou source mise en veille. |
| `ecowatt` | 9 | Timeout auth RTE (>10 s) | ℹ️ Probablement transitoire — l'API RTE pique des lenteurs par à-coups. EcoWatt sans impact utilisateur notable en août (période hors tension). |
| `bitcoin-mouvement` | 3 | Timeout CoinGecko (>10 s) | ℹ️ Transitoire probable — 3 échecs sur 7 jours, API communautaire. |
| `risque-secheresse` | 2 | `Réponse HTTP inattendue VigiEau : 404` · dernier : 14/08 | ℹ️ Seuil atteint (2/7 j) mais dernier échec le 14/08 (7 jours). Un commit récent « Fix risque-secheresse 404 nocturne » est dans l'historique. Ces 2 échecs pourraient être antérieurs au fix — à surveiller 48 h. Si 0 nouvel échec, RAS. |
| `statut-anthropic` | 2 | TLS : `Host: status.anthropic.com` absent des altnames du certificat (`*.statuspage.io`) | ⚠️ **Bug réel** — la source pointe vers `https://status.anthropic.com/api/v2/status.json` mais le certificat TLS servi ne couvre pas ce domaine. Anthropic héberge son status sur Statuspage (sous-domaine `anthropicstatus.com` ou `*.statuspage.io`). L'URL doit être corrigée côté code. |
| `statut-twitch` | 2 | Timeout (>10 s) | ℹ️ Transitoire probable, en ligne avec l'API instabilité connue de Twitch. |

### Point de vigilance — `statut-anthropic`

Le message d'erreur est explicite :
```
Hostname/IP does not match certificate's altnames:
Host: status.anthropic.com is not in the cert's altnames:
DNS:*.statuspage.io, DNS:statuspage.io
```
La source pointe vers `https://status.anthropic.com/api/v2/status.json`. L'endpoint réel est probablement `https://www.anthropicstatus.com/api/v2/status.json` (le sous-domaine Statuspage propre à Anthropic). À confirmer et corriger dans `server/sources/statut-anthropic.js`.

---

## b) TODO calendaires — échéances ≤ 60 jours (au 21/08/2026)

### Dans la fenêtre (≤ 60 j) — config déjà en place, RAS

| Source | Échéance | État |
|--------|----------|------|
| `festivals-musique` — Rock en Seine | 26-30 août 2026 (dans 5 j) | Config OK |
| `vacances-scolaires` / `rentree-scolaire` | 1ᵉʳ sept. 2026 (dans 11 j) | Config OK |
| `braderie-lille` | 5-6 sept. 2026 (dans 15 j) | Config 2026 OK ; `TODO 2027` en tête de fichier |
| `grandes-marees` | 11-13 sept. 2026 (dans 21 j) | Config 2026 OK |
| `journees-patrimoine` | 19-20 sept. 2026 (dans 29 j) | Config OK |
| `fete-science` | 2-12 oct. 2026 (dans 42 j) | Config 2026 vérifiée le 23/07 |
| `semaine-bleue` | 5-11 oct. 2026 (dans 45 j) | Config OK |
| `nobel-prix` | 5-12 oct. 2026 (dans 45 j) | Config OK |

### Point d'attention — `bison-fute`

Dernière date 2026 : **28 août 2026 (dans 7 jours)** — les retours de fin d'été. Après cette date, la source ne produit plus rien jusqu'à publication du calendrier 2027. Le `TODO` en tête du fichier (`⚠️ TODO début 2027 : remplacer JOURS_2026`) est bien posé ; aucun geste requis maintenant, mais à prévoir en janvier 2027.

### Hors fenêtre (> 60 j) — pour mémoire

- `grandes-marees` : 27 oct. (67 j) — dernier événement 2026. `TODO 2027` : la source sera dormante après octobre si non mise à jour.
- `echeances-fiscales` — Taxe foncière : en ligne le 20 oct. (60 j) ; Taxe d'habitation secondaires : 20 déc. Dates 2027 non encore publiées par la DGFiP (TODO documenté dans le fichier).
- `grands-prix-gastronomie` — 50 Best Lima : 4 nov. (75 j) ; Bocuse d'Or : 24-25 janv. 2027 (157 j).
- `festivals-musique` — Vieilles Charrues 2027, Solidays 2027 : non annoncés au 18/07, TODO ouvert.

---

## c) Slugs orphelins

**1 slug orphelin détecté** : `communaute`

- Présent en base (colonne `categories` de `sources`) pour `chat-perdu` et `chien-perdu` (init.sql lignes 4688 et 4712).
- Absent de `server/categories.js` (fichier qui alimente `/api/categories` et donc `window.LBACat`).
- **Conséquence** : le front affiche `communaute` en slug brut partout où il serait attendu un libellé humain (filtres du kiosque, verso de carte, etc.).
- **Correction** : ajouter `communaute` à la taxonomie dans `server/categories.js` avec un libellé adéquat (ex. `Communauté`). Geste Hugo uniquement.

---

## e) Cohérence schéma

```
schema_check.ok = true
expected_columns: 58 · missing: [] · type_mismatch: []
```

Schéma cohérent. Aucune migration manquante détectée.

---

## f) Vitalité PanneauPocket curée (Vague L)

**Données indisponibles ce run** — la section `panneaupocket_vitality` du JSON est vide (tableau vide `[]`). La requête utilisée dans le script effectue un `LEFT JOIN source_states ss ON ss.source_id = s.id` avec lecture de `ss.ref` (JSONB). En cas d'erreur, le script dégrade silencieusement (try/catch → `[]`). Les 19 sources curées identifiées (18 vague L + `arrosage-canal-gap`) ne sont donc pas évaluables ce run.

**Limite de méthode (rappel systématique)** : même si les données étaient disponibles, `last_activated_at` (seul proxy en base) sous-estime la vitalité — une entité publiant des panneaux hors filtre thématique ou cosmétiques reste vivante sans déclencher d'événement. Toute décision de désactivation reste humaine.

**Sources curées identifiées dans le code** :
`agenda-luc-en-diois`, `arrosage-canal-gap`, `cantine-a2m2v`, `dechets-campagne-caux`, `dechets-la-saucelle`, `dechets-saulieu`, `eau-charles-chaigneau`, `eau-coteaux-lizon`, `eau-isle-dronne`, `eau-provence-verte`, `eau-puisaye-forterre`, `eau-regie-metz`, `local-agly-fenouilledes`, `local-buech-devoluy`, `local-chablis`, `local-chabris-bazelle`, `securite-gendarmerie-albi`, `securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts`.

---

## g) Combos orphelins & stabilité ids `?panneau=`

### Combos orphelins

**26 lignes `source_param_states`** sans abonnement actif associé — reliquats de désabonnements. Aucune purge automatique (décision humaine uniquement).

Répartition par source (sur le sample de 26) :
- `vigilance-meteo` : 12 combos (dépts 31, 33, 35, 38, 44, 67, 74, 75, 83, 24, 16, 10, 69, 13 — total 14 dans le sample dont quelques-uns à cheval)
- `ma-collectivite` : 5 combos (URLs Oze, Valserres, AMR-05, Veynes, La Bâtie-Vieille — zone Hautes-Alpes, visiblement des tests)
- `risque-secheresse` : 4 combos (dépts 06, 14, 16, 53)
- `rappel-conso` : 2 combos (catégories `bébés-enfants` et `alimentation`)
- `iss-passages` : 1 combo (ville: `gap`)

Niveau habituel, aucune anomalie. Purge optionnelle si la table grossit.

### Stabilité des ids `?panneau=`

Point de vigilance ouvert documenté en tête de `server/sources/ma-collectivite.js` : si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaît comme « nouveau panneau ». Non mesurable sans fetch réseau (interdit la nuit). Signalé en point de vigilance persistant — sans alarme.

---

## Collisions d'ordre d'affichage

11 collisions cosmétiques (2-3 sources par display_order) :

| Order | Sources |
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

Cosmétique uniquement — l'ordre du tri final intègre d'autres critères. Pas d'urgence.

---

## États figés (`stale_states`) — contexte

285 entrées avec `checked_at` ancien. Toutes corroborées par le caveat du script : `checked_at` n'est rafraîchi qu'en cas d'écriture (`write:true`) — les sources en still-inactive gardent un timestamp ancien, c'est **normal** tant que l'étape B (refresh checked_at en still-inactive) n'est pas déployée.

Les entrées `active` dans les stale_states concernent exclusivement des combos qui sont aussi dans `orphan_param_states` (désabonnements) — bruit attendu, aucune alarme.

---

## Jamais actives à 90 jours (`never_active_90d`)

184 sources — chiffre élevé mais attendu :
- La quasi-totalité a été créée entre le 11/07 et le 25/07/2026 (< 40 jours de recul), donc hors fenêtre 90 j par construction.
- Les rares sources plus anciennes sont saisonnières (Beaujolais, Black Friday, Changement d'heure, Géminides, Journées du patrimoine…) ou bloquées par une clé API absente (EcoWatt en dehors des tensions réseau, SNCF).
- Aucune anomalie identifiée : aucune source censée s'activer souvent et silencieuse de façon suspecte.

---

## BROUILLON — À valider par Hugo avant toute exécution

> ⚠️ Ce brouillon décrit des pistes de correctifs possibles. Il n'est **pas exécuté** par le robot et doit être revu et approuvé par Hugo avant toute action.

### 1. Correctif `statut-anthropic` — URL TLS

Le certificat reçu depuis `status.anthropic.com` ne couvre pas ce hostname. L'URL correcte pour le status Anthropic sur Statuspage est probablement `https://www.anthropicstatus.com/api/v2/status.json`.

Vérifier en console (hors prod) :
```
curl -s https://www.anthropicstatus.com/api/v2/status.json | head -c 200
```
Si la réponse est un JSON de status valide, remplacer l'URL dans `server/sources/statut-anthropic.js`.

### 2. Correctif slug orphelin `communaute`

Dans `server/categories.js`, ajouter dans le groupe approprié (« Vie locale » ou un groupe dédié) une entrée :
```js
{ slug: 'communaute', label: 'Communauté', group: 'vie-locale' }
```
_(le nom de groupe et le libellé exact sont à décider par Hugo selon la convention du fichier)_

### 3. `lancement-spatial` — si les timeouts persistent

Si la source affiche encore >20 échecs lors du prochain run, envisager dans `server/sources/lancement-spatial.js` d'augmenter le timeout au-delà de 10 s (ex. 15 s) ou de marquer la source en observation silencieuse le temps de mesurer la fiabilité réelle de l'API Launch Library.
