> **Source de vérité (IOS-04, 11/11/2026)** : ce fichier, dans le dépôt du site, fait désormais référence. Il sert les deux apps consommatrices : Android natif (`LabonnealerteApp`) et iOS Expo (`LabonnealerteMobile`). La copie de `LabonnealerteApp/docs/contrat-api-app.md` est conservée pour l'historique et ne doit plus être modifiée. Contenu repris à l'identique ; seuls ajouts : cette note, les marques **[Spécifique Android]** et les routes iOS de la section 3.9.

# Contrat d'API LaBonneAlerte pour l'application mobile, v1

> **[Spécifique Android]** Note d'intégration de l'app Android (UnifiedPush, `DECISIONS.md` du dépôt Android). Un lecteur iOS (Expo) peut l'ignorer.

> **Note de l'integrateur (2026-10-08)** : la section 8 ci-dessous evoque FCM/APNs et une table `app_devices`. Cette piste est ECARTEE (voir DECISIONS.md D006) : l'app Android utilise UnifiedPush/Web Push via `POST /api/push/subscribe` existant. Seuls `GET /api/app/config` et `GET /api/app/events` restent a ajouter.

> Établi le 08/10/2026 en lisant uniquement le code de `C:\Dev\Labonnealerte` (branche main, commit 4c3f3cd).
> Chaque affirmation cite `fichier:ligne` (chemins relatifs au dépôt du site). Ce qui n'est pas vérifié dans le code porte la mention **hypothèse**.
> Aucun `CLAUDE.md` n'existe dans le dépôt. Le dossier `docs/` contient seulement `header-spec.md` et `rotation-identifiants.md`, sans rapport avec l'API. L'état du projet est tenu dans `.claude/etat-projet.md`.

---

## 1. Montage et préfixes

Point d'entrée : `server/index.js`. Express 5 (`package.json:14`, `"express": "^5.2.1"`).

| Ordre | Montage | Fichier:ligne |
|---|---|---|
| 1 | `trust proxy = 1` (un seul proxy, Railway) | server/index.js:30 |
| 2 | `helmet` + CSP (`connect-src 'self'`) | server/index.js:102-123 |
| 3 | `express.json()` | server/index.js:125 |
| 4 | `authTransport` : lit `Authorization: Bearer`, recopie le jeton dans `req.query.token` et `req.body.token`, pose `Cache-Control: private, no-store` | server/index.js:131 ; server/auth-transport.js:111-131 |
| 5 | `/manifest.webmanifest`, `/sw.js` | server/index.js:135-161 |
| 6 | `sitemapRouter` sur `/` | server/index.js:164 |
| 7 | `pagesMiddleware`, puis les fichiers statiques de `public/` | server/index.js:175, 185-192 |
| 8 | **Limiteur global `/api` : 120 req/min/IP** | server/index.js:196-203 |
| 9 | `/api` → `routes/api.js` | server/index.js:205 |
| 10 | `/api` → `routes/subscribe.js` (apiRouter) | server/index.js:206 |
| 11 | `/api` → `routes/myalerts.js` (apiRouter) | server/index.js:207 |
| 12 | `/api` → `routes/push.js` | server/index.js:208 |
| 13 | `/api` → `routes/le-point.js` (apiRouter) | server/index.js:210 |
| 14 | `/api` → `routes/user-tasks.js` (apiRouter) | server/index.js:211 |
| 15 | `/api` → `routes/community-reports.js` | server/index.js:212 |
| 16 | `/api/dev` → `routes/dev.js` | server/index.js:213 |
| 17 | `/auth` → `routes/auth.js` (OAuth) | server/index.js:215 |
| 18 | `/` → `routes/forum.js` (pages `/forum…` et JSON `/api/forum/…`) | server/index.js:316 |
| 19 | `/` → pages HTML (subscribe, myalerts, user-tasks) | server/index.js:319-321 |
| 20 | 404 final : JSON `{ error: 'Ressource introuvable' }` pour `/api/*` ; 410 pour `/boutique`, `/mes-decks`, `/deck`, `/collection` | server/index.js:344-356 |

Les routeurs decks, collections et skins sont archivés et ne sont plus montés (server/index.js:15, 209).

**CORS** : aucun en-tête `Access-Control-*` et aucun middleware `cors` dans `server/` (recherche sans résultat). Le site fonctionne en même origine. **Hypothèse** : un client natif (fetch iOS/Android, hors WebView) n'est pas soumis à CORS, donc l'absence d'en-têtes ne gêne pas l'app. Un client web hébergé sur une autre origine, lui, serait bloqué.

**Erreurs** : toujours du JSON `{ "error": "<message en français>" }`. Codes employés : 400 (validation), 401 (session), 403 (modération forum), 404, 409 (conflit), 410 (tâche close), 429 (limite de débit), 502 (relais geo.api.gouv), 503 (base indisponible, renvoyé par presque tous les `catch`). Une seule route renvoie 500 : la périodicité illisible d'une tâche (server/routes/user-tasks.js:241). Les routes `/confirm/:token` et `/unsubscribe/:token` répondent en HTML.

---

## 2. Authentification

### 2.1 Principe

- **Pas de cookie, pas de session serveur au sens Express.** L'authentification repose sur un **jeton opaque** de 64 caractères hexadécimaux (`crypto.randomBytes(32)`, server/sessions.js:10). Il est stocké dans la table `sessions` (server/db/init.sql:108-115).
- Durée : **90 jours**, avec **expiration glissante**. Une session vue il y a plus d'une heure est rafraîchie (`last_seen_at`). Si moins de 60 jours lui restent, `expires_at` est repoussé à J+90 (server/sessions.js:39-76). Cet UPDATE ne bloque pas la réponse.
- Les sessions expirées sont purgées au démarrage du serveur (server/index.js:360 ; server/sessions.js:104-111).
- Côté web, le jeton est rangé dans `localStorage` sous la clé `lba-token` (public/js/session.js:2, 32-34).
- **Le jeton porteur existe déjà.** `authenticate()` lit, dans l'ordre :
  a) `Authorization: Bearer <jeton>` (voie normale) ;
  b) `?token=` (repli de transition, annoncé « RETIRABLE ») ;
  c) `{ token }` dans le corps JSON (contrat actuel du front web).
  Références : server/auth-transport.js:10-13, 57-90 ; server/sessions.js:30-32. L'en-tête est prioritaire et écrase b) et c) (server/auth-transport.js:114-126). L'expression régulière du Bearer est bornée : `^Bearer[ \t]+([A-Za-z0-9._~+/=-]{1,512})` (server/auth-transport.js:57).
  → **L'app doit toujours envoyer `Authorization: Bearer`.** Elle ne doit jamais utiliser la query, qui va disparaître.
