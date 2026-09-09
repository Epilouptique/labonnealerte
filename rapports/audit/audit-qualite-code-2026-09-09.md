# Audit qualité de code — La Bonne Alerte
**Date :** 9 septembre 2026 · **Périmètre :** dépôt complet (`server/`, `public/`, `scripts/`, `robots/`, `server/db/`)
**Nature :** lecture seule. Aucun code modifié. Aucune action corrective appliquée.

---

## 0. Verdict général

Le projet est d'une qualité **nettement au-dessus de la moyenne** pour une base de cette taille :

- **Commentaires** : c'est le point fort du dépôt. La plupart des fichiers expliquent le *pourquoi*, les décisions actées, les garde-fous, les pièges rencontrés et même les contreparties assumées. C'est rare et précieux. **Le rapport ne recommande donc quasiment nulle part « ajouter des commentaires »** — le vrai déficit est ailleurs.
- **Sécurité** : anti-SSRF sérieux (`safe-fetch.js`), CSP stricte sans script inline, échappement systématique, hachage d'IP salé et bruyant si le sel manque, transactions correctes sur les opérations sensibles (likes, achats de skins, forum).
- **Cohérence produit** : les décisions (favori automatique, slugs stables, fork ≠ suivi vivant) sont appliquées uniformément.

Le problème dominant n'est **pas** la lisibilité mais la **duplication structurelle** : la même vérité est écrite à 2, 4, voire 73 endroits. Le dépôt contient aussi une quantité mesurable de **code mort** et de **détritus versionnés**.

**Chiffres clés relevés :**

| Mesure | Valeur |
|---|---|
| Lignes serveur | ~29 200 |
| Lignes front (JS) | ~11 700 |
| Lignes CSS | ~5 000 |
| Modules de sources | 274 (dont 202 via une factory `lib/`) |
| `init.sql` | 4 784 lignes, 292 INSERT, 358 UPDATE, 72 ALTER |
| Copies du helper `fetchFn` node-fetch | **73** |
| Implémentations de rate-limit maison | **6** |
| Copies de la fonction `esc`/`escHtml` | **18 côté front + 4 côté serveur** |
| Fichiers non suivis polluant `git status` | 51 |

---

## 1. Priorité HAUTE — duplication structurelle

### 1.1 Le helper `fetchFn` node-fetch : 73 copies, sur Node 24

**Fichiers :** 73 fichiers (`server/sources/*.js`, `server/rte-auth.js`, `server/francetravail-auth.js`, `server/legifrance-auth.js`, …)

Chacun rouvre la même ligne :
```js
const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
```

Or l'environnement tourne sous **Node v24** où `fetch` est global — et le reste du dépôt l'utilise déjà nativement (`server/safe-fetch.js`, `server/routes/auth.js`). C'est donc :
- 73 lignes strictement inutiles ;
- un `import()` dynamique par appel (le module est mis en cache par Node, mais la promesse et la clôture sont recréées) ;
- une dépendance `node-fetch` (`package.json`) supprimable.

**Recommandation :** supprimer les 73 lignes, remplacer `fetchFn(` par `fetch(`, retirer `node-fetch` des dépendances. Modification mécanique, sans risque sémantique.

### 1.2 Le bloc « fetch JSON avec timeout » : ~70 copies quasi identiques

**Fichiers :** la majorité des sources n'utilisant pas de factory (`vigicrues-05.js`, `vigieau-gap.js`, `indice-uv-gap.js`, `ecowatt.js`, `tempo.js`, `seismes-france.js`, …)

Le même bloc de 15 lignes est recopié partout, seul le nom de l'API change :
```js
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
let res;
try { res = await fetchFn(API_URL, { headers: { Accept: 'application/json' }, signal: controller.signal }); }
catch (err) {
  if (err.name === 'AbortError') throw new Error(`Timeout API X (>${TIMEOUT_MS} ms)`);
  throw new Error(`Appel API X échoué : ${err.message}`);
} finally { clearTimeout(timer); }
if (!res.ok) throw new Error(`Réponse HTTP inattendue X : ${res.status} ${res.statusText}`);
let payload;
try { payload = await res.json(); }
catch (err) { throw new Error(`Réponse X illisible (JSON invalide) : ${err.message}`); }
```

**Impact :** ~1 000 lignes redondantes. Toute amélioration transversale (retry, User-Agent, métrique de latence, plafond de taille) exige aujourd'hui 70 éditions.

**Recommandation :** ajouter `server/sources/lib/fetch-json.js` exposant
`fetchJson(url, { apiName, timeoutMs = 10_000, accept, headers })`
qui lève exactement les mêmes messages d'erreur (paramétrés par `apiName`) — la migration est alors ligne à ligne, sans changement de comportement observable.

### 1.3 Quatre modules OAuth `client_credentials` à 85 % identiques

**Fichiers :** `server/rte-auth.js` (69 l.), `server/francetravail-auth.js` (82 l.), `server/twitch-auth.js` (75 l.), `server/legifrance-auth.js` (91 l.) — **317 lignes**

Structure strictement commune : `cached = {token, expiresAt}`, marge de renouvellement de 5 min, `AbortController` 10 s, mêmes branches `400/401/403`, même lecture `expires_in`, même `_resetCache`. Les seules variables réelles sont : URL de token, préfixe d'env, mode d'authentification (Basic vs corps), scope par défaut, TTL de repli.

Le commentaire de `legifrance-auth.js` reconnaît d'ailleurs explicitement le problème : *« 4e usage du pattern éprouvé du projet »*.

**Recommandation :** une factory `server/lib/client-credentials-auth.js` :
```js
makeAuth({ name, tokenUrl, envPrefix, mode: 'basic' | 'body', defaultScope, defaultTtl })
  → { getToken, isConfigured, _resetCache }
```
Les 4 fichiers deviennent 4 appels de 6 lignes chacun. `twitch-auth.js` garde son `clientId()` en supplément. Gain : ~230 lignes, et une seule place pour corriger un bug de renouvellement.

### 1.4 Le SELECT « carte enrichie » recopié 4 fois

