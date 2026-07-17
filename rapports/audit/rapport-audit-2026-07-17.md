# Rapport d'audit sécurité — labonnealerte.fr

**Date :** 2026-07-17
**Périmètre :** dépôt local uniquement (code, dépendances, routes telles qu'écrites). Lecture seule.
**Robot 2 — Auditeur de sécurité hebdomadaire.** Aucune requête vers la prod, aucune modification hors ce rapport, aucun accès DB, aucun `runCycle()`.

---

## Résumé

**Quasi-RAS** — 1 point mineur, aucune régression critique. Le delta de la semaine
(collections phase 2 : `routes/decks.js`, `server/ugc.js`, `routes/collections.js`)
est correctement défendu (auth sur toutes les écritures, scoping propriétaire,
requêtes paramétrées, validation UGC serveur, tokens 128 bits, IP hachée).

- **(mineur)** `POST /api/decks/shared/:token/report` — endpoint anonyme sans
  rate-limit dédié, `INSERT` sans `ON CONFLICT`, et déclenche une action modifiant
  l'état (suspension du partage + `display_name` remis à `NULL`) au seuil de 3 IP
  distinctes. Potentiel d'abus/grief et de croissance de table. Voir §b.
- (info) `npm audit` : **0 vulnérabilité** (171 dépendances).
- (info) Régression cible du robot (route DELETE/debug/dump non authentifiée) :
  **absente**. Toutes les routes `.delete` sont authentifiées et scopées au propriétaire.

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

Total : **0 avis**. Métadonnées : 112 prod, 58 dev, 31 optional, 171 au total.
Aucun `npm audit fix` requis. **RAS.**

### b) Routes exposées

Montages réels vérifiés dans `server/index.js` : `/api` (apiLimiter global 120 req/min/IP
+ routers api, subscribe, myalerts, push, **collections**, **decks**), `/api/dev` (dev),
`/auth` (auth OAuth), `/` (pages statiques + pages HTML email + pages SEO
`/deck/:token`, `/collection/:slug`, `/source/:id/statut`).

**Aucune route destructive/debug/test/dump/reset/admin non authentifiée montée en
prod.** Toutes les routes `.delete` recensées sont protégées :

| Route DELETE | Auth | Scope |
|-------|------|-------|
| `DELETE /api/my-alerts/account` | `authenticate(token)` | `id = auth.id` |
| `DELETE /api/sources/:id/like` | likeLimiter (public, non destructif — décrément planché à 0) | source active |
| `DELETE /api/decks/:id` | `requireAuth` | `owner_subscriber_id = auth.id`, cascade DB |
| `DELETE /api/decks/:id/items/:sourceId` | `requireAuth` | via `ownedDeck()` |

Nouvelles routes decks/collections — écritures & données perso, toutes contrôlées :

| Route | Auth | Validation entrées | Rate-limit |
|-------|------|--------------------|-----------|
| `GET/POST /api/collections[/:slug][/adopt]` | adopt: `authenticate(token)` | slug via `$1`, `validateParams` défensif à l'adoption | apiLimiter |
| `POST /api/my-alerts/display-name` | `requireAuth` | `validateDisplayName` (3-25, jetons bannis, anti-URL) | apiLimiter + 3 chgts/30j |
| `GET/POST/PATCH/DELETE /api/decks[/:id]` | `requireAuth` | `validateDeckName/Description`, `isValidEmoji` (liste fermée) | apiLimiter + 10 ops/h/compte |
| `POST/DELETE /api/decks/:id/items[...]` | `requireAuth` + `ownedDeck` | `source_id` typé, `validateParams` sur params | apiLimiter |
| `POST /api/decks/:id/share`, `/unshare` | `requireAuth` + `ownedDeck` | pseudo requis avant partage | apiLimiter |
| `GET /api/decks/shared/:token` | publique (par nature) | token via `$1`, n'expose jamais l'email (pseudo seul) | apiLimiter |
| `POST /api/decks/shared/:token/fork` | `requireAuth` | token via `$1`, plafond 10 decks | apiLimiter + 10 ops/h |
| `POST /api/decks/shared/:token/report` | **anonyme** | `target` normalisé, IP hachée | **apiLimiter global seulement** |

**Constat mineur — `POST /api/decks/shared/:token/report`** (`server/routes/decks.js:440`) :

- **Anonyme et sans rate-limiter dédié** (seul l'apiLimiter global 120/min/IP
  s'applique). L'`INSERT INTO deck_reports` (`decks.js:453`) **n'a pas de
  `ON CONFLICT`** malgré le commentaire « idempotent par (deck, target, ip) » :
  la même IP peut insérer des lignes en boucle. Le décompte reposant sur
  `COUNT(DISTINCT ip_hash)` reste correct fonctionnellement, mais la table peut
  croître (jusqu'à 120 lignes/min/IP). Croissance de stockage bornée mais réelle.
- Le seuil de **3 IP distinctes** déclenche une **action modifiant l'état
  déclenchable sans authentification** : `visibility='private'` + `share_token=NULL`
  (`decks.js:463`) **et**, si `target='name'`, `display_name=NULL` du propriétaire
  (`decks.js:468`). Un acteur disposant de 3 IP (VPN/proxies) peut donc faire
  suspendre le partage d'un deck **et effacer le pseudo public** d'un utilisateur.
  C'est un seuil produit assumé (modération communautaire), et `trust proxy 1`
  derrière Railway rend `req.ip` difficile à usurper en masse — d'où la sévérité
  **mineure**, mais le fait qu'une action anonyme puisse remettre à `NULL` le pseudo
  d'autrui mérite l'arbitrage de Hugo (seuil, journalisation, réversibilité).

**Reste des routes d'écriture / données perso** (subscribe, my-alerts, push, dev) :
inchangées depuis l'audit du 2026-07-16, toujours protégées (auth token, whitelists,
double opt-in, limiteurs dédiés). **RAS.**

### c) SSRF & injection

**SSRF :** aucune nouvelle surface. Les seules routes effectuant un fetch vers une
**URL fournie par l'utilisateur** restent `/api/dev/validate-manifest` (+ sonde) et
la source `veille-rss`, toutes deux **exclusivement** via `server/safe-fetch.js`.
Les routes decks/collections **n'effectuent aucun fetch sortant** (uniquement des
requêtes DB). Tous les autres `fetch`/`node-fetch` du dépôt visent des hosts
officiels figés en dur (Météo-France, RTE, api.github.com, ECCC, oauth Google/GitHub,
`doomname.com` via env) — inchangé, acceptable. **RAS.**

**Injection SQL :** toutes les requêtes des nouveaux fichiers (`collections.js`,
`decks.js`) utilisent des **paramètres `$1/$2…`**. Vérifié en particulier :
- slugs/tokens/ids toujours passés en `$1` (`collections.js:48,108` ; `decks.js:61,
  330,443` etc.), jamais concaténés ;
- `default_params` et `params` sérialisés en JSON puis passés en `$n::jsonb`
  (`decks.js:256,423`), jamais interpolés ;
- aucun nom de colonne/table dynamique issu d'une entrée utilisateur.
Aucune concaténation ni template littéral d'entrée dans un `pool.query`. **RAS.**

### d) Cohérence validation client / serveur

Le nouvel UGC (decks, pseudos) est validé **côté serveur** dans `server/ugc.js`,
jamais uniquement au navigateur :
- **Noms/descriptions de deck** : `validateText` (bornes de longueur en points de
  code, jeu de caractères `\p{L}\p{N}` + émojis, **anti-URL** `URL_LIKE`, anti-`@`)
  — appliqué serveur avant tout `INSERT`/`UPDATE`.
- **Pseudo public** : `validateDisplayName` (3-25, jetons d'usurpation bannis
  `admin/officiel/support/labonnealerte…` après normalisation NFD, anti-URL),
  unicité insensible à la casse garantie par index (capture `23505` → 409),
  quota 3 changements/30 j **serveur**.
- **Émoji de deck** : liste **fermée** `DECK_EMOJIS` (`isValidEmoji`), pas de champ
  libre — le client ne fait que proposer la même liste.
- **Params de carte** : `validateParams(schema, …)` re-validé serveur à l'ajout
  (`decks.js:244`) et à l'adoption (`collections.js:146`, `decks.js:418`).

Aucun contrôle observé qui n'existerait que côté navigateur. **RAS.**

### e) Secrets en dur

`grep` des patterns (`api_key`, `secret`, `password`, `token`, `Bearer `, `sk-…`)
sur `server/` : **aucun secret en dur**. Nouveaux points vérifiés :
- `server/ugc.js:85` — `IP_HASH_SALT` lu via `process.env` avec un **fallback
  littéral** `'lba-ugc-report-salt'`. Ce n'est pas un secret exfiltrable (sel de
  hachage d'IP pour la pseudonymisation RGPD des signalements, pas un jeton
  d'authentification). Recommandation basse : définir `IP_HASH_SALT` en env de prod
  pour que le sel ne soit pas la valeur publique du dépôt — **info, non bloquant**.
- Tokens/ids générés par `crypto.randomBytes` (128 bits share_token, ids decks) —
  bonne pratique. Aucune valeur secrète recopiée dans ce rapport.

`.env` non lu (gitignoré). **RAS** (hors la note d'info ci-dessus).

---

## BROUILLON — à valider par Hugo avant toute exécution

Piste de durcissement du point mineur §b (endpoint `report`). **Non appliqué.**
À arbitrer par Hugo — c'est un compromis modération vs. abus, pas un bug bloquant :

1. Ajouter un **rate-limiter dédié** (mémoire, comme `likeLimiter`) sur
   `POST /api/decks/shared/:token/report`, p. ex. 5/h/IP, pour borner la croissance
   de `deck_reports` et les tentatives de grief.
2. Rendre l'`INSERT` réellement idempotent : contrainte unique
   `(deck_id, target, ip_hash)` + `ON CONFLICT DO NOTHING` (aligne le code sur le
   commentaire, supprime la croissance non bornée par IP).
3. Envisager que le déclenchement à 3 IP **suspende le partage sans remettre le
   pseudo à `NULL` automatiquement** (ou relève le seuil pour l'effacement du
   pseudo), l'effacement anonyme du `display_name` d'autrui étant l'effet le plus
   sensible. Décision produit.

---

## Conclusion

Aucun correctif requis en urgence. La nouvelle brique UGC (decks/collections/pseudos)
respecte la posture défensive du projet : auth sur toutes les écritures, scoping
propriétaire systématique, requêtes paramétrées, validation UGC serveur avec
anti-URL/anti-usurpation, tokens non devinables, IP hachée (RGPD). Un seul point de
suivi ouvert cette semaine : l'endpoint de signalement anonyme (§b), à durcir au
gré de l'arbitrage produit de Hugo.