- **CSRF** : il n'y a ni cookie ni jeton anti-CSRF. Le jeton circule explicitement (en-tête ou corps), donc un formulaire tiers ne peut pas le joindre automatiquement. Seul l'OAuth porte un `state` anti-CSRF : stocké en mémoire, TTL 10 min, usage unique (server/routes/auth.js:22-37).
- `authenticate()` renvoie `{ id, email, sessionToken }` ou `null` (server/sessions.js:77, 93, 96). Chaque route appelle `authenticate()` elle-même : il n'existe pas de middleware d'authentification global (server/auth-transport.js:94-98).

### 2.2 Lien magique, de bout en bout

1. `POST /api/my-alerts/request` avec `{ email }`. Si le compte existe **et** est confirmé, le serveur génère `magic_token` (64 hex) avec une validité de **30 minutes** (server/routes/myalerts.js:150-161). Il envoie ensuite l'email (server/routes/myalerts.js:163). La réponse est **toujours** 200 avec le même message neutre, pour empêcher l'énumération des comptes (server/routes/myalerts.js:142, 175). Débit limité à **5/min/IP**, en mémoire (server/routes/myalerts.js:41-55).
2. L'email contient `https://labonnealerte.fr/connexion?token=<magic_token>` (server/mailer.js:13, 145).
3. La page `/connexion` (server/routes/myalerts.js:846-848) charge `public/js/myalerts.js`. Ce script lit `?token=` (public/js/myalerts.js:26) puis appelle `GET /api/my-alerts` avec ce jeton (public/js/myalerts.js:115).
4. `authenticate()` ne trouve pas de session pour ce jeton. Il cherche alors un `magic_token` non expiré, **crée une session** et **efface le magic_token** : le lien est à usage unique (server/sessions.js:80-94).
5. `GET /api/my-alerts` renvoie le **jeton de session** dans le champ `token` (server/routes/myalerts.js:332-338). Le client le conserve et l'utilise ensuite.

L'ancienne URL `/mes-alertes?token=…` redirige en 301 vers `/connexion` en gardant la query (server/routes/myalerts.js:852-856).

**Pour l'app** : n'importe quelle route authentifiée échange le magic_token. Il suffit donc d'intercepter le lien `https://labonnealerte.fr/connexion?token=…` (Universal Link / App Link), puis d'appeler `GET /api/my-alerts` avec `Authorization: Bearer <magic_token>` et de stocker `response.token`. **Aucune modification serveur n'est nécessaire pour cette étape.** **Hypothèse** : il faudra publier `apple-app-site-association` et `assetlinks.json` sous `/.well-known/`, qui n'existent pas aujourd'hui. Ce sont des fichiers statiques à ajouter dans `public/`, et le chemin `.well-known` doit être servi par `express.static`.

### 2.3 OAuth (Google, GitHub)

- `GET /auth/google` et `GET /auth/github` redirigent vers le fournisseur (server/routes/auth.js:92-104, 150-160).
- Les callbacks exigent un email **vérifié** (server/routes/auth.js:131, 189-192). Le compte est fusionné par email (server/routes/auth.js:53-78). Le profil est pré-rempli (server/routes/auth.js:136-139).
- Atterrissage : `redirect('/connexion#session=<jeton>')`. Le jeton est dans le fragment, donc jamais renvoyé au serveur (server/routes/auth.js:81-84). En cas d'échec : `/connexion?erreur=oauth|email_non_verifie` (server/routes/auth.js:85-87).
- `redirect_uri` est fixe : `${BASE_URL}/auth/<provider>/callback` (server/routes/auth.js:97, 154). **Pour l'app**, il faut ouvrir ce flux dans un navigateur système (ASWebAuthenticationSession / Custom Tabs) et capter le fragment `#session=` sur `/connexion` par lien universel. **Hypothèse** : c'est faisable sans changement serveur. Sinon, un paramètre `redirect` vers un schéma d'app serait nécessaire, et il n'existe pas.

### 2.4 Déconnexion

`POST /api/logout` supprime la session du jeton. Réponse toujours `{ ok: true }` (server/routes/myalerts.js:600-607).

### 2.5 Ce qu'il faudrait ajouter pour le mobile

- Rien pour le jeton porteur, déjà en place.
- Optionnel : une durée ou un type de session « app » distinct. **Hypothèse** : les 90 jours glissants conviennent, car une app ouverte au moins une fois tous les 30 jours ne se déconnecte jamais.
- Optionnel : une colonne `sessions.client` (`web` | `ios` | `android`) pour les révocations ciblées. Elle n'existe pas (server/db/init.sql:108-114).

---

## 3. Endpoints

Légende de la colonne Auth : **—** = public ; **S** = session requise (Bearer). Toutes les routes `/api/*` passent par le limiteur global de 120 req/min/IP (server/index.js:203).

### 3.1 Catalogue (public)

| Méthode | Chemin | Auth | Paramètres | Réponse | Erreurs | Réf. |
|---|---|---|---|---|---|---|
| GET | `/api/sources` | — | aucun | `Source[]` (voir §4.1). `Cache-Control: public, max-age=60` | 503 | server/routes/api.js:119-154 |
| GET | `/api/categories` | — | — | `Category[]` (`{slug,label,group}`). `max-age=3600` | — | server/routes/api.js:72-75 ; server/categories.js:1-2 |
| GET | `/api/geo` | — | — | `{ countries:[{code,name}], departements:[{code,name,region}], regions:[{code,name}] }`. `max-age=86400` | — | server/routes/api.js:79-82 ; server/geo.js:7-16, 84, 95 |
| GET | `/api/communes` | — | `departement` (code valide) | `{ departement, communes: string[] }`. Relais de geo.api.gouv.fr, cache de 24 h | 400, 502 (`communes: []`) | server/routes/api.js:92-116 |
| GET | `/api/sources/:id/history` | — | `id` ; paramètres de la source en query (ex. `?departement=05`) | `{ events:[{event,message,created_at}] (50 derniers), days:[{date:'YYYY-MM-DD', status:'nodata'|'failed'|'active'|'calm'}] (90 jours) }` | 404, 503 ; 301 pour les anciens ids | server/routes/api.js:427-517 |
| GET | `/api/sources/:id/alert.json` | — | idem | `{ id,name,state,since,until,message,url,checked_at }` (manifeste OpenAlert) | 404 (inconnue ou `linked`), 503 | server/routes/api.js:380-421 |
| GET | `/api/sources/:id/badge.svg` | — | idem | SVG `calme|active|erreur`. `max-age=300` | 503 (corps vide) | server/routes/api.js:550-604 |
| GET | `/api/sources/:id/links` | — | — | `{ submitted_links:[{label,url}] }` (3 au maximum) | 404, 503 | server/routes/api.js:365-376 |
| GET | `/api/le-point` | — | — | « En ce moment » + « À venir » (voir §4.4). Cache mémoire de 2 min + `max-age=120` | 503 | server/routes/le-point.js:128-139 |
| GET | `/api/stats` | — | — | `{ checks_this_month, emails_this_month, alerts_this_month, sources_count }` | 503 | server/routes/api.js:520-547 |
| GET | `/api/param-lookup/:source` | — | `q` (2 à 60 caractères, lettres), `dept` facultatif | `{ options:[{label,value}] }` (50 au maximum). Ne renvoie jamais 500 | 404, 429 (30/min/IP) | server/routes/myalerts.js:86-135 |
| GET | `/api/support-links` | — | — | `{ paypal, kofi }` (URL https ou `null`) | — | server/routes/api.js:22-31 |
| GET | `/api/status` | — | — | Compatibilité leboncoin-livraison : `{active,pending,date_debut,date_fin,checked_at}` | 404, 503 | server/routes/api.js:607-631 |

