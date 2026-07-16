# Rapport d'audit sécurité — labonnealerte.fr

**Date :** 2026-07-16
**Périmètre :** dépôt local uniquement (code, dépendances, routes telles qu'écrites). Lecture seule.
**Robot 2 — Auditeur de sécurité hebdomadaire.** Aucune requête vers la prod, aucune modification hors ce rapport, aucun accès DB.

---

## Résumé

**RAS** — aucun constat, quelle que soit la sévérité.

- (info) `npm audit` : **0 vulnérabilité** (171 dépendances scannées).
- (info) La régression cible du robot (route DELETE/debug/dump non authentifiée) est **absente** : la seule route destructive est la suppression de compte par l'abonné authentifié.

---

## Détail par section

### a) Dépendances (npm audit)

`npm audit --json` exécuté avec succès (registre npm joignable).

| Sévérité | dependencies (prod) | devDependencies |
|----------|--------------------|-----------------|
| critical | 0 | 0 |
| high | 0 | 0 |
| moderate | 0 | 0 |
| low | 0 | 0 |

Total : **0 avis**. Métadonnées : 112 prod, 58 dev, 31 optional, 171 au total. Aucun `npm audit fix` requis. **RAS.**

### b) Routes exposées

Montages réels vérifiés dans `server/index.js` (le montage fait foi, pas l'existence de fichier) : `/api` (apiLimiter global 120 req/min/IP + routers api, subscribe, myalerts, push), `/api/dev` (dev), `/auth` (auth OAuth), `/` (pages statiques + pages HTML email).

**Aucune route destructive/debug/test/dump/reset/admin montée en prod.** Recherche `app.delete`/`router.delete` + patterns `debug|dump|reset|test|admin|__` : les seuls `.delete(` hors JS Map/Set sont :
- `myalerts.js:330` `DELETE /api/my-alerts/account` — **authentifiée** (`authenticate(req.body.token)`), supprime uniquement `WHERE id = $1` (le compte de l'appelant). Légitime : suppression autonome pilotée par l'abonné. **OK.**

Routes d'écriture / données personnelles — toutes protégées :

| Route | Auth | Validation entrées | Rate-limit |
|-------|------|--------------------|-----------|
| `POST /api/my-alerts/request` | (magic-link, anti-énumération, réponse neutre) | EMAIL_RE | 5/min/IP dédié |
| `GET /api/my-alerts[/sources/history]` | `authenticate(token)` | — | apiLimiter |
| `POST /api/my-alerts/preferences` | `authenticate(token)` | booléen | apiLimiter |
| `POST /api/my-alerts/profile` | `authenticate(token)` | `isValidCountry`/`isValidDepartement`/`VALID_SLUGS` (whitelists) | apiLimiter |
| `POST /api/my-alerts/quiet-hours` | `authenticate(token)` | heures entières bornées 0-23 | apiLimiter |
| `POST /api/my-alerts/toggle[-param]` | `authenticate(token)` | `validateParams`, source scoping par `auth.id` | apiLimiter |
| `DELETE /api/my-alerts/account` | `authenticate(token)` | scope `id = auth.id` | apiLimiter |
| `POST /api/logout` / `push/(un)subscribe` | `authenticate(token)` | — | apiLimiter |
| `POST /api/subscribe` | double opt-in (token confirm) | subscribeLimiter dédié | oui |
| `POST /api/dev/validate-manifest` | publique (par nature) | URL typée + **safe-fetch** | 10/min/IP dédié |
| `POST /api/dev/submit-source` | publique (`enabled=false`, revue manuelle) | URL/proto, `sanitizeCategories`, `validateParamsSchema` | 10/min/IP dédié |

Les routes chères (`/api/dev` fetch distant) portent un rate-limiter mémoire dédié (10/min/IP) **en plus** de l'apiLimiter global — jugé suffisant pour un usage manuel de proposition. **RAS.**

### c) SSRF & injection

**SSRF :** la seule route effectuant un fetch vers une **URL fournie par l'utilisateur** est la validation de manifeste (`/api/dev/validate-manifest` + sonde paramétrée) et la source `veille-rss`. Les deux passent **exclusivement** par `server/safe-fetch.js` (`safeFetchJson`/`safeFetchText` : rejet IP privées/loopback/lien-local IPv4+IPv6, `redirect: 'error'`, timeout, taille plafonnée, http/https seulement). Vérifié :
- `routes/dev.js:12,50,121,143` → `safeFetchJson`.
- `sources/veille-rss.js:13,48` → `safeFetchText`, `https` uniquement (`URL_RE`), plafond `MAX_FETCH`, cache 2h.

Tous les autres `fetch`/`node-fetch` du dossier `sources/` visent des **hosts officiels figés en dur** (Météo-France, RTE, api.github.com, registry.npmjs, ECCC, etc.) — acceptable. `doomname.js:18` : host figé (`DOOMNAME_TRACK_URL` env, défaut `www.doomname.com`), secret via header env. OK. Auth OAuth (`auth.js`) : endpoints Google/GitHub constants.

- Cas des sources paramétrées interpolant un paramètre utilisateur dans un host figé (ex. `github-release.js:14` `` `https://api.github.com/repos/${repo}/…` ``) : pas de SSRF (l'autorité ne peut être détournée par un contenu de path), et l'entrée est bornée à `owner/repo` par un `pattern` `^[A-Za-z0-9_.-]{1,39}/[A-Za-z0-9_.-]{1,100}$` re-testé **côté serveur** (`REPO_RE`, `checkWithParams:86`) — pas de `@`/`:`/`/` parasite possible. **OK.**

**Injection SQL :** aucune concaténation/template littéral d'entrée utilisateur dans une requête. Toutes les requêtes `pool.query(...)` inspectées utilisent des paramètres `$1/$2…`. Deux requêtes à **nom de colonne** dynamique dans `auth.js:43,49` (`SELECT ${col}` / `SET ${col}`) : `col` provient exclusivement des littéraux internes `'google_id'`/`'github_id'` (jamais de `req`), la valeur passe en `$1`. Non exploitable. **RAS.**

### d) Cohérence validation client / serveur

Les formulaires d'écriture ont un équivalent serveur qui ne fait jamais confiance au client :
- `/api/dev/submit-source` : `name`/`manifest_url` requis + typés, `new URL()` + contrôle protocole, `sanitizeCategories` (liste fermée 1-3 tags), `validateParamsSchema` côté serveur avant stockage.
- `/api/dev/validate-manifest` : schéma OpenAlert re-validé serveur (champs requis, ISO 8601, enum d'état) + sonde dynamique.
- `/api/my-alerts/profile` : `country`/`departement`/`interests` re-validés contre whitelists serveur (`geo.js`, `VALID_SLUGS`) — un `departement` hors FR est forcé à `null` côté serveur.
- `/api/my-alerts/quiet-hours` : bornes 0-23 re-vérifiées serveur.
- `/api/subscribe` : double opt-in serveur.

Aucun contrôle observé qui n'existerait que côté navigateur. **RAS.**

### e) Secrets en dur

`grep` des patterns (`api_key`, `secret`, `password`, `token`, `Bearer `, `sk-…`) sur `server/` : **aucun secret en dur**. Tous les secrets sont lus via `process.env.X` (`GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_SECRET`, `DOOMNAME_INTERNAL_KEY`, VAPID, RTE OAuth…), ce qui est le comportement attendu. `.env` non lu (gitignoré). Les occurrences `Bearer ` dans `auth.js:125,175` concatènent un `access_token` obtenu à l'exécution — pas un secret figé. **RAS.**

---

## Conclusion

Aucun correctif requis. Posture défensive cohérente : safe-fetch systématique sur les URL utilisateur, requêtes paramétrées partout, auth par token sur toutes les écritures de données personnelles, rate-limiters superposés, secrets en variables d'environnement, headers Helmet/CSP stricts. Aucun point de suivi ouvert cette semaine.
