# Rapport d'audit sécurité — 2026-10-02

> Robot 2 — revue LECTURE SEULE du dépôt local. Aucune requête vers labonnealerte.fr,
> aucune exécution contre un service en ligne, aucune modification hors ce rapport.
> Seul accès réseau : `npm audit` (registre npm).

## Résumé (classé par sévérité)

1. **majeur** — `adm-zip` (dépendance de PROD, directe) : 4 avis `high` + 2 `moderate` (DoS zip-bomb, traversée de symlink, crash process). Correctif disponible. Risque réel atténué : n'ingère qu'un flux ZIP Météo-France à URL fixe (cyclones-outremer), pas de ZIP fourni par l'utilisateur.
2. **mineur** — `sharp` (PROD, directe), `ip-address` / `brace-expansion` / `qs` (transitives) : vulnérabilités `high`/`moderate` avec correctif disponible, mais exploitation peu plausible dans l'usage actuel (détail §1).
3. **RAS** sur Routes exposées, SSRF/injection, validation client-serveur, secrets en dur. Aucune route destructive/debug/dump montée ; la seule route `DELETE` de données est la suppression de compte, authentifiée.

Aucun constat **critique**.

---

## 1. Dépendances (`npm audit`)

`npm audit` a abouti (registre joignable). Total : **5 avis** — 0 critical, **4 high**, **1 moderate**, 0 low. Toutes annoncent `fixAvailable: true`. Dépendances installées : 127 prod / 58 dev / 31 optionnelles.

### Dépendances de production (risque réel en service)

| Paquet | Directe ? | Sévérité max | Nature | Risque dans ce projet |
|---|---|---|---|---|
| `adm-zip` | oui | **high** | zip-bomb (DoS), symlink traversal, SUID/SGID, crash DEFLATE async, duplicate-entry | **Atténué** : seul consommateur = flux ZIP DPVigilance Météo-France à **URL fixe de confiance** (cyclones-outremer). Pas de ZIP utilisateur. Le risque DoS/traversée suppose une archive hostile ; la source est un endpoint officiel. |
| `sharp` | oui | **high** | heap overflow via libheif (`<0.35.4`) | **Atténué** : traitement d'images. Déclenchable seulement si `sharp` décode une image HEIF non fiable. À confirmer : aucun upload d'image utilisateur n'est servi à `sharp` en prod (usage apparent = génération d'assets hors-ligne). |
| `ip-address` | transitive | high / moderate | mauvaise classification d'IP → contournement de garde SSRF | **Faible** : le garde-fou SSRF maison (`server/safe-fetch.js`) **n'utilise pas** `ip-address` — il a sa propre fonction `isPrivateIP`. Le paquet est tiré transitivement, non sur le chemin SSRF. |
| `qs` | transitive | moderate | DoS (array-limit bypass, isBuffer) | Faible (parse de query string via Express). |

### Outillage (devDependencies, risque moindre)

| Paquet | Sévérité max | Nature |
|---|---|---|
| `brace-expansion` | **high** | DoS (expansion/récursion non bornée) — typiquement tiré par le tooling de build/glob, pas servi en prod. |

**Recommandation** (ne PAS exécuter ici) : un `npm audit fix` est annoncé non-breaking pour l'ensemble. À jouer par Hugo, puis vérifier le démarrage du poller (adm-zip sur cyclones-outremer, sharp sur la génération d'assets). Voir brouillon en fin de rapport.

---

## 2. Routes exposées

Montage réel relu dans `server/index.js` : `/api` (api, subscribe, myalerts, push, le-point, user-tasks, community-reports — tous derrière `apiLimiter` 120/min/IP), `/api/dev` (dev), `/auth` (auth), `/` (forum, pages, sitemap, statiques). Les routeurs decks/collections/skins sont **archivés et non montés** (commentaires `index.js:15,184,224,236,243`).

### Recherche de régression « route destructive/debug » (motif de ce robot)

Aucune route `debug`/`test`/`dump`/`reset`/`__`/`admin` non authentifiée n'est montée. Méthodes `DELETE` recensées :

- `DELETE /api/sources/:id/like` (`api.js:222`) — retrait de like, `likeLimiter`, exige un compte. OK.
- `DELETE /api/favorites` (`api.js:333`) — gestion de favoris. OK.
- `DELETE /api/my-alerts/account` (`myalerts.js:596`) — **suppression de compte pilotée par l'abonné authentifié** : `authenticate(token)` en tête, `401` sinon, `DELETE FROM subscribers WHERE id = $1` sur l'id de session uniquement. **Légitime** (cas explicitement toléré par la consigne). Pas de suppression de masse, pas d'id arbitraire.

Routes « admin » forum (`forum.js:956-961`, hide/unhide/lock/unlock) : chacune passe par `requireAdmin(req,res)` qui vérifie `authenticate()` **ET** `is_admin` (`forum.js:148-149`). Pas d'action destructive (soft-flag `hidden`/`locked` uniquement). OK.

### Authentification des écritures / données perso