Redirections 301 des anciens ids (`vigilance-meteo-XX`, `vigieau-gap`, `vacances-zone-*`, `carburant-seuils`, `indice-uv-gap`) vers la source paramétrée : server/routes/api.js:47-69.

### 3.2 Abonnements (« my-alerts »)

| Méthode | Chemin | Auth | Corps / query | Réponse | Erreurs | Réf. |
|---|---|---|---|---|---|---|
| POST | `/api/subscribe` | — | `{ email, source_id?, params? }` (source par défaut : `leboncoin-livraison`) | `{ message }`. Crée un abonné non confirmé et envoie le mail de confirmation | 400, 404, 409 (déjà inscrit), 429 (**8/min/IP**), 503 | server/routes/subscribe.js:18-24, 90-178 |
| POST | `/api/my-alerts/request` | — | `{ email }` | message neutre, toujours 200 | 429 (5/min/IP) | server/routes/myalerts.js:144-176 |
| GET | `/api/my-alerts` | S | — | Objet compte complet (voir ci-dessous) | 401, 503 | server/routes/myalerts.js:181-371 |
| GET | `/api/my-alerts/history` | S | — | `{ events:[{event,message,created_at,source_id,source_name}] }` (**20 derniers**, sources suivies) | 401, 503 | server/routes/myalerts.js:800-841 |
| GET | `/api/my-alerts/sources` | S | — | `{ sources:[{id,name,badge,enabled,endpoint_url,created_at}] }` (sources proposées par ce compte) | 401, 503 | server/routes/myalerts.js:377-403 |
| POST | `/api/my-alerts/toggle` | S | `{ source_id, subscribed:boolean }` | `{ source_id, subscribed }`. Source broadcast. S'abonner ajoute aussi la source aux favoris | 400, 401, 404, 503 | server/routes/myalerts.js:629-672 |
| POST | `/api/my-alerts/toggle-param` | S | `{ source_id, params:{clé:valeur}, subscribed }` | `{ source_id, subscribed, params (canonique), label }` | 400 (validation ou commune introuvable), 401, 404, 503 | server/routes/myalerts.js:679-769 |
| POST | `/api/my-alerts/toggle-mute` | S | `{ source_id, muted:boolean }` | `{ source_id, muted }`. Met en pause **toutes** les instances de la source | 400, 401, 404, 503 | server/routes/myalerts.js:777-795 |

Avec `toggle` à `false`, la suppression porte sur **toutes** les lignes `(subscriber, source)`, instances paramétrées comprises (server/routes/myalerts.js:661-664 : pas de filtre sur `params`).

**Réponse de `GET /api/my-alerts`** (server/routes/myalerts.js:334-366) :
```
{
  email, token,                 // token = jeton de SESSION (à stocker)
  sources: [{ id, name, description, description_long, badge,
              state: 'active'|'pending'|'inactive',  // pire état des instances
              subscribed: bool, muted: bool|null,
              params_schema: [...]|null,
              instances: [{ params, label, state, muted }],
              tasks: [{ id,label,tracking_mode,next_due,counter_unit,counter_current,counter_threshold }] }],
  favorites: [source_id],
  email_enabled, push_endpoints_count,
  country, departement, region, ville, interests: [slug],
  display_name, pseudo, points_balance, rank, leaderboard_optout, dashboard_skin,
  quiet_start (23 par défaut), quiet_end (8 par défaut), quiet_disabled,
  view_mode: 'cards'|'list', hide_community_reports
}
```
Cette liste ne contient pas les sources de type `linked` (server/routes/myalerts.js:200).

### 3.3 Profil et préférences

| Méthode | Chemin | Auth | Corps | Réponse | Erreurs | Réf. |
|---|---|---|---|---|---|---|
| POST | `/api/my-alerts/profile` | S | `{ country?, departement?, region?, ville?, interests?:[slug] }` | `{ country, departement, region, ville, interests }` (valeurs **effectives** après normalisation) | 400 (pays ou département invalide), 401, 503 | server/routes/myalerts.js:449-513 |
| POST | `/api/my-alerts/display-name` | S | `{ display_name }` | `{ display_name }` | 400, 401, 409 (déjà pris), 429 (**3 changements / 30 j**), 503 | server/routes/myalerts.js:862-898 |
| POST | `/api/my-alerts/preferences` | S | `{ email_enabled:boolean }` | `{ email_enabled }` | 400, 401, 503 | server/routes/myalerts.js:408-422 |
| POST | `/api/my-alerts/quiet-hours` | S | `{ disabled?, start?, end? }` (entiers 0 à 23, `start ≠ end`) | `{ quiet_start, quiet_end, quiet_disabled }` | 400, 401, 503 | server/routes/myalerts.js:546-574 |
| POST | `/api/my-alerts/view-mode` | S | `{ view_mode:'cards'|'list' }` | `{ view_mode }` | 400, 401, 503 | server/routes/myalerts.js:429-443 |
| POST | `/api/my-alerts/leaderboard` | S | `{ optout:boolean }` | `{ leaderboard_optout, rank }` | 400, 401, 503 | server/routes/myalerts.js:520-540 |
| POST | `/api/my-alerts/community-reports-visibility` | S | `{ hide_community_reports:boolean }` | `{ hide_community_reports }` | 400, 401, 503 | server/routes/myalerts.js:581-595 |

