# Rapport d'audit sécurité — 2026-10-30

Audit automatique en **lecture seule** du dépôt local (Robot 2). Aucune requête
vers labonnealerte.fr, aucune écriture hors de ce fichier, aucun accès DB.

## Résumé (classé par sévérité)

1. **majeur** — `proxy-addr` **critique (CVSS 9.1)** en dépendance de prod (via
   `express`) : usurpation d'IP via sous-réseau IPv6-mappé. Impact atténué par
   l'architecture (IP cliente dérivée de `cf-connecting-ip` validée par
   `ORIGIN_SECRET`), mais à corriger car il affecte le rate-limiting. Correctif
   non-breaking disponible.
2. **majeur** — `undici` **high** (direct, prod, cœur de `safe-fetch.js`) :
   contournement de validation de certificat TLS + plusieurs DoS. Chemin réseau
   sortant réel → à mettre à jour (6.29.1, **non** semver-major).
3. **mineur** — 8 avis npm au total (1 critique, 6 high, 1 moderate). `sharp`
   (high) est en **devDependency** (outillage, risque moindre). `adm-zip` (high,
   prod) n'ingère qu'un flux Météo-France à URL figée (risque réel faible).
   **`npm audit fix` (non-breaking) est annoncé disponible pour tout.**
4. **RAS** — Routes exposées : aucune route destructive/debug/dump/reset non
   authentifiée montée. Toutes les écritures et données perso passent par
   `authenticate()` / `requireAuthor` / `requireAdmin` / appartenance d'org.
5. **RAS** — SSRF (tout passe par `safe-fetch`), injection SQL (100 % paramétré),
   validation client/serveur (équivalents serveur présents), secrets en dur (aucun).

---

## 1. Dépendances (`npm audit`)

`npm audit --json` a abouti (registre joignable). **187 dépendances** (128 prod,
58 dev, 31 optionnelles). **8 vulnérabilités : 1 critique, 6 high, 1 moderate.**
Toutes avec `fixAvailable: true`.

### Production (risque réel en service)

| Paquet | Sév. | Direct ? | Chaîne | Nature | Correctif |
|---|---|---|---|---|---|
| **proxy-addr** | **critique** (9.1) | non | `express` → proxy-addr | Usurpation d'IP via sous-réseau de confiance IPv4-mapped-IPv6 (GHSA-jqcg-44mw-7w3h, `>=1.1.0 <2.0.8`) | oui |
| **undici** | high | **oui** | direct (`safe-fetch.js`) | Bypass validation cert TLS (GHSA-2m5v-pch6-74hx) + DoS (EventSource, content-encodings, renégociation TLS, PONG WebSocket). Installé **6.29.0**, corrigé **6.29.1** (non-major) | oui |
| **body-parser** | high | non | `express` → body-parser | DoS via octets résiduels après un corps compressé (GHSA-27r3-jxmh-p828, `>=2.0.0 <2.4.0`) | oui |
| **adm-zip** | high | **oui** | direct (`cyclones-outremer.js`) | Bombe de décompression / overwrite via symlink / SUID (plusieurs avis, `<=0.6.0`). **Atténué** : n'ingère que le ZIP DPVigilance Météo-France (URL figée, source de confiance), jamais d'archive utilisateur | oui |
| **qs** | moderate | non | `express` → qs | DoS / bypass de limite de tableau | oui |

Note : `brace-expansion` et `ip-address` (high/moderate) apparaissent aussi ;
chaînes transitives (probablement outillage `playwright`/glob). À confirmer via
`npm ls`, mais a priori non servies sur le chemin requête.

### devDependencies (risque moindre — outillage)

| Paquet | Sév. | Nature |
|---|---|---|
| **sharp** | high | Vulns libheif/librsvg (`<0.35.5`). `devDependency` (cf. `package.json`), **non `require()` dans `server/`** → pas sur le chemin de prod. |

### Recommandation
`npm audit fix` (non-breaking) couvre l'ensemble d'après l'avis ; `undici` monte
en 6.29.1 **sans** rupture semver. **Non exécuté par le robot.** Priorité :
`proxy-addr` (critique) puis `undici` (TLS, réseau sortant).

---

## 2. Routes exposées

Montage réel vérifié dans `server/index.js` : `/api` (api, subscribe, myalerts,
push, le-point, user-tasks, community-reports, community-sources, organizations,
municipal-events, app-api), `/api/dev` (dev), `/auth` (auth), `/` (forum, pages,
sitemap). Limiteur global `apiLimiter` 120/min/IP sur tout `/api`.

**Recherche de route destructive/debug oubliée (régression connue) : négatif.**
Aucun path `debug`/`dump`/`reset`/`__`/`test` monté. Les `DELETE` montés sont
tous légitimes et correctement contrôlés :

