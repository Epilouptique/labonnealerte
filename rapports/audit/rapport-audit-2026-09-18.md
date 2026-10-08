# Rapport d'audit sécurité — 2026-09-18

Robot 2 (auditeur lecture seule, périmètre = dépôt local). Aucune requête vers
labonnealerte.fr, aucune écriture hors ce fichier, aucun accès DB, aucun secret recopié.

## Résumé (5 lignes max)

- **mineur** — 5 vulnérabilités npm (0 critique, 3 high, 2 moderate), toutes avec correctif annoncé disponible ; 2 paquets *directs* prod concernés (`adm-zip` moderate, `sharp` high), le reste transitif.
- **mineur** — `ip-address` (transitif, high SSRF) est une brique de la chaîne anti-SSRF : à mettre à jour en priorité parmi les avis npm bien que non appelé directement.
- **RAS** routes exposées : aucune route destructive/debug/dump non authentifiée montée en prod ; tous les `DELETE` sont derrière `authenticate()` ou `requireAdmin`.
- **RAS** SSRF & injection : toutes les URL utilisateur passent par `safe-fetch` ; aucune concaténation SQL d'entrée utilisateur (les 3 interpolations sont des noms de colonnes littéraux).
- **RAS** secrets & validation client/serveur : aucun secret en dur, lecture via `process.env` ; validation serveur présente sur les formulaires d'écriture.

---

## 1. Dépendances (npm audit)

`npm audit --json` a abouti (registre joignable). Total : **5 vulnérabilités — 0 critical,
3 high, 2 moderate** sur 127 deps prod / 58 dev. Aucune n'est classée critical.

| Paquet | Sév. | Direct ? | Chaîne / nature | Correctif annoncé |
|---|---|---|---|---|
| `adm-zip` | moderate | **direct (prod)** | extraction suit les symlinks → écrasement de fichier arbitraire (GHSA-vwc7-r8mq-g2x9). Usage réel : décompression du flux ZIP DPVigilance (`cyclones-outremer`). Risque borné : archive d'une source officielle Météo-France, pas une entrée utilisateur. | oui (`npm audit fix`) |
| `sharp` | high | **direct (prod)** | vulns libheif (heap overflow, GHSA-rgj7-g3m4-5g8c) `<0.35.4`. Exposé seulement si `sharp` traite des images HEIF non fiables — à confirmer selon l'usage (génération d'assets ?). | oui |
| `ip-address` | high | transitif | Address4 décode les octets à zéro initial en décimal → **contournement SSRF** (GHSA-mwp4-54f8-5fhr) + 2 avis moderate. Brique bas-niveau d'une lib de la chaîne réseau. **À prioriser** : touche directement la surface anti-SSRF du produit. | oui |
| `brace-expansion` | high | transitif | DoS par expansion non bornée (outillage/build). | oui |
| `qs` | moderate | transitif | DoS / array-limit bypass (parsing query string). | oui |

