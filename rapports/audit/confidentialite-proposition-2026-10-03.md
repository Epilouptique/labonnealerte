# PROPOSITION — page /confidentialite réécrite (fil #9bis, audit 2, section C)

> **NON DÉPLOYÉ.** Ce fichier n'est pas servi par le site : `public/confidentialite.html`
> n'a PAS été modifié. Hugo valide le texte (juridique), puis je l'intègre.
>
> Règle appliquée : **rien d'affirmé qui ne soit prouvé par le code**. Ce que le code ne
> prouve pas est marqué « À CONFIRMER PAR HUGO » dans le texte lui-même.

## 1. Ce qui est retiré (decks / collection)

| Ligne actuelle | Motif |
|---|---|
| l.75 « il signe les **decks** que vous partagez » | decks archivés (fil #9) — aucune route n'écrit plus `collections` / `collection_items` |
| l.76 « vos **decks** (sélections de **cartes**…) … Vos decks sont supprimés » | idem |
| l.77 « signalement d'un **deck** … empreinte anonymisée » | `deck_reports` est du code mort ; le signalement réel avec empreinte IP est `forum_reports` |
| l.115 « dans « **Ma collection** » » | la vue s'appelle « Mon compte » |

## 2. Tableau de preuve : donnée → stockage → durée

| Donnée | Table.colonne | Écrite par | Durée prouvée par le code |
|---|---|---|---|
| Email | `subscribers.email` | `POST /api/subscribe`, OAuth | aucune purge automatique ; supprimée avec le compte |
| Jeton de lien magique | `subscribers.magic_token` (+ `_expires_at`) | `POST /api/my-alerts/request` | **30 min**, usage unique |
| Jeton de session | `sessions.token` / `expires_at` | `createSession()` | **90 j** glissants ; purge `DELETE … expires_at < NOW()` au démarrage puis 1×/24 h |
| Jeton côté navigateur | `localStorage['lba-token']` (aucun cookie) | `public/js/session.js` | local au navigateur |
| Identité Google / GitHub | `subscribers.google_id`, `github_id`, `github_username` | `/auth/*/callback` | vie du compte |
| Nom public | `subscribers.display_name` | `POST /api/my-alerts/display-name` | vie du compte |
| Historique des renommages | `display_name_changes` | idem | **aucune purge** → À CONFIRMER |
| @pseudo public | `subscribers.pseudo` | `ensurePseudo()` | jamais régénéré |
| Abonnements (+ réglages, pause) | `subscriptions` | `/api/my-alerts/toggle*` | supprimés par l'utilisateur ; CASCADE compte |
| Préférences email / veille / affichage | `subscribers.email_enabled`, `quiet_*`, `view_mode`, `hide_community_reports` | `/api/my-alerts/*` | CASCADE compte |
| Lieu : pays, région, département, ville (+ origine de chaque champ) | `subscribers.country` / `region` / `departement` / `ville` + `*_source` | `POST /api/my-alerts/profile`, auto-remplissage IP | CASCADE compte |
| Notifications push | `push_subscriptions.endpoint` / `p256dh` / `auth` | `POST /api/push/subscribe` | supprimé au désabonnement et sur endpoint mort (410) |
| Favoris / j'aime | `favorites`, `source_likes` | `/api/sources/:id/like`, `/api/favorites/sync` | CASCADE compte |
| Points / classement | `subscribers.points_balance`, `points_ledger`, `leaderboard_optout` | `server/points.js` | journal **append-only**, aucun DELETE → À CONFIRMER |
| Tâches à échéance | `user_tasks.label` / `anchor_date` / `next_due` … | `/api/user-tasks` | supprimées par l'utilisateur ; aucune purge des inactives → À CONFIRMER |
| Forum : sujets / messages | `forum_topics`, `forum_posts` | `POST /forum/t`, `/reply` | **aucune purge** → À CONFIRMER |
| Forum : signalements + **empreinte IP** | `forum_reports.reporter_ip_hash` = SHA-256(IP + sel) | `POST /forum/post/:id/report` | aucune purge → À CONFIRMER |
| Signalements communautaires | `community_reports` (commune, INSEE, lat/lon, description, lien, auteur) — **aucune IP** | `POST /api/community-reports` | `expires_at` = **7 j**, prolongeable **3×** ; le cron passe `status='expired'` mais **ne supprime pas** les lignes → À CONFIRMER |
| Témoignages « je l'ai vu » | `community_report_spots` (où / quand) | `/api/community-reports/:id/spot` | aucune purge |
| Notifications différées | `deferred_notifications` | poller (heures de veille) | supprimées au flush |
| Journal d'alertes | `source_events` — **lié à la source, pas à la personne** | poller | aucune purge (donnée non personnelle) |

**Aucun cookie** (zéro `document.cookie` / `Set-Cookie` dans le code) ; **aucun** outil d'analyse d'audience, tag manager ni CDN de polices (polices servies en local).

## 3. Sous-traitants prouvés

| Tiers | Preuve dans le code | Donnée reçue |
|---|---|---|
| Railway | `railway.json`, variables d'environnement | tout (base + journaux) |
| Resend | `server/mailer.js` (From `noreply@alert.labonnealerte.fr`) | email destinataire + contenu |
| Cloudflare | en-tête `cf-connecting-ip` + `ORIGIN_SECRET` (`server/profile-autofill.js`) | trafic HTTP / IP |
| Google / GitHub (OAuth) | `/auth/google`, `/auth/github` | code OAuth, jeton |
| **IPLocate** | `https://iplocate.io/api/lookup/<IP>` (`server/profile-autofill.js:51`) | **l'adresse IP du visiteur** |
| Service push du navigateur | `push_subscriptions.endpoint` | endpoint + charge chiffrée |

> ⚠️ **IPLocate n'est pas déclaré dans la page actuelle**, alors que l'adresse IP du visiteur
> lui est transmise. C'est le point le plus important de cette révision.

## 4. Texte proposé

### Données collectées (remplace la liste actuelle)

- votre **adresse email** ;
- si vous vous connectez via Google ou GitHub : un **identifiant technique** de votre compte et, pour GitHub, votre **pseudo public** ;
- la liste de vos **abonnements** aux alertes, avec leurs **réglages** (commune, département… selon l'alerte) ;
- des **jetons de session** pour vous garder connecté, et un **lien de connexion** temporaire quand vous en demandez un ;
- si vous les renseignez, des **préférences de lieu** : pays, région, département, ville, ainsi que vos centres d'intérêt. Ces champs sont facultatifs et vides par défaut ;
- à la **première connexion**, une **estimation de votre lieu** (pays, et selon le cas région, département, ville) est déduite de votre **adresse IP** pour pré-remplir ces champs. Pour cela, votre adresse IP est transmise au service **IPLocate** ; elle n'est **pas conservée** dans notre base. Ces valeurs restent modifiables et effaçables à tout moment ;
- vos **préférences de notification** : email activé ou non, **heures de veille**, mode d'affichage ;
- si vous en choisissez un, un **nom public** (pseudo) : il signe vos messages sur le forum. Ce n'est jamais votre email ;
- vos **messages et sujets du forum**, ainsi que vos **signalements** de messages. En cas de signalement, une **empreinte anonymisée** de l'adresse IP (hachée, jamais conservée en clair) est enregistrée pour limiter les abus ;
- vos **signalements communautaires** (par exemple un animal perdu) : commune, description, lien éventuel et zone concernée. Aucune adresse IP n'y est associée ;
- vos **tâches à échéance** personnelles : leur intitulé et leurs dates ;
- vos **favoris** et vos « **j'aime** » ;
- vos **points** et votre position au classement, que vous pouvez quitter ;
- si vous les activez, vos **notifications push** : l'adresse technique de notification fournie par votre navigateur.

### Durées de conservation

- Lien de connexion par email : **30 minutes**, usage unique.
- Jetons de session : **90 jours**, prolongés à chaque usage, supprimés à la déconnexion.
- Signalements communautaires : **7 jours**, prolongeables **3 fois** par leur auteur.
- Notifications push : supprimées dès que votre navigateur n'accepte plus les envois.
- Compte et données associées : supprimés immédiatement via « Supprimer mon compte ».
- *À CONFIRMER PAR HUGO : durée de conservation d'un compte inactif, des messages du forum, des signalements, du journal de points et de l'historique des noms publics — le code ne prévoit aujourd'hui aucune suppression automatique.*

### Sous-traitants

- **Railway** : hébergement. *À CONFIRMER PAR HUGO : la région exacte — la mention « europe-west4, Pays-Bas » n'est prouvée par aucun fichier du dépôt.*
- **Resend** : envoi des emails (société américaine). *À CONFIRMER PAR HUGO : encadrement du transfert (DPF / clauses contractuelles types).*
- **Cloudflare** : protection et distribution du site.
- **IPLocate** : estimation du lieu à partir de l'adresse IP, à la première connexion.
- **Google / GitHub** : uniquement si vous choisissez ce mode de connexion.
- **Service de notification de votre navigateur** (Google, Mozilla, Apple…) si vous activez les notifications push.

### Stockage local du navigateur

Thème, contraste, mode d'affichage, jeton de session, favoris et « j'aime » en navigation anonyme, recommandations ignorées. Ce ne sont **pas** des cookies, et rien n'est transmis à un tiers.

### Vos droits

… ou directement via le bouton « Supprimer mon compte » dans **« Mon compte »**.
*À CONFIRMER PAR HUGO : aucune route d'export des données n'existe aujourd'hui dans le code — la portabilité se fait donc manuellement.*

### Finalités et bases légales

Section laissée telle quelle. *À CONFIRMER PAR HUGO : le code ne prouve aucune base légale ; ces mentions relèvent d'un choix juridique.*

## 5. Points bloquants à trancher (au-delà de la rédaction)

1. **Suppression de compte impossible pour un membre du forum.** `forum_topics.author_subscriber_id` et `forum_posts.author_subscriber_id` référencent `subscribers(id)` **sans `ON DELETE CASCADE`** : `DELETE FROM subscribers` échoue dès qu'une personne a posté. À trancher — anonymiser l'auteur, ou supprimer ses messages. C'est un défaut RGPD réel, pas un détail de rédaction.
2. **`LOG_CLIENT_IP=1` est-il encore actif en production ?** Si oui, des adresses IP en clair et des géolocalisations (ville, code postal) partent dans les journaux Railway à chaque page vue, ce que la page ne déclare pas.
3. **Signalements communautaires expirés** : le cron marque `status='expired'` mais ne supprime jamais les lignes (commune, description, auteur).
4. **Tables mortes** (`collections`, `collection_items`, `deck_reports`, `skins`, `user_skins`) : elles peuvent contenir encore des données d'utilisateurs. À purger ou à conserver ?
5. **Bases légales** : aucune n'est prouvable par le code, alors que le texte actuel les affirme.
