# Rapport d'audit sécurité — 2026-07-31

Robot 2 (audit hebdomadaire, LECTURE SEULE, dépôt local). Aucun fichier modifié
hors ce rapport, aucune requête vers labonnealerte.fr, aucun accès DB, aucun
`runCycle()`. Seule sortie réseau : `npm audit` (registre npm).

## Résumé (classé par sévérité)

1. **mineur** — 1 vuln `high` npm (`brace-expansion`, DoS) mais en
   **devDependency uniquement** (nodemon → minimatch), absente du runtime prod.
2. **mineur** — bloc diagnostic `LOG_CLIENT_IP` dans `server/index.js` fait un
   `https.get` direct vers iplocate.io (désactivé par défaut, à retirer une fois
   le diagnostic IPv6 obtenu).

Aucun constat **critique** ni **majeur**. Routes destructives toutes
authentifiées, aucune route debug/dump/test/reset montée, SSRF canalisé par
`safe-fetch`, aucune injection SQL, aucun secret en dur.

---

## Détail par section

### a) Vulnérabilités des dépendances (`npm audit`)

`npm audit --json` a répondu (registre joignable). Bilan : **1 vulnérabilité au
total**, sévérité `high`, 0 critical/moderate/low.

| Paquet | Sévérité | Origine | Chaîne | Fix |
|---|---|---|---|---|
| `brace-expansion` (≤5.0.7) | high (CWE-400/770, DoS OOM par expansion non bornée, CVSS 7.5) | **devDependencies** | `nodemon` → `minimatch@10.2.5` → `brace-expansion@5.0.7` | `fixAvailable: true` (non-breaking annoncé) |

**Sévérité retenue : mineur.** L'avis est `high` sur le barème npm, mais le
paquet est tiré **exclusivement par `nodemon`** (outil de dev/rechargement,
jamais lancé en prod Railway). Il n'entre pas dans le chemin d'exécution servi
aux utilisateurs. Métadonnées : 127 deps prod, 58 dev, 31 optionnelles.

Un `npm audit fix` (non-breaking) est annoncé disponible — **non exécuté**
(hors périmètre lecture seule). À traiter par Hugo au prochain passage de
maintenance des dépendances, sans urgence.

### b) Revue des routes exposées

Montage réel vérifié dans `server/index.js` (`app.use(...)`). Préfixes : `/api`
(+ `apiLimiter` global 120/min), `/api/dev`, `/auth`, `/` (pages + forum).

**Recherche de routes destructives/debug — résultat négatif.** Aucune route
`debug`, `dump`, `test`, `reset`, `__…` montée. Toutes les méthodes
`delete`/`patch` trouvées sont légitimes et **authentifiées** :