**Fichiers :**
- `server/routes/api.js:121` (`GET /sources`)
- `server/routes/api.js:242` (`GET /favorites`)
- `server/routes/collections.js:705` (`GET /collections/:slug`)
- `server/routes/decks.js:70` (`enrichItems`)

Les 4 requêtes listent les **mêmes 14 colonnes** plus les **mêmes 3 sous-requêtes corrélées** (`subscriber_count`, `last_activated_at`, `topic_count`).

Le code documente lui-même la dette, ce qui est honnête mais ne la supprime pas :
> `-- DOUBLON ASSUMÉ du SELECT de /api/sources (même forme exacte…) : toute colonne ajoutée là-bas doit l'être ici, sinon le même verso affiche le compte sur le kiosque et pas depuis les favoris.`

Et l'historique montre que la divergence **s'est déjà produite** : deux des quatre commentaires expliquent qu'il a fallu rattraper l'absence de `forum_slug` + `topic_count` après coup.

**Recommandation :** extraire un module `server/db/source-card-sql.js` exportant la chaîne du SELECT (`SOURCE_CARD_COLUMNS`) à interpoler dans les quatre requêtes. C'est le correctif le plus rentable du rapport : il ferme une classe entière de régressions récurrentes.

### 1.5 La boucle d'adoption recopiée intégralement

**Fichiers :** `server/routes/collections.js:792-823` et `server/routes/decks.js:485-509`

~40 lignes identiques : itération sur les items, `resolveInstances`, branche `inst === null` / instance paramétrée, `INSERT … ON CONFLICT`, `award('ALERT_SUBSCRIBED')`, `addFavorite`, comptage `added/already/needsParams`.

**Recommandation :** `adoptItems(subscriberId, items, profileDept) → { added, already, needsParams }` dans `collections.js`, appelé par les deux routes.

**Note de performance associée :** cette boucle exécute **3 requêtes séquentielles par carte** (INSERT + award + addFavorite). Un deck de 20 cartes = 60 allers-retours PostgreSQL sous un seul `POST`. Une insertion en lot (`INSERT … SELECT unnest($2::text[])`) réduirait cela à 3 requêtes au total.

### 1.6 `addFavorite` défini deux fois, à l'identique

**Fichiers :** `server/routes/myalerts.js:34` et `server/routes/collections.js:25`

Corps strictement identiques. `collections.js` l'exporte pour `decks.js` et `subscribe.js`, mais `myalerts.js` a gardé sa copie locale. Le commentaire de `collections.js` dit d'ailleurs « Miroir du helper de routes/myalerts.js ».

**Recommandation :** `myalerts.js` importe celui de `collections.js` (ou mieux : déplacer dans un `server/favorites.js` neutre, pour éviter qu'une route dépende d'une autre route).

### 1.7 `FUSED_REDIRECTS` : deux copies de la même table de redirections

**Fichiers :** `server/index.js:186` et `server/routes/api.js:48` — objet littéral **strictement identique** (6 entrées).

Une fusion de source oubliée dans l'un des deux fichiers produit une incohérence silencieuse entre la page (`/source/:id/statut`) et l'API (`/api/sources/:id/*`).

**Recommandation :** un module `server/fused-redirects.js` unique.

### 1.8 Six implémentations maison de rate-limiting

**Fichiers :**
| Emplacement | Portée | Fenêtre |
|---|---|---|
| `server/routes/myalerts.js:55` (`rateLimit`) | IP | 5/min |
| `server/routes/myalerts.js:98` (`lookupRate`) | IP | 30/min |
| `server/routes/dev.js:26` (`rateLimit`) | IP | 10/min |
| `server/routes/decks.js:52` (`rateOk`) | compte | 10/h |
| `server/routes/forum.js:43` (`makeLimiter`) | compte | 5/h et 15/h |
| `server/routes/user-tasks.js:50` (`rateOk`) | compte | — |

Toutes reposent sur le même patron `Map<clé, timestamps[]>` + `setInterval` de purge + filtrage par fenêtre glissante. `forum.js` a déjà fait le bon geste (`makeLimiter(maxOps)`) mais ne l'a pas partagé — son commentaire dit « copie locale, comme la convention decks.js / dev.js », entérinant la duplication comme convention.

Par ailleurs `express-rate-limit` **est déjà une dépendance** et est utilisé dans `index.js` et `api.js` — le dépôt entretient donc deux mécanismes concurrents.

**Recommandation :** un `server/rate-limit.js` exposant `makeMemoryLimiter({ max, windowMs, keyBy: 'ip' | 'account' })`, et remplacer les 6 copies. Gain secondaire : `req.connection` (déprécié) apparaît dans 3 des copies — à remplacer par `req.socket` en une seule fois.

### 1.9 `esc` / `escHtml` : 22 implémentations

**Front (18) :** `cards.js:17`, `boutique.js:25`, `deck-stack.js:27`, `le-point.js:7`, `list-view.js:27`, `profile-decks.js:21`, `profile.js:20`, `proposer.js:7`, `quiet.js:17`, `source.js:27`, `timeline.js:7` (copies intégrales, toutes échappant `& < > " '`), plus 7 délégations propres à `LBACards.esc` (`collection-page.js`, `deck-add.js`, `deck-shared.js`, `decks.js:36`, `header.js:378`, `user-task-form.js`).

Le bon patron existe donc déjà — il n'a simplement pas été appliqué partout. **Recommandation :** aligner les 10 copies restantes sur `window.LBACards ? LBACards.esc(s) : …`.

**Serveur (4) :** `index.js:259`, `forum.js:65`, `user-tasks.js:104`, `mailer.js:167`.
⚠️ **Divergence réelle** : les versions serveur échappent `& < > "` (4 caractères) alors que le front en échappe 5 (avec `'`). Ce n'est pas exploitable dans les usages actuels (les interpolations sont toutes dans des attributs entre guillemets doubles ou dans du texte), mais c'est un écart de contrat entre deux moitiés du même produit. **Recommandation :** un `server/escape.js` unique échappant les 5 caractères.