**Règles du profil** (server/routes/myalerts.js:453-506) :
- `country` vaut `null` ou un code de `COUNTRIES` (`FR, BE, CH, LU, CA, MC, AD, AUTRE`) (server/geo.js:7-16).
- `departement` est **forcé à `null` si `country !== 'FR'`**. Sinon, ce doit être un code du référentiel (`'05'`, `'2A'`, `'974'`…) (server/routes/myalerts.js:460-464).
- **Le département fait autorité et la région en découle.** En France, si un département est fourni, `region = regionFromDept(departement)` : la région envoyée par le client est ignorée (server/routes/myalerts.js:482-483 ; server/geo.js:104). Sans département, une région absente de geo.js est remise à `null` (server/routes/myalerts.js:484). La valeur de région est le **nom exact** de geo.js (ex. `"Provence-Alpes-Côte d'Azur"`), car `REGIONS[].code === name` (server/geo.js:84).
- `ville` est du texte libre, nettoyé et tronqué à 80 caractères (server/routes/myalerts.js:470-476).
- `interests` est filtré sur `VALID_SLUGS` et dédoublonné (server/routes/myalerts.js:488-491).
- **Écrasement complet** : le client doit renvoyer **tous** les champs à chaque appel (server/routes/myalerts.js:469). Chaque champ renseigné est marqué `*_source = 'manual'` (server/routes/myalerts.js:500-505).
- Au premier `GET /api/my-alerts`, le profil est pré-rempli par IP (IPLocate). Une seule tentative est faite par compte (server/routes/myalerts.js:310-321).

### 3.4 Favoris et « j'aime »

| Méthode | Chemin | Auth | Corps / query | Réponse | Erreurs | Réf. |
|---|---|---|---|---|---|---|
| GET | `/api/favorites` | S | — | `Source[]` (même forme que `/api/sources`) | 401, 503 | server/routes/api.js:238-270 |
| POST | `/api/favorites/sync` | S | `{ ids:[source_id] }` (1000 au maximum) | `{ synced, liked }` | 401, 503 | server/routes/api.js:275-326 |
| DELETE | `/api/favorites` | S | `{ source_id }` (corps ou query) | `{ removed:true, source_id }` | 400, 401, 503 | server/routes/api.js:333-346 |
| POST | `/api/sources/:id/like` | S | — | `{ id, likes_count }`. Ajoute aussi la source aux favoris | 401, 404, 429 (**20/min/IP**), 503 | server/routes/api.js:38-44, 205-216 |
| DELETE | `/api/sources/:id/like` | S | — | `{ id, likes_count }`. Retire aussi le favori | idem | server/routes/api.js:222-233 |

Tout abonnement ajoute la source aux favoris. Se désabonner ne retire jamais le favori (server/favorites.js:1-10).

### 3.5 Échéances (tâches à échéance glissante, « user-tasks »)

| Méthode | Chemin | Auth | Corps | Réponse | Erreurs | Réf. |
|---|---|---|---|---|---|---|
| POST | `/api/user-tasks` | S | `{ label, anchor_date:'YYYY-MM-DD' (pas dans le futur), periodicity_value:1..1000, periodicity_unit:'day'|'week'|'month'|'year', announce_days?:int (7 par défaut, plafonné selon la périodicité) }` | 201 `{ task:{id,label,tracking_mode,next_due} }` | 400, 401, 409 (doublon), 429 (**20 créations/h/compte**), 503 | server/routes/user-tasks.js:32-37, 47-55, 258-338 |
| POST | `/api/user-tasks/:id/confirm` | S | — | `{ id, next_due, message }` | 400, 401, 404, 409 (mode compteur), 410 (tâche close), 500, 503 | server/routes/user-tasks.js:213-250 |
| DELETE | `/api/user-tasks/:id` | S | — | `{ id, deleted:true, subscribed }` (désactivation logique) | 400, 401, 404, 503 | server/routes/user-tasks.js:349-391 |
| GET | `/tache/:id/confirmer/:token` | jeton dans l'URL | — | page HTML (lien d'email) | — | server/routes/user-tasks.js:124 |

La lecture des tâches passe par `GET /api/my-alerts` (`sources[].tasks`) (server/routes/myalerts.js:221-230, 273-284).

### 3.6 Forum

| Méthode | Chemin | Auth | Corps | Réponse | Réf. |
|---|---|---|---|---|---|
| GET | `/api/forum/taggables` | — | — | `{ sources:[{id,name,forum_slug}] }` | server/routes/forum.js:657-670 |
| GET | `/api/forum/mentionables` | — | — | `{ members:[{slug,name}], sources:[{slug,name}] }` | server/routes/forum.js:681-705 |
| GET | `/api/forum/source/:slug/count` | — | — | `{ count }` | server/routes/forum.js:767-778 |
| POST | `/forum/t` (**sans** préfixe /api) | S | `{ category, title, body, source_id? }` | 201 `{ slug, url }` ; 400, 401 (`Connexion requise`), 429, 503 | server/routes/forum.js:787-831 |
| POST | `/forum/t/:id/reply` | S | `{ body }` | 201 `{ ok:true }` ; 404, 409 (sujet verrouillé), 429 | server/routes/forum.js:838-872 |
| POST | `/forum/post/:id/report` | S | `{ reason? }` (40 caractères au maximum) | **hypothèse** : `{ ok }` (réponse non lue en détail) | server/routes/forum.js:893-925 |
| POST | `/forum/admin/{post,topic}/:id/{hide,unhide,lock,unlock}` | S + `is_admin` | — | 403 si l'utilisateur n'est pas admin | server/routes/forum.js:148-153, 956-961 |
| GET | `/forum`, `/forum/c/:category`, `/forum/source/:slug`, `/forum/t/:slug`, `/u/:pseudo` | — | — | **HTML** rendu par le serveur (pas de JSON de lecture) | server/routes/forum.js:374-710 |

Le forum n'a **pas d'API JSON de lecture** des sujets et messages : l'app devra soit afficher le HTML en WebView, soit obtenir une API dédiée.

Les routes POST du forum ne commencent pas par `/api` et échappent donc au limiteur global (server/index.js:203, 316). Elles ont leurs propres limites par compte (`rateOkTopic`, `rateOkReply` ; server/routes/forum.js:789, 840).

### 3.7 Signalements communautaires (chat perdu et autres types)

| Méthode | Chemin | Auth | Corps / query | Réponse | Erreurs | Réf. |
|---|---|---|---|---|---|---|
| GET | `/api/community-reports` | S | `type?` (`chat-perdu` par défaut) | `Report[]` visibles : signalements suivis + ceux dont le rayon couvre la ville du profil. `[]` si le compte masque les signalements | 400, 401, 503 | server/routes/community-reports.js:58-102 |
| POST | `/api/community-reports` | S | `{ type?, ville, radius_km?, description?, link? }` | 200 `{ joined:true, report }` (signalement existant dans la commune) ou 201 `{ created:true, report }` | 400, 401, 409 (déjà un signalement actif), 503 | server/routes/community-reports.js:110-199 |
| POST | `/api/community-reports/:id/spot` | S | `{ where, when }` (2 à 200 caractères) | `{ spot_count, status }`. Fermeture automatique au seuil `spotsToClose` | 400, 401, 404, 409, 503 | server/routes/community-reports.js:207-265 |
| POST | `/api/community-reports/:id/extend` | S | — | `{ expires_at, extensions_count }` | 400, 401, 404, 409 | server/routes/community-reports.js:271-302 |
| POST | `/api/community-reports/:id/resolve` | S | — | `{ status:'resolved' }` | 400, 401, 409 | server/routes/community-reports.js:308-328 |