| Route | Fichier:ligne | Contrôle |
|---|---|---|
| `DELETE /api/my-alerts/account` | `routes/myalerts.js:536` | `authenticate(token)` → 401 sinon ; supprime le compte de `auth.id` uniquement |
| `PATCH /api/decks/:id` | `routes/decks.js:231` | `requireAuth` + `ownedDeck` + `WHERE owner_subscriber_id` |
| `DELETE /api/decks/:id` | `routes/decks.js:268` | `requireAuth` + `WHERE owner_subscriber_id = auth.id` |
| `DELETE /api/decks/:id/items/:sourceId` | `routes/decks.js:329` | `requireAuth` |
| `DELETE /api/collections/:slug/adopt` | `routes/collections.js:266` | (désadoption de l'abonné authentifié) |
| `DELETE /api/user-tasks/:id` | `routes/user-tasks.js:349` | soft delete, propriété vérifiée dans le WHERE (404 jamais 403 → pas d'énumération) |
| `DELETE /api/sources/:id/like` | `routes/api.js:170` | `likeLimiter` |
| `POST /forum/admin/topic|post/…` | `routes/forum.js:854-859` | `requireAdmin` (auth + `is_admin`) en tête de chaque handler |

- **Authentification** : chaque route de données perso / d'écriture appelle
  `authenticate()` / `requireAuth()` / `requireAdmin()` à la main (pas de
  middleware global — cohérent avec l'archi documentée). RAS.
- **Validation des entrées** : `req.params.id` parsé/typé (ex. `parseInt` +
  `Number.isInteger` dans forum admin), UGC validé (`ugc.validateDeckName/…`),
  `source_id`/`subscribed` typés avant usage (`myalerts.js:552`). RAS.
- **Rate-limiting** : `apiLimiter` global 120/min sur `/api` ; limiteurs stricts
  additionnels sur les routes chères (`/api/dev` 10/min `routes/dev.js:22`,
  création de decks/tâches, likes, lookup). Suffisant.

### c) Patterns SSRF / injection

**SSRF — RAS.** Les fetch sortants vers une **URL fournie par l'utilisateur**
passent bien par `server/safe-fetch.js` :
- `/api/dev/validate-manifest` et `/submit-source` → `safeFetchJson`
  (`routes/dev.js:12,50,121,142`), y compris la sonde dynamique paramétrée ;
- veille-rss / veille-agenda / youtube-chaine / panneaupocket → `safeFetchText`
  avec restriction d'hôte (documenté).

Les `fetch`/`https.get` **directs** restants pointent tous vers des **hôtes
figés en dur**, non contournables par l'utilisateur :
- OAuth (`routes/auth.js:111-186` : googleapis / github fixes) ;
- `domaine-securite.js:61` → `API_URL = 'https://urlhaus-api.abuse.ch/v1/host/'`
  (hôte fixe ; la valeur utilisateur n'est qu'un paramètre passé à cette API, pas
  la cible du fetch) ;
- toutes les sources via `node-fetch` (Météo-France, RTE, INSEE, USGS… endpoints
  officiels constants) ;
- `hausse-tarif-operateur.js:170` : `fetch('inc/'+sec+'.php')` s'exécute
  **dans la page headless (contexte navigateur, même origine boutique.orange.fr)**,
  `sec` étant une valeur de config d'opérateur figée, pas une entrée utilisateur.

Le module `safe-fetch` lui-même reste solide : rejet IP privées/loopback/lien-local
(IPv4+IPv6, y compris `::ffff:` mappé), `redirect: 'error'`, timeout, plafond de
taille, re-validation à chaque saut dans `safeProbe`.

**Injection SQL — RAS.** Aucune concaténation/interpolation de **valeur**
utilisateur dans `pool.query` : tout passe par les paramètres `$1/$2…`. Les trois
seules interpolations de chaîne (`grep`) portent sur un **nom de colonne** issu
d'une liste fermée, jamais d'une entrée utilisateur, et sont commentées comme
telles :
- `routes/auth.js:44,50` — `${col}` ∈ `{'google_id','github_id'}` (constantes) ;
- `routes/forum.js:848` — `${column}` ∈ `{'hidden','locked'}` (via
  `setTopicFlag('hidden'|'locked', …)`, `routes/forum.js:856-859`).

### d) Cohérence validation client / serveur

Chaque formulaire d'écriture a un **équivalent serveur**, indépendant du JS
client :
- `/api/dev/submit-source` : re-valide `name`/`description`/`manifest_url`
  (protocole http(s)), catégories via `sanitizeCategories` (liste fermée 1-3),
  `params_schema` via `validateParamsSchema`, borne les longueurs pour respecter
  les `CHECK` SQL, `enabled = false` forcé (`routes/dev.js:166-245`) ;
- `/validate-manifest` : schéma OpenAlert validé serveur (`validateManifest`) ;
- decks / user-tasks / subscribe : validation UGC (`server/ugc.js`) + `params.js`
  (`validateParams`, `maxLength` par descripteur) côté serveur.

Aucun contrôle observé qui serait présent uniquement au front. RAS.

### e) Secrets en dur

`grep` des patterns usuels (`api_key`, `secret`, `token`, `password`, `Bearer`,
`sk-…`) sur `server/` et `public/` (hors `node_modules`) : **aucune valeur de
secret codée en dur**. Les occurrences sont toutes des lectures
`process.env.X` (normal) ou des noms de variables. `.env` gitignoré (non lu).

---

## Point d'attention (informational, non bloquant)

`server/index.js:33-89` — bloc diagnostic `LOG_CLIENT_IP` : quand
`process.env.LOG_CLIENT_IP === '1'`, chaque requête HTML déclenche un
`https.get` direct vers `iplocate.io` (URL construite à partir de l'IP client).
La cible (`iplocate.io`) est fixe → **pas un SSRF** ; le bloc est **désactivé par
défaut** et sans écriture DB. Le commentaire le marque déjà « à retirer une fois
le diagnostic obtenu ». Recommandation : le supprimer (ou le laisser dormant) au
prochain passage — aucune action urgente. **Sévérité : informational.**

---

## Conclusion

État sain. La régression historique motivant ce robot (route destructive/debug
oubliée en prod) **n'est pas présente** : toutes les routes destructives sont
authentifiées et scopées au propriétaire, aucune route debug/dump n'est montée.
Seul point de suivi non urgent : la vuln `high` npm confinée aux devDependencies.
Aucun brouillon de correctif nécessaire.