### 1.10 Trois `slugify` différents sous le même nom

**Fichiers :** `server/forum-slug.js:34` (concaténé sans séparateur, borné à 64), `server/routes/forum.js:137` (tirets + suffixe aléatoire, borné à 160), `server/routes/dev.js:157` (tirets, borné à 48).

Les trois sémantiques sont **légitimes et différentes** — ce n'est pas de la duplication à supprimer, mais un piège de nommage : un développeur qui importe « le » slugify se trompera. **Recommandation :** renommer en `forumTopicSlug` et `sourceIdSlug`, en gardant `slugify` pour le module canonique.

### 1.11 Quatre robots PowerShell à 90 % identiques

**Fichiers :** `robots/robot1-veille.ps1` (60 l.), `robot2-audit.ps1` (57), `robot3-soumissions.ps1` (65), `robot4-veille-sources.ps1` (66)

Seuls changent le fichier de prompt et le répertoire de rapport. `$RepoDir = 'c:\Dev\Labonnealerte'` est codé en dur **dans les quatre**.

**Recommandation :** un `robots/run-robot.ps1 -Robot <nom>` piloté par une table `nom → (prompt, dossier)`, et `$RepoDir` déduit de `$PSScriptRoot`.

### 1.12 Divers doublons ponctuels

- `monthKey()` défini deux fois à l'identique : `server/poller.js:172` et `server/mailer.js:31`.
- Deux logiques de compteurs mensuels concurrentes : `incCounter` (poller) et `incEmailCounters` (mailer), même table, même patron d'upsert.
- `server/mailer.js:10-11` : `SITE_URL` et `PUBLIC_SITE` valent **exactement la même chaîne**. Les deux sont utilisés dans le même fichier.
- `server/safe-fetch.js` : `safeFetchText` (l. 135) et `safeFetchBuffer` (l. 191) partagent ~40 lignes rigoureusement identiques (parsing d'URL, contrôle de protocole, `dns.lookup`, rejet des IP privées, `AbortController`, branches d'erreur). Extraire un `prepareAndFetch(rawUrl, opts)` interne.
- `server/routes/myalerts.js:681` et `:698` : le même bloc « lire `departement` du profil » est écrit deux fois de suite dans `toggle-param`, l'un pour `commune`, l'autre pour `commune-coords`.
- `loadLookupSources()` (`myalerts.js:80`) et `loadCalendarSources()` (`le-point.js`) : deux scans `readdirSync` + `require` du même dossier `server/sources/`, avec un troisième dans `poller.js:26` (`loadSources`). Trois parcours du même répertoire à l'amorçage, trois filtres différents. **Recommandation :** un registre unique `server/sources/registry.js` chargeant une fois et exposant `all()`, `withLookup()`, `withUpcoming()`, `pollable()`.
- `resolveSourceId` / `resolveDeckId` (`forum.js:165`, `:175`) font **deux requêtes** là où `WHERE forum_slug = $1 OR id = $1 ORDER BY (forum_slug = $1) DESC LIMIT 1` en suffirait une.

---

## 2. Priorité HAUTE — code mort

### 2.1 Fonctions mortes confirmées

| Fonction | Fichier | Lignes | Vérification |
|---|---|---|---|
| `confirmedEmailsForSource` | `server/poller.js:43` | 10 | 0 appelant |
| `confirmedEmailsForSourceParams` | `server/poller.js:433` | 11 | 0 appelant |
| `sendToSource` | `server/webpush.js:35` | ~55 | importé par `poller.js:6`, **jamais appelé** |
| `sendToSourceParams` | `server/webpush.js:93` | ~40 | importé par `poller.js:6`, **jamais appelé** |

Ces quatre fonctions ont été rendues obsolètes par `dispatchAlert` (aiguillage par abonné avec heures de veille) mais n'ont pas été retirées. **~115 lignes** de logique d'envoi de notifications non testée et non exécutée, qui donne l'illusion d'exister. C'est du code dangereux à conserver : quelqu'un pourrait l'appeler en croyant qu'il respecte les heures de veille — ce n'est pas le cas.

**Recommandation :** supprimer les 4 fonctions et corriger l'import ligne 6 de `poller.js`.

### 2.2 Router jamais monté

`server/routes/le-point.js` exporte `{ apiRouter, pagesRouter }`, mais `server/index.js:18` ne déstructure que `apiRouter`. La route est servie par un `app.get('/le-point', …)` écrit directement dans `index.js`. **`pagesRouter` de `le-point.js` est mort.** Choisir l'un des deux et supprimer l'autre (le montage via router est plus cohérent avec `subscribe.js` / `myalerts.js`).

### 2.3 Modules de sources désactivées toujours chargés

`init.sql` désactive explicitement plusieurs sources (fusion v2) :
```sql
UPDATE sources SET enabled = false WHERE id = 'vigieau-gap'      -- l. 1057
UPDATE sources SET enabled = false WHERE id = 'carburant-seuils' -- l. 1127
UPDATE sources SET enabled = false WHERE id = 'indice-uv-gap'    -- l. 1801
UPDATE sources SET enabled = false WHERE id = 'vigicrues-05'     -- l. 2054
UPDATE sources SET enabled = false WHERE id = 'seismes-france'   -- l. 2067
UPDATE sources SET enabled = false WHERE id = 'ipc-quebec'       -- l. 2863
```
Or les fichiers `server/sources/vigieau-gap.js`, `indice-uv-gap.js`, `carburant-seuils.js`, `vigicrues-05.js`, `vacances-zone-a|b|c.js`… **existent toujours** et `loadSources()` (`poller.js:26`) les `require()` **tous** au démarrage avant de filtrer sur `enabled`. Résultat : des modules chargés en mémoire, maintenus dans les recherches et les revues, qui ne s'exécuteront jamais.

