# Audit d'architecture — labonnealerte

**Date : 18 juillet 2026** · Périmètre : `server/`, `public/`, `server/db/init.sql`, `robots/`, `scripts/`.
**Nature : rapport de lecture seule. Aucune ligne de code n'a été modifiée pour cet audit.**
Gravité : 🔴 risque actif · 🟠 dette gênante · 🟢 cosmétique.

> Contexte : la base a absorbé ~15 chantiers (6 vagues de sources → ~168 modules, v2 paramétrée, collections/decks, favoris, veille de nuit, lots UX, « Le Point »). L'ossature tient remarquablement bien ; les points ci-dessous sont la dette *normale* d'une croissance rapide, pas des défauts de conception.

---

## Synthèse — les 5 constats majeurs

1. **🟠 Index manquant sur `subscriptions(source_id)`** — le poller interroge `WHERE source_id = $1` (recipients broadcast + `SELECT DISTINCT params` des sources paramétrées) à chaque cycle, mais le seul index utile démarre par `subscriber_id`. Coût qui grandit linéairement avec les abonnements. Le correctif le plus rentable du lot.
2. **🟠 Trois fichiers « monstres »** : `init.sql` (2496 l.), `public/css/site.css` (2024 l.), `public/js/site.js` (1771 l.). Encore lisibles mais au seuil où tout nouveau chantier devient risqué. Découpage recommandé (par domaine), sans réécriture.
3. **🟠 Factorisations amorcées mais pas généralisées** : la `release-factory` (créée pour crates/packagist/rubygems) et `lib/meteoalarm.js` (créé pour `meteo-europe`) existent, mais `npm-release`/`pypi-release` et `meteo-belgique` conservent leur copie inline. Duplication connue et volontairement laissée (sources en prod) — à résorber quand c'est calme.
4. **🟠 L'enum « département » (~100 entrées JSON) est dupliqué** dans plusieurs `params_schema` d'`init.sql` (vigilance-meteo, seismes-departement, tour-de-france-passage) et reconstruit côté JS depuis `geo.js`. Une seule source de vérité manque.
5. **🟢/🟠 Rendu de carte éclaté sur 6 fichiers front** (`cards.js` = `LBACards` partagé, mais `collection-page.js`, `deck-shared.js`, `favoris.js`, `decks.js` ont leurs variantes). Risque de divergence visuelle ; `LBACards` devrait être le seul générateur.

Rien de 🔴 bloquant n'a été trouvé côté sécurité structurelle (voir §5). C'est notable et sain.

---

## Axe 1 — Répétitions & factorisation manquée

- **🟠 Familles de releases dev.** `server/sources/npm-release.js` et `pypi-release.js` (~130 l. chacune) répètent exactement la mécanique désormais dans `lib/release-factory.js` (cache 2 h, plafond `EXTERNAL_MAX_COMBOS`, `Promise.allSettled`, 404→inactif). `crates/packagist/rubygems` l'utilisent déjà. **Remède** : migrer npm/pypi sur la factory (≈ −100 l. chacune, iso-comportement). Risque : ce sont 2 sources en prod → tester le `fetchLatest` à l'identique avant bascule.
- **🟠 Parsing MeteoAlarm dupliqué.** `meteo-belgique.js` embarque son propre parser Atom+CAP + mapping FR ; `lib/meteoalarm.js` (créé pour `meteo-europe`) en est la copie factorisée. **Remède** : migrer `meteo-belgique` sur la lib (et vérifier si `meteo-suisse`, qui utilise une autre API, peut partager le mapping type→FR). Ne pas toucher tant que la lib n'a pas tourné en prod via `meteo-europe`.
- **🟠 Enum département.** Le même tableau ~100 départements est écrit en dur dans 3 `params_schema` d'`init.sql` et régénéré en JS (`seismes-departement`, `tour-de-france-passage`) depuis `geo.js`. **Remède** : générer les `params_schema` géo depuis `geo.js` au `migrate` (ou un helper `paramsSchemaDepartement()`), pour une source unique. Gros gain de maintenabilité, régression faible (données identiques).
- **🟢 Rendu de carte.** `LBACards.cardHTML` (cards.js) est la brique commune, mais plusieurs pages composent leur propre markup de tuile/carte. **Remède** : converger vers `LBACards` avec des variantes paramétrées (mode `deck`/`collection`/`favori`). À faire progressivement.
- **🟢 Bien factorisé (à préserver).** 38 statuts via `statuspage-factory`, `calendar-factory` (72 sources !), `vigilance`/`vacances` factories, `lib/feed-parser`, `lib/prefectures`, `safe-fetch`. C'est l'ossature qui a permis d'atteindre 168 sources sans chaos — **ne pas la remanier pour le plaisir**.

## Axe 2 — Cohérence de construction

