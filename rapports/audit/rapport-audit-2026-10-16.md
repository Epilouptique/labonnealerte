# Rapport d'audit sécurité (lecture seule) — 2026-10-16

## Résumé (≤ 5 lignes)
- **majeur** : `npm audit` = 1 critique + 7 high + 1 moderate, mais le **critique (`proxy-addr`)** et les high `braces`/`chokidar`/`nodemon` relèvent de transitives/devDeps ; côté **dépendances de prod**, `adm-zip` (high, usage réel cyclones-outremer) et `sharp` (high, traitement image) sont les vrais points à traiter.
- **mineur** : `ip-address` (high, mais SSRF couvert par notre propre `safe-fetch`), `qs` (moderate).
- **RAS routes** : aucune route destructive/debug/dump non authentifiée montée ; tous les `DELETE` sont authentifiés et scopés propriétaire ; routes admin forum gardées par `requireAdmin`.
- **RAS SSRF/injection** : aucune concaténation SQL sur entrée utilisateur ; toutes les URL utilisateur passent par `safe-fetch`.
- **RAS secrets** : aucun secret en dur dans `server/` ni `public/`.

---

## 1. Dépendances (`npm audit`)
`npm audit --json` a abouti (registre joignable). Total : **9 avis** — 1 critique, 7 high, 1 moderate, 0 low. 187 deps (128 prod, 58 dev, 31 optional).

### Dépendances de PRODUCTION (risque réel en service)
| Paquet | Sév. | Direct ? | Nature | Fix non-breaking ? |
|---|---|---|---|---|
| **adm-zip** | high | direct (prod) | Décompression ZIP : bomb-DoS (CVE-2026-39244 + bypass taille=0), crash DEFLATE async, path/symlink overwrite, SUID/SGID. Usage réel : flux ZIP DPVigilance de `cyclones-outremer` (`adm-zip` cité dans etat-projet). | `fixAvailable: true` (non-majeur annoncé) |
| **sharp** | high | direct (prod) | Vulns libheif + librsvg (CVE-2026-96889, use-after-free) sur décodage image. | `fixAvailable: true` |
| **ip-address** | high/moderate | transitive (prod) | Mauvaise classification SSRF/NAT64/IPv4-mapped. **Atténué chez nous** : nos fetchs d'URL utilisateur passent par `server/safe-fetch.js` (contrôle propre), on ne s'appuie pas sur `ip-address` pour la frontière de confiance. | `fixAvailable: true` |
| **qs** | moderate | transitive (prod) | Array-limit bypass + DoS via isBuffer. Parsing de query-string Express. | `fixAvailable: true` |
| **proxy-addr** | **critical** | transitive (prod) | CVSS 9.1 — spoofing d'IP via sous-réseau de confiance IPv4-mapped IPv6 (bypass `trust proxy`). Transitive d'Express. | `fixAvailable: true` |

> **Nuance de priorisation `proxy-addr`** : classé *critical* par l'avis, mais l'impact réel chez nous est limité — `clientIp()` ne fait pas confiance aveuglément à `x-forwarded-for` (il privilégie `cf-connecting-ip` vérifié par `ORIGIN_SECRET`, puis le 1er IP **public**). La mise à jour reste recommandée car elle est annoncée non-breaking, mais ce n'est pas un danger immédiat compte tenu de notre chaîne Cloudflare.

### devDependencies (outillage, risque moindre)
| Paquet | Sév. | Chaîne | Note |
|---|---|---|---|
| **nodemon** | high | direct (dev) | via `chokidar` → `braces`. Outil de dev local uniquement, **non servi en prod**. Le fix annoncé est `nodemon@1.14.10` = **rétrograde SemVer-major** (downgrade) → à ne PAS appliquer tel quel. |
| **chokidar** | high | dev | via `braces`. idem (dev-only). |
| **braces** | high | dev | DoS stack-exhaustion sur patterns imbriqués. Chemin dev-only (watch de fichiers). |

**Recommandation de priorité** : traiter d'abord **`adm-zip`** et **`sharp`** (prod, surface réelle), puis `proxy-addr`/`qs`/`ip-address` (fix non-breaking annoncés). Les high `nodemon`/`chokidar`/`braces` sont dev-only et leur « fix » est un downgrade → à laisser tel quel ou migrer manuellement hors de ce robot. **Aucun `npm audit fix` exécuté** (lecture seule).

---

## 2. Routes exposées
Montage réel relevé dans `server/index.js` (la vérité, pas le fichier) :
- `/api` → apiLimiter (ligne 207) **puis** api, subscribe, myAlerts, push, le-point, **user-tasks, community-reports, community-sources, organizations, municipal-events, app-api** (lignes 209-220) — ces 6 derniers sont **nouveaux depuis `etat-projet.md`** (daté juillet).
- `/api/dev` → dev (221) · `/auth` → auth (223) · `/` → sitemap, pages, forum, myAlertsPages, userTasksPages (168, 179, 346-351).