**Recommandation :** supprimer les fichiers des sources définitivement fusionnées (l'historique Git les conserve), ou les déplacer dans `server/sources/_retired/` que `loadSources` ignore.

### 2.4 Instructions SQL contradictoires

`init.sql` applique des `UPDATE … SET description_long = …` à des sources **déjà désactivées quelques centaines de lignes plus haut** :
- l. 4062 → `carburant-seuils` (désactivée l. 1127)
- l. 4248-4250 → `vacances-zone-a|b|c`
- l. 4268 → `vigieau-gap` (désactivée l. 1057)

Aucun effet visible, mais chaque rejeu du fichier les exécute. Signal clair que le fichier n'est plus relu dans son ensemble.

### 2.5 Bloc de diagnostic temporaire en production

`server/index.js:36-96` — 60 lignes de diagnostic IPv6/IPLocate, gardées derrière `LOG_CLIENT_IP === '1'`. Le commentaire l'admet :
> `⚠️ DIAGNOSTIC TEMPORAIRE (lot IPv6) … À RETIRER (ou laisser dormant) une fois le diagnostic obtenu.`

Le bloc fait un appel HTTPS sortant non maîtrisé (`https.get` brut, **sans passer par `safe-fetch`**, sans timeout) vers un tiers, pour chaque page vue, si la variable est posée. **Recommandation :** le diagnostic ayant vraisemblablement abouti, supprimer le bloc.

### 2.6 Sonde de contrôle temporaire

`server/poller.js:746-763` + `server/leboncoin-promo-probe.js` : trois `cron.schedule` supplémentaires, explicitement marqués
> `SONDE DE CONTRÔLE TEMPORAIRE — À DÉMONTER après validation de 2-3 week-ends`.

La bascule datant du 06/09/2026, l'échéance approche. À planifier explicitement plutôt qu'à oublier.

### 2.7 Valeur d'énumération fantôme : `'unlisted'`

`server/routes/decks.js:365` documente que le modèle est devenu binaire public/privé :
> `« Partager = rendre PUBLIC … 'unlisted' est retiré. »`

Mais `visibility IN ('public', 'unlisted')` subsiste dans **au moins 5 requêtes** (`decks.js:406`, `:439`, `:526`, `index.js:227`, …). Plus aucun code n'écrit `'unlisted'`. C'est de la condition morte qui alourdit chaque lecture et sème le doute sur le modèle de données réel. **Recommandation :** vérifier en base (`SELECT count(*) … WHERE visibility='unlisted'`), migrer les résidus, puis retirer la valeur des requêtes **et** du CHECK SQL.

### 2.8 Page et scripts orphelins

`server/index.js:213` redirige `/favoris` en 302 vers `/?mode=favoris`. Le commentaire précise :
> `public/favoris.html et js/favoris*.js restent dans le dépôt mais ne sont plus atteignables par aucun lien.`

Cela représente `favoris.html` + `favoris.js` (219 l.) + `favoris-title.js`. La conservation est défendable pendant une période de transition, mais elle devrait être **datée** (« à supprimer après le 01/12/2026 ») plutôt que laissée indéfiniment.

### 2.9 Branche inatteignable dans le service worker

`public/sw.js` — `staleWhileRevalidate` :
```js
return cached || network || fetch(request);
```
`network` est une **promesse** (issue de `fetch(...).then(...).catch(() => null)`), donc toujours *truthy*. Le troisième terme `fetch(request)` est **inatteignable**. Pire : quand le réseau échoue, `network` se résout à `null` et la fonction renvoie `null` à `event.respondWith()`, ce qui produit une erreur réseau plutôt qu'un repli. **Recommandation :**
```js
if (cached) return cached;
const res = await network;
return res || Response.error();
```

---

## 3. Priorité MOYENNE — performance et robustesse

### 3.1 Le poller interroge 274 sources strictement en série

`server/poller.js:669` — `for (const source of active) { await … }`.

Avec un `TIMEOUT_MS` de 10 s par source, le pire cas théorique d'un cycle dépasse largement l'intervalle de 30 minutes du cron. **Et il n'existe aucun verrou d'exécution** : `cron.schedule(SCHEDULE, runCycle)` relance un cycle même si le précédent tourne toujours, provoquant des checks concurrents sur les mêmes sources, des doubles notifications potentielles et des transitions d'état en course.

**Recommandations, par ordre d'urgence :**
1. **Verrou de cycle** (correctif de sûreté, 3 lignes) :
   ```js
   let running = false;
   async function runCycle() { if (running) { console.warn('[poller] cycle précédent en cours — passage ignoré'); return; } running = true; try { … } finally { running = false; } }
   ```
2. **Parallélisme borné** : traiter les sources par lots de 5 à 10 (`p-limit` maison de 10 lignes). Le temps de cycle passerait d'une somme à un maximum.
3. Journaliser la durée du cycle pour objectiver le problème avant d'agir.

### 3.2 ~550 écritures de compteurs par cycle

`poller.js:367-368` appelle `incCounter('checks_total')` **et** `incCounter('checks_' + monthKey())` pour **chaque** source — soit 548 UPSERT par cycle, sur les deux mêmes lignes, en contention permanente.

**Recommandation :** accumuler le compte en mémoire pendant le cycle et écrire **une** fois en fin de cycle (`+= n`). Gain : 548 → 2 requêtes.

### 3.3 Requêtes redondantes sur la même ligne

- `getState()` (l. 140) puis `getStoredSince()` (l. 149) : deux SELECT sur `source_states` pour la même ligne, même clé.
- Idem `getParamState` (l. 394) / `getParamStoredSince` (l. 402).
- `applyResult` appelle systématiquement le premier, et conditionnellement le second.

**Recommandation :** un seul `SELECT state, since` renvoyant les deux champs.

### 3.4 `GET /api/sources/:id/history` : coût quadratique

`server/routes/api.js:487-502` — boucle sur 90 jours ; **à chaque itération** :
```js
all.filter((e) => e.event === 'failed' && new Date(e.created_at) >= dayStart && new Date(e.created_at) < dayEnd)
```
Soit 90 × |all| parcours, avec **deux allocations `Date`** par élément et par jour. Pour une source ayant 2 000 événements : 180 000 itérations et 360 000 objets `Date` par requête HTTP.

**Recommandation :** pré-calculer une fois `const failDays = new Map()` en un seul passage sur `all` (clé = `YYYY-MM-DD`), puis lire la Map dans la boucle des 90 jours. Passage de O(90n) à O(n).

### 3.5 `GET /api/my-alerts` : 7 requêtes séquentielles

`server/routes/myalerts.js:196-313` enchaîne : sources, instances paramétrées, schémas, tâches, préférences, (auto-remplissage + relecture), rang, favoris. Toutes sont indépendantes deux à deux sauf la relecture post-autofill.

Le commentaire de `public/js/session.js` révèle l'impact mesuré : *« les quatre requêtes se sérialisaient côté serveur (jusqu'à 6 s pour la dernière) »*. La déduplication front a masqué le symptôme sans traiter la cause.

