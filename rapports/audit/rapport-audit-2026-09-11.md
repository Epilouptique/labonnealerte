# Rapport d'audit sécurité — 2026-09-11

Robot 2 · revue en **lecture seule** du dépôt local · aucune requête vers `labonnealerte.fr`, aucun accès DB, aucune modification hors ce rapport. Seul appel réseau : `npm audit` (registre npm).

## Résumé (par sévérité)

- **critique** : RAS. **La régression qui a motivé ce robot est absente** — aucune route `DELETE`/`debug`/`dump`/`reset`/`test`/`admin` destructive non authentifiée n'est montée. Les `router.delete` présents sont des actions légitimes pilotées par l'abonné authentifié.
- **majeur** : RAS en propre au code. Côté dépendances, 2 avis `high` — mais l'un (`sharp`) est en `devDependencies`, l'autre (`brace-expansion`) vient de `nodemon` (dev) → **pas servis en prod**.
- **mineur** : (1) `ip-address` (high/SSRF-CWE-918) en **prod** via `express-rate-limit`/`geoip-lite` — correctif non-breaking dispo ; (2) `qs` (moderate) en prod via `express` — non-breaking ; (3) `adm-zip` (moderate) en prod — correctif **breaking** ; (4) `htmlPage` de `subscribe.js` n'échappe pas ses interpolations (documenté, entrées de confiance uniquement) ; (5) diagnostic `LOG_CLIENT_IP` appelle `iplocate.io` en sortie si activé (off par défaut).

---

## 1. Dépendances (`npm audit`)

`npm audit --json` a réussi (registre joignable). Total : **5 vulnérabilités — 0 critique, 3 high, 2 moderate**. Dépendances : 127 prod, 58 dev.

Classement **prod vs dev** (chaîne vérifiée via `npm ls`) :

| Paquet | Sévérité | Prod/Dev | Chaîne | Correctif | Priorité |
|---|---|---|---|---|---|
| `ip-address` | high + moderate | **PROD** | `express-rate-limit@8.5.2` + `geoip-lite@2.0.3` → `ip-address@10.2.0` | `npm audit fix` (non-breaking) | **la plus utile** |
| `qs` | moderate ×2 | **PROD** | `express@5.2.1` → `body-parser`/`qs@6.15.3` | `npm audit fix` (non-breaking) | moyenne |
| `adm-zip` | moderate | **PROD** | direct `^0.6.0` (utilisé par `cyclones-outremer`, flux ZIP DPVigilance) | `0.5.8` **isSemVerMajor = breaking** | basse (voir ci-dessous) |
| `sharp` | high | **DEV** (`devDependencies`) | direct `^0.35.3` | `npm audit fix` | basse (jamais servi) |
| `brace-expansion` | high | **DEV** | `nodemon@3.1.14` → `minimatch` → `brace-expansion@5.0.7` | `npm audit fix` (non-breaking) | basse (jamais servi) |

Notes :
- **`ip-address`** : les deux avis sont catégorisés SSRF/trust-boundary (CWE-918/20), mais l'usage réel ici est la **normalisation d'IP** pour les clés de rate-limit (`express-rate-limit`) et la géoloc (`geoip-lite`), **pas** le chemin anti-SSRF de `server/safe-fetch.js` (qui a sa propre logique). Impact concret limité ; correctif non-breaking → à prendre.
- **`sharp` (high)** : déclaré en `devDependencies` → **n'est pas dans le bundle de prod servi**. Vuln libheif réelle mais hors surface de service. Moins urgent qu'une moderate prod.
- **`brace-expansion` (high, DoS)** : purement outillage `nodemon` (dev). Idem.
- **`adm-zip`** : seul correctif = **rétrograder en 0.5.8** (majeur/breaking). Ne pas lancer `npm audit fix --force`. À traiter à part, après vérification de compatibilité avec `cyclones-outremer.js`.

