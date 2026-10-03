# Rotation des identifiants d'API — inventaire et procédure

> **Aucune valeur de secret ne figure dans ce document, ni dans aucun fichier du dépôt.**
> On n'y manipule que des **noms de variables d'environnement**. Les valeurs vivent
> uniquement dans les variables Railway et dans le portail de chaque fournisseur.

France Travail renouvelle **automatiquement, chaque année à partir d'octobre 2026**, le
Client ID et le Client Secret de chaque application, avec un mail de rappel **avant** le
renouvellement puis **avant l'expiration** des anciens identifiants. Les autres portails
pratiquent des rotations comparables, à la main ou sur expiration. Ce document existe pour
qu'une rotation ne casse **jamais une source en silence**.

---

## 1. Ce qui se passe maintenant quand des identifiants sont rejetés

Avant le fil #9bis, un rejet d'identifiants (`invalid_client`, 401, 403) était simplement
journalisé en `console.warn` et la source renvoyait « inactive » : vu du site, elle
affichait **« rien à signaler »**, exactement comme un jour sans actualité. Une rotation
pouvait donc casser une source pendant des semaines sans que rien ne le dise.

Depuis, pour les **quatre fournisseurs OAuth2** du projet :

1. le rejet est journalisé sur une ligne reconnaissable dans les journaux Railway :

   ```
   [auth][france-travail] IDENTIFIANTS REJETÉS (HTTP 400, error=invalid_client) — rotation
   d'identifiants probable. Mettre à jour FRANCETRAVAIL_CLIENT_ID / FRANCETRAVAIL_CLIENT_SECRET
   sur Railway puis redéployer (procédure : docs/rotation-identifiants.md). …
   ```

   Seuls le **statut HTTP** et le **code d'erreur normalisé** du fournisseur
   (`invalid_client`…) sont écrits : jamais le corps brut, jamais `error_description`
   (qui peut contenir l'identifiant), jamais une valeur de secret.

2. l'erreur est **propagée** par la source au lieu d'être ravalée → le poller enregistre un
   événement `failed` : la source apparaît en **« Incident de surveillance »** sur sa page
   statut (`/source/<id>/statut`) et remonte dans le tableau de veille
   (`node scripts/veille-readonly.js`, bloc `failing_sources`). L'état précédent est
   **conservé** (pas de fausse désactivation).

3. **aucun mail n'est envoyé aux abonnés** : un événement `failed` ne notifie jamais (seul
   `activated` notifie). L'incident regarde Hugo, pas les abonnés — principe « que du signal ».

Une variable **vidée** par une rotation ratée est traitée comme un rejet (même ligne
`[auth][…] IDENTIFIANTS ABSENTS`, même incident).

Ce qui **reste silencieux**, volontairement : une panne purement réseau (timeout, 5xx) sur
le endpoint token. Elle ne dit rien sur les identifiants et se résorbe seule au cycle
suivant ; la source dégrade en « inactive » comme avant.

---

## 2. Inventaire des identifiants (noms de variables uniquement)

### Fournisseurs OAuth2 (client_credentials) — détection active