**Recommandation :** `Promise.all` sur les 5 premières lectures indépendantes.

### 3.6 Lecture disque à chaque requête SEO

`server/index.js:236`, `:288`, `:340` — `fs.readFileSync(...deck.html | collection.html | source.html)` **à chaque requête**, sur le chemin chaud des pages publiques indexées.

**Recommandation :** lire les trois gabarits une fois au démarrage dans un objet module.

### 3.7 Trois routes SEO quasi identiques

Les blocs `/deck/:token` (l. 224), `/collection/:slug` (l. 268) et `/source/:id/statut` (l. 320) partagent la même mécanique : requête → 404 HTML inline → lecture du gabarit → 5 `.replace()` de placeholders → `send`. Y compris la **page 404 HTML écrite trois fois en dur avec les mêmes styles inline**.

**Recommandation :** `renderSeoPage(res, { template, row, title, desc, url })` + une seule fonction `notFoundPage(title, message)`.

### 3.8 `POST /subscribe` : effets secondaires « non bloquants » qui bloquent

`server/routes/subscribe.js:170-180` :
```js
await award(subscriber.id, 'ALERT_SUBSCRIBED', sourceId);
await addFavorite(subscriber.id, sourceId);
```
Les commentaires annoncent « Effet secondaire non bloquant ». En pratique les deux `await` sont **à l'intérieur du `try` principal** : si l'un d'eux lève, le `catch` renvoie un **503** alors que l'abonnement a bien été créé et que le mail n'est pas parti. `award` et `addFavorite` avalent leurs erreurs en interne, donc le risque est actuellement théorique — mais le contrat annoncé et le code ne correspondent pas. **Recommandation :** envelopper explicitement (`try { … } catch (e) { console.error(…) }`) pour que le commentaire devienne vrai.

### 3.9 Le state OAuth vit en mémoire du processus

`server/routes/auth.js:22` — `const states = new Map()`. En cas de redéploiement pendant qu'un utilisateur est chez Google, ou de scale au-delà d'une instance, la connexion échoue (`?erreur=oauth`) sans explication. Acceptable pour une instance unique sur Railway, mais **à documenter comme contrainte de déploiement** dans le fichier, car rien ne le signale aujourd'hui. Même remarque pour les 6 rate-limiters mémoire et le cache `top20Cache`.

### 3.10 Cache sans protection contre l'afflux simultané

`server/routes/le-point.js` — au moment de l'expiration du cache (2 min), N requêtes concurrentes déclenchent N `build()` complets en parallèle. Même patron dans `points.js` (`getTop20Ids`) et `api.js` (`communesCache`).

**Recommandation :** mémoriser la **promesse** en vol plutôt que le résultat — exactement le patron déjà maîtrisé dans `public/js/session.js` (`inflight`). Le front a résolu ce problème ; le serveur ne l'a pas repris.

### 3.11 Absence de gestionnaires globaux Express

`server/index.js` ne définit **ni middleware 404 final, ni middleware d'erreur** `(err, req, res, next)`. Toute exception synchrone non capturée dans un handler tombe sur le gestionnaire par défaut d'Express, qui renvoie la **stack trace** en développement et une page HTML brute en production. Chaque route compense individuellement par un `try/catch` — d'où 60+ blocs `catch` répétant `res.status(503).json({ error: 'Service indisponible' })`.

**Recommandations :**
1. Ajouter un 404 JSON/HTML final et un middleware d'erreur qui journalise et renvoie 503 sans détails.
2. Envisager un `asyncHandler(fn)` (wrapper `.catch(next)`), ce qui permettrait de retirer une soixantaine de `try/catch` identiques et de gagner ~180 lignes.

### 3.12 Bug confirmé : `jsonb_array_length` sur un objet

`scripts/veille-readonly.js:191` :
```sql
CASE WHEN ss.ref IS NULL THEN NULL ELSE jsonb_array_length(ss.ref) END AS ref_panneau_count
```
`ss.ref` n'est pas toujours un tableau (certaines sources y stockent un objet). PostgreSQL lève alors `cannot get array length of a non-array`, **toute la requête échoue**, et le `catch` de la ligne 313 pose `panneaupocket_vitality = []` **sans journaliser quoi que ce soit**. Le robot de veille signale donc « aucune donnée de vitalité » au lieu de « la requête est cassée » — la tâche de surveillance est muette depuis un moment sans que rien ne l'indique.

**Correctif :**
```sql
CASE WHEN jsonb_typeof(ss.ref) = 'array' THEN jsonb_array_length(ss.ref) ELSE NULL END
```
et **journaliser `e.message`** dans le `catch` (l. 312) plutôt que de dégrader en silence.

### 3.13 41 `catch` silencieux

41 occurrences de `catch (e) {}` / `catch {}` dans `server/` et `public/js/`. La grande majorité sont **justifiées et commentées** (accès `localStorage` en navigation privée, modules non chargeables). Mais certaines masquent de vraies pannes — le cas 3.12 en est la démonstration. **Recommandation :** convention simple — un `catch` vide doit porter un commentaire d'une ligne expliquant pourquoi l'erreur est sans conséquence ; sinon, il journalise.

---

## 4. Priorité MOYENNE — schéma et migrations

### 4.1 `init.sql` : 4 784 lignes, monolithe rejoué intégralement

**Fichier :** `server/db/init.sql`, appliqué par `server/db/migrate.js` en **une seule** `pool.query(sql)`.