- **🟢 Contrat des sources homogène.** Broadcast `{id, check}`, paramétré `{id, paramsSchema, checkWithParams}`, calculé via factory. Gestion d'erreur cohérente (timeout + AbortController, `inactive()` sur échec, `console.warn` préfixé `[id]`). Très régulier.
- **🟠 `fetch` réseau : deux styles.** 44 sources importent `node-fetch` directement (URL officielles FIXES → SSRF non applicable), 1 chemin passe par `safe-fetch`. C'est **justifié** (SSRF ne concerne que les URL pilotées par l'utilisateur : `veille-rss`, `doomname`, validateur `/proposer`). **À vérifier** explicitement : que TOUTE source à URL fournie par l'utilisateur passe bien par `safeFetch*` (voir §5) — le reste peut rester en `node-fetch`.
- **🟠 `init.sql` : lisibilité.** 2496 lignes, blocs empilés par vague. Les migrations de fusion (vigilance 15→1, vacances 3→1…) et les `UPDATE` de réalignement restent mêlés aux `INSERT` récents. **Remède** : séparer en fichiers ordonnés (`schema.sql`, `sources-*.sql`, `migrations-*.sql`) chargés en séquence, ou au minimum des bandeaux de section clairs + un index en tête.
- **🟢 Front : délégation d'événements** cohérente (handlers `document` clés sur `body[data-mode]`), ordre de chargement des scripts stable par page.
- **🟠 Globals `window.LBA*`** : 11 objets (`LBASession` 30 réf., `LBAAccount` 17, `LBACat`, `LBACards`, `LBAShare`, `LBADefaults`, `LBADeckMotifs`, `LBAHeader`, `LBATimeline`, `LBAKioskCats`, `LBACopy`). Acceptable comme « modules IIFE », mais le couplage implicite (qui dépend de qui) n'est documenté nulle part. **Remède léger** : un commentaire d'en-tête par module listant ses dépendances `LBA*`.
- **🟢 Routes API** : conventions homogènes (`authenticate(token)`, réponses JSON `{error}`/`503`, rate-limit mémoire réutilisé).

## Axe 3 — Points de fragilité

- **🟠 `public/js/site.js` (1771 l.)** fait tout : kiosque, filtres, reco, panneau compte, hero animé, favoris, URL params. C'est le fichier le plus exposé à casser au prochain chantier. **Remède** : extraire `account-panel`, `kiosk-filters`, `reco` en modules `LBA*` dédiés (le pattern existe déjà).
- **🟠 `public/css/site.css` (2024 l.)** : composants stylés à plusieurs endroits (headers ont un historique chargé ; tuiles de deck déclinées par page). Risque de divergence. **Remède** : découper par composant (`header.css`, `cards.css`, `account.css`, `le-point.css`…), chargés ensemble.
- **🟢 Absence de `--accent`/`--text`/`--border` dans `tokens.css`** : les tokens réels sont `--ink`, `--line`, `--surface`, `--muted`, violet en dur `#a567e3`. Cohérent mais non documenté → un nouveau venu peut inventer `var(--accent)` (silencieusement cassé). **Remède** : soit ajouter des alias, soit documenter la palette en tête de `tokens.css`.
- **🟢 `display_order` : cartographie des plages.** Utilisées : historique ≤ ~172, puis 300-303, 310-311, 320-324, 330-341, 350-355. **Trous** : 173-299, 304-309, 312-319, 325-329, 342-349. Pas de collision, mais la logique « plages hautes par vague » mériterait d'être notée dans `init.sql` pour éviter les chevauchements futurs.
- **🟢 Import mort introduit ce cycle** : `index.js` importe `lePointPagesRouter` mais sert `/le-point` via un `app.get` direct (comme `/proposer`). Sans effet ; à nettoyer au prochain passage.
- **🟢 Nommage fr/en mélangé** : `checkWithParams` (en) vs `verifie`/`evenements` (fr) selon les fichiers ; `subscribers`/`subscriptions` (en, DB) vs `abonnements` (fr, UI). Sans gravité, constat seulement.

## Axe 4 — Performance & poids

- **🟠🔴 Index `subscriptions(source_id)` manquant.** `poller.js` : `processSource` (recipients `WHERE source_id`) et `processParamSource` (`SELECT DISTINCT params WHERE source_id`) tournent pour chaque source à chaque cycle (×168, ×48 fois/jour). L'index `uq_subscriptions_sub_src_params` démarre par `subscriber_id` → **inutilisable** pour ces filtres → scans. **Remède** : `CREATE INDEX idx_subscriptions_source ON subscriptions(source_id);`. C'est LE correctif prioritaire (rentable, sans risque).
- **🟠 Index/état sur `source_param_states(state)`** : la requête « Le Point » et le poller filtrent `WHERE state='active'` sur une table qui grossit par combinaison. PK `(source_id, params)` OK pour les accès ciblés, mais un index partiel `WHERE state='active'` accélérerait les agrégats globaux. Mineur tant que le volume est modeste.
- **🟢 `GET /api/my-alerts`** enchaîne ~5 requêtes séquentielles (sources, param subs, schémas, prefs, +auto-remplissage). Pas un N+1 (nombre fixe), mais parallélisable (`Promise.all`) si la latence devient sensible.
- **🟢 Front** : `site.js`/`site.css` chargés seulement sur la home et les pages qui en ont besoin ; `/le-point` ne charge que `theme.js` + `le-point.js` (bien). Vérifier qu'aucune page annexe ne tire `site.js` inutilement.
- **🟢 Caches en place** : release-factory (2 h), meteo-europe (20 min), Le Point (2 min), factories statuspage/vigilance. Bon réflexe généralisé.

