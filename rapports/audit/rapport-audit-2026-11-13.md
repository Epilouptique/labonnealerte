# Rapport d'audit sécurité — 2026-11-13

Robot 2 — auditeur en LECTURE SEULE, périmètre dépôt local uniquement. Aucune
requête vers labonnealerte.fr, aucune exécution contre un service en ligne,
aucune modification hors ce rapport.

## Résumé (classé par sévérité)

1. **critique** — `proxy-addr` (transitif d'Express) : CVE d'usurpation d'IP via sous-réseau de confiance IPv4-mapped IPv6 (CVSS 9,1). En **dependencies** prod. `fix: true` non-breaking.
2. **majeur** — plusieurs vulns `high` en **dependencies** prod (DoS) : `adm-zip`, `body-parser`, `brace-expansion`, `ip-address`, `undici`, `sharp` (devDep). Toutes corrigeables.
3. **mineur** — 3 vulns `moderate` (`qs`, `minimatch`, `nodemon`) — DoS/outillage, risque faible.
4. **RAS routes** : aucune route DELETE/debug/dump/reset/admin non authentifiée montée. La régression qui a motivé ce robot **n'est pas présente**. Tous les DELETE visent une ressource possédée par l'appelant authentifié.
5. **RAS SSRF / injection SQL / secrets** : URLs utilisateur passent par `safe-fetch`, requêtes paramétrées partout, aucun secret en dur.

---

## 1. Dépendances (`npm audit`)

`npm audit --json` a abouti (registre joignable). Total : **10 vulnérabilités** —
1 critique, 6 high, 3 moderate, 0 low.

### dependencies (prod — risque réel en service)

| Paquet | Sévérité | Direct ? | Nature | Fix |
|---|---|---|---|---|
| **proxy-addr** | **critique** (9,1) | transitif (via express) | Usurpation d'IP via sous-réseau IPv4-mapped IPv6 (GHSA-jqcg-44mw-7w3h) | `true` (non-breaking) |
| **undici** | high | direct (`6.29.0`) | DoS EventSource / content-encodings / bypass validation TLS | `6.29.1` (non-breaking) |
| **adm-zip** | high | direct (`^0.6.0`) | DoS bombe de décompression, overwrite via symlink, SUID/SGID (7 avis) | `true` |
| **body-parser** | high | transitif | DoS via octets en traîne sur corps compressé | `true` |
| **brace-expansion** | high | transitif | DoS expansion/récursion non bornée (5 avis) | `true` |
| **ip-address** | high | transitif | Mauvaise classification SSRF/trust-boundary (9 avis) | `true` |
| **qs** | moderate | transitif | DoS / bypass array-limit | `true` |

> **Priorité réelle.** `proxy-addr` est le point le plus sérieux : il décide quelle
> IP est « de confiance » derrière le proxy. L'app s'appuie sur `clientIp()` /
> `x-forwarded-for` / `cf-connecting-ip` (cf. etat-projet « Géoloc IP ») pour
> l'autofill géo et le rate-limiting par IP → une usurpation d'IP affaiblit ces
> deux mécanismes. À corriger en premier. `undici` et `ip-address` touchent la
> surface SSRF/réseau sortant (safe-fetch), donc à traiter juste après.

### devDependencies (outillage — risque moindre)

| Paquet | Sévérité | Nature | Fix |
|---|---|---|---|
| **sharp** | high | Vulns libheif/librsvg (traitement d'images, build d'icônes) | `true` |
| **minimatch** | moderate | DoS glob | via `nodemon` (breaking) |
| **nodemon** | moderate | via minimatch | `3.1.11` (semver-major) |

`sharp` et `nodemon`/`minimatch` ne tournent pas dans le process servi en prod
(génération d'icônes hors ligne, `nodemon` = dev seulement) → urgence moindre
qu'une `high` en dependencies.

---

## 2. Routes exposées

Montages réels relevés dans `server/index.js` : `/api` (api, subscribe, myalerts,
push, le-point, user-tasks, community-reports, community-sources, organizations,
municipal-events, app-api), `/api/dev` (dev), `/auth` (auth), `/` (sitemap,
forum, pages). `apiLimiter` global posé sur `/api` (index.js:207) **avant** tous
les routeurs `/api`.

> **Note de périmètre.** Le prompt listait 4 montages « connus » ; le dépôt en
> monte davantage (forum, community-*, organizations, municipal-events, app-api,
> user-tasks). Ces routeurs plus récents ont donc été examinés en priorité.

### Routes destructives / debug — vérification ciblée (régression connue)

**RAS.** Aucune route `DELETE`/`debug`/`dump`/`reset`/`__` non authentifiée.
Tous les `router.delete` montés visent une ressource **possédée par l'appelant
authentifié** :

- `DELETE /api/user-tasks/:id` — tâche de l'utilisateur.
- `DELETE /api/sources/:id/like` — like de l'utilisateur (orphelin côté UI, documenté, inverse exact du POST).
- `DELETE /api/favorites` — favoris de l'utilisateur.
- `DELETE /api/my-alerts/account` — suppression RGPD par l'abonné authentifié (`authenticate(token)`, transaction tout-ou-rien, anonymisation/effacement par listes de tables/colonnes **codées en dur**). Légitime.
- `DELETE /api/community-sources/:id` — réservé à l'auteur (`requireAuthor` + `loadOwned`).

Routes d'administration (`/forum/admin/post|topic/:id/...`) : protégées par
`requireAdmin(req,res)` (forum.js:934,946) avant toute écriture. OK.

### Authentification des routes de données perso / écriture

- `municipal-events.js` : modèle exemplaire — `requireAccount` (auth) + `loadMembership` + `guard()` (membre **actif** d'une organisation **vérifiée** + rôle autorisé) sur create/patch/publish/cancel/notify.
- `myalerts.js` : chaque route d'écriture passe par `authenticate(token)`.
- `community-sources.js` / `community-reports.js` / `organizations.js` : `requireAuthor` / auth + contrôle de propriété.
- `auth.js` : callbacks OAuth Google/GitHub, URLs **fixes** (pas d'entrée utilisateur dans les URLs d'échange de jeton).

### Validation des entrées

Bornage et typage systématiques : `parseInt` + `Number.isInteger` sur les `:id`,
`validateEventInput`, `validateParamsSchema`, `sanitizeCategories`, `VALID_SLUGS`,
bornes de longueur (`.slice`), `q ≤ 60` sur param-lookup. RAS.

### Rate-limiting des routes publiques coûteuses

- `apiLimiter` global `/api`.
- Routes chères dotées d'un limiteur dédié **en plus** : `/subscribe` (`subscribeLimiter`), `/api/dev/*` (10/min/IP), `/param-lookup` (`lookupRate` 30/min), like (`likeLimiter` 20/min), `community-sources/:id/preview` (`previewRateOk`), `municipal-events` création (`evtRateOk` 20/10min), `my-alerts/request`.

Les envois d'e-mails (`municipal-events/:id/notify`) sont derrière auth + rôle +
organisation vérifiée → non déclenchables anonymement. **RAS.**

---

## 3. SSRF & injection

### SSRF — RAS

Les seuls fetch sur URL **fournie par l'utilisateur** passent par
`server/safe-fetch.js` :

- `routes/dev.js` : `validate-manifest` / `submit-source` → `safeFetchJson(url, { robots:true })`, y compris la sonde dynamique paramétrée.
- `routes/community-sources.js` : `preview` → `safeFetchText(...)` (veille-page/rss/agenda).
- Sources `veille-page`, `veille-rss`, `veille-agenda`, `ma-collectivite`, `panneaupocket-*`, `youtube-chaine`, `domaine-*`, `hausse-tarif-*` → `safe-fetch` (15 fichiers confirmés).

Tous les autres `fetch`/`https.get` ciblent des **URLs constantes** d'API
officielles (Météo-France, RTE, INSEE, USGS, NOAA, geo.api.gouv.fr, endpoints
OAuth Google/GitHub, tokeninfo Google) ou une base figée en dur → acceptable.
Aucun contournement de `safe-fetch` détecté.

### Injection SQL — RAS

Aucune concaténation d'entrée utilisateur dans une requête. Toutes les valeurs
passent en paramètres `$1/$2…`. Les interpolations de template repérées
(`${col}`, `${column}`, `${t}`/`${c}`, `${EVT_COLUMNS}`, `${ORG_COLUMNS}`,
`${REPORT_COLUMNS}`, `${TOPIC_SELECT}`, `${paramsCond}`, `${paramFilter}`,
`${where}`) sont **sans exception** des **fragments constants ou des identifiants
issus de listes blanches codées en dur**, jamais des valeurs reçues du client :

- `auth.js:44,50` — `col ∈ {'google_id','github_id'}` (param interne, commenté).
- `forum.js:951` — `column ∈ {'hidden','locked'}` (littéral à l'appel).
- `myalerts.js:640-641` — tables/colonnes des constantes `ACCOUNT_ANONYMIZE`/`ACCOUNT_ERASE`.
- `api.js` / `app-api.js` / `forum.js` — `paramFilter`/`where` composés par la logique serveur, valeurs réelles toujours en `$n`.

---

## 4. Cohérence validation client / serveur — RAS

Les formulaires d'écriture sont revalidés côté serveur indépendamment du front :

- `/api/dev/submit-source` & `validate-manifest` : URL (protocole http/https), catégories (`sanitizeCategories`, liste fermée 1-3 tags), `params_schema` (`validateParamsSchema`), bornes de longueur — tout côté serveur.
- `subscribe`, `my-alerts/profile`, `municipal-events` : validations serveur présentes (typage, enum, bornes, `VALID_SLUGS`, `isValidCategory`).

Aucun contrôle trouvé qui n'existerait que dans le navigateur.

---

## 5. Secrets en dur — RAS

Grep des patterns usuels sur `server/` et `public/` : **aucun secret en clair**.
Les clés sont lues via `process.env.X` (normal). Unique correspondance :
`server/safe-fetch.js:34` `BOT_TOKEN = 'LaBonneAlerte'` — **ce n'est pas un
secret** (jeton de User-Agent annoncé publiquement dans robots.txt, déjà qualifié
ainsi dans les audits du 16/10 et 30/10). `.env` gitignoré, non lu.

---

## BROUILLON — à valider par Hugo avant toute exécution

Correctifs de dépendances uniquement (aucune modification de code). Ordre par
risque décroissant ; `npm audit fix` d'abord (non-breaking), puis les
semver-major seulement si souhaité.

```bash
# 1. Non-breaking (corrige proxy-addr critique, body-parser, brace-expansion,
#    ip-address, qs, adm-zip, undici 6.29.0 -> 6.29.1, sharp) :
npm audit fix

# 2. Vérifier :
npm audit

# 3. Optionnel — reste moderate en devDep (nodemon/minimatch, semver-major) :
#    à ne faire que si l'on accepte le bump majeur de nodemon (dev seulement).
# npm audit fix --force   # <-- NON recommandé à l'aveugle : vérifier le diff de package.json
```

Après tout `audit fix`, relancer la suite (quand elle existera) et vérifier le
démarrage avant `railway up`. **Rien de tout cela n'a été exécuté par le robot.**
