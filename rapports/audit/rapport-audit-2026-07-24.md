# Rapport d'audit sécurité — 2026-07-24

## Résumé (lecture seule, dépôt local)

**RAS critique / majeur.** Aucune vulnérabilité de dépendance, aucune route
destructive/debug exposée sans contrôle, aucune SSRF contournant `safe-fetch`,
aucune injection SQL, aucun secret en dur. Un seul point **mineur** (like public
décrémentable sans auth, plafonné à 0) + rappels de dette déjà connue (middleware
diag `LOG_CLIENT_IP` dormant). Détail ci-dessous.

---

## 1. Dépendances (npm audit)

`npm audit --json` exécuté avec succès (registre joignable).

- **0 vulnérabilité**, toutes sévérités confondues : `critical 0 / high 0 /
  moderate 0 / low 0 / info 0`, total **0** sur 185 dépendances (126 prod, 58 dev,
  31 optionnelles).
- Aucun `npm audit fix` requis.

**RAS.**

---

## 2. Routes exposées

Montages réels relevés dans `server/index.js` : `/api` (api, subscribe, myalerts,
push, collections, decks, le-point) avec `apiLimiter` global (120 req/min/IP,
`index.js:132-139`), `/api/dev` (dev), `/auth` (auth), pages à la racine `/`.

### Routes d'écriture / données perso — authentification vérifiée
Toutes les routes touchant un compte, des abonnements ou une donnée perso
exigent un token de session résolu côté serveur, et **scopent la requête SQL sur
`auth.id`** (impossible d'agir sur les données d'autrui) :

- `DELETE /api/my-alerts/account` (`myalerts.js:373-384`) — RGPD, `authenticate`
  puis `DELETE ... WHERE id = $1` sur l'id authentifié. CASCADE assumée. **OK.**
- `POST /api/my-alerts/toggle` (`myalerts.js:389+`) — `authenticate` + source
  vérifiée active/abonnable. **OK.**
- `DELETE /api/decks/:id` (`decks.js:211-224`) — `requireAuth` + `WHERE id=$1 AND
  owner_subscriber_id=$2`. **OK.**
- `DELETE /api/decks/:id/items/:sourceId` (`decks.js:271+`) et `POST
  /decks/:id/items` (`decks.js:230+`) — `requireAuth` + `ownedDeck(id, auth.id)`.
  **OK.**

### Vérification « route destructive / debug oubliée » (régression cible)
Recherche exhaustive de `app.delete`/`router.delete` et des chemins
`debug`/`test`/`dump`/`reset`/`admin`/`__` **montés** :

- Les seuls `.delete(...)` montés sont les 4 routes légitimes ci-dessus + le like
  (ci-dessous). Les autres occurrences `delete`/`reset` sont des `Map.delete`
  internes (rate-limit, states OAuth), des `_resetCache()` de test non montés, et
  du texte dans `init.sql`. **Aucune route de debug/dump/reset exposée.**
- Aucun chemin `admin`/`test`/`dump` monté. **RAS.**

### Point mineur
- `DELETE /api/sources/:id/like` (`api.js:155-175`) est **non authentifié**
  (comme son POST symétrique). Il décrémente un compteur public `likes_count`,
  **planché à 0** (`GREATEST(likes_count-1,0)`) et protégé par `likeLimiter`. Pas
  de donnée perso, pas de destruction réelle (le favori n'est retiré que si un
  token valide est fourni). Sévérité **mineure** : un tiers peut fausser à la
  baisse un compteur d'affichage. Design public assumé ; acceptable en l'état.

### Rate-limiting des routes chères
- `/api/dev/validate-manifest` et `/submit-source` : limiteur mémoire dédié
  10 req/min/IP (`dev.js:26-46`), en plus du global. Ces routes déclenchent un
  fetch sortant → le limiteur strict est adapté. **OK.**
- Rappel (déjà dans la dette, `etat-projet.md` lot audit) : `/auth/*` n'a pas de
  rate-limit dédié au-delà du global (qui ne couvre que `/api`). Non bloquant
  (OAuth code grant + state anti-CSRF usage unique), mais reste un durcissement
  souhaitable. **Mineur, connu.**

---

## 3. SSRF & injection

