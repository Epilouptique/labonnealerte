# Rapport d'audit sécurité — LaBonneAlerte — 2026-08-21

> Robot 2 · audit en lecture seule · dépôt local uniquement.

---

## Résumé (5 lignes max)

Aucun point **critique**. Un point **majeur** : la bibliothèque `ip-address`
(≤ 10.3.0), utilisée par `express-rate-limit` et `geoip-lite` — toutes deux en
`dependencies` — présente trois CVE de contournement SSRF/trust-boundary dont
un `high`. Un point **mineur** : deux template literals SQL interpolant une
colonne (constante interne, pas d'entrée utilisateur, mais pattern défensif à
améliorer). Aucune route de debug/test/dump n'est montée en prod. Aucun secret
en dur.

---

## 1. Dépendances — npm audit

### Résultat brut

```
vulnerabilities: { high: 2, total: 2 }
```

### a) `brace-expansion` — HIGH — **devDependencies uniquement**

| Champ | Valeur |
|-------|--------|
| Sévérité | High (CVSS 7.5) |
| CVE | GHSA-mh99-v99m-4gvg + GHSA-rgw5-rvv9-x895 |
| Chaîne | `nodemon` → `minimatch@10.2.5` → `brace-expansion@5.0.7` |
| Présent en prod ? | **Non** (`nodemon` est devDependency) |
| Correctif dispo | Oui (`npm audit fix` non-breaking) |

**Risque réel : faible.** `nodemon` ne tourne pas sur Railway (processus de
dev local seulement). Un `npm audit fix` dans le prochain cycle de maintenance
est suffisant.

### b) `ip-address` — HIGH + 2 MODERATE — **dependencies prod (double entrée)**

| Champ | Valeur |
|-------|--------|
| CVE principale | GHSA-mwp4-54f8-5fhr (High) |
| CVE secondaires | GHSA-4xrf-jv44-h6hh + GHSA-22jq-vg5j-6vgg (Moderate) |
| Chaîne 1 | `express-rate-limit@8.5.2` → `ip-address@10.2.0` |
| Chaîne 2 | `geoip-lite@2.0.3` → `ip-address@10.2.0` |
| Présent en prod ? | **Oui** (les deux paquets parents sont `dependencies`) |
| Correctif dispo | Oui (`npm audit fix` non-breaking annoncé) |

**Risque réel : majeur (pas critique).** Les trois CVE concernent la
classification des adresses IP :

- `GHSA-mwp4-54f8-5fhr` : un octet en notation octale (ex. `010.0.0.1`)
  est interprété différemment par `ip-address` et par les résolveurs système
  → une IP privée peut ne pas être détectée comme telle.
- `GHSA-4xrf-jv44-h6hh` : un suffixe CIDR sur l'adresse parsée supprime
  sa classification spéciale.
- `GHSA-22jq-vg5j-6vgg` : IPv4-mappées/NAT64 mal classifiées.

Pour **LaBonneAlerte**, les conséquences immédiates sont :

1. **`express-rate-limit`** : un client qui forge son IP avec des octets en
   notation octale (si `trust proxy` laisse passer une telle valeur) pourrait
   contourner le rate-limiting `/api` (120 req/min) ou les limiteurs internes
   (`apiLimiter`, `devRouter`, `myalerts`). Le vecteur est atténué par
   `app.set('trust proxy', 1)` (seul le premier proxy Railway est considéré)
   mais pas annulé.
2. **`geoip-lite`** : utilisé pour la géolocalisation IP au moment de
   l'inscription (pays par défaut). Une IP mal classifiée donne un mauvais
   pré-remplissage de pays — conséquence fonctionnelle, pas de sécurité directe.

Le vrai risque SSRF s'exercerait si `ip-address` était utilisé dans
`safe-fetch.js` pour classifier les adresses — ce n'est pas le cas : `safe-fetch.js`
utilise `net.isIPv4()` et une liste de plages codées en dur (cf. `isPrivateIPv4`).
Le risque reste donc un contournement potentiel du rate-limiting.

**Recommandation** : exécuter `npm audit fix` au prochain déploiement.

---

## 2. Routes exposées

### Montages réels (server/index.js)