## Axe 5 — Sécurité (complément structurel du Robot 2)

- **🟢 SSRF** : `safe-fetch.js` (validateur + poller partagés) existe. Les 44 sources en `node-fetch` direct visent des URL **officielles fixes** (pas d'entrée utilisateur) → hors périmètre SSRF. **À CONFIRMER explicitement** (🟠) : que `veille-rss`, `doomname` et le validateur `/proposer` (URL fournies par l'utilisateur) passent TOUS par `safeFetch*` — c'est le seul vrai vecteur.
- **🟢 Validation UGC** centralisée (`ugc.js` : `validateDisplayName`, `validateDeckName`, anti-URL, jetons interdits) et appliquée **côté serveur** avant stockage. Le client ne fait que du confort. Bon sens du « serveur autoritaire ».
- **🟢 Params v2** : `validateParams` honore le pattern uniquement pour les schémas internes de confiance (anti-ReDoS mentionné) ; unicité display_name par index `lower()` avec capture 23505. Solide.
- **🟠 Rate-limit** : présent sur `api`, `decks`, `dev`, `myalerts`, `subscribe`, mais **`auth.js` (OAuth callbacks) n'en a pas** de dédié (au-delà du limiter global `/api`). Les callbacks sont protégés par le `state` anti-CSRF (usage unique, TTL 10 min), donc risque faible, mais un rate-limit sur `/auth/*` fermerait la porte au bruteforce de `state`.
- **🟢 Auto-remplissage geoIP** (ce cycle) : best-effort, ne remplit que les NULL, IP non conservée, RGPD documenté. Rien à redire.

---

## Ce qui est BIEN construit (ne PAS toucher)

- Les **factories** (calendar/statuspage/vigilance/vacances) et `lib/*` (feed-parser, prefectures, safe-fetch, format-fr) : cœur sain, réutilisé partout.
- Le **contrat OpenAlert v2** (broadcast/paramétré) et son poller (transitions pures `decideTransition`, épisodes, `allSettled` à échecs isolés).
- L'**idempotence systématique** d'`init.sql` (`WHERE NOT EXISTS`, `ON CONFLICT DO NOTHING`, report d'état sur fusion) — invariant zéro-perte respecté.
- La **discipline anti-spam** (seuils stricts, jaune exclu, veille de nuit différée) et **anti-mémoire** (dates vérifiées, TODO datés).

---

## Plan de correction — lots ordonnés (chacun = un futur prompt autonome)

**Lot 1 — Index & perf DB (le plus rentable, risque quasi nul).**
`CREATE INDEX idx_subscriptions_source ON subscriptions(source_id);` + index partiel `source_param_states(state) WHERE state='active'`. Migration idempotente. Régression : nulle (ajout d'index). Mesurer le temps de cycle poller avant/après.

**Lot 2 — Source unique pour l'enum département (risque faible).**
Helper `paramsSchemaDepartement()` (depuis `geo.js`) côté JS + génération des `params_schema` géo au `migrate` plutôt qu'en dur dans `init.sql`. Vérifier octet-à-octet que le JSON produit == l'existant (invariant). Touche vigilance-meteo, seismes-departement, tour-de-france-passage.

**Lot 3 — Migration npm/pypi + meteo-belgique sur les factories (risque moyen : sources prod).**
Basculer `npm-release`/`pypi-release` sur `release-factory`, `meteo-belgique` sur `lib/meteoalarm`. Test comparatif `fetchLatest`/parsing sur des cas réels avant/après. Suppression de ~250 l. dupliquées.

**Lot 4 — Découpe des fichiers monstres (risque moyen, purement mécanique).**
`site.js` → extraire `account.js`, `kiosk.js`, `reco.js` (modules `LBA*`). `site.css` → `header.css`/`cards.css`/`account.css`/`le-point.css`. `init.sql` → `schema.sql` + `sources-*.sql` + `migrations-*.sql`. Aucune logique changée ; tester chaque page.

**Lot 5 — Convergence du rendu de carte + rate-limit `/auth` + nettoyages 🟢.**
`LBACards` seul générateur (variantes deck/collection/favori) ; rate-limit sur `/auth/*` ; retrait de l'import mort `lePointPagesRouter` ; documentation palette `tokens.css` + dépendances `LBA*` + plages `display_order`. Confirmer la couverture `safeFetch*` des sources à URL utilisateur.

**Risques de régression annoncés** : Lot 3 (comportement d'une source prod peut changer si le parsing diffère → test comparatif obligatoire) et Lot 4 (ordre de chargement des scripts / cascade CSS → tester visuellement chaque page). Lots 1-2-5 sont à faible risque.