- `myalerts.js` : toutes les routes de profil/abonnement/compte appellent `authenticate(token)` et renvoient `401` sans jeton valide.
- `community-reports.js` : les 4 écritures (`post`, `:id/spot`, `:id/extend`, `:id/resolve`) appellent `authenticate(token)` (`:116,212,276,313`). OK.
- `forum.js` : écritures (`/forum/t`, `/reply`, `/report`) authentifiées ; limiteurs par compte `makeLimiter` (5 sujets/h, 15 réponses/h). OK.
- `dev.js` : `validate-manifest` et `submit-source` publics mais `enabled=false` à l'insertion (modération manuelle) + rate-limit mémoire 10/min/IP. OK.

### Rate-limiting

`apiLimiter` global (120/min/IP) sur tout `/api`, complété par des limiteurs stricts dédiés aux routes chères (`subscribeLimiter` 8/min pour les envois d'email, `likeLimiter` 20/min, `dev` 10/min, limiteurs forum par compte). Suffisant pour les routes coûteuses relues.

**Note (dette connue, non bloquante)** : `/auth/*` (OAuth Google/GitHub) n'a pas de rate-limit dédié — déjà consigné dans l'audit d'architecture (« rate-limit /auth/* », lot restant). Mineur : les callbacks dépendent d'un `state` à usage unique.

---

## 3. SSRF & injection

### SSRF

Tous les fetchs sortants vers une **URL fournie par l'utilisateur** passent par `server/safe-fetch.js` :
- `dev.js` (validate-manifest + sonde dynamique) → `safeFetchJson` (`dev.js:12,50,121,142`).
- `server/external.js` (poller sources externes) → `safeFetchJson` (`external.js:9`).

`safe-fetch.js` est robuste : résolution DNS préalable + rejet des IP privées/loopback/lien-local/IPv4-mapped (`isPrivateIP`), `redirect:'error'` (aucun rebond), plafond de taille, timeout, erreurs « publiques » neutres. `safeProbe` re-valide l'anti-SSRF **à chaque saut** de redirection suivi manuellement.

Fetchs **directs** (hors safe-fetch) recensés — tous sur **URL constante en dur**, donc acceptables :
- `routes/auth.js:111,125,167,182` — endpoints OAuth Google/GitHub (constants).
- `server/doomname.js:18` — `BASE + '/api/internal/track'` (hôte projet frère, constant).
- `server/francetravail-auth.js:52`, `server/legifrance-auth.js:62` — URL de jeton OAuth constantes.
- `server/profile-autofill.js:53` et `server/index.js:51` — `iplocate.io/api/lookup/<ip>` ; l'IP est encodée, l'hôte est constant. `index.js:51` est en outre derrière le flag `LOG_CLIENT_IP=1` (diagnostic, désactivé par défaut).

**Mineur / pour information** — limite théorique de `safe-fetch` : la validation résout le DNS puis `fetch` re-résout le nom (fenêtre TOCTOU de DNS-rebinding). Risque faible (résolveur normalement stable, cibles à faible valeur), connu comme compromis de conception ; non exploitable trivialement. Rien à corriger dans l'immédiat.

### Injection SQL

Aucune concaténation/interpolation d'**entrée utilisateur** dans une requête. Toutes les requêtes relues utilisent des paramètres `$1/$2…`.

Deux interpolations de **nom de colonne** par template littéral, vérifiées sûres (valeur fixe, jamais une entrée utilisateur) :
- `auth.js:44,50` — `col` ∈ {`google_id`,`github_id`}, littéral côté appelant (commentaire `auth.js:43`).
- `forum.js:950` — `column` ∈ {`hidden`,`locked`}, fourni par `setTopicFlag('hidden'|'locked', …)` (constantes au montage `forum.js:958-961`).

Pas de signalement.

---

## 4. Cohérence validation client / serveur

- **submit-source** (`dev.js:166`) : validation **serveur** complète — types/longueurs (`name`, `description`), `manifest_url` re-parsée (`new URL` + protocole http/https), catégories via liste fermée `sanitizeCategories`, `params_schema` via `validateParamsSchema`, bornage des champs, `enabled=false`. Ne fait pas confiance au front.
- **subscribe** (`subscribe.js`) : `validateParams` côté serveur (`subscribe.js:6`), limiteur dédié. OK.
- **profil / toggle-param** (`myalerts.js`) : résolution commune/INSEE et validation des params côté serveur à la souscription.

Aucun contrôle trouvé qui n'existerait que côté navigateur. Pas de signalement.

---

## 5. Secrets en dur

Recherche de motifs (`apiKey`, `api_key`, `token`, `secret`, `password`, `Bearer `, `sk-…`) avec valeur littérale dans `server/**` et `public/**` : **aucun secret en dur**. Les clés sont lues via `process.env.X` (normal). `.env` gitignoré, non lu. Pas de signalement.

---

## BROUILLON — à valider par Hugo avant toute exécution

Mise à jour des dépendances vulnérables (toutes `fixAvailable`). **Non exécuté par le robot.**

```
# 1) Voir ce que fix changerait, sans l'appliquer :
npm audit fix --dry-run

# 2) Si non-breaking confirmé :
npm audit fix

# 3) Vérifications post-fix (localement, PAS contre la prod) :
#    - adm-zip : parsing du flux ZIP cyclones-outremer (server/sources + lib adm-zip)
#    - sharp   : génération d'assets images (si script hors-ligne)
#    - démarrage du serveur + poller sans erreur
```

Si `adm-zip`/`sharp` exigeaient un saut de version majeur (breaking), traiter dans un commit dédié avec test du chemin concerné, plutôt que via `npm audit fix --force`.