| Préfixe monté | Routeur | Auth requise ? |
|---------------|---------|----------------|
| `/api` | api, subscribe, myalerts, push, collections, decks, skins, le-point, user-tasks, community-reports | Par route (token en body/header) |
| `/api/dev` | dev | Non (rate-limit 10/min/IP) |
| `/auth` | auth | N/A (OAuth callbacks) |
| `/` | forum, pagesRouter, myAlertsPagesRouter, userTasksPagesRouter | Par route |

### Vérification spécifique : routes DELETE/debug/test/dump

**Recherche exhaustive effectuée** sur `server/routes/*.js` et `server/index.js`.

Routes `DELETE` trouvées et montées :

| Route | Auth | Objet |
|-------|------|-------|
| `DELETE /api/sources/:id/like` | token en body | Dé-liker (légitime) |
| `DELETE /api/favorites` | token en body | Retirer un favori (légitime) |
| `DELETE /api/collections/:slug/adopt` | token en body | Désadopter un deck (légitime) |
| `DELETE /api/decks/:id` | token en body | Supprimer son deck (légitime) |
| `DELETE /api/decks/:id/items/:sourceId` | token en body | Retirer une carte d'un deck (légitime) |
| `DELETE /api/my-alerts/account` | token en body | Droit à l'effacement RGPD (légitime) |
| `DELETE /api/user-tasks/:id` | token en body | Supprimer une tâche utilisateur (légitime) |

**Aucune route de type `debug`, `test`, `dump`, `reset`, `admin` non authentifiée**
n'est montée. La régression redoutée (ayant motivé ce robot) n'est pas présente.

### Points d'attention secondaires

- **`/api/dev` (validate-manifest + submit-source)** : public, rate-limité
  à 10 req/min/IP par un limiteur en mémoire maison (en plus de l'`apiLimiter`
  global 120/min). La sonde `fetchManifest` passe par `safeFetchJson` → SSRF
  protégé. Pas de problème.
- **Routes forum admin** (`/forum/admin/post|topic/:id/…`) : vérifiées, toutes
  protégées par `requireAdmin` (qui appelle `authenticate`). RAS.
- **`DELETE /api/my-alerts/account`** : suppression de compte abonné,
  authentifiée par token. Cascade Postgres sur sessions et abonnements. RAS.

---

## 3. SSRF & injection

### SSRF

**`safe-fetch.js` est bien en place et utilisé correctement.** Il couvre :
- Résolution DNS préalable + refus des IP privées/loopback/lien-local
- `redirect: 'error'` (pas de suivi de redirection)
- Timeout 5 s + plafond 100 Ko
- Protocoles autorisés : http/https uniquement

**Points vérifiés :**

- `/api/dev` (`validate-manifest`) : appel via `safeFetchJson(url)` où `url`
  vient de `req.body.url`. SSRF protégé par safe-fetch.