`Report` = `{ id, type, commune_nom, commune_insee, lat, lon, radius_km, description, link, created_at, expires_at, extensions_count, status, spot_count, subscribed, spotted, is_author }` (server/routes/community-reports.js:45-50, 72-77).

### 3.8 Compte (RGPD)

| Méthode | Chemin | Auth | Réponse | Réf. |
|---|---|---|---|---|
| DELETE | `/api/my-alerts/account` | S (jeton dans le **corps** ou en Bearer) | `{ ok:true }`. `DELETE FROM subscribers`, avec suppression en cascade des abonnements, sessions et push_subscriptions | server/routes/myalerts.js:613-624 ; server/db/init.sql:110, 118, 126 |
| POST | `/api/logout` | jeton | `{ ok:true }` | server/routes/myalerts.js:600-607 |
| GET/POST | `/unsubscribe/:token` | jeton d'abonné (email) | HTML / 200 ; supprime l'abonné | server/routes/subscribe.js:224-273 |

Remarque : `DELETE` avec un corps JSON fonctionne, car `express.json()` le lit. Avec Bearer, `authTransport` recopie le jeton dans `req.body.token` à condition que `req.body` soit un objet (server/auth-transport.js:123-125). **Hypothèse** : si l'app envoie un DELETE sans corps, `req.body` vaut `undefined` sous Express 5. Le jeton n'est alors pas recopié et la route répond 401. **Il faut envoyer `{}` en corps** (`Content-Type: application/json`).

### 3.9 Push web

| Méthode | Chemin | Auth | Corps | Réponse | Erreurs | Réf. |
|---|---|---|---|---|---|---|
| GET | `/api/push/vapid-key` | — | — | `{ key, enabled }` | — | server/routes/push.js:14-16 |
| POST | `/api/push/subscribe` | S | `{ subscription:{ endpoint, keys:{p256dh, auth} } }` | `{ ok:true }`. Upsert sur `endpoint` | 400, 401, 503 | server/routes/push.js:19-46 |
| POST | `/api/push/unsubscribe` | S | `{ endpoint }` | `{ ok:true }` | 400, 401, 503 | server/routes/push.js:49-66 |
| POST | `/api/push/subscribe-expo` | S | `{ token, expo_token }` | `{ ok:true }`. Upsert sur `endpoint` | 400 format invalide, 401 session, 503 indispo | server/routes/push.js:79-104 |
| POST | `/api/push/unsubscribe-expo` | S | `{ token, expo_token }` | `{ ok:true }` | 400 format invalide, 401 session, 503 indispo | server/routes/push.js:107-124 |

Routes iOS (IOS-02) : `expo_token` = `ExponentPushToken[...]` ou `ExpoPushToken[...]`. Stockage : `push_subscriptions` avec `kind = 'expo'`, `endpoint` = le jeton, `p256dh` et `auth` NULL ; upsert sur `endpoint`. Charge utile envoyée : `{ title, body, data: { url } }`, **sans `source_id`** : l'id de source se lit dans `url` (`/source/<id>/statut`).

### 3.10 Développeurs (hors périmètre de l'app)

`POST /api/dev/validate-manifest` et `POST /api/dev/submit-source` : 10 req/min/IP (server/routes/dev.js:20-36, 113, 166).

---

## 4. Schémas des objets

### 4.1 Source (élément de `GET /api/sources`)

Champs issus du SELECT (server/routes/api.js:122-141) et types issus de la table (server/db/init.sql:1-18 et ALTER suivants) :

| Champ | Type | Notes |
|---|---|---|
| `id` | string (64 au maximum) | identifiant stable |
| `name` | string | |
| `subtitle` | string\|null | 38 caractères au maximum (init.sql:4-5) |
| `description` | string\|null | ≤ 120 (init.sql:4032) |
| `description_long` | string\|null | init.sql:4012 |
| `badge` | `'official'|'verified'|'community'` | init.sql:10 |
| `type` | `'internal'|'external'|'linked'|'user-task'|'community'` | les trois premiers dans init.sql:7 ; `user-task` dans server/routes/myalerts.js:226 ; `community` dans server/community-types.js:117 |
| `link_url` | string\|null | service partenaire (`linked`) |
| `categories` | string[] | slugs, 3 au maximum (init.sql:15) |
| `submitted_by_github` | string\|null | |
| `params_schema` | array\|null | voir §5. `null` = source broadcast |
| `likes_count` | int | |
| `created_at` | ISO 8601 | |
| `forum_slug` | string\|null | |
| `state` | `'active'|'pending'|'inactive'` ou `null` si `linked` | server/routes/api.js:125-126 |
| `subscriber_count` | int | abonnés confirmés |
| `last_activated_at` | ISO\|null | dernier événement `activated` |
| `topic_count` | int | sujets de forum visibles |
| `community` | `{type,label,radiusChoices,defaultRadiusKm}` | présent seulement si `type==='community'` (server/community-types.js:97-120) |

**Pour une source paramétrée**, `state` correspond à l'état « broadcast » (`source_states`), **pas** à celui d'une combinaison. L'état par combinaison s'obtient avec `alert.json?…` ou `history?…`, ou via `instances[]` de `/api/my-alerts`.

### 4.2 États : calme, active, incident

- Valeurs stockées : `active | pending | inactive` (server/db/init.sql:53, 184). Il n'existe **pas** d'état « incident » en base.
- Transitions (server/poller.js:251-275) :
  - de `inactive` vers `pending`, si `requires_confirmation`, soit une confirmation sur deux cycles ;
  - de `inactive` directement vers `active` sinon ;
  - de `pending` vers `active` ;
  - de `active` vers `active` avec un nouvel épisode si `since` avance d'au moins 24 h ;
  - de `active` ou `pending` vers `inactive`, ce qui produit l'événement `deactivated`.
- Notions **dérivées**, aucune n'étant un état :
  - historique sur 90 jours, par jour : `failed` si au moins 3 échecs dans la journée, sinon `active` si un intervalle actif recouvre le jour, sinon `calm` ; `nodata` avant la création de la source (server/routes/api.js:493-510) ;
  - badge : `active`, `erreur` si le dernier événement est `failed` et date de moins de 90 min, sinon `calme` (server/routes/api.js:570-585).
- Correspondance proposée pour l'app : **calme** = `inactive` (ou `pending`, encore non confirmé) ; **active** = `active` ; **incident** = dernier événement `failed` récent (règle du badge).

