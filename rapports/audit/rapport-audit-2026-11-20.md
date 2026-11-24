# Rapport d'audit sécurité — 2026-11-20

> Robot 2 (Auditeur de sécurité, LECTURE SEULE, dépôt local). Aucune requête vers
> labonnealerte.fr, aucun accès DB, aucune modification de fichier hors ce rapport.
> `npm audit` exécuté contre le registre npm (seule sortie réseau autorisée).

## Résumé (classé par sévérité)

1. **critique** — `proxy-addr` (transitif via `express`) : IP spoofing via sous-réseau
   de confiance IPv4-mapped IPv6. L'app pose `trust proxy = 1` et dérive l'IP client
   pour le rate-limiting → impact réel. Corrigé par `npm audit fix` (non-breaking).
2. **majeur** — 6 avis `high` en dépendances **prod** (adm-zip, undici, body-parser,
   brace-expansion, ip-address) + 3 `moderate` (qs). Tous DoS/bypass, tous corrigeables
   sans breaking (`npm audit fix` ; `undici@6.29.1` = mise à jour mineure).
3. **mineur** — 2 `high` + 1 `moderate` en **devDependencies** (sharp, nodemon,
   minimatch) : outillage de build, pas servi en prod, urgence moindre.
4. **RAS** — Routes exposées : aucune route destructive/debug/dump non authentifiée.
   Les 5 `DELETE` montés sont tous derrière `authenticate()`/`requireAdmin()`.
5. **RAS** — Aucune injection SQL (identifiants interpolés = constantes littérales
   whitelistées, valeurs toujours en `$1/$2`), aucun SSRF contournant `safe-fetch`,
   aucun secret en dur.

---

## 1. Dépendances (`npm audit`)

Total : **10 vulnérabilités — 1 critique, 6 high, 3 moderate** (0 low/info).

### Dépendances de PRODUCTION (risque réel en service)

| Paquet | Sév. | Direct/transitif | Avis (résumé) | Fix |
|---|---|---|---|---|
| **proxy-addr** | **critique** | transitif ← `express@5.2.1` | IP spoofing via sous-réseau de confiance IPv4-mapped IPv6 | `npm audit fix` (non-breaking) |
| adm-zip | high | **direct** | symlink overwrite, bombe de décompression (taille=0 bypass), SUID/SGID, crash DEFLATE async (DoS) | `npm audit fix` (non-breaking) |
| undici | high | **direct** | 5 avis : DoS EventSource/content-encodings/PONG, bypass validation TLS | `undici@6.29.1` (mineur, non-breaking) |
| body-parser | high | transitif ← `express` | DoS via octets en trop après corps compressé | `npm audit fix` |
| brace-expansion | high | transitif ← `express`→`qs`→`ip-address` | 5 avis DoS (OOM, récursion, temps quadratique) | `npm audit fix` |
| ip-address | high | transitif ← `express`→`qs` | 8 avis : mauvaise classification IP (bypass SSRF/trust-boundary), DoS parse | `npm audit fix` |
| qs | moderate | transitif ← `express` | array-limit bypass, DoS `isBuffer`, DoS `stringify` | `npm audit fix` |

**Priorités de risque :**
- **proxy-addr (critique)** est le point le plus sensible : l'app s'appuie sur
  `app.set('trust proxy', 1)` (`server/index.js:34`) et sur l'IP client dérivée pour
  `express-rate-limit`. Un spoofing d'IP permettrait de contourner les limiteurs
  (subscribe, dev, like, forum). Correction prioritaire.