- Sonde dynamique de paramètre (`probe`) dans `dev.js` ligne 142 : reconstruit
  une URL depuis l'URL validée + query params d'exemple (générés en interne,
  jamais fournis par l'utilisateur). Passe également par `safeFetchJson`. RAS.
- `hausse-tarif-operateur.js` ligne 170 : `fetch('inc/' + sec + '.php', ...)` —
  ce `fetch` est exécuté **dans un contexte navigateur** (Playwright
  `page.evaluate()`), pas dans Node.js. `sec` est une constante interne
  (`'mobile'`, `'fixe'`, etc.), jamais une entrée utilisateur. Pas de SSRF.
- `server/index.js` ligne 51 : `https.get(url, ...)` dans le middleware de
  diagnostic IP — URL vers `iplocate.io` construite avec une IP résolue en
  interne, activée uniquement si `LOG_CLIENT_IP=1` (variable prod non posée
  par défaut). RAS.

**Aucun `fetch(` direct sur une URL non figée contournant `safe-fetch` n'a été
détecté.**

### Injection SQL — template literals

Deux occurrences de template literals dans des requêtes `pool.query` :

| Fichier | Ligne | Colonne interpolée | User input ? |
|---------|----|---------|------|
| `server/routes/forum.js` | 1010 | `${column}` (`'hidden'` ou `'locked'`) | Non — constante interne |
| `server/routes/auth.js` | 44, 50 | `${col}` (`'google_id'` ou `'github_id'`) | Non — constante interne |

**Risque actuel : nul** — les valeurs interpolées sont des constantes littérales
de chaînes contrôlées par le code, jamais par des entrées utilisateur
(commentaires explicites présents dans les deux fichiers).

**Sévérité : mineur** — le pattern lui-même est fragile à la maintenance : si
un refactoring futur laissait passer une valeur externe dans `column` ou `col`,
l'injection serait possible. Consigné pour information ; une liste blanche
explicite (whitelist + `throw` si hors liste) renforcerait la défense en
profondeur.

---

## 4. Cohérence validation client / serveur

### `/api/dev` — validate-manifest et submit-source

- **`manifest_url`** : validé côté serveur (syntaxe URL, protocoles http/https)
  avant tout fetch. Le front (`proposer.html`) vérifie également le format mais
  ce contrôle est contournable par appel direct.
- **`name`, `description`** : vérifiés comme `string` non vide côté serveur.
- **`categories`** : passés par `sanitizeCategories()` serveur (liste fermée,
  1 à 3 tags).
- **`params_schema`** : validé par `validateParamsSchema()` serveur. RAS.
- **`email`, `github`** : tronqués à 255 chars côté serveur, mais pas de
  validation de format email stricte — acceptable pour un champ optionnel
  non fonctionnel (non envoyé à l'abonné, juste stocké pour review manuelle).

### `/api/my-alerts/toggle` et routes d'abonnement

- **`source_id`** : vérifié dans la base (`WHERE id = $1 AND enabled = true`)
  avant tout usage. Pas d'injection possible via paramètre paramétré.
- **`params`** : validés par `validateParamsSchema` côté serveur à la
  souscription. RAS.

### Forum

- **Titres / corps** : validés via `validateForumTitle` / `validateForumBody`
  (module `ugc.js`) côté serveur. Les corps sont échappés HTML avant rendu
  (`escHtml` + `bodyToHtml`). RAS.

**Bilan** : la validation client/serveur est cohérente sur toutes les routes
d'écriture inspectées. Aucun contrôle purement client sans équivalent serveur
n'a été détecté.

---

## 5. Secrets en dur

Recherche effectuée sur les patterns `apiKey`, `api_key`, `Bearer `, `sk-`,
`password`, `secret`, `token` dans `server/` et `public/`.

**Résultat : aucun secret en dur.**

Tous les identifiants sensibles sont lus depuis `process.env.*` :
- `METEOFRANCE_API_KEY`, `SNCF_API_KEY` → vérifiés absents si variable non
  posée (erreur levée proprement).
- `FRANCETRAVAIL_CLIENT_SECRET`, `TWITCH_CLIENT_SECRET`, `LEGIFRANCE_CLIENT_SECRET`,
  `RTE_CLIENT_SECRET` → lus depuis env + guard `if (!id || !secret) { ... }`.
- `GOOGLE_SECRET`, `GITHUB_SECRET` → lus depuis env dans `routes/auth.js`.
- `ORIGIN_SECRET` → lu depuis env, utilisé uniquement dans des comparaisons
  `===`, jamais loggé.
- `IPLOCATE_APIKEY` → optionnel, lu depuis env dans le middleware diagnostic.

Le `.env` est gitignore (normal). Aucune valeur de secret n'est copiée dans ce
rapport.

---

## Récapitulatif par priorité

| Priorité | Sujet | Fichier / portée | Action suggérée |
|----------|-------|-----------------|-----------------|
| **Majeur** | `ip-address ≤ 10.3.0` en dependencies (bypass rate-limit possible) | `express-rate-limit`, `geoip-lite` | `npm audit fix` au prochain déploiement |
| **Faible** | `brace-expansion` High en devDependencies | `nodemon` | `npm audit fix` (maintenance courante) |
| **Mineur** | Template literals SQL (`column`/`col`) — pattern fragile à la maintenance | `forum.js:1010`, `auth.js:44,50` | Whitelist explicite + throw si valeur inattendue |

---

*Fin du rapport. Aucune modification de fichier hors ce rapport n'a été effectuée.*
