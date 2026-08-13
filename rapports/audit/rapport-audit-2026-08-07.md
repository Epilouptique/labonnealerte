# Rapport d'audit de sécurité — 2026-08-07

> Périmètre : dépôt local uniquement. Aucune requête vers labonnealerte.fr.
> Aucune modification de code effectuée.

---

## Résumé (5 lignes max)

**Aucun problème critique.** Deux vulnérabilités npm de sévérité _high_ identifiées,
dont une concerne une dépendance de production (`ip-address` via `express-rate-limit`
et `geoip-lite`) — risque réel mais **modéré** (pas un vecteur SSRF direct). Aucune
route destructive ou de debug non-authentifiée exposée. SSRF bien contenu via
`safe-fetch.js`. Aucune injection SQL par concaténation. Aucun secret en dur.

---

## 1. Dépendances — npm audit

```
2 vulnérabilités : 0 critical, 2 high, 0 moderate, 0 low
```

### 1.1 `brace-expansion` — HIGH (DoS, 2 CVE)

| Champ | Valeur |
|---|---|
| Paquet | `brace-expansion@5.0.7` |
| GHSA | GHSA-mh99-v99m-4gvg / GHSA-rgw5-rvv9-x895 |
| Via | `nodemon@3.1.14 → minimatch@10.2.5 → brace-expansion` |
| Dep type | **devDependency** (nodemon, outil de redémarrage en dev) |
| Fix dispo | Oui (`npm audit fix` non-breaking) |

**Sévérité réelle : faible.** `nodemon` n'est jamais chargé en production (Railway).
L'expansion illimitée provoquant un OOM n'est exposée que sur la machine de
développement locale. Ne pas corriger en urgence ; inclure dans un prochain
`npm update nodemon`.

### 1.2 `ip-address` — HIGH (SSRF / trust-boundary bypass, 3 CVE)

| Champ | Valeur |
|---|---|
| Paquet | `ip-address@10.2.0` |
| GHSA | GHSA-mwp4-54f8-5fhr / GHSA-4xrf-jv44-h6hh / GHSA-22jq-vg5j-6vgg |
| Via | `express-rate-limit@8.5.2` et `geoip-lite@2.0.3` |
| Dep type | **dependencies** (présentes en production) |
| Fix dispo | Oui (`npm audit fix` non-breaking) |

**Sévérité réelle : mineure à modérée** — les trois vulnérabilités signalent que
`ip-address` peut mal-classifier des adresses IPv4 avec zéros initiaux, des CIDR
suffixés, ou des adresses IPv4-mappées en IPv6. En pratique :

- `express-rate-limit` utilise `ip-address` pour analyser les IP clientes afin
  d'identifier le bucket de rate-limit. Un attaquant envoyant une IP malformée
  (via `X-Forwarded-For` si mal-configuré) pourrait contourner le rate-limiting.
  Atténuant : `app.set('trust proxy', 1)` limite le trust à UN seul proxy (Railway),
  ce qui réduit mais n'élimine pas le risque.
