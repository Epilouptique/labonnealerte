# Audit qualité de code — La Bonne Alerte (nº 2)
**Date :** 10 septembre 2026 · **Périmètre :** dépôt complet
**Précédent :** [audit-qualite-code-2026-09-09.md](audit-qualite-code-2026-09-09.md) — 22 commits se sont intercalés entre les deux.
**Nature :** lecture seule. Aucun code modifié.

---

## 0. Verdict

Vingt-deux commits en un jour, dont **aucun n'est cosmétique**. Trois observations d'ensemble :

1. **Le lot B (sûreté) est bouclé** — verrou du poller, transaction de migration, `jsonb_array_length`, branche morte du service worker. Ces quatre-là étaient les corrections à effet réel : elles sont faites et bien faites.
2. **Un travail non prévu au plan d'hier a été mené, et il est plus important que ce que je proposais** : le transport du jeton en `Authorization: Bearer`, l'assainissement des messages d'événements, la maîtrise du cache Cloudflare, le calibrage du pool PostgreSQL, le garde-fou de déploiement. C'est du travail de production, mesuré (les commentaires citent des chiffres relevés en conditions réelles), pas de la théorie.
3. **Les lots C, D et E n'ont pas été entamés** — la duplication structurelle est intacte, à l'unité près. Ce n'est pas un reproche : les priorités choisies étaient meilleures que les miennes.

**Le niveau de commentaire, déjà remarquable, a encore monté.** `auth-transport.js` documente un piège d'Express 5 vérifié à la main ; `db.js` justifie chaque valeur du pool par une mesure ; `Deploy-LBA.ps1` explique ce qu'il ne fait **pas** et pourquoi. C'est de la documentation d'ingénierie, pas du commentaire de politesse.

**Ce rapport porte donc surtout sur ce qui est neuf** : 6 constatations sur le code livré depuis hier, et 5 constatations dans des zones que le premier audit avait survolées — dont **une anomalie de fuseau horaire qui affecte l'affichage des dates en production**.

---

## 1. Statut des 24 recommandations du 09/09

