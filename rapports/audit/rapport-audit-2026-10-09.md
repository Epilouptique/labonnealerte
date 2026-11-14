# Rapport d'audit sécurité — 2026-10-09 (Robot 2, lecture seule, dépôt local)

## Résumé (classé par sévérité)

1. **majeur** — `proxy-addr` 2.0.7 (transitif via `express`, **prod**) : CVSS 9.1 « critique » (usurpation d'IP via sous-réseau IPv6 mappé IPv4). Risque réel **atténué** (`trust proxy 1` + Cloudflare en amont, `clientIp()` vérifie `cf-connecting-ip` via `ORIGIN_SECRET`), mais la clé de rate-limiting repose sur `req.ip`. Correctif non-cassant disponible.
2. **majeur** — `adm-zip` 0.6.0 (**prod directe**, décompresse le ZIP DPVigilance de cyclones-outremer) : 7 avis dont 4 `high` (DoS/bombe de décompression, symlink, SUID). Exploitation suppose un flux Météo-France compromis (URL figée, de confiance) → danger réel faible, mais paquet servi en prod. Correctif disponible.
3. **mineur** — `ip-address` 10.2.0 (transitif via `express-rate-limit` + `geoip-lite`, **prod**) : classification d'adresses imparfaite (SSRF/trust-boundary). **N'affecte PAS** l'anti-SSRF de `safe-fetch.js` (qui a son propre `isPrivateIP`). Correctif disponible.
4. **mineur** — `qs` 6.15.3 (transitif via `express`, **prod**) + `sharp` 0.35.3 (**devDependency**, `high` libheif/librsvg mais hors runtime servi) + chaîne `nodemon`/`chokidar`/`braces`/`brace-expansion` (**dev**, outillage).
5. **RAS** sur Routes exposées, SSRF/injection, validation client-serveur et secrets en dur.

Aucune route destructive/debug non authentifiée. Aucune injection SQL. Aucun secret commité. Aucun fetch utilisateur contournant `safe-fetch`.

---

## 1. Dépendances (`npm audit --json`)

Registre npm joignable, audit exécuté (non modifié). Total : **9** vulnérabilités — 1 critique (CVSS), 7 high, 1 moderate. 186 paquets (127 prod, 58 dev, 31 opt).

### Servies en PROD (risque réel)

| Paquet | Sév. | Chaîne | Avis | Correctif |
|---|---|---|---|---|
| `proxy-addr` 2.0.7 | **critical** (CVSS 9.1) | `express` → `proxy-addr` | GHSA-jqcg-44mw-7w3h — usurpation IP via sous-réseau de confiance IPv6 mappé IPv4 | `fixAvailable: true`, non-cassant |
| `adm-zip` 0.6.0 | **high** (directe) | directe (cyclones-outremer) | 7 avis : GHSA-7q85-xj36-vmfc, -rcw4-f5rp-g42v, -j5f4-cc29-5x44, -8238-w5pm-2374 (high) + -vwc7-r8mq-g2x9, -p634-w6r4-rjp2, -c6fg-446q-cg94 (moderate) | `fixAvailable: true`, non-cassant |
| `ip-address` 10.2.0 | high + moderate | `express-rate-limit` + `geoip-lite` → `ip-address` | 7 avis de classification (GHSA-mwp4-54f8-5fhr high, etc.), CVSS non noté (0) | `fixAvailable: true` |
| `qs` 6.15.3 | moderate | `express`/`body-parser` → `qs` | GHSA-x5fp-wj9c-mxmx, -4mjr-xmp4-gh2g (DoS) | `fixAvailable: true` |

- **`proxy-addr`** : le CVSS est « critique » mais le contexte atténue fortement. L'app pose `trust proxy 1` (un seul saut, Railway) et `clientIp()` privilégie `cf-connecting-ip` authentifié par `ORIGIN_SECRET`. L'impact résiduel concerne la clé de rate-limiting (`req.ip`) : un attaquant forgeant `X-Forwarded-For` pourrait brouiller le comptage par IP. Classé **majeur** en risque réel. Correctif facile → recommandé.
- **`adm-zip`** : seul consommateur = `server/sources/cyclones-outremer.js` (flux ZIP `/vigilanceom/flux/dernier` de Météo-France, **URL figée en dur**). Les vulns (bombe de décompression, symlink, SUID, crash DoS) nécessitent un ZIP hostile → suppose la compromission du flux officiel MF. Risque réel faible, mais paquet actif en prod → **majeur**, correctif recommandé.
- **`ip-address`** : utilisé par `express-rate-limit` (clé IP) et `geoip-lite` (géoloc profil). **Important** : l'anti-SSRF de `safe-fetch.js` n'en dépend PAS (implémentation maison `isPrivateIP`/`isPrivateIPv4`), donc les avis « SSRF » de ce paquet ne dégradent pas la protection SSRF du site. Impact = justesse du keying rate-limit/géoloc. **mineur**.
- **`qs`** : DoS théorique via parsing de query. Borné par `apiLimiter` (120/min). **mineur**.

### Outillage / hors runtime servi (risque moindre)

| Paquet | Sév. | Portée | Note |
|---|---|---|---|
| `sharp` 0.35.3 | high | **devDependency** | libheif/librsvg (GHSA-rgj7-g3m4-5g8c, -wq5f-xc86-pv6w). Génération d'images hors ligne, jamais dans le chemin requête servi. Correctif dispo (`fixAvailable: true`). |
| `nodemon`→`chokidar`→`braces`→`brace-expansion` | high/moderate | **dev** | DoS regex/récursion. `nodemon` = dev-only (`npm run dev`). Le correctif proposé est un **downgrade cassant** (`nodemon` 1.14.10, `isSemVerMajor`) → **ne pas l'appliquer** ; attendre une version corrigée amont. |

### Recommandation
`npm audit fix` **sans `--force`** couvrirait `proxy-addr`, `adm-zip`, `ip-address`, `qs`, `sharp` (correctifs non-cassants annoncés). **Ne pas** lancer `npm audit fix --force` : il rétrograderait `nodemon` (cassant, dev seulement). Voir brouillon en fin de rapport. *(Robot 2 n'exécute rien : à décider par Hugo.)*

---

## 2. Routes exposées

Points de montage réels (`server/index.js`) : `/api` (api, subscribe, myalerts, push, le-point, user-tasks, community-reports, app-api) sous `apiLimiter` global 120/min ; `/api/dev` (dev) ; `/auth` (OAuth) ; `/` (forum, pages, sitemap). Routeurs decks/collections/skins **archivés, non montés** (fil #9).

**Recherche de routes destructives/debug : aucune régression.** Les 4 routes d'écriture destructive sont toutes authentifiées et vérifient la propriété :
- `DELETE /api/my-alerts/account` (myalerts.js:616) — `authenticate(body.token)`, puis `DELETE ... WHERE id = $1` sur le compte authentifié. **OK** (suppression RGPD pilotée par l'abonné).
- `DELETE /api/user-tasks/:id` (user-tasks.js:349) — `authenticate`, soft-delete `WHERE id=$1 AND subscriber_id=$2`. **OK**.
- `DELETE /api/sources/:id/like` (api.js:222) — `likeLimiter`, authentifié. **OK**.
- `DELETE /api/favorites` (api.js:333) — authentifié. **OK**.

Aucun path `debug`/`test`/`dump`/`reset`/`admin` monté sans auth. Les routes `/forum/admin/*` passent par `requireAdmin` (forum.js:933,945).

Routes publiques d'écriture, correctement bornées :
- `POST /api/dev/submit-source` + `POST /api/dev/validate-manifest` (dev.js:166,113) — sans compte, mais rate-limit 10/min/IP, validation stricte du schéma, écriture `enabled=false` (quarantaine). **OK**.
- `POST /api/subscribe` (subscribe.js:90) — rate-limit 8/min/IP, email validé, `source_id` vérifié, params validés contre schéma, `confirmed=false`. **OK**.
- `POST /api/app/login/request` + `/verify` (app-api.js:174,219) — réponse neutre anti-énumération, rate-limit 5–10/min/IP, code `^\d{6}$`, anti-brute-force (5 essais/code, 10 échecs/h/email). **OK**.

Toutes les routes `/api/my-alerts/*` d'écriture ou de données perso appellent `authenticate(token)` (preferences, view-mode, profile, leaderboard, quiet-hours, toggle, toggle-param, toggle-mute, display-name, community-reports-visibility). **OK**.

**Observations mineures (non bloquantes)** :
- `DELETE /api/my-alerts/account` n'a pas de rate-limit dédié (authentifié + action rare → acceptable ; une boucle resterait bornée par le pool DB).
- Plusieurs routes authentifiées n'ont pas de rate-limit propre : couvertes par l'`apiLimiter` global 120/min. Suffisant pour des routes non coûteuses.

---

## 3. SSRF & injection

### SSRF
Toutes les sources effectuant un fetch vers une **URL réellement libre** passent par `server/safe-fetch.js` (rejet IP privées/loopback/lien-local, `redirect: 'error'`, timeout, taille bornée) :
- `veille-rss.js:48`, `veille-page.js:63`, `veille-stock.js:61` → `safeFetchText`.
- `domaine-disponibilite.js:59` → `safeProbe` (re-valide l'IP à **chaque** saut de redirection).
- `panneaupocket` / `lib/panneaupocket-parser.js:106` → `safeFetchText`, précédé de `validPanneauUrl` (https + hôte exact `app.panneaupocket.com` + `/ville/`, re-validé avant fetch).

Les sources à **hôte figé** avec entrée utilisateur restreinte (enum/regex injectée en query/path/corps) utilisent parfois `node-fetch` direct — **acceptable** car l'hôte n'est pas contrôlable : `crypto-seuil.js` (Binance/Coinbase, enum `SYMBOLS`), `veille-twitch.js` (Helix, `LOGIN_RE`), `veille-entreprise.js` (API gouv, `^\d{9}$`), `domaine-securite.js` (urlhaus, `host=` en corps), `hausse-tarif-*` (hôtes opérateurs/streaming figés, enum fermé).
- **mineur/cosmétique** : `crypto-seuil.js:107` n'encode pas `sym` dans le path (sûr : enum fermé `[A-Za-z]{2,5}`). Note de style : si un de ces endpoints devenait un jour paramétrable, basculer sur `safe-fetch`.

### Injection SQL
Aucune concaténation d'entrée utilisateur dans une requête. Toutes les requêtes `pool.query` utilisent les paramètres `$1/$2…`. Deux interpolations `${}` repérées sont des **constantes littérales internes**, jamais des entrées utilisateur :
- `auth.js:44,50` — `${col}` ∈ {`google_id`,`github_id`} (fixé par le flux OAuth). **OK**.
- `forum.js:950` — `${column}` ∈ {`hidden`,`locked`} (passé en dur par `setTopicFlag('hidden'|'locked', …)`). **OK**.

**RAS.**

---

## 4. Cohérence validation client / serveur

Vérifié que les contrôles front ont un équivalent **serveur** (jamais de confiance au seul JS navigateur) :
- `/api/dev/submit-source` & `validate-manifest` : validation serveur stricte du schéma OpenAlert (nom, description, URL manifeste via sanitisation, catégories, `params_schema`) — dev.js:63-108.
- `/api/subscribe` : email (regex), `source_id` existant, params validés contre `params_schema` côté serveur.
- `/api/my-alerts/profile`, `display-name` (`validateDisplayName`), `quiet-hours` (heures 0-23 entières), `view-mode` (∈ {cards,list}), `toggle-param` (résolution commune-insee/coords + schéma) : tous bornés/typés côté serveur.

Aucun contrôle trouvé qui n'existerait que côté navigateur. **RAS.**

---

## 5. Secrets en dur

Aucun secret commité. Tous les identifiants sont lus via `process.env` (normal) :
- OAuth Google/GitHub : `GOOGLE_SECRET`/`GITHUB_SECRET` (auth.js:117,172).
- OAuth2 RTE/FranceTravail/Twitch/Légifrance : `client_secret` depuis l'env (`*-auth.js`).
- VAPID push : `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (webpush.js:10-12).
- Clés API sources : `METEOFRANCE_API_KEY` (vigilance-factory.js:83), `SNCF_API_KEY` (sncf-perturbations.js:47).

Côté `public/js`, les occurrences de « token » sont des jetons de session lus depuis `localStorage` (`LBASession.get()`) — comportement client normal, pas des secrets codés en dur. Aucun motif `sk-…`/`AIza…`/clé littérale détecté dans `server/` ou `public/`. **RAS.**

---

## BROUILLON — à valider par Hugo avant toute exécution

> Non appliqué par le robot. Correctifs de dépendances **non-cassants** uniquement.

```bash
# 1) Sauvegarder l'état verrouillé avant toute modif
cp package-lock.json package-lock.json.bak

# 2) Correctifs non-cassants : proxy-addr, adm-zip, ip-address, qs, sharp
npm audit fix        # SANS --force (ne pas rétrograder nodemon)

# 3) Vérifier qu'il ne reste que la chaîne dev nodemon/chokidar/braces
npm audit

# 4) Smoke test local (le .env pointe la PROD : NE PAS lancer de cycle poller ;
#    se limiter au démarrage du serveur et à une page statique)
```

- Ne **pas** exécuter `npm audit fix --force` : il rétrograderait `nodemon` (dev-only) en 1.14.10, changement cassant, sans bénéfice runtime.
- Après `adm-zip`, revérifier `server/sources/cyclones-outremer.js` (décompression du ZIP DPVigilance) en conditions réelles lors du prochain épisode de vigilance.
- `sharp` : correctif dispo mais dev-only ; peut attendre un lot « dépendances ».