Problèmes :
1. **Schéma et données mélangés** : 72 `ALTER TABLE`, 292 `INSERT` de catalogue et 358 `UPDATE` de correction éditoriale s'entremêlent dans l'ordre chronologique du développement.
2. **Aucune transaction** : `pool.query` sur un fichier multi-instructions s'exécute en autocommit implicite par instruction. Un échec au milieu laisse la base dans un **état partiellement migré**, sans possibilité de rejeu propre.
3. **Coût de rejeu croissant** : chaque déploiement réexécute 4 784 lignes, dont des `UPDATE` sans effet (cf. §2.4) et des `ALTER … IF NOT EXISTS` déjà satisfaits depuis des mois.
4. **Illisibilité** : retrouver l'état actuel d'une colonne exige de lire le fichier de bout en bout, en composant mentalement les patchs successifs.

**Recommandations, sans big-bang :**
- **Immédiat (1 ligne)** : envelopper dans une transaction — `BEGIN; … COMMIT;` autour du contenu, ou `await client.query('BEGIN')` dans `migrate.js`. Un échec redevient alors sans effet.
- **Court terme** : scinder en `schema.sql` (DDL, idempotent) + `catalog.sql` (les 292 sources) + `migrations/NNN-*.sql` numérotées avec une table `schema_migrations` enregistrant les fichiers appliqués. Les migrations passées deviennent alors « déjà appliquées » et cessent d'être rejouées.
- Le catalogue de 292 sources gagnerait à devenir un fichier de données (JSON/CSV) synchronisé par script — un script du même esprit existe déjà (`scripts/sync-init-descriptions.js`).

### 4.2 SSL désactivé sans condition

`server/db.js:10` — `ssl: { rejectUnauthorized: false }` est posé **en dur**, y compris pour un développement local sur `localhost` où PostgreSQL n'écoute pas en TLS. Le commentaire explique correctement le pourquoi (certificat auto-signé du proxy Railway), mais le réglage devrait être conditionnel :
```js
ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '') ? false : { rejectUnauthorized: false }
```

---

## 5. Priorité BASSE — cohérence et lisibilité

### 5.1 URL du site codée en dur à 15+ endroits

`https://labonnealerte.fr` apparaît dans `server/poller.js` (2×), `server/mailer.js` (4 constantes), `server/routes/forum.js:25` (`SITE_URL`), `server/routes/sitemap.js:29` (`ORIGIN`), et **11 fois dans `public/js/`**.

Or `server/routes/auth.js:12` définit déjà `BASE_URL` depuis l'environnement. Le dépôt a donc la bonne pratique **et** la mauvaise, côte à côte. Un changement de domaine (ou un environnement de préproduction) exigerait aujourd'hui une quinzaine d'éditions.

**Recommandation :** un `server/config.js` exportant `BASE_URL`, importé partout côté serveur. Côté front, préférer des URL relatives ou `location.origin` pour la construction des liens de partage.

### 5.2 Deux styles JavaScript coexistent

- `public/js/**` : ES5 intégral — **1 688 `var`** contre 48 `const`/`let`, IIFE, `function` anonymes, pas de modules.
- `public/sw.js` et l'ensemble de `server/` : ES2017+ — `const`, fonctions fléchées, `async/await`.

Il n'y a pas d'étape de build ni de transpilation, donc l'ES5 du front n'est pas *nécessaire* : tous les navigateurs ciblés (ceux qui supportent les service workers, `fetch` et `Promise`, déjà requis) supportent `const`/`let`. Le style ES5 est donc un choix historique, pas une contrainte.

Ce n'est **pas un défaut** en soi, et une réécriture globale serait un risque disproportionné. **Recommandation minimale :** écrire les *nouveaux* fichiers front en `const`/`let` (comme `sw.js` le fait déjà), et documenter la convention dans un `CLAUDE.md` ou un `CONTRIBUTING.md` — aujourd'hui aucun fichier n'énonce la règle.

### 5.3 Ordre de déclaration dispersé dans `server/index.js`

Le fichier alterne : configuration → helmet → routes PWA → sitemap → static → rate-limit → montage des routers → **`FUSED_REDIRECTS` (l. 186)** → routes de pages → route `/deck/:token` → **`escHtml` (l. 259, après ses 3 usages)** → route `/collection/:slug` → route `/source/:id/statut` → montage du forum.

Le commentaire `// Page de statut d'une source : SEO injecté côté serveur + 404 propre.` (l. 258) est posé **au-dessus de `escHtml`**, à ~60 lignes de la route qu'il décrit. Tout fonctionne (hoisting), mais la lecture est pénible.

**Recommandation :** regrouper toutes les constantes et helpers en tête de fichier, puis les montages dans l'ordre de résolution.

### 5.4 Collisions de noms entre concepts distincts

- `CATEGORIES` désigne **la taxonomie des cartes** dans `server/categories.js` et **les 5 forums** dans `server/routes/forum.js:29`. `server/routes/api.js` importe le premier ; `server/routes/sitemap.js:31` importe le second — via `require('./forum').CATEGORIES`, c'est-à-dire une propriété **greffée sur un objet Router Express** (`forum.js:1025`). Le patron est fragile et non conventionnel ; on le retrouve dans `collections.js:887-889` (trois exports attachés au router).
  **Recommandation :** exporter `{ router, CATEGORIES }` explicitement.
- `rateLimit` désigne tantôt le middleware `express-rate-limit` importé, tantôt une fonction maison locale (`myalerts.js:55`, `dev.js:26`).

### 5.5 Nommage

- `redirectOldVig` (`api.js:56`) gère en réalité **deux** familles de redirections (anciennes vigilances *et* sources fusionnées vague 12) → `redirectFusedSource`.
- `page_` avec tiret bas final apparaît 6 fois dans `forum.js` — l'échappement d'un mot-clé qui n'en est pas un en JavaScript. `pageNum` conviendrait.
- `server/routes/decks.js:182` : `// POST /api/decks — crée un deck (plafond 10…)` alors que `MAX_DECKS = 15` (l. 17). **Commentaire périmé** — le seul relevé de cette nature dans le dépôt, ce qui en dit long sur la tenue générale des commentaires.