### 4.3 Événement (`source_events`)

Table : `id SERIAL, source_id, event ('activated'|'deactivated'|'failed'), message TEXT, created_at TIMESTAMPTZ, params JSONB` (server/db/init.sql:138-144, 197).

Forme exposée (history) : `{ event, message, created_at }`. Les routes ne renvoient **jamais** `id` ni `params` (server/routes/api.js:464-468, myalerts.js:825-834). `message` est filtré : le texte est conservé pour `activated`, remplacé par `"Source momentanément indisponible"` pour `failed`, et vaut `null` dans les autres cas (server/public-events.js:31-37). Un seul `failed` est enregistré par heure et par source (server/poller.js:227-239).

**Gravité** : il n'existe **aucun champ de gravité**, ni sur les sources, ni sur les états, ni sur les événements (aucune occurrence de `severity` ou `gravit` dans init.sql ni dans les routes). Une couleur de vigilance n'apparaît que dans le texte du `message`.

**Attribution et licence des données** : il n'existe **aucun champ** dédié. L'attribution figure dans le texte des descriptions, par exemple « via Dealabs » ou « via Crossref » (server/db/init.sql:899 ; .claude/etat-projet.md, section ÉNERGIE). L'app ne peut donc l'afficher que via `description` et `description_long`.

**État courant d'une alerte** (`alert.json`) : `{ id, name, state, since, until, message, url, checked_at }` (server/routes/api.js:407-416).

### 4.4 Le Point / « En ce moment » (`GET /api/le-point`)

```
{ generated_at,
  active: [ {kind:'broadcast', id, name, message, url, since}
          | {kind:'param', id, name, count, labels:[8 max], unit:'zone'|'élément', url, since} ],
  upcoming: [{ id, start, message, url }] (20 au maximum, sur 10 jours),
  counts: { active, upcoming } }
```
Références : server/routes/le-point.js:74-125. Seul l'état `active` y figure, `pending` est exclu (server/routes/le-point.js:9-10).

### 4.5 Catégorie

`{ slug, label, group }`. La taxonomie est fermée et compte 27 groupes (server/categories.js:2, 5-38).

---

## 5. `params_schema`

- Format : un **tableau plat** de descripteurs `{ key, label, type, values?, multiple, required, default, min?, max?, pattern?, maxLength?, lowercase? }` (server/params.js:2, 194-198).
- Types possibles : `enum | string | number | commune | commune-coords | dynamic-enum` (server/params.js:161).
- Un schéma soumis (source externe) n'accepte qu'**un seul** paramètre (server/params.js:167). `pattern` n'est honoré que pour les schémas internes (server/params.js:57-58).
- Validation (`validateParams`, server/params.js:13-70) :
  - `enum` : la valeur doit faire partie de `values[].value`, et elle est renvoyée sous forme de string. Les `values` sont des `[{value,label}]`.
  - `commune` : la valeur canonique est un **code INSEE**. Le nom de ville envoyé par le client est résolu en INSEE par la route, avec le département du profil pour lever les homonymes (server/routes/myalerts.js:703-715).
  - `commune-coords` : la valeur canonique est `"lat|lon|nom"`. Le client envoie un nom, que la route résout (server/routes/myalerts.js:720-733).
  - `number` : nombre, avec bornes `min` et `max`.
  - `string` et `dynamic-enum` : chaîne de 120 caractères au maximum (ou `maxLength` ≤ 500), avec `pattern` et `lowercase` optionnels. Pour `dynamic-enum`, les options viennent de `GET /api/param-lookup/:source?q=` (server/routes/myalerts.js:109).
- Libellé lisible d'une combinaison : `resolveLabel`, utilisé par les champs `label` (server/params.js:125-148).
- En query string (history, alert.json, badge), les clés du schéma sont lues directement, par exemple `?departement=05` (server/params.js:151-159).
- Plusieurs combinaisons sont possibles par couple (abonné, source), grâce à l'index unique sur `(subscriber_id, source_id, COALESCE(params,'{}'))` (server/db/init.sql:172-174).

---

## 6. Pipeline de push web existant

- Bibliothèque : `web-push` ^3.6.7 (package.json:25 ; server/webpush.js:7).
- VAPID : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:contact@labonnealerte.fr` par défaut). Sans clés, le module ne fait rien (server/webpush.js:10-19).
- Table `push_subscriptions(id, subscriber_id → subscribers ON DELETE CASCADE, endpoint UNIQUE, p256dh, auth, created_at)` (server/db/init.sql:124-132).
- **Payload** : `JSON.stringify({ title: info.name || 'La Bonne Alerte', body: info.message || 'Une alerte que vous suivez vient de se déclencher.', url: info.url || info.statusUrl || 'https://labonnealerte.fr' })` (server/webpush.js:47-51, 105-109, 159-163). `statusUrl` vaut `https://labonnealerte.fr/source/<id>/statut[?params]` (server/poller.js:136, 492). Il n'y a pas d'`id` d'événement dans le payload.
- **Nettoyage** : sur une réponse 404 ou 410 du service push, la ligne est supprimée (`DELETE … WHERE id = ANY`). Les autres erreurs sont comptées et journalisées (server/webpush.js:63-81, 174-180).
- **Aiguillage** (`dispatchAlert`, server/poller.js:72-123) : pour chaque abonné confirmé dont l'abonnement n'est pas en pause (`sub.muted = false`, server/poller.js:65), deux canaux sont possibles. L'email part si `email_enabled !== false`, le push si l'abonné a au moins un appareil (`push_count > 0`). Le push immédiat passe par `sendToSubscriber(id, info)`. Ce sont les fonctions `sendToSource` et `sendToSourceParams` qui existent, mais le poller utilise `sendToSubscriber` (server/poller.js:104).
- **Heures calmes** (server/quiet-hours.js) : la plage par défaut va de 23 h à 8 h, **heure de Paris** (server/quiet-hours.js:6-7, 9-16). Elle est réglable par `quiet_start`, `quiet_end` et `quiet_disabled`. Pendant la plage, l'email et le push sont mis en file dans `deferred_notifications(kind 'email'|'push', payload)` (server/poller.js:88-90, 108-115 ; server/db/init.sql:1262-1270). À la sortie de la plage, le flush envoie un push par alerte s'il y en a au plus deux et qu'elles sont encore actives, un résumé sinon (`"N alertes pendant votre veille"`, url `/connexion`), puis vide la file (server/poller.js:595-643).
- Le seuil de déclenchement est l'événement `activated` (`notify: true`) d'une transition (server/poller.js:255-268). Une désactivation ne notifie pas.

---

## 7. ETag sur `/api/sources`