- **adm-zip (direct)** : utilisé uniquement dans `server/sources/cyclones-outremer.js:48`
  pour décompresser le flux ZIP **DPVigilance de Météo-France** (endpoint officiel
  figé, pas d'upload utilisateur) → surface d'attaque réduite, mais rester à jour
  (bombe de décompression possible si MF était compromis/MITM). À corriger.
- **undici (direct)** : surtout du DoS + un bypass TLS. Corrigible en mise à jour mineure.
- `ip-address`/`brace-expansion`/`qs`/`body-parser` : chaîne transitive d'`express`,
  essentiellement DoS. `ip-address` porte des bugs de classification IP exploitables
  en SSRF — **mais** le module SSRF maison (`safe-fetch.js`) fait ses propres contrôles
  d'IP et ne s'appuie pas sur ce paquet ; le risque est donc indirect. À aligner via fix.

### devDependencies (outillage, risque moindre)

| Paquet | Sév. | Avis | Fix |
|---|---|---|---|
| sharp | high | libheif/librsvg (GHSA-rgj7, CVE-2026-96889) | `npm audit fix` |
| nodemon | moderate | via `minimatch` | `nodemon@3.1.11` (**semver-major**) |
| minimatch | moderate | ReDoS | idem nodemon |

Non servies en prod (build/dev only) → urgence basse. `nodemon` exige un bump majeur :
à traiter hors du `fix` automatique.

> **Rappel périmètre** : `npm audit fix` / `--force` **non exécutés** (lecture seule).
> Commandes consignées dans le brouillon en fin de rapport, à lancer par Hugo.

---

## 2. Routes exposées — **RAS critique**

Montages réels (`server/index.js`) : `/api`, `/api/dev`, `/auth`, `/` (forum, pages).
Revue des routes d'écriture / données perso / `DELETE`.

**Aucune route destructive, debug, dump, reset ou admin non authentifiée.** La
régression qui a motivé ce robot n'est pas reproduite.

Les 5 `DELETE` montés sont tous légitimes et authentifiés :
- `DELETE /api/my-alerts/account` (`myalerts.js:650`) — suppression de compte RGPD,
  `authenticate()` + anonymisation/erase par listes de colonnes whitelistées.
- `DELETE /api/favorites` (`api.js:333`) — `authenticate()`.
- `DELETE /api/sources/:id/like` (`api.js:222`) — `authenticate()` + `likeLimiter`.
- `DELETE /api/community-sources/:id` (`community-sources.js:404`) — authentifié.
- `DELETE /api/user-tasks/:id` (`user-tasks.js:349`) — authentifié.

Routes publiques coûteuses : correctement limitées (en plus de l'`apiLimiter` global
120/min/IP sur `/api`) :
- `POST /api/dev/validate-manifest` + `/api/dev/submit-source` : 10/min/IP, fetch via
  `safeFetchJson` (robots:true, timeout, cap taille).
- `POST /api/subscribe` : 8/min/IP + confirmation par e-mail (magic link).
- `POST /api/my-alerts/request` : 5/min/IP (envoi d'e-mail).
- `GET /api/param-lookup/:source` : 30/min/IP.
- Forum : 5 sujets/h, 15 réponses/h par compte.

Les routes admin forum (`/forum/admin/...`) passent par `requireAdmin()`.

---

## 3. SSRF & injection — **RAS**

**SSRF** : toutes les sources à URL **fournie par l'utilisateur** passent par
`server/safe-fetch.js` (`safeFetchText`/`safeFetchJson`/`safeProbe`/`safeFetchBuffer`) :
`veille-page`, `veille-rss`, `veille-agenda`, `domaine-disponibilite`, PanneauPocket
(parser + factory, après `validPanneauUrl`), `external.js` (sources OpenAlert externes),
`routes/dev.js` (validate-manifest / probe). Les `fetch` directs restants visent des
**endpoints officiels figés en dur** (Météo-France, RTE, INSEE, NASA, YouTube feed après
validation stricte du channel-id, doomname via `BASE` constant) → acceptables.

> Faux positif écarté : `server/sources/domaine-securite.js:61` fait un `fetch` **direct**,
> mais vers `API_URL` **constant** (API URLhaus) ; le domaine utilisateur part dans le
> **corps POST** (`host=…`, `encodeURIComponent`, validé par `DOMAIN_PATTERN`), pas dans
> l'URL de destination. **Ce n'est donc pas un SSRF.** (Noté pour éviter une fausse alerte
> au prochain passage.)

**Injection SQL** : aucune concaténation d'entrée utilisateur dans une requête. Les 7
occurrences d'interpolation `${…}` dans `pool.query` n'interpolent que des **noms de
colonnes/tables constants et whitelistés** (jamais des valeurs) :
- `auth.js:44,50` — `col ∈ {'google_id','github_id'}` (constante).
- `forum.js:951` — `column ∈ {'hidden','locked'}` (constante littérale).
- `myalerts.js:640,641` — tables/colonnes des listes `ACCOUNT_ANONYMIZE`/`ACCOUNT_ERASE`.
- `municipal-events.js:106`, `orgs/municipal-notify.js:139` — constantes `EVT_COLUMNS`/`SUB_FIELDS`.
Les valeurs sont toujours passées en paramètres `$1/$2`. **Pas de signalement.**

---

## 4. Validation client / serveur — **RAS**

Les formulaires d'écriture ont un contrôle serveur équivalent au contrôle front, donc
non contournables par appel direct :
- `/api/subscribe` : regex e-mail côté serveur (`subscribe.js`).
- `/api/dev/validate-manifest` / `submit-source` : URL validée (protocole `http(s)` only)
  + `safeFetchJson` ; champs bornés.
- `domaine-securite` / `domaine-disponibilite` : `DOMAIN_PATTERN` + `lowercase` côté
  serveur (`params_schema`), pas seulement au front.
- `my-alerts/quiet-hours` : heures bornées 0-23 ; `preferences` : enums validés.

---

## 5. Secrets en dur — **RAS**

`grep` des motifs usuels (`apiKey`, `secret`, `token`, `password`, `Bearer`, `sk-…`) sur
`server/` et `public/` : aucun secret réel codé en dur. Tous les secrets sont lus via
`process.env.X` (URLHAUS_AUTH_KEY, METEOFRANCE_API_KEY, TOKEN_HASH_SECRET, ORIGIN_SECRET…).

Deux captures non-secrètes (déjà documentées aux audits précédents) :
- `server/safe-fetch.js:34` `BOT_TOKEN = 'LaBonneAlerte'` — identifiant de User-Agent
  **public** (annoncé dans robots.txt), pas un secret.
- `scripts/test-push-transports.js:19` — jeton Expo **factice** d'exemple (placeholder),
  pas une valeur de prod.

---

## BROUILLON — à valider par Hugo avant toute exécution

> Jamais exécuté par le robot. Corrige la quasi-totalité des avis sans breaking change.
> `nodemon` (devDep) exige un bump majeur, isolé à part.

```sh
# 1) Vérifier ce que fix changerait (dry-run de lecture)
npm audit fix --dry-run

# 2) Corrections non-breaking (proxy-addr critique, adm-zip, undici, body-parser,
#    qs, brace-expansion, ip-address, sharp) :
npm audit fix

# 3) Re-vérifier
npm audit

# 4) Seulement si souhaité — bump majeur de l'outil de dev nodemon (hors prod) :
#    npm install -D nodemon@^3.1.11   # tester le watch en local avant de committer
```

Après `npm audit fix` : relancer la suite locale / un démarrage `node server/index.js`
en local pour confirmer qu'`express`/`undici` n'ont pas de régression avant push.