**Recommandation** : un `npm audit fix` (sans `--force`) corrige `ip-address`, `qs`, `brace-expansion`, `sharp` sans casse. `adm-zip` reste, à arbitrer par Hugo. **À exécuter par Hugo — jamais par ce robot.**

---

## 2. Routes exposées

Point de montage réel lu dans `server/index.js` (le montage fait foi) :

- `/api` : `api`, `subscribe`, `myalerts`, `push`, `collections`, `decks`, `skins`, `le-point`, `user-tasks`, `community-reports` (+ `apiLimiter` global 120/min/IP, `index.js:170-177`).
- `/api/dev` : `dev`. `/auth` : `auth`. `/` : `sitemap`, `forum`, pages statiques + pages HTML email.

> Le montage réel est plus large que celui listé dans la consigne du robot (ajouts : collections, decks, skins, le-point, user-tasks, community-reports, forum, sitemap). Revus ci-dessous.

### Recherche de route destructive/debug (régression connue) — RAS

`app.delete`/`router.delete` trouvés (`server/routes/`) : tous **légitimes et authentifiés** —
- `api.js:222` `DELETE /sources/:id/like` (auth requise, `likeLimiter` 20/min),
- `api.js:333` `DELETE /favorites` (compte),
- `collections.js:292` `DELETE /collections/:slug/adopt`,
- `decks.js:274/335` `DELETE /decks/:id` + items (propriétaire),
- `myalerts.js:607` `DELETE /my-alerts/account` (suppression de compte pilotée par l'abonné — cas explicitement acceptable),
- `user-tasks.js:349` `DELETE /user-tasks/:id`.

Routes `admin` du forum (`forum.js:1077-1082`) protégées par `requireAdmin(req,res)` (auth + `is_admin`). **Aucune** route `debug`/`dump`/`reset`/`test`/`__` montée. La régression historique (route destructive de debug oubliée) **n'est pas présente**.

### Authentification / validation — points vérifiés
- `authenticate()` (`sessions.js:30`) : token → session en base avec `expires_at > NOW()`, expiration glissante. Middleware `authTransport` (`index.js:124`) recopie `Authorization: Bearer` et pose `Cache-Control: private, no-store` sur requête authentifiée.
- `community-reports.js` : **toutes** les routes appellent `authenticate()` (401 sinon) ; `type` toujours passé par liste blanche `getType()` ; rayon borné (`clampRadius`) ; les routes par `:id` relisent le `type` sur la ligne (pas de confiance au client) ; `author_subscriber_id` jamais exposé.
- `dev.js` : `validate-manifest` + `submit-source` publics mais rate-limités (10/min/IP, en mémoire) ; `submit-source` insère `enabled=false`, catégories en liste fermée, requêtes **paramétrées**.
- `subscribe.js` : `POST /subscribe` avec `subscribeLimiter` strict (8/min/IP, car déclenche des emails) + `validateParams`.

### Rate-limiting
`apiLimiter` global 120/min/IP sur `/api` + limiteurs stricts locaux (subscribe 8, dev 10, likes 20). **Point de dette connu** : `/auth/*` (OAuth) n'a pas de limiteur dédié (déjà noté dette Lot dans `etat-projet.md`). Sévérité basse (callbacks OAuth, coût modéré) — laissé à Hugo.

---

## 3. SSRF & injection

### SSRF — conforme
Toutes les sources fetchant une **URL fournie par l'utilisateur** passent par `server/safe-fetch.js` : `veille-page`, `veille-rss`, `veille-stock`, `veille-entreprise`, `youtube-chaine`, `ma-collectivite`, `panneaupocket-parser`, `veille-agenda`, `hausse-tarif-*`, `domaine-disponibilite`, `meteo-forets`, `commune-insee`. `dev.js` (`validate-manifest`) idem via `safeFetchJson`, y compris la sonde paramétrée (`dev.js:142`).

Les `fetch`/`https.get` **directs** vérifiés visent tous des **URL figées / endpoints officiels**, aucun contournement :
- `auth.js` (OAuth Google/GitHub), `doomname.js`, `*-auth.js` (RTE/FranceTravail/Twitch/Légifrance) : URL constantes.
- `domaine-securite.js:61` : POST vers `API_URL` **fixe** (URLhaus) ; le domaine utilisateur part dans le corps `host=` encodé, il n'est **pas** fetché → pas de SSRF.
- `hausse-tarif-operateur.js:170` : `fetch('inc/'+sec+'.php')` s'exécute **dans le navigateur headless** (même origine `boutique.orange.fr`), `sec` vient d'un picker de config (pas d'entrée utilisateur).
- `index.js:53` / `profile-autofill.js:53` : `iplocate.io` (URL construite, IP encodée) — voir §5.

### Injection SQL — RAS
Les 3 seules interpolations dans un `pool.query` sont des **noms de colonne littéraux constants**, jamais des entrées utilisateur :
- `auth.js:44,50` → `${col}` ∈ `{google_id, github_id}` (fixé par l'appelant).
- `forum.js:1071` → `${column}` ∈ `{hidden, locked}` (fixé par `setTopicFlag('hidden'|'locked', …)`).
Les valeurs passent partout en paramètres `$1/$2`. Aucune concaténation d'entrée utilisateur détectée.

---

## 4. Cohérence validation client / serveur

- **`/api/dev` (submit-source)** : validation serveur présente et indépendante du front — `name`/`manifest_url` requis et typés, URL re-parsée (`new URL`, protocole http(s) only), catégories via `sanitizeCategories` (liste fermée), `params_schema` via `validateParamsSchema`, descriptions bornées aux CHECK DB. Ne fait pas confiance au JS client.
- **`/api/dev` (validate-manifest)** : validation intégralement serveur (`validateManifest`).
- **`/subscribe`** : `validateParams` côté serveur.
- **`community-reports`** : type liste blanche + rayon borné + UGC assaini (`ugc.js`) côté serveur.

Aucun contrôle trouvé qui n'existerait que côté navigateur. RAS.

---

## 5. Secrets en dur

`grep` des motifs `api_key`/`secret`/`token`/`password`/`Bearer`/`sk-…` sur `server/` et `public/` : **aucun secret en clair**. Toutes les correspondances sont soit des lectures `process.env.X` (normal), soit des noms de variables/paramètres (`:token` de route, messages de log). `public/` : aucune correspondance.

Aucune valeur n'est recopiée ici (conforme à la consigne).

---

## Constats mineurs (référence, non bloquants)

- **`subscribe.js:41` `htmlPage()`** : n'échappe pas ses interpolations `${title/heading/message}`. Documenté en commentaire (« n'y passer que du texte de confiance »). À ce jour alimenté par du texte statique/échappé en amont. À surveiller si une entrée utilisateur y était un jour injectée → XSS. Sévérité basse en l'état.
- **`index.js:42-92` `LOG_CLIENT_IP`** : diagnostic qui, **si `LOG_CLIENT_IP=1`**, émet un `https.get` sortant vers `iplocate.io` par requête HTML. Off par défaut, non bloquant, sans écriture DB. Le commentaire prévoit son retrait. À nettoyer une fois le diagnostic clos.

---

## BROUILLON — à valider par Hugo avant toute exécution

Correctif dépendances non-breaking (corrige `ip-address`, `qs`, `brace-expansion`, `sharp` ; laisse `adm-zip`) :

```bash
# À exécuter par Hugo, jamais par le robot.
npm audit fix          # SANS --force (ne pas rétrograder adm-zip)
npm audit              # vérifier : ne doit rester que adm-zip (moderate)
```

`adm-zip` (moderate, symlink-overwrite à l'extraction) : correctif = rétrograder en `0.5.8` (majeur). Vérifier d'abord la compatibilité avec `server/sources/cyclones-outremer.js` (lecture du ZIP DPVigilance) avant de décider. Risque réel faible : le ZIP provient d'un endpoint Météo-France figé, pas d'une entrée utilisateur.