### 5.6 `public/css/site.css` : 4 792 lignes en un fichier

74 `@media` et 5 thèmes de skins de cartes (`.skin-dresseur` 75 règles, `.skin-assemblee` 56, `.skin-arcane` 33, `.skin-ecole-classique` 32) représentent ~334 lignes de cosmétique, chargées sur **toutes** les pages, y compris celles qui n'affichent aucune carte (mentions légales, confidentialité, connexion).

Point positif : seulement **17 `!important`** sur 4 792 lignes, et une tokenisation exemplaire (`tokens.css` de 52 lignes fait autorité, `dev.css` se contente de redéfinir les variables). La spécificité est donc bien tenue — c'est uniquement un problème de volume et de découpage.

**Recommandation :** extraire `skins.css`, chargé par les seules pages concernées (kiosque, boutique, deck, profil).

### 5.7 Petites remarques ponctuelles

- `server/routes/collections.js:853` : `DELETE /collections/:slug/adopt` lit le token dans `req.body` — un corps sur une requête DELETE fonctionne avec `express.json()` mais reste inhabituel et mal supporté par certains clients HTTP. Accepter aussi `?token=` (le `DELETE /favorites` de `api.js:334` le fait déjà : `body.token || req.query.token`).
- `server/routes/forum.js:86` : `MENTION_RE` est une regex `/g` **partagée au niveau module**, utilisée à la fois via `.exec()` en boucle (`collectMentions`) et via `.replace()` (`linkifyMentions`). Le `lastIndex` est bien remis à zéro dans `collectMentions`, donc c'est correct aujourd'hui — mais c'est un état mutable partagé qui casse silencieusement si quelqu'un ajoute un troisième usage. **Recommandation :** une fabrique `mentionRe()` renvoyant une instance neuve.
- `server/routes/dev.js:194` : la boucle `while (await exists(id))` exécute jusqu'à 6 requêtes séquentielles pour trouver un identifiant libre. Un `INSERT … ON CONFLICT DO NOTHING RETURNING id` en boucle serait plus court et sans course.
- `server/safe-fetch.js` : la résolution DNS puis le `fetch` sur le **nom d'hôte** laissent une fenêtre de *DNS rebinding* (l'IP validée n'est pas forcément celle utilisée par la connexion). Le risque est faible ici (URLs de manifestes soumises, déjà modérées manuellement), mais mérite d'être **documenté dans le fichier** au même titre que les autres garde-fous, qui le sont tous.

---

## 6. Hygiène du dépôt

### 6.1 Cinq fichiers de détritus versionnés

