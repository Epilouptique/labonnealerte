# Rapport d'audit sécurité (lecture seule) — 2026-09-25

## Résumé (par sévérité)

- **majeur** — 5 vulnérabilités npm (`npm audit`) : 4 `high`, 1 `moderate`, 0 critique. Deux touchent des dépendances **prod directes** (`adm-zip`, `sharp`) ; `ip-address` (transitive) concerne la classification SSRF. Toutes ont un correctif annoncé (`fixAvailable`).
- **mineur** — RAS côté code applicatif : aucune route destructive/debug/dump exposée, toutes les routes d'écriture/données perso sont authentifiées et scoppées au propriétaire, aucun contournement de `safe-fetch` sur URL utilisateur, aucune injection SQL par concaténation, aucun secret en dur.

Aucune régression du type « route DELETE/debug oubliée en prod » (motif du robot) n'a été trouvée.

---

## 1. Dépendances (`npm audit --json`)

Registre npm joignable, audit exécuté. Total : **5** (high 4 / moderate 1 / low 0 / critical 0). 127 deps prod, 58 dev.

### Dependencies (prod — risque réel en service)

| Paquet | Sév. | Direct | Avis | Correctif |
|---|---|---|---|---|
| `adm-zip` | **high** | oui | Alloc mémoire non bornée via taille décompressée déclarée (DoS, `<0.6.1`) + suivi de symlinks à l'extraction (écrasement de fichier, `>=0.5.9 <=0.6.0`) | `fixAvailable` (non-breaking annoncé) |
| `sharp` | **high** | oui | Vulns libheif (heap overflow, `<0.35.4`) | `fixAvailable` |
| `ip-address` | **high** + 2 moderate | non (transitive) | Décodage octets à zéro initial en décimal → **contournement SSRF / trust-boundary** ; suffixe CIDR et adresses IPv4-mapped/NAT64 mal classées | `fixAvailable` |
| `qs` | moderate | non (transitive) | Bypass array-limit + DoS via `isBuffer` contrôlé | `fixAvailable` |

**Priorisation :**
- `adm-zip` est consommé par `cyclones-outremer` (extraction du ZIP DPVigilance de Météo-France, endpoint officiel figé — pas d'URL utilisateur). Le risque symlink/DoS suppose un contenu ZIP hostile ; la source étant officielle, l'exposition réelle est faible, mais **c'est une dep prod directe avec fix non-breaking** → à monter.
- `sharp` : traitement d'images côté serveur. `high` prod directe, fix disponible → à monter.
- `ip-address` : `high` **parce qu'elle touche la logique de classification d'IP anti-SSRF**. À vérifier : savoir si `server/safe-fetch.js` s'appuie sur ce paquet (transitive, chaîne non affichée par l'audit) pour ses contrôles d'IP privée/loopback. Si oui, la mise à jour est prioritaire ; si `safe-fetch` fait sa propre validation d'IP, l'impact est indirect. **Je me suis abstenu de tester** — à trancher par lecture de la chaîne `npm ls ip-address` (non exécuté ici, hors périmètre strict).

### devDependencies (outillage — risque moindre)

| Paquet | Sév. | Avis |
|---|---|---|
| `brace-expansion` | high | DoS par expansion non bornée (OOM) |

Transitive d'outillage de build/test. **Moins urgent** qu'une vuln prod servie en ligne, malgré le niveau `high`.

> Aucune commande `npm audit fix` n'a été exécutée (lecture seule).

---

## 2. Routes exposées

Point de montage réel (`server/index.js`) — la vérité est le montage, pas le fichier :

- `/api` → apiRouter, subscribe, myAlerts, push, lePoint, **userTasks**, **communityReports** (tous derrière `apiLimiter` global, `app.use('/api', apiLimiter)` ligne 178)
- `/api/dev` → devRouter (rate-limit propre 10/min/IP)
- `/auth` → authRouter
- `/` → sitemap, **forum**, pages, myAlertsPages, userTasksPages

> Nouveaux routers non listés dans les « montages connus » du cahier des charges : **forum**, **user-tasks**, **community-reports**. Vérifiés ci-dessous — RAS.

**Routes destructives / sensibles — toutes contrôlées :**

