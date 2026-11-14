# Audit de faisabilité — « Publier pour les mairies et com-com » (étape 1, lecture seule)

Date 2026-10-11. Portée : faisabilité sur l'existant, sans modification ni déploiement. Fichiers clés lus : `server/poller.js`, `server/routes/community-reports.js`, `server/community-types.js`, `server/sources/ma-collectivite.js`, `server/sources/lib/panneaupocket-veille.js`, `server/sources/lib/commune-insee.js`, `server/sources/lib/geo-distance.js`, `server/mailer.js`, `server/webpush.js`, `server/db/init.sql`, `server/routes/community-sources.js`.

## 1) Événements ÉCRITS par un humain, et modèle « émetteur » (mairie)

Le moteur de sources est bâti sur `check()`/`checkWithParams()` → détection (poller). **Il n'existe pas de type de source « événement saisi »** côté moteur. En revanche le projet possède déjà **le précédent exact** : les **cartes communautaires** (`community_reports`, types `chat-perdu`/`chien-perdu` via `community-types.js`). Elles sont : contenu humain (`description`, `link`), **par commune** (`commune_nom`, `commune_insee`), **géolocalisées** (`lat`/`lon` + `radius_km`), avec **expiration prolongeable** (`expires_at`, `extensions_count`, `maxExtensions`) et **clôture auto** (`spotsToClose`) — tout cela **sans passer par le poller**. `source_events` existe mais c'est le journal du poller (`activated/deactivated/failed`), pas des événements humains.

**Modèle « émetteur » recommandé** (réutilise le patron `community_reports`, pas une refonte) : une table `municipal_events(id, org_id, type[coupure|travaux|evenement|fermeture], title, body, starts_at, ends_at|expires_at, commune_insee, lat, lon, radius_km, categories TEXT[], status[draft|scheduled|published|expired], author_subscriber_id, created_at)`. Une **mairie = une organisation liée à un `commune_insee`** ; les événements sont saisis, expirent via `expires_at`, catégorisés avec les slugs **déjà existants** de la famille `vie-locale` (`travaux-voirie`, `coupures-circulation`, `collecte-dechets`, `mairie`, `evenements-locaux`…), zone géo = `commune_insee` + `lat/lon` + `radius_km` résolus via `resolveCommuneInsee`/`resolveCommuneCoords` + `distanceKm` (déjà en place).

**Abonnement par commune — déjà deux mécanismes réutilisables :** (a) sources paramétrées (`ma-collectivite`, `panneaupocket`) : l'URL `/ville/` est stockée dans `subscriptions.params`, un état par combinaison (`source_param_states`) ; (b) `community_reports` : visible à **tout profil dans le `radius_km`** de l'instance (via `subscribers.ville`/`departement` résolus à la volée) **ou** abonné direct (`community_report_subscriptions`). Le mécanisme (b) — rayon + commune du profil — est **directement réutilisable** pour « les abonnés de la commune ».

## 2) Notification d'un événement saisi (chemin réel + protections)

Chemin réel d'envoi = `poller.dispatchAlert(sourceId, params, info)` → `loadSubscribersForAlert` → **email immédiat** (`mailer.sendPromoAlert`, boucle séquentielle, en-têtes `List-Unsubscribe` 1-clic) **+ push** (`webpush.sendToSubscriber`, `Promise.all` par appareil), **ou mise en file** `deferred_notifications` si l'abonné est en **heures de veille** (`isQuietNow`), flush à la sortie de plage. `requires_confirmation` distingue scraper (2 cycles) vs API officielle (immédiat).

Pour un événement **saisi**, la notification ne peut pas venir de `check()` : il faut **appeler `dispatchAlert` au moment de l'enregistrement** (fan-out aux abonnés de la commune). **Ce fan-out à la création n'existe pas encore** : `community_reports` ne notifie aujourd'hui **que l'auteur** (email sur un « Repéré »), pas toute la commune. C'est donc du travail neuf.