Ces fichiers, **suivis par Git**, sont manifestement des redirections shell ratées ayant capturé la sortie de `git log` / `git show` (codes d'échappement ANSI inclus) :

| Fichier | Contenu réel |
|---|---|
| `how 5bba18b` | sortie de `git show 5bba18b` |
| `tash list` | sortie de `git stash list` / `git log` |
| `ait les autres — visible seulement au filtre car cette carte est` | 16 653 octets |
| `e partage la largeur sans jamais deborder, meme sur les tres` | 16 653 octets (identique au précédent) |
| `que: plancher carte 340->300 (auto-fill), 3 colonnes stables 1024-1920, …` | 16 653 octets |

Les noms sont des fragments de messages de commit — le résultat d'un `>` mal placé dans une commande `git commit -m`. **Recommandation :** `git rm` sur les cinq.

### 6.2 Fichiers temporaires non suivis

- `tmp-veille.json` (94 Ko) et `C:DevLabonnealertetmp-veille.json` (90 Ko) — le second porte un **chemin Windows entier comme nom de fichier**, autre redirection ratée.
- **51 fichiers non suivis** au total, dont ~45 rapports générés par les robots (`rapports/veille/*.md`, `run-*.log`, `rapports/audit/*`).

`rapports/` est partiellement versionné (87 fichiers) mais les nouvelles productions ne le sont pas, ce qui rend `git status` illisible et fait courir le risque de commiter des logs par mégarde avec un `git add .`.

**Recommandation :** trancher explicitement — soit `rapports/**/run-*.log` dans `.gitignore` (les logs sont du bruit), soit versionner tout. Et ajouter `tmp-*.json` au `.gitignore`.

### 6.3 Images de travail versionnées

`brouillon.png`, `brouillon_magic.png`, `capture-arcane-coupure.png`, `capture-assemblee-actuel.png`, `capture-dresseur-boutons.png`, `capture-ecole-actuel.png`, `exemple carte magic.png`, `exemple_carte_pokemon.png` — **~840 Ko** de captures de travail à la racine du dépôt, alors que `.gitignore` exclut déjà correctement `captures-decks-review/`, `captures-cards-format/` et `captures-decks-ribbon/`.

Même remarque pour `skins-reference.html` (444 l.) et `skins2-reference.html` (394 l.), maquettes de travail à la racine.

**Recommandation :** un dossier `design/` ignoré, ou un déplacement dans `docs/` s'ils gardent une valeur de référence.

### 6.4 Absence de tests automatisés

Aucun fichier de test, aucun script `test` dans `package.json`, aucune dépendance de test. Plusieurs commentaires mentionnent pourtant un « banc d'essai » et exportent explicitement des fonctions à cette fin :
- `server/poller.js:783` : *« processSource/processParamSource/decideTransition exposés pour le banc d'essai »*
- `server/routes/collections.js:887` : *« exposé pour tests »*

Les fonctions **pures** déjà isolées sont idéalement testables sans base de données ni réseau, et couvrent la logique la plus critique du produit :

| Fonction | Fichier | Pourquoi elle mérite des tests |
|---|---|---|
| `decideTransition` | `poller.js:224` | Machine à états des alertes — cœur du produit |
| `inWindow` / `isQuietNow` | `quiet-hours.js` | Passage par minuit, plage vide |
| `validateParams` | `params.js:333` | 6 types, bornes, patterns |
| `resolveInstances` | `collections.js:740` | Résolution profil/défaut/multi |
| `validateForumBody` / `validateDisplayName` | `ugc.js` | Filtres anti-spam et anti-usurpation |
| `slugBase` / `resolveCollision` | `forum-slug.js` | Stabilité des identifiants publics |
| `isPrivateIP` | `safe-fetch.js:120` | Barrière anti-SSRF |
| `labelFromDynamicValue` | `params.js:400` | Dérivation de libellé |

**Recommandation :** `node --test` (intégré à Node, **zéro dépendance**) sur ces 8 fonctions. C'est probablement le meilleur rapport effort/valeur du rapport après le §1.4 — quelques centaines de lignes protégeant la logique métier la moins observable.

### 6.5 Dettes calendaires non outillées

**92 fichiers de sources contiennent un TODO**, dont **41 avec une échéance datée** (« TODO 2027 », « TODO 2028 », « TODO : CAMPAGNES[2027] dès parution »). Ce sont des sources calendaires dont les tables d'années sont codées en dur : elles deviendront **silencieusement muettes** au changement d'année, sans erreur ni alerte.

Le robot de veille couvre partiellement le sujet, mais rien ne fait remonter mécaniquement « cette source n'a plus de données au-delà du 31/12/2026 ».

**Recommandation :** convention machine-lisible en tête de ces fichiers, par exemple `// @data-valid-until: 2026-12-31`, et un script (10 lignes) exécuté par le robot mensuel qui liste les sources arrivant à expiration dans les 90 jours.

---

## 7. Ce qui est déjà exemplaire (à ne pas toucher)

Pour équilibrer : ces éléments constituent des références internes dont les autres parties devraient s'inspirer.

- **`server/sources/lib/`** — 21 modules partagés (factories vigilance, calendrier, vacances, release, statuspage ; parseurs ICS, RSS, PDF), utilisés par **202 des 274 sources**. La bonne architecture existe déjà ; les 72 sources restantes sont simplement celles qui n'y sont pas passées.
- **`server/safe-fetch.js`** — anti-SSRF appliqué à *chaque saut* de redirection dans `safeProbe`, avec une justification écrite. Rigoureux.
- **`server/quiet-hours.js`** — 45 lignes, purement fonctionnel, gestion correcte du passage par minuit, aucune dépendance à la base. Modèle du genre.
- **`public/js/session.js`** — la déduplication d'appels en vol est expliquée avec le problème mesuré, la solution, **et** la limite (« ce n'est pas un cache »). Le commentaire répond aux questions avant qu'on les pose.
- **`public/css/tokens.css`** — 52 lignes qui font autorité sur toute l'identité visuelle, avec `dev.css` qui se contente de redéfinir les variables. Discipline CSS remarquable.
- **`server/ugc.js`** — l'échec bruyant si `IP_HASH_SALT` est absent (plutôt qu'un sel de repli en dur) est exactement la bonne décision, et elle est justifiée par écrit.
- **La documentation des contreparties** — `api.js:142` (« Contrepartie ASSUMÉE : un like qui vient de changer peut mettre jusqu'à 60 s à apparaître »), `sitemap.js` (« VOLONTAIREMENT ABSENTS : /deck/:token — un token de partage publié dans un sitemap détruit la nature du lien non listé »). Ce niveau d'explicitation des arbitrages est rare.

---

## 8. Plan d'action suggéré

Trié par **valeur ÷ risque**. Les 5 premiers points sont mécaniques et sans effet fonctionnel.

### Lot A — nettoyage sans risque (≈ 1 200 lignes retirées)
1. Supprimer les 73 `fetchFn` → `fetch` global ; retirer `node-fetch` (§1.1)
2. Supprimer les 4 fonctions mortes de `poller.js` / `webpush.js` (§2.1)
3. Supprimer le `pagesRouter` orphelin de `le-point.js` (§2.2)
4. Retirer le bloc de diagnostic IPv6 de `index.js` (§2.5)
5. `git rm` des 5 fichiers de détritus + `.gitignore` pour `tmp-*.json` et `rapports/**/run-*.log` (§6.1, §6.2)

### Lot B — correctifs de sûreté (petits, à effet réel)
6. **Verrou d'exécution du poller** (§3.1) — 3 lignes, supprime un risque de course en production
7. `BEGIN/COMMIT` autour de `init.sql` (§4.1) — 1 ligne, rend les migrations atomiques
8. Corriger `jsonb_array_length` + journaliser l'erreur dans `veille-readonly.js` (§3.12)
9. Corriger la branche morte de `staleWhileRevalidate` dans `sw.js` (§2.9)
10. Ajouter les middlewares 404 et erreur dans `index.js` (§3.11)

### Lot C — factorisation à fort rendement
11. **Extraire le SELECT « carte enrichie »** (§1.4) — ferme la classe de bugs la plus récurrente
12. Un module de rate-limit partagé, remplaçant les 6 copies (§1.8)
13. Une factory `client-credentials-auth` pour les 4 modules OAuth (§1.3)
14. `fetchJson` partagé dans `sources/lib/` + migration progressive des ~70 sources (§1.2)
15. `server/escape.js` et `server/config.js` (BASE_URL) uniques (§1.9, §5.1)

### Lot D — performance
16. Compteurs agrégés en fin de cycle : 548 → 2 requêtes (§3.2)
17. `GET /history` : passage de O(90n) à O(n) (§3.4)
18. `Promise.all` sur `GET /api/my-alerts` (§3.5)
19. Gabarits SEO lus une fois au démarrage (§3.6)
20. Parallélisme borné du poller (§3.1) — après le verrou du lot B

### Lot E — fond
21. Tests `node --test` sur les 8 fonctions pures (§6.4)
22. Découpage d'`init.sql` en schéma + catalogue + migrations numérotées (§4.1)
23. Retrait de la valeur fantôme `'unlisted'` (§2.7)
24. Convention `@data-valid-until` + contrôle mensuel des sources calendaires (§6.5)

---

*Aucune modification n'a été apportée au code lors de cet audit.*