### Vérification régression « route destructive/debug » (motif du robot) → **RAS**
- `router.delete` trouvés : 3, **tous légitimes et authentifiés** :
  - `api.js:222` `DELETE /api/sources/:id/like` — `likeLimiter` + compte requis.
  - `api.js:333` `DELETE /api/favorites` — route compte.
  - `community-sources.js:404` `DELETE /community-sources/:id` — `requireAuthor` + `loadOwned` (ownership) + statut borné `draft|testing` + `WHERE author_subscriber_id=$2` (double garde).
- Routes « admin » forum (`forum.js:956-961`) : toutes derrière `requireAdmin(req,res)` (hide/unhide/lock). OK.
- `municipal-events.js:320` `POST …/notify/test` = « test à moi seul » (aperçu à son propre compte), pas un dump/debug. OK.
- Aucun path `debug`/`dump`/`reset`/`__` monté. Les occurrences `reset` relevées = `scripts/reset-likes.js` (hors-ligne, non monté) et texte de commentaire.

### Auth / validation / rate-limit (points notables)
- `apiLimiter` global couvre tout `/api`. Les routes chères à URL utilisateur (`/api/dev/validate-manifest`, `/api/dev/submit-source`) ont **en plus** un `rateLimit` dédié (dev.js:114, 167).
- SQL à identifiant interpolé mais **jamais sur entrée utilisateur** (whitelist) et valeurs toujours paramétrées `$1/$2` :
  - `auth.js:44,50` `${col}` ∈ {`google_id`,`github_id`} (constantes).
  - `forum.js:950` `${column}` ∈ {`hidden`,`locked`} (via `setTopicFlag`, littéraux).
  - `municipal-events.js:95,106` / `orgs/municipal-notify.js:139` `${EVT_COLUMNS}`/`${SUB_FIELDS}` = listes de colonnes constantes.
  → Acceptable, mais **à garder sous surveillance** : ce motif n'est sûr que tant que ces variables restent des constantes littérales.

---

## 3. SSRF & injection
- **SSRF** → **RAS**. Toutes les sources à **URL fournie par l'utilisateur** passent par `server/safe-fetch.js` : `veille-page`, `veille-rss`, `veille-stock`, `veille-agenda`, `domaine-disponibilite`, `domaine-securite`, `youtube-chaine`, `ma-collectivite`, `hausse-tarif-operateur/streaming`, + `routes/dev.js` (`validate-manifest` via `safeFetchJson(rawUrl,{robots:true})`, dev.js:51) et `routes/community-sources.js`.
- Fetchs directs **sur hôte figé en dur** (acceptables) : OAuth Google/GitHub (`auth.js:111-186`, `app-api.js:530`), IPLocate (`profile-autofill.js:58` & `index.js:64` → hôte constant `iplocate.io`, seule l'IP est injectée via `encodeURIComponent`, **pas** une URL utilisateur), partial Orange (`hausse-tarif-operateur.js:170` = `fetch` relatif **en contexte navigateur headless**, même origine, section = constante interne). Les ~70 autres `fetchFn =` sont des **définitions d'import** `node-fetch`, pas des appels à URL dynamique.
- **Injection SQL** → **RAS**. Aucune concaténation/template de requête à partir de `req.body/query/params` ; recherche ciblée des `pool.query` interpolés = uniquement les identifiants whitelistés ci-dessus.

---

## 4. Cohérence validation client / serveur
- `/api/dev/submit-source` et `/validate-manifest` valident **côté serveur** (`params.js`, `safeFetchJson` robots-aware, `rateLimit`) — pas de dépendance au seul JS client.
- `community-sources` : motif de signalement validé serveur (`lc.isValidReportReason`, community-sources.js:438), quota 20/h serveur (`reportRateOk`), statut borné serveur avant DELETE.
- Aucun contrôle sensible trouvé qui n'existerait **que** côté front. **RAS** (revue par échantillon des formulaires d'écriture ; pas de preuve de contrôle client-only contournable).

---

## 5. Secrets en dur
- `server/` : **RAS**. Unique match = `safe-fetch.js:34` `BOT_TOKEN = 'LaBonneAlerte'` → **pas un secret** (jeton de User-Agent annoncé dans robots.txt, public par nature).
- `public/` : **RAS** (0 match).
- Les clés sont lues via `process.env.*` (`IPLOCATE_APIKEY`, `ORIGIN_SECRET`, clés OAuth, `METEOFRANCE_API_KEY`…) — usage normal. `.env` gitignoré, non lu.

---

## Remarques de suivi (non bloquant, pour Hugo)
- `etat-projet.md` (juillet) ne mentionne pas les 6 nouveaux routeurs `/api` (user-tasks, community-*, organizations, municipal-events, app-api) ni forum/userTasksPages — l'inventaire des surfaces exposées mériterait une mise à jour, utile pour les prochains passages du robot.
- Aucun correctif proposé en bloc BROUILLON : les fix dépendances sont des `npm audit fix` ciblés (prod : adm-zip, sharp) que seul Hugo doit lancer, hors périmètre lecture seule de ce robot.
