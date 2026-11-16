# Rapport d'audit de sécurité — 2026-10-23

> Robot 2 — revue en LECTURE SEULE du dépôt local. Aucune requête vers labonnealerte.fr,
> aucune exécution contre un service en ligne, aucune modification hors ce fichier.
> Seul `npm audit` a contacté le registre npm.

## Résumé (classé par sévérité)

1. **majeur** — `proxy-addr` (dépendance PROD, CVE critique 9.1, usurpation d'IP via IPv6-mapped) : peut saper le rate-limiting et la confiance IP. Correctif non-breaking disponible.
2. **mineur** — `adm-zip` / `ip-address` / `sharp` / `qs` (dépendances PROD, high/moderate) : correctifs `npm audit fix` non-breaking disponibles ; impact réel limité (entrées figées / mitigations en place).
3. **mineur** — `nodemon` → `braces`/`chokidar`/`brace-expansion` (devDependencies, high) : outillage de dev, non servi en prod ; correctif semver-major.
4. **RAS** — Routes exposées, SSRF, injection SQL, validation client/serveur, secrets : **aucun constat de gravité**. Aucune route destructive/debug/dump non authentifiée (régression historique **absente**).

---

## 1. Dépendances (npm audit)

`npm audit --json` a abouti. Bilan : **1 critique, 7 high, 1 moderate** (total 9). 128 deps prod / 58 dev.

### Dépendances de PRODUCTION (risque réel en service)

| Paquet | Sév. | Avis | Chaîne | Fix non-breaking |
|---|---|---|---|---|
| **proxy-addr** | **critique (9.1)** | GHSA-jqcg-44mw-7w3h — usurpation d'IP via sous-réseau de confiance IPv4-mapped IPv6 | transitif (via `express`) | **oui** (`fixAvailable:true`, non semver-major) |
| adm-zip | high | 7 avis : DoS décompression, symlink traversal, SUID/SGID, crash DEFLATE async… | **directe** | oui |
| ip-address | high/mod | GHSA-mwp4-54f8-5fhr + 7 autres — mauvaise classification SSRF/trust-boundary | transitif | oui |
| sharp | high | libheif (GHSA-rgj7-g3m4-5g8c) + librsvg (CVE-2026-96889) | **directe** | oui |
| qs | moderate | array-limit bypass + DoS isBuffer | transitif (via `express`) | oui |

**Priorisation / justification :**

- **`proxy-addr` (majeur)** — c'est le seul constat dépendance qui mérite mieux que « mineur ». L'app repose sur `app.set('trust proxy', 1)` (`server/index.js:34`) et le rate-limiting (`apiLimiter`, limiteurs `dev`/`subscribe`/`myalerts`, `app-api`) est **clé par IP**. Une usurpation d'IP permettrait de contourner ces limites et de fausser le géo-remplissage/compteurs. **Mitigation réelle en place** qui empêche de classer « critique » : Cloudflare est en frontal avec `clientIp()` qui privilégie `cf-connecting-ip` validé par `ORIGIN_SECRET` (cf. `profile-autofill.js` et le bloc diagnostic `index.js:80-102`), et un seul saut proxy est déclaré. Le risque résiduel reste réel pour les limiteurs qui s'appuient sur `req.ip`. **Action conseillée : `npm audit fix` (non-breaking).**
- **`adm-zip` (mineur)** — dépendance directe, utilisée pour le flux ZIP `cyclones-outremer` (DPVigilance Météo-France). L'entrée est une **source officielle figée** (pas un ZIP fourni par l'utilisateur) → les scénarios DoS/symlink/SUID supposent une archive malveillante peu plausible ici. Correctif disponible, à appliquer par hygiène.
- **`ip-address` (mineur)** — avis liés au SSRF, mais les protections SSRF du projet passent par `server/safe-fetch.js` (undici + garde d'adresses) et non par ce paquet directement sur le chemin utilisateur ; à mettre à jour néanmoins (`fixAvailable:true`).
- **`sharp` / `qs` (mineur)** — correctifs non-breaking disponibles ; impacts (traitement d'image / parsing querystring derrière Cloudflare) de portée limitée.

### devDependencies (outillage, risque moindre)

| Paquet | Sév. | Note |
|---|---|---|
| nodemon | high | **dev seulement** (watch de dev), jamais servi en prod |
| chokidar ← braces ← brace-expansion | high | DoS regex/récursion — transitifs de `nodemon`, hors runtime prod |

Correctif annoncé pour `nodemon` = **semver-major** (`isSemVerMajor:true`) → à traiter hors `npm audit fix`, sans urgence puisque absent du service.

> **Recommandation globale** : un `npm audit fix` simple (sans `--force`) couvre proxy-addr, adm-zip, ip-address, sharp, qs. **Non exécuté** par Robot 2 (lecture seule). Voir brouillon en fin de rapport.

---

## 2. Routes exposées (montage réel dans `server/index.js`)

Montages constatés : `/api` (api, subscribe, myalerts, push, le-point, user-tasks, community-reports, community-sources, organizations, municipal-events, app-api), `/api/dev` (dev), `/auth` (auth), `/` (pages, forum, sitemap). Le montage fait foi — vérifié ligne à ligne (`index.js:168-351`).

### Vérification régression « route destructive/debug » → **ABSENTE (bon)**

- Routes `DELETE` montées : `/api/sources/:id/like`, `/api/favorites`, `/api/my-alerts/account`, `/api/user-tasks/:id`, `/api/community-sources/:id`. **Toutes authentifiées** (`authenticate(token)`) et pilotées par le propriétaire ; les suppressions de contenu sont des **soft-deletes** (`active=false`) sauf la suppression de compte (RGPD, cascade attendue). Aucune n'est un dump/reset/debug.
- Aucun path `debug`/`dump`/`reset`/`__` exposé. Les routes `admin` du forum (`/forum/admin/*`, `forum.js:956-961`) sont **toutes protégées par `requireAdmin`** (`forum.js:933,945`).
- Routes de « pages archivées » (decks/boutique/collection) renvoient proprement 410 Gone (`index.js:359-383`).

### Authentification / validation / rate-limit

Revue exhaustive des routes d'écriture (POST/PUT/PATCH/DELETE) et des routes de données perso :

- **Données perso / écriture → authentifiées** : tout `/api/my-alerts/*`, `/api/push/*`, `/api/community-*`, `/api/organizations/*`, `/api/municipal-events/*`, `/api/user-tasks/*`, `/app/*` sensibles passent par `authenticate()` avec contrôle de propriété dans le `WHERE`. **Aucune route de données perso sans auth.**
- **Routes publiques par conception** (non des anomalies) : `POST /subscribe` (inscription double opt-in, `subscribeLimiter` 8/min/IP), `POST /api/my-alerts/request` (lien magique, 5/min/IP, réponse neutre anti-énumération), `POST /api/dev/submit-source` & `/validate-manifest` (`rateLimit` 10/min/IP), `GET /api/communes/:insee/events` (seulement événements publiés de communes vérifiées), `POST /app/login/*` (codes OTP, plafonds par IP + globaux, comparaison timing-safe). **Jugées acceptables.**

**Constats mineurs (bas niveau, à l'appréciation de Hugo) :**

- **mineur** — `POST /api/community-sources` (`community-sources.js:79`) et `POST /api/community-reports` (`community-reports.js:110`) : authentifiées et validées, mais **sans rate-limiter local**. Le limiteur global `/api` (120/min/IP) s'applique, et des quotas par compte existent sur d'autres actions (preview, report). Un compte authentifié pourrait néanmoins créer en masse brouillons/instances. Risque limité (coût = insert DB, pas d'e-mail ni de fetch sortant). À envisager : un petit `rateOk` par compte, comme `organizations`/`municipal-events` en ont déjà.
- **info** — `DELETE /api/my-alerts/account` (`myalerts.js:616`) : pas de double confirmation côté serveur (la confirmation est côté client). Acceptable pour une action volontaire authentifiée ; mentionné pour mémoire.

---

## 3. SSRF & injection

### SSRF → **conforme**

- Les deux chemins qui *fetchent une URL fournie par l'utilisateur* passent bien par `safe-fetch` :
  - `server/routes/dev.js:12,50-52,122,143` — `safeFetchJson(rawUrl, { robots:true })` pour `validate-manifest` **et** la sonde paramétrée (`u.href`).
  - `server/routes/community-sources.js:19,188+` — `safeFetchText` (anti-SSRF) pour l'aperçu.
- Les `fetch`/`https.get` **directs** restants ciblent tous des **URL constantes figées en dur** (acceptable) : OAuth Google (`auth.js:111,125` + `app-api.js:530` tokeninfo), OAuth GitHub (`auth.js:167,182,186`), `doomname.js:18` (endpoint interne fixe), auth OAuth factorisés (`rte/francetravail/legifrance/twitch-auth.js`), et le diagnostic IPLocate (`index.js:62`, URL construite sur `iplocate.io`, dormant sauf `LOG_CLIENT_IP=1`). Aucun ne prend d'URL utilisateur arbitraire → pas de contournement de `safe-fetch`.
- Les sources de polling (`server/sources/**`) consomment `safe-fetch` / `external.js` (`external.js:9`) conformément à l'architecture.

### Injection SQL → **aucune**

- Aucune concaténation de chaîne ni template interpolé avec une entrée utilisateur dans un `pool.query(...)`. Toutes les valeurs passent par des paramètres `$1/$2…`.
- Les quelques `${...}` présents dans des requêtes sont des **fragments contrôlés par le code**, jamais des entrées utilisateur, et vérifiés :
  - `api.js:451,456,473,574` — `paramFilter` = littéral constant `'AND params = $2::jsonb'`.
  - `auth.js:44,50` — `${col}` = nom de colonne provider choisi par le code.
  - `forum.js:950` — `${column}` = littéral `'hidden'`|`'locked'` (commenté comme tel).
  - `app-api.js:411-420` — construction de `WHERE` par **placeholders** `$${params.length}` (indices, pas de valeurs).
  - `community-reports.js:72,138,142` — `${REPORT_COLUMNS}` = liste de colonnes constante.

---

## 4. Cohérence validation client / serveur → **conforme**

Les formulaires d'écriture disposent d'un équivalent serveur ne faisant pas confiance au JS client :

- `/api/dev/submit-source` (`dev.js:167-247`) : revalide `name`/`description`/`manifest_url` (protocole http(s) via `new URL`), `categories` via `sanitizeCategories` (liste fermée 1-3), `params_schema` via `validateParamsSchema`, et borne toutes les longueurs avant l'INSERT (respect des CHECK DB).
- `/subscribe` : regex e-mail + validation des `params` contre le `params_schema` si présent.
- `myalerts` (`profile`, `quiet-hours`, `view-mode`, `toggle-param`…) : énums/bornes strictes côté serveur (`view_mode ∈ {cards,list}`, heures ∈ [0,23], params validés, commune résolue en INSEE serveur).

Aucun contrôle trouvé qui n'existerait que côté navigateur.

---

## 5. Secrets en dur → **aucun**

`grep` des motifs (`apiKey`/`api_key`/`token`/`secret`/`password`/`Bearer `/`sk-…`) hors `node_modules` : **aucune valeur de secret codée en dur**. Les occurrences sont toutes des lectures `process.env.X` (normal) ou des noms de variables. `.env` reste gitignoré (non lu).

---

## BROUILLON — À valider par Hugo avant toute exécution

> Jamais appliqué par Robot 2. Lecture seule.

**1) Corriger les vulnérabilités de dépendances non-breaking (couvre le `proxy-addr` critique) :**

```
npm audit fix
```

Couvre `proxy-addr`, `adm-zip`, `ip-address`, `sharp`, `qs` sans changement de version majeure (tous `fixAvailable:true`, non semver-major). Vérifier ensuite que `cyclones-outremer` (adm-zip) et le traitement d'image (sharp) fonctionnent toujours. **Ne pas** utiliser `--force` (il rétrograderait `nodemon` en semver-major, inutile puisque dev-only).

**2) (Optionnel, mineur) Rate-limiter par compte sur les créations communautaires**, sur le modèle déjà présent dans `organizations.js`/`municipal-events.js` (`createRateOk`/`evtRateOk`), appliqué à `POST /api/community-sources` et `POST /api/community-reports`.