- `geoip-lite` utilise `ip-address` pour la géolocalisation au 1er login. Non
  critique (décision d'ergonomie, pas de sécurité).
- **`safe-fetch.js` n'utilise pas `ip-address`** : il repose sur `dns.lookup` +
  `net.isIPv4` de Node.js natif. Le SSRF côté poller n'est pas affecté.

**Recommandation :** `npm audit fix` lors du prochain cycle de maintenance.
Pas d'urgence bloquante, mais à ne pas laisser traîner car `express-rate-limit`
est sur le chemin critique de toutes les routes `/api`.

---

## 2. Routes exposées

### 2.1 Montages réels (server/index.js)

| Préfixe monté | Router | Rate-limit |
|---|---|---|
| `/api` | apiLimiter (120/min/IP) | ✓ global |
| `/api` | apiRouter, subscribeApiRouter, myAlertsApiRouter, pushRouter, collectionsRouter, decksRouter, skinsRouter, lePointApiRouter, userTasksApiRouter, communityReportsRouter | via apiLimiter |
| `/api/dev` | devRouter | apiLimiter + 10/min/IP propre |
| `/auth` | authRouter | — |
| `/` | forumRouter, pagesRouter, myAlertsPagesRouter, userTasksPagesRouter | — |
| statique | `public/` via `express.static` | — |

### 2.2 Vérification DELETE / debug / admin

**Aucune route de type debug/dump/reset/test exposée.**

Routes `DELETE` trouvées :

| Route | Auth | Note |
|---|---|---|
| `DELETE /api/sources/:id/like` | Optionnel (like public) | Décrémente un compteur, non-destructif. Rate-limit `likeLimiter` 20/min/IP |
| `DELETE /api/favorites` | `authenticate()` requis | Auth vérifiée, données propres à l'abonné |
| `DELETE /api/collections/:slug/adopt` | `authenticate()` requis | Ligne collection_adoptions seule, vérifiée |
| `DELETE /api/user-tasks/:id` | `authenticate()` requis | Soft-delete (`active=false`), propriété vérifiée dans WHERE |

✅ **Aucune route DELETE destructive non-authentifiée.** La régression historique
(route debug exposée) qui motive ce robot n'est pas présente dans l'état actuel
du dépôt.

Routes admin forum (`/forum/admin/post/:id/hide`, `/unhide`, `/forum/admin/topic/…`) :
montées sous `/` via `forumRouter` (pas sous `/api`, donc hors `apiLimiter`).
Protégées par `requireAdmin()` = `authenticate()` + `SELECT is_admin FROM subscribers`.
**Pas de rate-limiting IP** sur ces routes de modération. Risque faible (admin =
compte identifié, déjà limité par le rate-limit de création de session), mais à
noter.

### 2.3 Validation des entrées — points identifiés

**`POST /api/dev/submit-source`** : `name`, `manifest_url`, `description`, `categories`
validés. `github` et `email` tronqués à 255 chars mais **non validés en format** côté
serveur (pas de regex email, pas de validation handle GitHub). Un email invalide peut
être stocké tel quel. Sévérité : faible (champ non fonctionnel, juste une mention pour
Hugo) — la valeur n'est jamais réutilisée en dehors d'un affichage admin.

**`GET /api/communes`** : le paramètre `departement` est validé contre `isValidDepartement`
avant toute requête externe. ✓

---

## 3. SSRF & injection

### 3.1 SSRF

**Bilan : aucun bypass détecté.**

Sources dont l'URL est fournie par l'utilisateur :

| Source | Fetch | Via |
|---|---|---|
| `veille-rss` | URL param utilisateur | `safeFetchText` ✓ |
| `veille-page` | URL param utilisateur | `safeFetchText` ✓ |
| `veille-stock` | URL param utilisateur | `safeFetchText` ✓ |
| `veille-agenda` | URL iCal utilisateur | `safeFetchText` ✓ |
| `panneaupocket` / `ma-collectivite` | URL `/ville/` utilisateur | `safeFetchText` + `validPanneauUrl` (hôte exact `app.panneaupocket.com`) ✓ |
| `youtube-chaine` | Page chaîne YouTube | `safeFetchText` + restriction hôte `youtube.com` ✓ |
| `domaine-disponibilite` | Domaine utilisateur | `safeProbe` ✓ |
| `domaine-securite` | URL URLhaus lookup | URL fixe (api.urlhaus.abuse.ch) ✓ |
| `POST /api/dev/validate-manifest` | URL manifeste utilisateur | `safeFetchJson` (safe-fetch.js) ✓ |

Sources utilisant `fetchFn` (node-fetch) directement :
**toutes vers des URL de base constantes** (API gouvernementales, USGS, JPL, etc.) ;
la partie utilisateur n'est qu'un paramètre de query string encodé. Aucun SSRF.

`safe-fetch.js` : DNS lookup → bloque les IP privées/loopback/link-local via
`isPrivateIP` (couverture IPv4, ::1, fe80, fc/fd). **N'utilise pas `ip-address`** →
non affecté par la vulnérabilité npm ci-dessus.

### 3.2 Injection SQL

**Aucune concaténation de chaîne dans `pool.query()` sur une entrée utilisateur.**

Un seul template littéral interpolé dans `pool.query` identifié :

```js
// server/routes/forum.js:854
const r = await pool.query(
  `UPDATE forum_topics SET ${column} = $1 WHERE id = $2 RETURNING id`,
  [value, id]
);
```

`column` est une **constante littérale du code source** (`'hidden'` ou `'locked'`),
jamais une entrée utilisateur — `setTopicFlag` est appelé avec des arguments en dur
aux lignes 862-865. Pas d'injection possible.

---

## 4. Cohérence validation client / serveur

### `POST /api/dev/submit-source`

Front (`public/js/...`) : formulaire avec champs `name`, `manifest_url`, `description`,
`categories`. Validation serveur présente (type, longueur, proto http/https, catégories
fermées). Aucune validation de format manquante pour les champs fonctionnels.

Champs `github` / `email` : pas de validation de format côté serveur. Côté client
non inspecté en détail. Faible importance fonctionnelle (stockage seul, jamais envoi).

### `/api/community-reports`

Routes de création/extension/résolution vérifiées à haut niveau (authenticate,
vérification propriété dans WHERE, rayon borné 10-50 km). Validation complète de
`description` et `link` non inspectée en détail — à vérifier si le module
`ugc.js` y est branché.

---

## 5. Secrets en dur

**Aucun secret en dur détecté.**

Tous les tokens, clés API et secrets identifiés dans le code passent par
`process.env.*` : `METEOFRANCE_API_KEY`, `SNCF_API_KEY`, `GOOGLE_SECRET`,
`GITHUB_SECRET`, `ORIGIN_SECRET`, `IPLOCATE_APIKEY`, clés RTE/France Travail/Twitch/
Légifrance. Le `.env` est gitignored et n'a pas été lu.

---

## Notes complémentaires

- **`validate-manifest` sonde dynamique** (server/routes/dev.js:135-148) : si le
  manifeste déclare `params`, la route effectue un second fetch vers
  `url + ?exemple=valeur`. Ce second fetch passe bien par `fetchManifest` →
  `safeFetchJson` → `safe-fetch.js`. ✓

- **LOG_CLIENT_IP=1** (server/index.js:40-89) : middleware de diagnostic IP qui, si
  activé, appelle `https://iplocate.io/api/lookup/...` directement via `https.get`
  sans safe-fetch. L'URL est construite depuis l'IP extraite par `clientIp()` (jamais
  une URL fournie par l'utilisateur). Pas de SSRF. Ce middleware est non-bloquant,
  commenté dans le code comme « DIAGNOSTIC TEMPORAIRE » et désactivé par défaut.

- **Forum sans rate-limit IP** : les routes GET du forum (`/forum`, `/forum/t/:slug`,
  etc.) ne sont sous aucun rate-limiter IP. Elles font des requêtes DB (SELECT) à
  chaque chargement de page. Risque de scraping ou surcharge légère. Sévérité : faible
  (pas de donnée sensible, pas d'action d'écriture).

---

*Rapport généré par l'agent de revue de sécurité (lecture seule). Aucune modification
de code ni de configuration n'a été effectuée. La régression historique (route debug
exposée) qui motive ce robot n'est pas présente dans l'état actuel.*