| # | Recommandation | Statut |
|---|---|---|
| 1 | Supprimer les 73 `fetchFn` / retirer `node-fetch` | ❌ ouvert (**73** copies, dépendance présente) |
| 2 | Fonctions mortes `poller.js` / `webpush.js` | ❌ ouvert (les 4 sont là, l'import ligne 6 aussi) |
| 3 | `pagesRouter` orphelin de `le-point.js` | ❌ ouvert |
| 4 | Retirer le diagnostic IPv6 d'`index.js` | ❌ ouvert |
| 5 | Détritus versionnés + `.gitignore` | ✅ **fait** (5 fichiers supprimés, PNG déplacés dans `reference/captures/`, règles ajoutées) |
| 6 | **Verrou d'exécution du poller** | ✅ **fait** (+ durée de cycle journalisée) |
| 7 | **`BEGIN/COMMIT` autour d'`init.sql`** | ✅ **fait** (un seul client, avec la justification) |
| 8 | `jsonb_array_length` + journalisation | ✅ **fait** |
| 9 | Branche morte de `staleWhileRevalidate` | ✅ **fait** (+ correction plus profonde du contournement du cache HTTP) |
| 10 | Middlewares 404 et erreur | ❌ ouvert |
| 11 | Extraire le SELECT « carte enrichie » | ❌ ouvert (toujours 4 copies) |
| 12 | Rate-limit partagé | ❌ ouvert (**7** implémentations maison désormais) |
| 13 | Factory `client-credentials-auth` | ❌ ouvert (4 modules) |
| 14 | `fetchJson` partagé | ❌ ouvert |
| 15 | `escape.js` / `config.js` uniques | ❌ ouvert (18 `esc` front, 4 serveur, 13 URL en dur dans `mailer.js`) |
| 16 | **Compteurs agrégés** | ✅ **fait** (546 → 2, avec la Map pour le passage de mois) |
| 17 | `GET /history` en O(n) | ❌ ouvert (`all.filter` toujours dans la boucle, [api.js:503](../../server/routes/api.js#L503)) |
| 18 | **`Promise.all` sur `GET /api/my-alerts`** | ✅ **fait** (5 sur 6 — voir §2.4) |
| 19 | Gabarits SEO lus une fois | ❌ ouvert (3 `readFileSync` par requête) |
| 20 | Parallélisme borné du poller | ❌ ouvert (délibérément après le verrou) |
| 21 | Tests `node --test` | ❌ ouvert |
| 22 | Découpage d'`init.sql` | ⏳ partiel (atomicité obtenue, découpage non fait) |
| 23 | Retrait de `'unlisted'` | ❌ ouvert (7 occurrences) |
| 24 | Convention `@data-valid-until` | ❌ ouvert |

**8 faites, 1 partielle, 15 ouvertes.** Les 15 ouvertes sont inchangées : je ne les redéveloppe pas ici, le rapport du 09/09 fait toujours foi. La suite porte sur le neuf.

---

## 2. Constatations sur le code livré depuis hier

### 2.1 🔴 La migration Bearer est incomplète, et le plan de retrait du repli va casser

**Fichiers :** [auth-transport.js](../../server/auth-transport.js), les 12 fichiers de `public/js/`

`auth-transport.js` annonce noir sur blanc son plan de sortie :

> `SON RETRAIT FERA L'OBJET D'UN LOT ULTERIEUR […] Retirer alors : la lecture query/body dans tokenFrom(), et le miroir posé par authTransport().`
> Motif invoqué : *« après le déploiement, des navigateurs continuent d'exécuter l'ANCIEN session.js »*.

Or l'état réel du front n'est pas celui-là. Vérifié fichier par fichier :

| Transport | État |
|---|---|
| Jeton en **query string** (`?token=`) | ✅ **éliminé** — plus aucune occurrence hors commentaires et hors lien magique |
| Jeton en **corps JSON** (`body.token`) | ⚠️ **~30 sites d'appel, dans 12 fichiers** |
| Fichiers ayant adopté `authFetch`/`authHeaders` | **6 sur 14** (`session`, `site`, `boutique`, `deck-add`, `decks`, `favoris`) |

Les huit autres (`profile.js`, `push.js`, `quiet.js`, `forum.js`, `collection-page.js`, `deck-shared.js`, `source.js`, `user-task-form.js`) envoient toujours le jeton **dans le corps** de leurs POST.

**Deux conséquences distinctes, à ne pas confondre :**

- **L'objectif de sécurité est atteint.** Un jeton en corps de POST n'atterrit ni dans les journaux d'accès, ni dans une clé de cache, ni dans l'historique du navigateur. Les cinq chemins de fuite énumérés dans l'en-tête du module sont bien fermés.
- **Mais le retrait planifié du repli (b) ne cassera pas « quelques navigateurs en retard » : il cassera le front actuel**, sur les 8 fichiers ci-dessus, immédiatement, au déploiement. Le lot « quelques jours plus tard » décrit dans le commentaire est aujourd'hui infaisable tel quel.

**Recommandation :** amender le commentaire d'`auth-transport.js` (il devient trompeur) et scinder le repli en deux, parce que les deux moitiés n'ont pas la même échéance :
- `legacyQueryFrom()` — repli de transition véritable, retirable dès que le parc a tourné ;
- `legacyBodyFrom()` — **contrat courant du front**, à ne retirer qu'après migration des 8 fichiers restants vers `LBASession.authFetch`.

Un simple `grep -rn "token: token\|token: t\b" public/js/` donne la liste de travail exacte.

### 2.2 🟠 La garde `Cache-Control: private, no-store` est écrasable en silence

**Fichier :** [auth-transport.js](../../server/auth-transport.js), fonction `authTransport`

Le middleware pose l'en-tête **avant** que la route ne s'exécute :

```js
if (bearer || legacyFrom(req)) res.set('Cache-Control', 'private, no-store');
next();
```

Toute route qui pose ensuite son propre `Cache-Control` **écrase la garde**. Onze routes le font aujourd'hui (`/categories`, `/geo`, `/communes`, `/sources`, `/sources/:id/links`, `/badge.svg`, `/status`, `/le-point`, `/sitemap.xml`, et `express.static` lui-même, monté **après** `authTransport`).

**Ce n'est pas exploitable aujourd'hui** — j'ai vérifié les onze : toutes servent des données strictement publiques, identiques pour tous. Mais la protection est silencieusement conditionnelle : le jour où une route authentifiée voudra un `Cache-Control` (ne serait-ce que `no-cache` pour un ETag), elle désactivera la garde sans que rien ne le signale.

**Recommandation :** poser l'en-tête **après** la route plutôt qu'avant, de sorte qu'il gagne toujours :
```js
if (bearer || legacyFrom(req)) {
  res.on('headersent' /* ou via un wrap de res.writeHead */, …);
}
```
Le plus simple et le plus lisible reste un `res.writeHead` intercepté, ou — à défaut — **écrire l'invariant dans le fichier** : « ne jamais poser un `Cache-Control` public dans une route qui lit un jeton ». Un invariant écrit vaut mieux qu'un invariant supposé, et c'est déjà la doctrine du dépôt partout ailleurs.

### 2.3 🟠 Les pages de forum se canonisent vers l'URL demandée, pas vers l'URL canonique

**Fichier :** [routes/forum.js](../../server/routes/forum.js), routes `/forum/source/:slug` et `/forum/deck/:slug`

Le commit `b7f36c0` a corrigé ce point pour les sujets, avec une justification exacte. Mais les deux routes voisines posent :

```js
{ url: SITE_URL + '/forum/source/' + encodeURIComponent(sid) }   // sid = req.params.slug
```

Or `resolveSourceId()` accepte **deux** entrées pour la même page : le `forum_slug` public **et** l'`id` de la source (repli de rétrocompatibilité, documenté ligne 165). Les deux URL servent donc un contenu identique — et chacune se déclare canonique d'elle-même. C'est précisément le duplicata que la balise `canonical` existe pour supprimer. Même chose pour `/forum/deck/:slug`.

**Recommandation :** canoniser vers le slug résolu, qui est déjà calculé deux lignes plus haut (`const slug = meta.rows[0].forum_slug || sid`) :
```js
url: SITE_URL + '/forum/source/' + encodeURIComponent(slug)
```

### 2.4 🟡 Une sixième lecture indépendante est restée hors du `Promise.all`

**Fichier :** [routes/myalerts.js](../../server/routes/myalerts.js), `GET /api/my-alerts`

Cinq lectures ont été regroupées — le gain est réel. Mais la requête des favoris, qui ne dépend elle aussi que de `auth.id`, est restée **après** le `Promise.all`, séquentielle :

```js
const favRows = await pool.query('SELECT source_id FROM favorites WHERE subscriber_id = $1', [auth.id]);
```

C'est un aller-retour de ~145 ms (le chiffre est celui de `db.js`) qui s'ajoute inutilement. `getRank`, lui, dépend de `pr.leaderboard_optout` et doit rester après — c'est correct.

**Recommandation :** passer `favRows` en sixième entrée du `Promise.all`. Le `max: 10` du pool le supporte.

### 2.5 🟡 `max: 10` + une salve de 5 requêtes = 2 requêtes simultanées avant saturation

**Fichiers :** [db.js](../../server/db.js), [routes/myalerts.js](../../server/routes/myalerts.js)

Le commentaire de `db.js` est explicite et juste : *« max: 10 […] Nécessaire aux lectures en Promise.all : 5 requêtes = 5 connexions. »* Mais il faut en tirer la conséquence : **deux** chargements de `/api/my-alerts` concurrents occupent 10 connexions, soit la totalité du pool. Un troisième visiteur — ou le poller, qui en tient une pendant son cycle — attend, avec un `connectionTimeoutMillis` de 10 s au bout.

Sur le trafic actuel c'est théorique. Mais la modification vient de transformer une route « 1 connexion pendant 5×145 ms » en « 5 connexions pendant 145 ms » : le produit est le même, la **pointe de concurrence** ne l'est pas, et c'est elle qui sature un pool.

**Recommandation :** aucune action immédiate, mais journaliser `pool.waitingCount` (ou poser un compteur sur `pool.on('acquire')`) pour objectiver la marge avant d'ajouter d'autres fan-outs. Passer `max` à 15-20 est sans risque côté Postgres et rendrait la marge confortable.

### 2.6 🟡 Le bloc social/canonical est désormais recopié dans 12 pages HTML

**Fichiers :** `public/*.html` (12 fichiers × 16 balises), plus un mécanisme concurrent à placeholders

Le référencement social a été ajouté partout — c'est la bonne décision, et le commentaire qui explique *pourquoi ces balises doivent être dans le HTML servi* (les crawlers n'exécutent pas JS) est exactement au bon endroit. Mais il en résulte **deux mécanismes** et une divergence :

| Page | Mécanisme | `noindex` | Bloc social |
|---|---|---|---|
| `index`, `a-propos`, `boutique`, `confidentialite`, `le-point`, `mentions-legales`, `proposer`, `soutenir` | en dur (16 balises) | non | 16 |
| `source`, `deck`, `collection` | placeholders `{{OG_*}}` remplacés serveur | non | 16 |
| `connexion` | en dur | **oui** | **16** ⚠️ |
| `mes-decks` | en dur | **oui** | **4**, sans canonical ⚠️ |
| pages de forum | `forumShell()` serveur | selon | **0 si noindex** |

`forum.js` a codifié la règle — *« RÈGLE : rien de tout ça sur une page noindex. C'est ce qui protège /u/:pseudo »* — et cette règle est enfreinte par `connexion.html` (noindex **et** canonical **et** og complet) et appliquée à moitié par `mes-decks.html`. Sans conséquence pratique (un moteur ignore le canonical d'une page noindex), mais c'est trois comportements pour une même situation, dans un dépôt dont la force est justement l'uniformité des décisions.

**Recommandation :** aligner les deux pages sur la règle de `forum.js` (noindex ⇒ pas de bloc social). Et acter la duplication : sans étape de build, recopier 16 balises dans 12 fichiers est le prix à payer — mais ce prix doit être écrit quelque part, sans quoi la 13ᵉ page l'oubliera. Une alternative sobre : servir les 8 pages statiques par la même fonction que `/deck`, `/collection` et `/source`, qui sait déjà remplir des placeholders.

### 2.7 🟢 `.dockerignore` et `.railwayignore` sont deux copies strictement identiques

**Fichiers :** [.dockerignore](../../.dockerignore), [.railwayignore](../../.railwayignore)

Vérifié : hors commentaires d'en-tête, **les jeux de règles sont identiques au caractère près** (~35 lignes). Le fichier le sait et le dit :

> `Garder en tete que ce fichier et le .dockerignore doivent evoluer ENSEMBLE.`

Une consigne écrite est mieux que rien, mais c'est exactement le genre d'invariant qui dérive au troisième ajout. Le dépôt dispose déjà du bon outil pour ce problème : le garde-fou de déploiement.

**Recommandation :** ajouter une cinquième vérification à `Deploy-LBA` — comparer les deux fichiers et refuser si les règles divergent. Trois lignes, dans l'idiome maison :
```powershell
$d = (Get-Content .dockerignore  | Where-Object { $_ -notmatch '^\s*(#|$)' })
$r = (Get-Content .railwayignore | Where-Object { $_ -notmatch '^\s*(#|$)' })
if (Compare-Object $d $r) { Write-Error "DEPLOIEMENT REFUSE : .dockerignore et .railwayignore ont divergé." ; return }
```

---

## 3. Constatations nouvelles (zones survolées par le premier audit)

### 3.1 🔴 Aucun fuseau horaire n'est fixé — la convention écrite du dépôt est fausse en production

C'est la constatation la plus importante de ce second audit.

**Le dépôt affirme une convention.** [sources/lib/format-fr.js](../../server/sources/lib/format-fr.js), en tête de fichier :

> *« Convention du dépôt : les dates sont manipulées en heure locale (= **Europe/Paris en dev comme en prod**), comme le fait déjà calendar-factory (getDate/getMonth…). »*

**Rien ne la fait tenir.** Vérifié : aucun `TZ` dans le [Dockerfile](../../Dockerfile), aucun dans [railway.json](../../railway.json), aucun dans [.env.example](../../.env.example), aucun `process.env.TZ` dans le code. L'image de base est `mcr.microsoft.com/playwright:v1.61.1-jammy` — une Ubuntu, donc **UTC**. En production, `new Date().getHours()` renvoie donc l'heure UTC : **une à deux heures de moins que Paris**, selon la saison.

**Ce que cela touche :**

| Emplacement | Effet |
|---|---|
| [format-fr.js:28](../../server/sources/lib/format-fr.js#L28) — `à ${date.getHours()}h${mm}` | Un événement à 23h59 Paris s'affiche « à 21h59 » l'été |
| [veille-agenda.js:125](../../server/sources/veille-agenda.js#L125) — `formatQuand` | Idem, sur les messages d'alerte envoyés par email et push |
| [ics-parser.js:160](../../server/sources/lib/ics-parser.js#L160) — `base.getHours()` | Les occurrences récurrentes sont **reconstruites** sur cette heure : un événement de fin de soirée peut basculer de jour |
| `calendar-factory.js` — `new Date(year, monthIdx, …)` | Les bornes de la fenêtre d'annonce glissent de 1-2 h |
| **27 fichiers** de `server/sources/` utilisant `getHours`/`getDate`/`getMonth` | Même exposition |

**Le contraste est net** : partout où le fuseau compte pour la *planification*, le projet le pin explicitement et correctement — `cron.schedule(…, { timezone: 'Europe/Paris' })` (4 fois dans `poller.js`), `quiet-hours.js` via `Intl.DateTimeFormat({ timeZone: 'Europe/Paris' })`, `leboncoin-promo-probe.js` de même. C'est uniquement le **rendu des dates** qui a été laissé au fuseau du processus, sur la foi d'une convention non appliquée.

**Vérification à faire avant de conclure** (je ne peux pas lire les variables du tableau de bord Railway) — une ligne dans les journaux de production :
```js
console.log('[boot] TZ =', Intl.DateTimeFormat().resolvedOptions().timeZone, '·', new Date().toString());
```
Si elle affiche `UTC`, le défaut est confirmé et actif.

**Correctif, si confirmé — une ligne :**
```dockerfile
ENV TZ=Europe/Paris
```
dans le [Dockerfile](../../Dockerfile), qui rend vraie la convention déjà écrite. À doubler d'une mention dans `.env.example` (§3.2) pour l'environnement de développement, et — dans l'esprit du dépôt — d'un commentaire disant que `format-fr.js` en dépend.

### 3.2 🟠 `.env.example` a 23 variables de retard, dont une qui empêche le démarrage

**Fichier :** [.env.example](../../.env.example)

Comparaison automatique entre les `process.env.*` du code et les clés documentées :

```
DOOMNAME_INTERNAL_KEY      LEGIFRANCE_CLIENT_ID          ORIGIN_SECRET
DOOMNAME_TRACK_URL         LEGIFRANCE_CLIENT_SECRET      PLAYWRIGHT_CHROMIUM_PATH
EXTERNAL_MAX_COMBOS        LEGIFRANCE_SCOPE              SNCF_API_KEY
FRANCETRAVAIL_CLIENT_ID    LOG_CLIENT_IP                 TWITCH_CLIENT_ID
FRANCETRAVAIL_CLIENT_SECRET METEOFRANCE_DPBRA_API_KEY    TWITCH_CLIENT_SECRET
FRANCETRAVAIL_SCOPE        METEOFRANCE_VIGILANCE_API_KEY URLHAUS_AUTH_KEY
IPLOCATE_APIKEY            METEOFRANCE_VIGILANCE_OM_URL  LBA_TOKEN
IP_HASH_SALT               METEOFRANCE_VIGILANCE_URL
```

(En sens inverse : aucune variable documentée n'est inutilisée. Le fichier n'est pas périmé, il est **incomplet**.)

**`IP_HASH_SALT` est le cas grave.** [ugc.js](../../server/ugc.js) lève à l'import :

```js
if (!IP_SALT) throw new Error('IP_HASH_SALT manquant : …');
```

`ugc.js` étant requis par la chaîne d'initialisation, **un clone neuf qui suit `.env.example` à la lettre ne démarre pas**, avec une erreur qui ne renvoie vers aucune documentation. L'échec bruyant est le bon choix (je l'ai salué hier) — mais il suppose que la variable soit *documentée quelque part*, et elle ne l'est nulle part.

**Recommandation :** compléter `.env.example` avec les 23 clés, en séparant visuellement l'**obligatoire** (`DATABASE_URL`, `IP_HASH_SALT`) de l'**optionnel** (chaque source qui dégrade proprement sans sa clé). Y ajouter `TZ=Europe/Paris` (§3.1). C'est vingt minutes de travail qui évitent une soirée perdue à la prochaine réinstallation.

### 3.3 🟠 Un manifeste externe peut injecter une date invalide jusque dans le SQL

**Fichier :** [server/external.js](../../server/external.js), `manifestToResult`

```js
const d = (v) => (v ? new Date(v) : null);
return { state, since: d(m && m.since), until: d(m && m.until), … };
```

`new Date('n'importe quoi')` ne lève pas : il retourne un `Invalid Date`. Cet objet descend dans `applyResult` → `writeState` → `pool.query([… since, until …])`, où `pg` échoue à le sérialiser. `processSource` n'enveloppe pas `applyResult`, donc l'exception remonte jusqu'au `try/catch` par-source de `runCycleInner` : le cycle survit, mais la source est cassée à chaque passage, sous un message (`erreur inattendue`) qui ne dit pas que le manifeste distant est en cause.

Le paradoxe est que **la validation existe déjà** : [routes/dev.js](../../server/routes/dev.js) a une fonction `isIso8601()` appliquée à la soumission. Mais une source externe est re-interrogée à chaque cycle, et son manifeste peut changer après approbation — le contrôle à la soumission ne protège que le premier jour.

**Recommandation :** extraire `isIso8601` de `dev.js` vers un module partagé et l'appliquer dans `manifestToResult` (`date invalide → null`, comme un champ absent). Le validateur et le consommateur appliqueraient enfin la même règle.

### 3.4 🟡 Le tableau des mois français est défini dans 9 fichiers

**Fichiers :** `sources/lib/format-fr.js`, `sources/lib/calendar-factory.js`, `sources/lib/insee-bdm.js`, `sources/veille-agenda.js`, `sources/ce-qui-change.js`, `sources/eau-potable-commune.js`, `sources/taux-livret-a.js`, `sources/tour-de-france-passage.js`, `sources/veille-emploi.js`

`format-fr.js` a été créé exactement pour ça — *« Formatage de dates en français, mutualisé entre sources »* — et **5 sources seulement** l'utilisent. Les autres redéclarent `MOIS`, parfois `JOURS`, et leur propre `formatQuand` / `formatJourMois` / `formatAvecJour`.

Ce n'est pas grave en soi (un nom de mois ne change pas), mais c'est le même symptôme que partout ailleurs : **le bon module existe, il n'est pas adopté**. Et il devient nocif au moment où le fuseau horaire est corrigé (§3.1) : la correction devra être vérifiée dans 9 endroits au lieu d'un.

**Recommandation :** faire de `format-fr.js` le passage obligé (y déplacer `JOURS`, `formatAvecJour`, `formatQuand`), puis migrer les 4 sources qui redéclarent le plus.

### 3.5 🟢 Deux fichiers non suivis bloquent actuellement le déploiement

**État de `git status` au moment de l'audit :**
```
 M public/css/site.css          ← travail en cours (autre session)
 M public/js/site.js            ← travail en cours (autre session)
?? public/img/675005dc03927e9683fcaaee_Footer.webp
?? public/img/image_footer.webp
```

Les deux `.webp` portent un nom d'export automatique (identifiant hexadécimal d'outil de maquette). Ils ne sont référencés par aucun fichier du dépôt — vérifié.

Ce n'est pas un défaut de code : c'est le **garde-fou qui fonctionne**. `Deploy-LBA` refuse en l'état, et c'est exactement ce pour quoi il a été écrit hier. À traiter par la personne qui les a déposés : soit les intégrer (avec un nom lisible), soit les retirer. Je n'y touche pas — le script lui-même explique pourquoi remiser le travail d'autrui serait pire que de refuser.

---

## 4. Ce qui reste ouvert (rappel condensé)

Les 15 recommandations non traitées du 09/09 restent valables **sans modification**. Par volume de dette :

| Sujet | Ampleur | Renvoi |
|---|---|---|
| `fetchFn` node-fetch en 73 exemplaires, sur Node 24 | ~73 lignes + 1 dépendance | §1.1 (rapport nº 1) |
| Bloc « fetch JSON + timeout » recopié ~70 fois | ~1 000 lignes | §1.2 |
| 4 modules OAuth `client_credentials` à 85 % identiques | ~230 lignes | §1.3 |
| **SELECT « carte enrichie » en 4 copies** | classe de bugs récurrente | §1.4 |
| Boucle d'adoption en 2 copies + N+1 requêtes | ~40 lignes | §1.5 |
| 7 rate-limiters maison (6 hier) | ~120 lignes | §1.8 |
| 22 `esc`/`escHtml`, dont 2 contrats différents (4 vs 5 caractères) | ~110 lignes | §1.9 |
| Code mort : 4 fonctions, 1 routeur, ~6 modules de sources désactivées | ~115 lignes + fichiers | §2.1-2.3 |
| Absence de tests | 8 fonctions pures prêtes à l'emploi | §6.4 |

**Un point mérite d'être souligné à nouveau, autrement.** Hier je recommandais d'extraire le SELECT « carte enrichie » dans un fragment SQL partagé. Je n'avais pas remarqué que **le dépôt applique déjà exactement ce patron ailleurs** :

```js
// server/routes/community-reports.js:45
const REPORT_COLUMNS = `
  r.id, r.type, r.commune_nom, r.commune_insee, r.lat, r.lon, r.radius_km,
  r.description, r.link, r.created_at, r.expires_at, …
`;
```

Ce n'est donc pas un patron à introduire, c'est un patron **maison à généraliser**. Le même argument vaut pour `makeLimiter` (déjà écrit dans `forum.js`, jamais partagé), pour `LBACards.esc` (déjà délégué par 7 fichiers front sur 18) et pour `format-fr.js` (déjà écrit, adopté par 5 sources sur 27). Dans les quatre cas, la bonne solution est déjà dans le dépôt et n'a pas été propagée. C'est une caractéristique du projet plus qu'un défaut ponctuel, et probablement le levier le plus rentable : il n'y a rien à concevoir, seulement à étendre.

---

## 5. Ce qui est exemplaire dans le travail d'aujourd'hui

- **[auth-transport.js](../../server/auth-transport.js)** — le piège Express 5 (`req.query` est un getter de prototype, l'affectation ne tient pas) est documenté *avec la version testée*, *avec la raison pour laquelle le bug aurait été invisible* (le repli l'aurait masqué), et *avec la solution*. C'est le meilleur commentaire du dépôt.
- **[db.js](../../server/db.js)** — chaque valeur du pool est justifiée par une mesure de production (~145 ms l'aller-retour, 0,8-1,6 s l'établissement, 1,69 s contre 0,23 s après 30 s de pause), y compris la contre-mesure qui prouve que le conteneur ne dormait pas. Et le choix `min: 4` plutôt que 2 est motivé par la connexion que retient le poller.
- **[public/sw.js](../../public/sw.js)** — la correction va bien au-delà de ce que je signalais : la vraie cause (le cache HTTP de Cloudflare empoisonnant `cache.addAll()` sur des URL nues) a été trouvée, chiffrée au **nombre d'octets près** (12 814 contre 13 766), et corrigée par `{cache: 'reload'}` aux deux endroits qui le nécessitaient.
- **[Deploy-LBA.ps1](../../scripts/Deploy-LBA.ps1)** — quatre vérifications, chacune motivée par un incident réel, et une section « ce qu'il ne fait délibérément pas » qui vaut mieux que la plupart des documentations d'outil. Le refus de `git stash` automatique parce que *« remiser le travail d'autrui sans le lui dire est pire que de refuser »* est une décision de conception, pas un raccourci.
- **[public-events.js](../../server/public-events.js)** — la règle par défaut est *ne pas publier*, et il faut venir éditer le module pour ouvrir un nouveau type d'événement. Un défaut sûr plutôt qu'une liste noire.
- **[.dockerignore](../../.dockerignore)** — l'inventaire de ce qui doit rester dans l'image est explicite, et l'affirmation « aucun script externe n'est lancé à l'exécution » est présentée comme **vérifiée par grep**, pas comme supposée.
- **[community-types.js](../../server/community-types.js)** (non modifié aujourd'hui, mais relu) — « ajouter un type = 1 entrée ici + 1 ligne dans init.sql, aucun autre fichier à toucher », et c'est vrai. Le contraire exact de la duplication qui règne côté sources.

---

## 6. Plan actualisé

### Lot 0 — à traiter en premier, coût quasi nul
1. **Vérifier le fuseau en production** (une ligne de journal), puis `ENV TZ=Europe/Paris` si confirmé — §3.1
2. **Compléter `.env.example`** des 23 variables, `IP_HASH_SALT` en tête — §3.2
3. Corriger le canonical de `/forum/source/:slug` et `/forum/deck/:slug` — §2.3
4. Ajouter `favRows` au `Promise.all` — §2.4
5. Aligner `connexion.html` / `mes-decks.html` sur la règle noindex de `forum.js` — §2.6

### Lot 1 — dette de transition, avant qu'elle ne piège
6. **Amender le commentaire d'`auth-transport.js`** et scinder `legacyQueryFrom` / `legacyBodyFrom` — §2.1
7. Migrer les 8 fichiers front restants vers `LBASession.authFetch` — §2.1
8. Rendre l'invariant `Cache-Control` explicite (ou robuste) — §2.2
9. Garde-fou `.dockerignore` ≡ `.railwayignore` dans `Deploy-LBA` — §2.7

### Lot 2 — reprise du plan du 09/09, par valeur décroissante
10. Nettoyage sans risque : 73 `fetchFn`, 4 fonctions mortes, `pagesRouter` orphelin, diagnostic IPv6 — §1.1, 2.1, 2.2, 2.5 (nº 1)
11. **Généraliser les patrons déjà écrits** : `REPORT_COLUMNS` → SELECT carte, `makeLimiter` → les 7 copies, `LBACards.esc` → les 10 copies, `format-fr.js` → les sources — §4
12. Middlewares 404 et erreur — §3.11 (nº 1)
13. `isIso8601` partagé, appliqué dans `external.js` — §3.3
14. `GET /history` en O(n), gabarits SEO en mémoire — §3.4, §3.6 (nº 1)
15. Tests `node --test` sur les 8 fonctions pures — §6.4 (nº 1)

---

*Aucune modification n'a été apportée au code lors de cet audit. Les deux fichiers modifiés et les deux fichiers non suivis présents dans l'arbre de travail au moment de l'analyse ne sont pas de mon fait.*