**Protections à ajouter (aucune pour un envoi de masse humain aujourd'hui) :** (i) **relecture/aperçu avant envoi** — réutiliser le patron `community-sources` (gate preview→submit du lot 11) ; (ii) **fenêtre d'annulation** (ex. 2 min entre enregistrement et envoi réel, via `publish_at`) ; (iii) **limite par jour** par organisation/commune (patron des compteurs glissants `PREVIEW_MAX`/`REPORT_MAX` déjà présents) ; (iv) **veille** déjà gérée par `dispatchAlert` ; (v) **désinscription 1-clic** déjà dans `mailer`. Point d'attention : `sendPromoAlert` envoie **en série, un email par destinataire** — correct pour une petite commune, à **batcher/étaler** pour une grande liste.

## 3) Organisations (modèle minimal + vérification)

**Rien n'existe** (aucune table org/membres/rôles/vérifié ; `grep` négatif). Modèle minimal : `organizations(id, kind='commune', name, commune_insee, email_domain, status[pending|verified], created_at)` + `organization_members(org_id, subscriber_id, role[owner|agent], status)`.

**Données ouvertes déjà dans le projet :** résolution **INSEE** et **coordonnées** de commune via `geo.api.gouv.fr` (`commune-insee.js`), et l'infra d'**email de confirmation** (`mailer.sendConfirmation`). **Manquant :** le **domaine e-mail officiel** d'une mairie n'est pas dans le projet — disponible en open data via l'**Annuaire de l'administration / Service-Public (data.gouv)**. Vérification minimale praticable : (INSEE commune) + (email de l'agent dont le **domaine** correspond au domaine officiel de la mairie *ou* confirmation envoyée à l'adresse officielle `mairie@…` tirée de l'annuaire). Nouvelle intégration à prévoir (API annuaire, gratuite).

## 4) Parcours agent — 3 écrans, modèles, programmation

- **Écran 1 — Quoi** : commune pré-remplie (org vérifiée) ; choix du **type** (Coupure / Travaux / Événement / Fermeture) ; catégories pré-remplies selon le type.
- **Écran 2 — Détail + aperçu** : titre, texte, **dates début/fin**, zone (commune entière / rayon km), lien ; **aperçu** du message (email + push).
- **Écran 3 — Relecture + programmation** : récap, **immédiat ou planifié** (`publish_at`), **confirmation d'envoi** (+ fenêtre d'annulation). *Réutilise l'infra 2-écrans de `publier-flow.js`/`publier.js`.*

**Modèles de messages** (brut, échappé à l'affichage) :
- *Coupure* : « 🚱 Coupure {service} à {commune} — {secteur} — du {début} au {fin}. Détails : {lien}. »
- *Travaux* : « 🚧 Travaux {lieu} à {commune} — {début} → {fin}. Circulation : {impact}. {lien}. »
- *Événement* : « 🎉 {titre} à {commune} — le {date}, {lieu}. {lien}. »
- *Fermeture* : « ⛔ {service} fermé à {commune} — le {date}. {motif}. {lien}. »

**Programmation** : `publish_at` libéré soit par le cycle 30 min, soit par un cron quotidien dédié (patron `runUserTaskNotify`, `0 9 * * *`, Europe/Paris) pour éviter les envois nocturnes.

## 5) Risques & estimation par lots

- **Usurpation** (se faire passer pour une mairie) → vérification org (part 3) + **badge « officiel »** + modération. **LCEN/hébergeur** : UGC → obligation de **retrait sur signalement** (réutiliser `source_reports`/modération admin). **RGPD** : données minimales (emails déjà gérés, `List-Unsubscribe`), registre + mention CNIL ; pas de données sensibles. **Fiabilité** : un envoi de masse erroné est difficilement rattrapable → relecture + fenêtre d'annulation + limite/jour (part 2).

**Lots proposés (ordre + dépendances) :**
1. **S — Organisations & vérification** (tables org/membres, INSEE + annuaire, badge). *Dépend de rien.*
2. **M — Table `municipal_events` + saisie 3 écrans + aperçu** (réutilise `publier-flow`, `commune-insee`, `geo-distance`). *Dépend de L1 et du chantier Publier existant.*
3. **M — Fan-out commune + protections** (`dispatchAlert` à la création, veille, annulation, limite/jour, batch email). *Dépend de L2 ; cœur du risque.*
4. **S — Modération / retrait / signalement** (gate review réutilisé). *Dépend de L1-L3.*
5. **L — Programmation + export/widget** (part 6b). *Dépend de L2-L3.*

## 6) Interopérabilité et concurrence PanneauPocket

**(a) Ce que fait déjà le connecteur.** `panneaupocket` (paramétrée par URL `/ville/`) et `ma-collectivite` (ville → URL via `public-api/city/FR-<dept>`) lisent **la page publique `/ville/`** (HTML → `parsePanneaux`, `fetchPanneaux`) et l'**endpoint public non authentifié** de liste par département. Détection anti-rétroactive par `hash(titre+texte+annulé)` (nouveau panneau / mise à jour), cache 2 h, `robots:true`, re-validation `validPanneauUrl` (hôte exact, chemin `/ville/`). **Limites/fragilité :** endpoints **non officiels** (peuvent changer/fermer), **scraping HTML** sensible aux évolutions de markup, **stabilité des ids `?panneau=` non garantie** (TODO documenté : une ré-édition pourrait apparaître comme « nouveau »), dépendance à la **vitalité de l'entité** (garde-fou prévu : carte sans panneau 90 j → candidate désactivation, rapport seul), lecture seule (**on ne peut pas écrire dans PanneauPocket**). **Reprise sans double saisie :** une mairie déjà sur PanneauPocket est **déjà couvrable en miroir** — on surveille son URL `/ville/` et on re-diffuse « via PanneauPocket », **sans ressaisie**. On peut aller plus loin en **important ses panneaux existants** comme miroir en lecture seule, toujours attribué.

**(b) Export RSS/JSON + widget.** **Très faisable dès lors qu'on possède la donnée** (`municipal_events`) : exposer `/commune/<insee>/events.json` et un `/…/events.rss` (le projet construit déjà des flux via `feed-parser`/`rss-alerte`). **Widget** intégrable (balise `<script>`/`iframe` lisant ce JSON, rendu statique, sans auth) : faisable, léger. *Ne s'applique qu'aux événements que la mairie publie chez nous, pas au miroir PanneauPocket (droits du tiers).*

**(c) Contributeurs de confiance.** Deux modes, mappés sur les rôles (part 3) : **publication directe** pour une mairie **vérifiée** (`verified`) ; **après modération** pour un contributeur `pending` ou tiers — réutilise le **gate review** de `community-sources` (`draft → review → published`, validé par l'admin via `scripts/source-lifecycle-admin.js`). Aucun nouveau moteur de modération n'est nécessaire.

**(d) Honnêteté sur le « temps réel » sans Google.** Le poller tourne **toutes les 30 min** → les sources **scrapées/en miroir (PanneauPocket) ne sont pas temps réel**. Pour un événement **saisi chez nous**, la notification peut partir **quasi-instantanément à l'enregistrement** (fan-out, part 2), **sans dépendance à Google/FCM** : le push passe par **Web Push / VAPID** (déjà en place dans `webpush.js`), supporté par les navigateurs majeurs. Nuances à dire aux mairies **sans survendre** : (i) pas de SLA « < 1 minute » garanti (livraison push/email, mise en file en heures de veille) ; (ii) les sources **vérifiées périodiquement** (30 min) sont présentées comme telles ; (iii) option **ntfy** possible (un topic par commune) comme canal complémentaire ouvert ; (iv) le vrai « instantané » suppose que **la mairie publie directement** sur La Bonne Alerte (alors la notification part à la saisie), pas via un miroir d'un tiers.