| Fournisseur | Variables | Lues par | Source(s) servie(s) | Rappel de renouvellement |
|---|---|---|---|---|
| **France Travail** (francetravail.io) | `FRANCETRAVAIL_CLIENT_ID`, `FRANCETRAVAIL_CLIENT_SECRET`, `FRANCETRAVAIL_SCOPE` (optionnelle) | `server/francetravail-auth.js` | `veille-emploi` | **Mail automatique** à `contact@dahu-concept.fr` (libellé Gmail `labonnealerte`) : un avant le renouvellement annuel, un avant l'expiration des anciens identifiants. Rotation annuelle automatique à partir d'octobre 2026. |
| **PISTE / Légifrance** (piste.gouv.fr) | `LEGIFRANCE_CLIENT_ID`, `LEGIFRANCE_CLIENT_SECRET`, `LEGIFRANCE_SCOPE` (optionnelle) | `server/legifrance-auth.js` | `veille-legifrance` | Portail PISTE, section **« Identifiants Oauth »** (⚠️ **pas** « API Keys » : piège d'ergonomie documenté dans le module). Mails du portail sur l'adresse du compte PISTE — **à confirmer au premier renouvellement**. |
| **RTE** (digital.iservices.rte-france.com) | `RTE_CLIENT_ID`, `RTE_CLIENT_SECRET` | `server/rte-auth.js` | `ecowatt` | Portail RTE Data (« Mes applications »). Pas de rotation automatique connue ; **à confirmer**. |
| **Twitch** (dev.twitch.tv) | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | `server/twitch-auth.js` | `veille-twitch` | Console développeur Twitch. Le secret ne tourne que si on le régénère à la main (ou si l'app est révoquée). |

Particularité relevée **en test réel le 04/10/2026** : France Travail, PISTE et RTE
répondent **HTTP 400** (et non 401) à un couple identifiant/secret invalide — les quatre
modules traitent donc 400, 401 et 403 comme des rejets.

### Clés d'API simples (pas d'OAuth) — comportement existant, inchangé

| Clé | Lue par | Source(s) | En cas d'échec d'authentification |
|---|---|---|---|
| `METEOFRANCE_API_KEY` | `server/sources/lib/vigilance-factory.js`, `server/sources/cyclones-outremer.js` | vigilances Météo-France, `cyclones-outremer` | **401/403 → exception → « incident de surveillance »** (déjà correct). Clé absente → exception aussi. |
| `METEOFRANCE_VIGILANCE_API_KEY` | `server/sources/vigilance-submersion.js` | `vigilance-submersion` | Clé absente → source inactive silencieuse ; erreur d'appel → `console.warn` + inactive. **Non détecté** (clé non posée sur Railway à ce jour). |
| `METEOFRANCE_DPBRA_API_KEY` | `server/sources/risque-avalanche.js` | `risque-avalanche` | Clé absente → no-op silencieux documenté. Clé non posée sur Railway, et **source désactivée en base** (`sources.enabled = false`) : sans objet aujourd'hui. |
| `SNCF_API_KEY` | `server/sources/sncf-perturbations.js` | `sncf-perturbations` | 401/403 → exception → « incident de surveillance » (déjà correct). ⚠️ **Clé absente de Railway alors que la source est activée** : 130 événements `failed` sur 7 jours au 04/10/2026, message « SNCF_API_KEY absente de l'environnement ». À poser, ou désactiver la source. |
| `URLHAUS_AUTH_KEY` | `server/sources/domaine-securite.js` | `domaine-securite` | Clé absente ou 401/403 → `console.warn` + inactive silencieux (choix d'origine, non modifié). |
| `IPLOCATE_APIKEY` | `server/profile-autofill.js`, `server/index.js` (diagnostic) | pré-remplissage géo du profil (aucune alerte) | Échec → profil non pré-rempli, jamais d'erreur visible. Quota : voir §4. |
| `RESEND_API_KEY` | `server/mailer.js` | envoi de tous les mails | Hors périmètre des sources : une clé invalide se voit immédiatement (aucun mail ne part). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | `server/routes/auth.js` | connexion des comptes | Hors périmètre des sources : une rotation casse la connexion, visible immédiatement. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | `server/webpush.js` | notifications push | **À NE JAMAIS FAIRE TOURNER** : changer la paire invalide tous les abonnements push existants. |

Autres variables sensibles, sans rapport avec un fournisseur externe :
`DATABASE_URL`, `ORIGIN_SECRET`, `IP_HASH_SALT`, `DOOMNAME_INTERNAL_KEY`.
`IP_HASH_SALT` ne doit pas être changé sans raison (il déconnecterait les hachages d'IP
des signalements déjà enregistrés).

---

## 3. Procédure de mise à jour d'un identifiant (Railway)

Toujours dans cet ordre, **sans jamais coller un secret dans un fichier, un commit, un
rapport ou un message de journal** :

1. **Récupérer les nouveaux identifiants** sur le portail du fournisseur (voir le tableau
   ci-dessus : France Travail → francetravail.io ; Légifrance → portail PISTE, section
   « Identifiants Oauth » ; RTE → portail RTE Data ; Twitch → console développeur).

2. **Mettre à jour la ou les variables sur Railway** — service `labonnealerte`, onglet
   *Variables*. Interface web, ou en ligne de commande :

   ```bash
   railway variable set FRANCETRAVAIL_CLIENT_SECRET=<nouvelle valeur>
   # ou, pour ne pas laisser la valeur dans l'historique du terminal :
   railway variable set --stdin FRANCETRAVAIL_CLIENT_SECRET
   ```

   ⚠️ `railway variable list` (et `--json`, et `-k`) **affiche les valeurs** : ne jamais coller sa sortie
   dans un rapport, un ticket ou une conversation. Pour contrôler la seule *présence* d'une
   variable, lister les **noms** :

   ```bash
   railway variables --json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(Object.keys(JSON.parse(d)).sort().join('\n')))"
   ```

3. **Redéployer** (une variable modifiée ne prend effet qu'au redémarrage du service, et le
   jeton OAuth est mis en cache mémoire 5 min avant expiration) :

   ```bash
   railway up
   ```

   puis attendre la fin du build.

4. **Vérifier la source concernée** — trois contrôles, du plus rapide au plus sûr :

   - journaux Railway : plus aucune ligne `[auth][<fournisseur>] IDENTIFIANTS REJETÉS` ;
   - page statut publique de la source (`https://labonnealerte.fr/source/<id>/statut`) :
     la frise ne doit plus marquer « Incident de surveillance » au cycle suivant
     (le poller tourne **toutes les 30 min**) ;
   - tableau de veille : `node scripts/veille-readonly.js` — la source ne doit plus
     apparaître dans `failing_sources`.

5. **Si le fournisseur laisse cohabiter ancien et nouveau secret** (cas annoncé par France
   Travail), faire la mise à jour **pendant la période de recouvrement**, pas après : la
   source ne subit alors aucune interruption.

### Correspondance source ↔ identifiants (pour l'étape 4)

| Source à vérifier | Identifiants |
|---|---|
| `veille-emploi` | France Travail |
| `veille-legifrance` | PISTE / Légifrance |
| `ecowatt` | RTE |
| `veille-twitch` | Twitch |

---

## 4. Quota IPLocate (1000 appels / jour)

Deux chemins appellent IPLocate :

- **`server/profile-autofill.js`** — pré-remplissage géo du profil. **Borné** depuis le
  correctif v42 : la tentative est marquée en base (`departement_source` = `auto` ou
  `auto-none`, idem région/ville) et **n'est plus rejouée**. Avant v42, un lookup partait à
  *chaque* chargement du tableau de bord tant qu'un champ restait vide — c'était la fuite.
  Ordre de grandeur constaté : **1 à 2 appels par jour** (une tentative par compte, une
  seule fois).
- **`server/index.js`, middleware `[ip-geo-diag]`** — actif **uniquement si
  `LOG_CLIENT_IP=1`**. **Un appel par page HTML servie** : c'est le seul chemin capable
  d'épuiser le quota à lui seul.

Depuis le fil #9bis, les deux chemins passent par `server/iplocate-quota.js` :

- compteur **journalier** persisté dans la table `counters` (clés `iplocate_YYYYMMDD`,
  même mécanisme que `checks_*` du poller — aucun schéma nouveau) ;
- une ligne de journal par appel : `[iplocate] 2026-10-04 appel 42/1000 (autofill)` ;
- **avertissement à 80 %** (800 appels) : `[iplocate] SEUIL 80 % ATTEINT …` ;
- **plafond dur à 1000** : au-delà, les appels sont refusés (`[iplocate] BUDGET JOURNALIER
  ATTEINT …`) et le profil reste simplement non pré-rempli — jamais d'erreur côté visiteur.

Lecture du compteur, **sans aucune écriture** :

```bash
node scripts/iplocate-quota-readonly.js        # 14 derniers jours
node scripts/iplocate-quota-readonly.js 30     # 30 derniers jours
```

> **Action recommandée (manuelle, décision de Hugo) :** `LOG_CLIENT_IP` est **encore posée
> sur Railway**. Le diagnostic qu'elle sert a livré sa réponse (Cloudflare transmet bien
> l'IPv6 réelle du visiteur, ce qui est exploité en production depuis). La retirer ramène la
> consommation IPLocate au seul pré-remplissage de profil :
> `railway variable delete LOG_CLIENT_IP` puis `railway up`.

---

## 5. Rappel : ce qui ne doit jamais sortir

- Aucune valeur de secret dans un fichier du dépôt, un commit, un rapport, un journal.
- Les journaux n'écrivent que : nom du fournisseur, statut HTTP, code d'erreur normalisé,
  **noms** des variables à mettre à jour.
- `.env` est ignoré par git ; `.env.example` ne contient que des noms.
- La sortie de `railway variables` (sans `--json | keys`) contient les valeurs : ne jamais
  la copier ailleurs.