### SSRF
- **veille-rss** (`sources/veille-rss.js`) — seule source dont l'URL est
  **fournie par l'utilisateur** (param `flux`). Passe exclusivement par
  `safeFetchText` (`safe-fetch.js`) : rejet IP privées/loopback/lien-local,
  `redirect:'error'`, taille plafonnée, timeout, https only + regex `URL_RE`.
  Plafond `MAX_FETCH` (EXTERNAL_MAX_COMBOS). **Conforme.**
- **/api/dev/validate-manifest** (`dev.js:113+`) — URL utilisateur également, via
  `safeFetchJson` (même module), y compris la sonde paramétrée. **Conforme.**
- Tous les autres `fetch`/`https.get`/`node-fetch` relevés dans `server/sources/*`
  et `server/*-auth.js` portent sur des **URLs constantes codées en dur**
  (Météo-France, RTE, USGS, endpoints OAuth Google/GitHub, iplocate.io, etc.) :
  hors périmètre SSRF. `rss-alerte.js` (broadcast) fetch des `urls` figées dans la
  config de source, pas d'entrée utilisateur.
- `index.js:47` (`https.get` iplocate, middleware `LOG_CLIENT_IP`) : host
  constant, argument = IP client encodée, pas une URL libre. Pas de SSRF. Voir §6.

**Aucun fetch sur URL utilisateur ne contourne `safe-fetch`.**

### Injection SQL
- Recherche des concaténations / templates interpolés dans `pool.query(...)` :
  seuls hits = `auth.js:44` et `auth.js:50`, où `${col}` est interpolé.
  **Vérifié : `col` n'est jamais une entrée utilisateur** — les seuls appelants
  passent les littéraux `'google_id'` / `'github_id'` (`setProviderId`), commenté
  comme tel. La *valeur* passe bien en paramètre `$1`. **Pas d'injection.**
- Toutes les autres requêtes utilisent les paramètres `$1/$2…`. **RAS.**

---

## 4. Cohérence validation client / serveur

- **/api/dev/submit-source** (`dev.js:166+`) : validation serveur complète et
  indépendante du front — `name`/`manifest_url` requis + typés, `description`
  requise, URL reparsée (protocole http/https imposé), catégories via liste fermée
  `sanitizeCategories`, `params_schema` revalidé par `validateParamsSchema` avant
  stockage, champs bornés (`.slice`), insertion `enabled=false`. **OK.**
- **/api/dev/validate-manifest** : structure du manifeste entièrement validée
  serveur (`validateManifest`), messages d'erreur « publics » only (pas de fuite
  `err.message` brut). **OK.**
- **decks / toggle / subscribe** : les params sont revalidés serveur contre
  `params_schema` (`validateParams`), source vérifiée active et non `linked`.
  **OK.**

Aucun contrôle trouvé uniquement côté client sans équivalent serveur.

---

## 5. Secrets en dur

- Recherche des patterns (`api_key`, `secret`, `token`, `password`, `Bearer`,
  `sk-…`) hors `node_modules` : **aucun secret littéral**. Toutes les clés sont
  lues via `process.env.X` (`GOOGLE_CLIENT_SECRET`, `IPLOCATE_APIKEY`,
  `ORIGIN_SECRET`, etc.) — usage normal.
- `.env` gitignoré, non lu. **RAS.**

---

## 6. Rappels de dette (déjà connus, non-sécurité bloquante)

Signalés pour mémoire, cohérents avec `etat-projet.md` :

- **Middleware diagnostic `LOG_CLIENT_IP`** (`index.js:36-86`) : dormant par
  défaut (activé seulement si var d'env = `'1'`). Trace des en-têtes d'IP et
  appelle iplocate. Aucune écriture DB. À retirer au prochain nettoyage comme
  déjà noté. Pas une faille en l'état.
- **Rate-limit `/auth/*`** : durcissement souhaitable (cf. §2).

---

## Conclusion

Posture saine. Le risque de régression ciblé (route destructive/debug non
authentifiée) est **absent** : les 4 routes DELETE montées sont authentifiées et
scopées propriétaire. Aucun correctif à appliquer ; seul le like public non
authentifié mérite éventuellement une décision produit (mineur, plafonné).
Aucun brouillon de correctif nécessaire.