- `DELETE /api/sources/:id/like` (`api.js:222`) — 401 si anonyme (`authenticate`).
- `DELETE /api/favorites` (`api.js:333`) — scopé au compte connecté.
- `DELETE /api/community-sources/:id` (`community-sources.js:404`) — `requireAuthor`
  + `loadOwned` (jamais la source d'autrui) + statut limité à `draft`/`testing`.
- `DELETE FROM subscribers WHERE token = $1` (`subscribe.js:226`) — désinscription
  pilotée par le jeton de l'abonné (légitime).
- `DELETE FROM subscribers WHERE id = $1` (`myalerts.js:621`) — suppression de
  compte par l'abonné authentifié (légitime).

Routes admin forum (`/forum/admin/...`, `forum.js:956-961`) : protégées par
`requireAdmin` (auth + `is_admin = true`, `forum.js:148`).

**Authentification** : toutes les routes de données perso / d'écriture vérifiées
appellent `authenticate()` en tête (myalerts, push, user-tasks, community-reports,
organizations, municipal-events, app-api notify-channel) ; les routes d'org/event
ajoutent un contrôle d'appartenance (`loadMembership`/`loadEventForMember`).

**Validation des entrées** : systématique avant usage — `validateUrlType`,
`sanitizeCategories` + `VALID_SLUGS`, `isValidSelector`, `validateParamsSchema`,
bornage des longueurs, enums fermées (`NOTIFY_CHANNELS`, `STATE_ENUM`).

**Rate-limiting** : `apiLimiter` global 120/min + limiteurs stricts dédiés sur les
routes chères : `/api/dev` 10/min/IP (`dev.js:26`), aperçu community-sources
10/10 min/compte (réseau sortant), signalements 20/h/compte, `likeLimiter`,
login app 10/min/IP. Couverture jugée suffisante.

**Point mineur** : `/api/dev/submit-source` et `POST /api/community-sources`
écrivent en base (sources en `draft`, `enabled=false`) — `submit-source` est
**non authentifié** (par conception « proposer une source »), borné par le
rate-limit 10/min/IP et la revue manuelle. Risque de spam résiduel faible, pas
de donnée perso exposée. Laissé à l'appréciation de Hugo.

---

## 3. SSRF & injection

**SSRF** : les fetches sur **URL fournie par l'utilisateur** passent bien par
`server/safe-fetch.js` :
- `dev.js` validate-manifest → `safeFetchJson(url, { robots:true })` ;
- `community-sources.js` preview (veille page/rss/agenda) → `safeFetchText(..., { robots:true })`.

`safe-fetch.js` est robuste : http/https seuls, blocage IPv4/IPv6 privés+réservés
(loopback, CGNAT, lien-local/metadata 169.254, ULA, mapped/6to4/NAT64…),
**épinglage DNS au connect** (anti-rebinding), **redirections jamais suivies**
(`redirect:'error'`), taille bornée avant ET après décompression (anti-bombe),
timeout, robots.txt opt-in.

Les très nombreux `fetch`/`node-fetch` des modules `server/sources/*` ciblent des
**endpoints officiels à URL figée en dur** (Météo-France, RTE, INSEE, USGS,
geo.api.gouv.fr…) → acceptable, hors périmètre SSRF utilisateur. Cas vérifié :
`hausse-tarif-operateur.js:170` `fetch('inc/'+sec+'.php')` s'exécute **dans le
contexte navigateur Playwright** (`page.evaluate`), `sec` étant une section figée
— pas un fetch serveur, pas d'URL utilisateur.

**Injection SQL** : **aucune concaténation / template interpolé dans une requête.**
Tous les `pool.query` relus utilisent les paramètres `$1/$2…`. Les templates
littéraux abondants de `forum.js`/`subscribe.js` sont de la **génération HTML**,
systématiquement passée par `escHtml()` — aucune injection SQL.

---

## 4. Cohérence validation client / serveur

Les formulaires d'écriture ont tous un contrôle serveur équivalent, indépendant
du JS client :
- `/api/dev` submit-source / validate-manifest : `validateManifest`,
  `validateParamsSchema`, `sanitizeCategories`, bornage longueurs (`dev.js`).
- `community-sources` (publier) : `validateUrlType`, `isValidSelector`,
  `validatePersonalization`, `validateDescriptions`, `VALID_SLUGS`, quotas.
- subscribe / myalerts (compte, abonnements, pseudo, heures de veille) :
  validations serveur (`validateParams`, enums, `ensurePseudo`).

Aucun contrôle trouvé qui n'existerait **que** côté navigateur. RAS.

---

## 5. Secrets en dur

`grep` des motifs usuels (`api_key`, `secret`, `password`, `token`, `Bearer `,
`sk-…`, `AIza…`, `ghp_…`) sur `server/` et `public/` : **aucun secret en dur.**
Toutes les clés sont lues via `process.env.X` (`GOOGLE_CLIENT_ID`,
`ORIGIN_SECRET`, `IPLOCATE_APIKEY`, `METEOFRANCE_API_KEY`…). Seule occurrence
captée : `safe-fetch.js:34` `BOT_TOKEN = 'LaBonneAlerte'` — un **identifiant de
User-Agent robots.txt**, pas un secret. RAS.

---

## BROUILLON — à valider par Hugo avant toute exécution

Mise à jour des dépendances vulnérables (non appliquée par le robot) :

```
# Correctifs non-breaking annoncés par npm (prod d'abord) :
npm audit fix
# Vérifier ensuite que undici est bien >= 6.29.1 et proxy-addr >= 2.0.8 :
npm ls undici proxy-addr body-parser qs adm-zip
# sharp (devDependency, high) : non urgent ; mettre à jour à l'occasion :
#   npm i -D sharp@latest
```

Rien d'autre à corriger côté code : auth, SSRF, injection SQL et secrets sont
conformes à cette date.