- `DELETE /api/my-alerts/account` (`myalerts.js:596`) — RGPD, `authenticate(token)` obligatoire (401 sinon), suppression scoppée à `auth.id`, cascade. ✅ Légitime (effacement piloté par l'abonné authentifié).
- `DELETE /api/user-tasks/:id` (`user-tasks.js:349`) — auth + `WHERE subscriber_id = $2` (404 si tâche d'un autre), `id` validé `Number.isSafeInteger`. ✅
- `DELETE /api/sources/:id/like` (`api.js:222`) — auth (401 anonyme), `likeLimiter` 20/min/IP. ✅
- `DELETE /api/favorites` (`api.js:333`) — route de favoris utilisateur (auth attendue, cf. section likes du projet). ✅
- `POST /forum/admin/post|topic/:id/hide|unhide|lock|unlock` (`forum.js:956-961`) — **chacune derrière `requireAdmin(req,res)`** (`setPostHidden`/`setTopicFlag`), `id` parsé en entier. ✅ Pas de route admin non authentifiée.

**Recherche ciblée `debug` / `dump` / `reset` / `test` / `__` / `/admin` :** aucune route de ce type montée. Les seules occurrences `.delete(...)` hors routes HTTP sont des `Map.delete()` de rate-limiters en mémoire (auth.js, dev.js, forum.js, myalerts.js). ✅

**Validation des entrées :** les routes lues valident type et bornes (`typeof`, `parseInt`/`Number.isSafeInteger`, enums fermés, slice de longueur). `dev.js` borne l'URL, les catégories (liste fermée `sanitizeCategories`), le `params_schema` (`validateParamsSchema`).

**Rate-limiting :** `apiLimiter` global sur `/api` ; limiters dédiés sur les routes chères/publiques (`dev.js` 10/min, `likeLimiter` 20/min, lookups myalerts 30/min, forum, user-tasks). Rappel dette connue (hors périmètre code) : `/auth/*` n'a pas de rate-limit dédié (déjà noté dans l'audit-architecture du projet) — **mineur**, à confirmer si souhaité.

---

## 3. SSRF & injection

### SSRF — RAS

Toutes les sources effectuant un fetch vers une **URL fournie par l'utilisateur** passent par `server/safe-fetch.js` :

- `veille-page.js:63` → `safeFetchText`
- `veille-stock.js:61` → `safeFetchText`
- `veille-rss.js:48` → `safeFetchText`
- `lib/panneaupocket-parser.js:106` → `safeFetchText` (+ re-validation `validPanneauUrl` en amont)
- `routes/dev.js` (validate-manifest + sonde paramétrée) → `safeFetchJson` ; la sonde dynamique (ligne 142) réutilise `fetchManifest` → mêmes protections.

Les `fetch`/`node-fetch`/`https.get` **directs** trouvés portent tous sur des **URL constantes figées en dur** (endpoints officiels : Météo-France, RTE, INSEE, USGS, NOAA, geo.api.gouv.fr, OAuth Google/GitHub dans `auth.js`, doomname interne, etc.) — acceptable par le cahier des charges. Aucun `fetch` direct sur une URL utilisateur contournant `safe-fetch`.

> Réserve : voir §1 `ip-address` — si `safe-fetch` délègue la classification d'IP à ce paquet vulnérable, la protection SSRF elle-même pourrait être partiellement contournable (octet à zéro initial, CIDR, IPv4-mapped). À vérifier par lecture de la chaîne de dépendances. Non testé (aucune sonde live).

### Injection SQL — RAS

Aucune concaténation/template d'entrée utilisateur dans une requête. Les seuls templates littéraux dans `pool.query` interpolent un **nom de colonne issu d'un whitelist de constantes**, jamais une entrée user :

- `auth.js:44,50` — `${col}` ∈ `{'google_id','github_id'}` (valeur fixe, commentaire à l'appui).
- `forum.js:950` — `${column}` ∈ `{'hidden','locked'}` (constante littérale passée par `setTopicFlag`).

Toutes les autres requêtes utilisent des paramètres `$1/$2…`. ✅

---

## 4. Cohérence validation client / serveur — RAS

Les formulaires d'écriture revalident côté serveur, indépendamment du JS client :

- `/api/dev/submit-source` : `name`/`manifest_url` requis + typés, URL reparsée (`new URL`, protocole http/https only), catégories via liste fermée, `params_schema` via `validateParamsSchema`, longueurs bornées avant INSERT (respect des CHECK).
- `/api/dev/validate-manifest` : URL typée + `safeFetchJson`, schéma validé serveur.
- `/api/my-alerts/toggle`, `/user-tasks/:id`, likes : auth + validation de type/bornes + existence source côté serveur.

Aucun contrôle trouvé qui n'existerait que côté navigateur.

---

## 5. Secrets en dur — RAS

Grep des motifs (`sk-…`, `Bearer …`, `api_key`/`secret`/`password`/`token = "…"`) sur `server/` : **aucune valeur codée en dur**. Les secrets sont lus via `process.env.X` (normal). `.env` gitignoré, non lu.

---

## Notes d'abstention (périmètre lecture seule respecté)

- Aucune requête vers `labonnealerte.fr` ni vers un service en ligne (seul `npm audit` a joint le registre npm).
- Aucun `runCycle()`, aucun accès DB, aucun `git` en écriture, aucune modification hors ce rapport.
- Chaîne de dépendance de `ip-address` **non résolue** (`npm ls` non exécuté par prudence de périmètre) : je recommande à Hugo de vérifier si `safe-fetch` en dépend, car c'est le seul point où une vuln transitive pourrait dégrader une protection de sécurité active.

## Recommandation (non appliquée)

Envisager la mise à jour des 3 deps prod (`adm-zip`, `sharp`, `ip-address`) via un `npm audit fix` **relu avant exécution** par Hugo (les correctifs sont annoncés non-breaking mais à vérifier au diff `package-lock.json`). Priorité : `ip-address` (impact SSRF potentiel) > `sharp`/`adm-zip` (prod directes) > `qs`/`brace-expansion` (transitives / dev).