**Priorisation.** `sharp` (high, prod, direct) et `ip-address` (high, SSRF, sous-jacent à
la défense réseau) d'abord ; `adm-zip` ensuite (moderate mais prod direct sur flux tiers) ;
`brace-expansion`/`qs` en dernier (transitifs, surface DoS d'outillage). Un `npm audit fix`
non-breaking est annoncé disponible pour les 5 — **non exécuté** (hors périmètre lecture seule).

---

## 2. Routes exposées

Montages réels (`server/index.js`) : `/api` (api, subscribe, myalerts, push, le-point,
user-tasks, community-reports + `apiLimiter` 120/min/IP global), `/api/dev` (dev), `/auth`
(auth), `/` (forum, pages, sitemap). Les routeurs decks/collections/skins sont **archivés,
non montés** (fil #9, 12/09/2026) — surface réduite, cohérent avec l'état projet.

**Vérification régression connue (route destructive/debug oubliée) : négatif.** Toutes les
routes `DELETE` recensées sont légitimes et authentifiées :

- `DELETE /api/sources/:id/like` (`api.js:222`) — `authenticate()` obligatoire, 401 sinon + `likeLimiter`.
- `DELETE /api/favorites` (`api.js:333`) — `authenticate()`, 401 sinon ; `source_id` typé.
- `DELETE /api/my-alerts/account` (`myalerts.js:596`) — suppression de compte pilotée par l'abonné authentifié (cas légitime prévu par le cahier des charges).
- `DELETE /api/user-tasks/:id` (`user-tasks.js:349`) — route utilisateur.

Aucun path `debug`/`dump`/`reset`/`__`/`test` monté. Les seules routes `/forum/admin/*`
(`forum.js:956-961`) sont derrière `requireAdmin` (vérifié `setTopicFlag`/`setPostHidden`) et
ne font que masquer/verrouiller — non destructives. Les occurrences `/reset`, `debug` du grep
correspondent à des noms de variables/commentaires internes, pas à des routes.

**Validation & rate-limiting.** `/api/dev` porte son propre rate-limiter 10/min/IP en plus du
global. `validate-manifest` et `submit-source` bornent et typent toutes les entrées
(`req.body`), URL re-validée via `new URL()` + protocole http/https. La sonde dynamique de
manifeste paramétré repasse par `safeFetchJson` (protections SSRF). Rien à signaler.

Rappel dette (déjà connu, non bloquant) : `/auth/*` sans rate-limit dédié (audit-architecture,
Lot 5) — hors périmètre de nouvelle régression.

---

## 3. SSRF & injection

**SSRF — conforme.** Toutes les sources qui *fetchent une URL fournie par l'utilisateur*
passent par `server/safe-fetch.js` :
- `veille-page.js:63` (`safeFetchText`), `veille-stock.js:61` (`safeFetchText`),
  `veille-rss` (documenté SSRF-safe), `dev.js` validate-manifest/probe (`safeFetchJson`).

Les nombreux `fetch(...)` directs des autres sources visent des **endpoints officiels figés en
dur** (Météo-France, RTE, USGS, NOAA, INSEE, geo.api.gouv.fr, oauth2.googleapis.com,
api.github.com…) — usage légitime, hors périmètre SSRF. Cas examiné :
`hausse-tarif-operateur.js:170` `fetch('inc/'+sec+'.php')` s'exécute **dans le contexte
navigateur** (`page.evaluate`, même origine boutique.orange.fr) et `sec` est une **constante de
configuration**, pas une entrée utilisateur — pas de SSRF.

**Injection SQL — conforme.** Aucune concaténation ni template littéral interpolant une entrée
utilisateur dans `pool.query`. Les 3 seules interpolations `${...}` sont des **noms de colonnes
provenant de littéraux du code**, jamais de `req` :
- `auth.js:44,50` — `${col}` ∈ {`google_id`,`github_id`} (fixé par le flux OAuth).
- `forum.js:950` — `${column}` ∈ {`hidden`,`locked`} (passé en dur par les handlers admin).

Toutes les valeurs utilisateur transitent par les paramètres `$1/$2…`.

---

## 4. Cohérence validation client / serveur

Les formulaires d'écriture appliquent une validation **serveur** indépendante du front :
- `submit-source` (`dev.js:166`) : `name`/`manifest_url` requis et typés, `description` non
  vide, URL re-parsée + protocole contrôlé, catégories via liste fermée `sanitizeCategories`,
  `params_schema` via `validateParamsSchema` avant stockage, champs bornés (`.slice`).
- `subscribe` / `myalerts` (toggle-param, résolveur commune) : validation `isValidDepartement`,
  `q` borné ≤60, throttle 30/min sur param-lookup (cf. état projet). Pattern ReDoS retiré des
  schémas soumis.

Aucun contrôle constaté comme présent *uniquement* côté client. RAS.

---

## 5. Secrets en dur

`grep` des motifs (`apiKey`/`secret`/`token`/`password`/`Bearer`/`sk-…`) sur `server/` et
`public/` : **aucun secret en clair**. Les correspondances sont toutes des lectures
`process.env.X` (normal) ou des noms de variables. `.env` gitignoré, non lu.

Points examinés (fichier + ligne, valeurs non recopiées) :
- `index.js:50`, `profile-autofill.js:52`, `scripts/test-iplocate.js:32` — clé IPLocate lue via
  `process.env.IPLOCATE_APIKEY`, concaténée dans l'URL après `encodeURIComponent` : normal.
- `ORIGIN_SECRET` (`index.js:77`) comparé depuis `process.env` : normal.

RAS.

---

*Fin du rapport. Aucun correctif appliqué. Aucun `npm audit fix` exécuté. Le seul geste
recommandé (mise à jour des 5 paquets, priorité `sharp`/`ip-address`) est laissé à
l'appréciation de Hugo.*