- Aucun ETag explicite dans le code, et aucun `app.set('etag', …)` (recherche dans server/ sans résultat).
- Express utilise par défaut des **ETag faibles** pour `res.json` / `res.send`, et répond 304 sur `If-None-Match`. Le projet s'appuie déjà sur ce comportement pour les pages HTML (server/pages.js:12-14). **Hypothèse forte** : `GET /api/sources` envoie donc `ETag: W/"…"` et accepte `If-None-Match`, mais le serveur recalcule quand même la requête SQL entière avant de répondre 304.
- `Cache-Control: public, max-age=60` (server/routes/api.js:148). **Hypothèse** : Cloudflare est en mode « Respect Existing Headers » (server/index.js:166-167) et peut servir sa propre copie pendant 60 s.

---

## 8. Ce qui manque pour l'app, et proposition minimale additive
> **[Spécifique Android]** Proposition FCM / APNs et table `app_devices` ÉCARTÉE (voir la note d'intégration en tête). L'iOS utilise le transport Expo de la section 3.9, pas cette proposition. Un lecteur iOS (Expo) peut l'ignorer.


### 8.1 Écarts constatés

| Besoin | Existant | Écart |
|---|---|---|
| Jeton porteur | `Authorization: Bearer` géré partout (server/auth-transport.js:111-131) | Aucun |
| Connexion par lien magique | `/connexion?token=` + échange sur n'importe quelle route authentifiée | Fichiers `/.well-known/apple-app-site-association` et `assetlinks.json` à publier (**hypothèse**) |
| Enregistrement d'appareil natif (FCM / APNs) | Seulement Web Push VAPID (`push_subscriptions` exige `p256dh` et `auth`) | Table et route d'appareil manquantes, ainsi que l'envoi FCM/APNs dans le poller |
| Flux d'événements « depuis l'ID N » | `my-alerts/history` = 20 derniers, sans `id` | Pas de pagination ni de curseur, et `id` non exposé |
| Version minimale de l'app | Rien | Endpoint de configuration manquant |
| Gravité et licence structurées | Absentes | Hors v1, rester sur le texte |
| Lecture JSON du forum | HTML uniquement | Hors v1 (WebView) |

### 8.2 Proposition : `server/routes/app-api.js` (nouveau fichier, purement additif)

**Montage** : une seule ligne dans `server/index.js`, placée **après** le limiteur global (ligne 203) et après les routeurs `/api` existants, par exemple juste après la ligne 212 :

```js
app.use('/api', require('./routes/app-api'));   // API dédiée à l'application mobile (préfixe /api/app/*)
```

Placée là, la ligne profite de `express.json()` (l.125), de `authTransport` (l.131), donc du Bearer et de `no-store`, et du limiteur de 120/min (l.203). Elle passe avant le 404 JSON final (l.344).

**Migration SQL** (à ajouter en fin de `server/db/init.sql`, idempotente comme le reste du fichier) :

```sql
CREATE TABLE IF NOT EXISTS app_devices (
  id SERIAL PRIMARY KEY,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE, -- effacement RGPD automatique
  platform VARCHAR(8) NOT NULL,            -- 'ios' | 'android'
  push_token TEXT UNIQUE NOT NULL,          -- jeton FCM / APNs
  app_version VARCHAR(32),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_devices_subscriber ON app_devices (subscriber_id);
```

**Endpoints proposés** (tous sous `/api/app/`) :

| Méthode | Chemin | Auth | Contrat |
|---|---|---|---|
| GET | `/api/app/config` | — | `{ api_version: 1, min_app_version: process.env.APP_MIN_VERSION || '1.0.0', latest_app_version, magic_link_host: 'labonnealerte.fr' }`. L'app bloque sa propre utilisation si sa version est inférieure à `min_app_version` |
| POST | `/api/app/devices` | S | `{ platform:'ios'|'android', push_token, app_version? }` → upsert sur `push_token` (même logique que server/routes/push.js:32-40) → `{ ok:true, id }` |
| DELETE | `/api/app/devices` | S | `{ push_token }` → `{ ok:true }` (à la déconnexion) |
| GET | `/api/app/events?since_id=N&limit=50` | S | Événements des sources suivies avec `id > N`, **par ordre croissant d'id**. Même filtre `EXISTS` que server/routes/myalerts.js:808-819, même assainissement via `publicEventMessage`. Réponse `{ events:[{ id, source_id, source_name, event, message, params, label, created_at }], next_since_id, has_more }`. `limit` est plafonné à 200 |

Esquisse (non exécutée) :

```js
// server/routes/app-api.js — API de l'application mobile. Additif : ne modifie aucune route existante.
const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../sessions');
const { resolveLabel } = require('../params');
const { publicEventMessage } = require('../public-events');
const router = express.Router();

router.get('/app/config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ api_version: 1,
    min_app_version: process.env.APP_MIN_VERSION || '1.0.0',
    latest_app_version: process.env.APP_LATEST_VERSION || null });
});

router.post('/app/devices', async (req, res) => {
  const auth = await authenticate(req); // lit le Bearer directement (sessions.js:30)
  if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });
  const { platform, push_token, app_version } = req.body || {};
  if (!['ios', 'android'].includes(platform) || typeof push_token !== 'string' || !push_token || push_token.length > 4096) {
    return res.status(400).json({ error: 'Appareil invalide' });
  }
  try {
    const r = await pool.query(
      `INSERT INTO app_devices (subscriber_id, platform, push_token, app_version)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (push_token) DO UPDATE SET subscriber_id = EXCLUDED.subscriber_id,
         platform = EXCLUDED.platform, app_version = EXCLUDED.app_version, last_seen_at = NOW()
       RETURNING id`, [auth.id, platform, push_token, app_version ? String(app_version).slice(0, 32) : null]);
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { res.status(503).json({ error: 'Service indisponible' }); }
});

router.delete('/app/devices', async (req, res) => {
  const auth = await authenticate(req);
  if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });
  const t = (req.body || {}).push_token;
  if (typeof t !== 'string' || !t) return res.status(400).json({ error: 'push_token manquant' });
  try { await pool.query('DELETE FROM app_devices WHERE push_token = $1 AND subscriber_id = $2', [t, auth.id]); res.json({ ok: true }); }
  catch (e) { res.status(503).json({ error: 'Service indisponible' }); }
});

router.get('/app/events', async (req, res) => {
  const auth = await authenticate(req);
  if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });
  const since = Math.max(0, parseInt(req.query.since_id, 10) || 0);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  try {
    const { rows } = await pool.query(
      `SELECT ev.id, ev.event, ev.message, ev.created_at, ev.params,
              s.id AS source_id, s.name AS source_name, s.params_schema
         FROM source_events ev JOIN sources s ON s.id = ev.source_id
        WHERE s.enabled = true AND ev.id > $2
          AND EXISTS (SELECT 1 FROM subscriptions sub
                       WHERE sub.source_id = ev.source_id AND sub.subscriber_id = $1
                         AND (sub.params IS NOT DISTINCT FROM ev.params OR ev.params IS NULL))
        ORDER BY ev.id ASC LIMIT $3`, [auth.id, since, limit + 1]);
    const page = rows.slice(0, limit);
    res.json({
      events: page.map((r) => ({ id: r.id, source_id: r.source_id, source_name: r.source_name,
        event: r.event, message: publicEventMessage(r.event, r.message), params: r.params || null,
        label: r.params ? resolveLabel(r.params_schema, r.params) : '', created_at: r.created_at.toISOString() })),
      next_since_id: page.length ? page[page.length - 1].id : since,
      has_more: rows.length > limit,
    });
  } catch (e) { res.status(503).json({ error: 'Service indisponible' }); }
});

module.exports = router;
```

**Points d'attention** :
- `source_events.id` est un SERIAL et sert de curseur monotone (server/db/init.sql:139). **Hypothèse** : sans index sur `id` combiné à `source_id`, la requête reste servie par la clé primaire, ce qui est acceptable au volume actuel.
- **Envoi natif** : il faut un `server/native-push.js` (FCM HTTP v1 / APNs) avec un `sendToSubscriberNative(subscriberId, info)`. Il sera appelé **à côté** de `sendToSubscriber` dans `dispatchAlert` et dans le flush de veille (server/poller.js:104, 628-636), avec la même logique de purge des jetons invalides que server/webpush.js:63-81. Ces deux appels sont les **seules** modifications de code existant, en dehors de la ligne de montage. Le compteur `push_count` (server/poller.js:62) devra intégrer `app_devices`, sinon un abonné équipé uniquement de l'app, sans email ni push web, sera ignoré (server/poller.js:87). Le payload natif devrait transporter l'`id` d'événement, pour que l'app appelle `/api/app/events?since_id=` à l'ouverture.
- **DELETE avec corps** : voir la remarque du §3.8, toujours envoyer `{}`.
- La suppression du compte nettoie `app_devices` automatiquement grâce à `ON DELETE CASCADE`.

---

## 9. Licence du dépôt

- **Il n'y a pas de fichier `LICENSE`** à la racine de `C:\Dev\Labonnealerte` (vérifié par `ls`).
- La licence MIT est déclarée dans `package.json:10` (`"license": "MIT"`) et dans `README.md:123-125` (« ## Licence / MIT. »).
- Recommandation : ajouter un fichier `LICENSE` contenant le texte MIT complet, avec le titulaire et l'année, pour lever l'ambiguïté avant de réutiliser le code ou d'en dériver l'app.

---

## 10. Ajouts serveur pour l'app (deployes le 2026-10-08, commit site b7ed45a)
> **[Spécifique Android]** Section rédigée pour l'app Android : `min_version_code` / `latest_version_code` sont des versionCode Android, et les tests cités (`tools/server-tests/`) sont dans le dépôt Android. Les routes elles-mêmes servent les deux apps. Un lecteur iOS (Expo) peut l'ignorer.


Fichier `server/routes/app-api.js`, monte sous `/api` (server/index.js, apres communityReportsRouter). Fonction `sendAppLoginCode` ajoutee a `server/mailer.js`.

| Methode | Chemin | Auth | Corps / query | Reponse | Erreurs |
|---|---|---|---|---|---|
| GET | `/api/app/config` | — | — | `{min_version_code, latest_version_code, maintenance, message, vapid_public_key}` (`max-age=300`) | — |
| POST | `/api/app/login/request` | — | `{email}` | message neutre, toujours 200 ; e-mail avec lien magique + code a 6 chiffres | 429 (5/min/IP) |
| POST | `/api/app/login/verify` | — | `{email, code}` | `{token, email}` (session 90 j, Bearer) | 400 code faux/expire, 429 (10/min/IP ou 10 echecs/h/email), 503 |
| GET | `/api/app/events` | S | `since_id` (0 = 7 derniers jours), `limit` (1..200, defaut 100) | `{events:[{id, source_id, source_name, event:'activated'|'deactivated', message, label, categories, created_at, url}], last_id, has_more}` par id croissant | 401, 503 |

Anti force brute du code : 5 essais par code (le compteur ne repart pas a zero quand on redemande un code), 10 echecs/heure/email, 3 envois/15 min/email, IP reelle via `clientIp` (profile-autofill). Codes en memoire : HYPOTHESE une seule instance Railway.

Variables Railway OPTIONNELLES (non posees, a la discretion de Hugo) : `APP_MIN_VERSION_CODE`, `APP_LATEST_VERSION_CODE`, `APP_MAINTENANCE=1`, `APP_MESSAGE`.

Verification : test hors ligne `tools/server-tests/test-app-api.js` (14/14, modules simules) ; en production, `GET /api/app/config` verifie. `login/*` et `events` NON verifies avec un vrai compte (LBA_TEST_TOKEN absent ; un essai de connexion enverrait un vrai e-mail).

### 10.1 Creation de compte par code (APP-04, commit site 264dbe4, NON DEPLOYE)

| Methode | Chemin | Corps | Reponse |
|---|---|---|---|
| GET | `/api/app/config` | — | + `terms_version` (ex. `confidentialite-2026-10`), `terms_url` |
| POST | `/api/app/login/request` | `{email}` | 200, corps IDENTIQUE inscrit / inconnu, envoye avant tout acces base. Inscrit et confirme : e-mail de connexion (code + lien). Inconnu ou jamais confirme : e-mail de creation (code seul), AUCUNE ecriture en base |
| POST | `/api/app/login/verify` | `{email, code}` | inscrit : `{token, email}` comme avant. Inconnu, code correct : **409** `{needs_terms:true, terms_version, terms_url}`, code CONSERVE |
| POST | `/api/app/login/verify` | `{email, code, accept_terms:true, terms_version}` | inconnu : `{token, email, created:true}`. Version differente de la courante : 409 |

Creation : un seul `INSERT ... ON CONFLICT (email) DO UPDATE SET confirmed = true, terms_accepted_at = NOW(), terms_version` (ligne non confirmee du site : confirmee, meme id). Code consomme avant tout await (usage unique sous concurrence). Session par `createSession` (empreinte h1:, 67 car.). Memes limites que la connexion (le compteur d'envois s'applique aussi aux adresses inconnues). Colonnes ajoutees (init.sql, idempotent) : `subscribers.terms_accepted_at TIMESTAMPTZ`, `subscribers.terms_version VARCHAR(32)`. Nouvelle fonction `sendAppSignupCode` (server/mailer.js).

Tests : `tools/server-tests/test-app-signup.js` (26 cas, vrais sessions.js / token-hash.js, base simulee, largeurs comparees a init.sql) et `test-app-api.js` (50 cas).
