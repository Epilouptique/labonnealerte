# Audit de l'état des alertes — 2026-11-17

**Méthode.** Trois sources de vérité croisées, aucune supposition :

1. `node scripts/veille-readonly.js` exécuté contre la **base de prod** (lecture seule, SELECT uniquement) → 16 sources en échec sur 7 jours, `266 sources enabled`, `40 combinaisons paramétrées`, schéma cohérent.
2. **Test réel de tous les endpoints** depuis le poste de Hugo : les 38 cartes `statut-*`, Launch Library, api-couleur-tempo, VigiEau, Hydro-Québec, Datadog (+ ses URL alternatives).
3. Lecture du code des sources concernées, de `rapports/veille/rapport-veille-2026-11-17.md` et des TODO datés de `server/sources/*.js`.

Le test depuis le poste est ce qui permet de **séparer « l'API est cassée » de « Railway n'y arrive pas »** — distinction que le robot de veille ne peut pas faire (il n'a pas le droit de sortir sur le réseau).

---

## Tableau de bord

| # | Source | Symptôme (prod) | Vu depuis le poste | Verdict |
|---|---|---|---|---|
| 1 | `statut-datadog` | 403 Forbidden, **130 échecs/7 j**, dernier succès 26/10 | **403 aussi** | 🔴 **Cassée pour de bon** |
| 2 | `rappel-conso` | — (bug fonctionnel silencieux) | API OK | 🔴 **Angle mort à corriger** |
| 3 | `ecowatt` | HTTP 429 (quota RTE), 8 échecs/7 j | n/a (clé) | 🟠 **Défaut de conception : aucun cache** |
| 4 | `lancement-spatial` | Timeout >10 s, 44 échecs/7 j | **OK, 160-450 ms, 3/3** | 🟠 Problème côté Railway / timeout trop court |
| 5 | `asteroide-frole-terre` | Timeout API JPL, 5 échecs/7 j | — | 🟠 Timeout trop court |
| 6 | `tempo` | HTTP 508 Loop Detected, 3 échecs/7 j | **OK, 48-167 ms, 3/3** | 🟠 À surveiller (hiver = source clé) |
| 7 | `sncf-perturbations` | Muette depuis toujours | — | 🟠 `SNCF_API_KEY` absente (env, pas code) |
| 8 | `versement-prestations-caf` | — | — | 🟠 **Deviendra muette en janvier 2027** |
| 9 | `grandes-causes` | — | — | 🟠 Restos du Cœur : fenêtre **fin novembre**, non datée |
| 10 | `dechets-campagne-caux` | `last_activated_at` NULL depuis juillet | — | 🟠 Carte probablement vide (décision humaine) |
| 11 | `eau-puisaye-forterre` | 69 j sans activation | — | 🟡 À surveiller |
| 12 | `brouillon-dahu-concept-fr` | `enabled`, `display_order 100` | — | 🟡 Source de test en prod |
| 13 | 10 × `statut-*` + `rappel-conso` | 2-3 timeouts groupés le 13/11 | **37/38 OK** | 🟢 Bruit réseau confirmé |
| 14 | `risque-secheresse` | 404 VigiEau, 3/7 j | **OK (200, 101 dépts)** | 🟢 Normal, déjà documenté |
| 15 | `vigilance-meteo` | 3 × ECONNREFUSED le 15/11 | — | 🟢 Transitoire, poller reparti |
| 16 | `black-friday` | « n'a jamais déclenché » | — | 🟢 **Faux positif du robot** |

**Bilan : 2 à corriger pour de vrai, 5 à améliorer, 2 décisions produit, 5 non-sujets.**

---

## 🔴 À corriger

### 1. `statut-datadog` — l'API Statuspage est fermée

`https://status.datadoghq.com/api/v2/status.json` → **403 depuis le poste de Hugo aussi**. Ce n'est donc **pas** un blocage d'IP Railway comme le supposait le rapport de veille : Datadog a fermé son API publique. `/api/v2/summary.json` et `/api/v2/components.json` sont également en 403.

Les 37 autres cartes `statut-*` répondent 200. **Datadog est le seul cas.**

Ce qui reste accessible (testé, HTTP 200) :
- `https://status.datadoghq.com/history.rss` (~31 Ko)
- `https://status.datadoghq.com/history.atom`

Mais le RSS **ne porte pas le champ `impact`** (`major`/`critical`). Impossible de reproduire la règle anti-spam actuelle « on ne notifie que les pannes majeures » : une carte branchée sur ce RSS alerterait sur **tous** les incidents, y compris mineurs. C'est contraire à l'ADN anti-spam.

**Recommandation : désactiver la carte**, en la documentant dans les « écartées » (comme Propluvia, Spotify, WHO DON). On perd 1 carte sur 38 ; on ne gagne rien de fiable en échange. Le détecteur RSS reste une option si un abonné la réclame — mais avec une dégradation de qualité assumée, à écrire noir sur blanc.

### 2. `rappel-conso` — angle mort `asphyxie` / `dommage à la vue`

Ce fix est **documenté depuis le 27/07/2026** dans `.claude/etat-projet.md` et **toujours pas appliqué** (vérifié ce matin) : la liste `GRAVE` de `server/sources/rappel-conso.js` compte 20 motifs, et **ni `asphyxi` ni `vue` n'y figurent**.

Conséquence : une fiche RappelConso dont les `risques_encourus` ne portent **que** ces motifs passe sous le radar — sur les 10 catégories, pas seulement l'automobile. C'est le seul point de cet audit où le kiosque **rate une vraie alerte de sécurité**. À traiter en premier.

---

## 🟠 À améliorer

### 3. `ecowatt` — aucun cache, donc 429 réguliers

`server/sources/ecowatt.js` appelle `digital.iservices.rte-france.com/.../ecowatt/v5/signals` **à chaque cycle de 30 min, sans aucun cache**. RTE plafonne les appels → 8 × HTTP 429 en 7 jours.

C'est un défaut de conception, pas une panne : les signaux EcoWatt ne changent que quelques fois par jour. Les autres sources du projet mettent leur succès en cache (`veille-page` 6 h, `panneaupocket` 2 h, `veille-rss` 2 h) ; EcoWatt ne le fait pas. Un cache de succès de 1 h suffit, et on entre dans l'hiver — la période où cette carte compte.

### 4 & 5. `lancement-spatial` et `asteroide-frole-terre` — `TIMEOUT_MS = 10_000` trop court

`https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=40&mode=list` répond **en 159 à 445 ms depuis le poste, 3 fois sur 3, 40 Ko**. L'API n'est donc pas en panne — contrairement à ce que conclut le rapport de veille (« API instable depuis plusieurs semaines »). Mais 44 timeouts en 7 jours côté Railway, avec un `checked_at` figé au 15 septembre : c'est l'egress Railway qui est lent ou bridé sur cet hôte, pas l'API.

Note : `2.2.0` fonctionne toujours, et `2.3.0` existe (`/2.3.0/launches/upcoming/`, testé 200). Le miroir de développement `lldev.thespacedevs.com` répond aussi 200 — utile en repli.

Même diagnostic pour `asteroide-frole-terre` (API JPL, 5 timeouts). Deux leviers : **relever le timeout** (10 s → 25 s) et **ne pas journaliser un `failed` sur le premier timeout** — c'est exactement ce que fait déjà `server/sources/lib/fail-threshold.js` (seuil N=3), branché sur `veille-rss`/`veille-page`/`veille-agenda`/PanneauPocket mais **pas** sur ces sources.

### 6. `tempo` — HTTP 508 à surveiller

3 × HTTP 508 (Loop Detected), dernier le 16/11 à 23 h. **L'API répond parfaitement depuis le poste** (48-167 ms, 3/3). Donc : soit un incident ponctuel chez l'hébergeur d'`api-couleur-tempo.fr`, soit à nouveau l'egress Railway. Pas d'action de code pour l'instant, mais tempo est **la** carte de la période novembre-mars : à re-regarder dans le rapport de veille de lundi. Rappel : le portail RTE officiel (qui remplacerait ce repli communautaire) reste à souscrire.

### 7. `sncf-perturbations` — variable d'environnement

`SNCF_API_KEY` est absente **du `.env` local et de Railway**. Le code est correct (`throw` explicite ligne 48). Rien à coder : il faut demander la clé sur le portail SNCF (`numerique.sncf.com`) et la poser sur Railway. Connu depuis juillet.

### 8 & 9. Deux échéances calendaires qui rendent une carte muette

- **`versement-prestations-caf.js` (l. 12)** : la table `VERSEMENTS[2027]` n'existe pas. Sans elle, la carte est **muette dès janvier 2027** — dans 6 semaines. Les dates CAF 2027 ne sont en général pas publiées en novembre : à surveiller sur `caf.fr`, puis transcrire.
- **`grandes-causes.js` (l. 11)** : lancement de la 42e campagne d'hiver des Restos du Cœur, « fin novembre 2026, à confirmer ». La fenêtre est **maintenant**. À confirmer sur `restosducoeur.org` et dater, sinon l'événement passe sans alerte.

Les ~130 autres TODO calendaires relevés dans `server/sources/*.js` sont de la maintenance annuelle normale (éditions 2027/2028 non encore publiées) — hors périmètre, aucune urgence.

---

## Décisions produit (pas du code)

### 10. `dechets-campagne-caux` — candidate à désactivation

`last_activated_at` **NULL depuis sa création en juillet 2026**, alors qu'un panneau de référence existe (`ref_panneau_count = 1`). Le panneau n'a donc jamais correspondu au filtre thématique « déchets ». 4 mois de carte vide.

Limite de méthode connue, à respecter : le proxy `last_activated_at` **sous-estime** la vitalité (il ne compte que les panneaux *alertables*). La vérification doit se faire **à la main dans l'appli PanneauPocket** — jamais de désactivation automatique. Si Campagne de Caux ne publie pas de calendrier de collecte, le preset de filtre est à élargir ou la carte à retirer.

### 11. `eau-puisaye-forterre` — 69 jours

Même mécanique, pas encore dans la zone des 90 jours. À regarder en même temps, sans urgence.

### 12. `brouillon-dahu-concept-fr` — source de test en prod

Présente en base, `enabled`, `display_order 100` (en collision avec `fetes-familiales`), et **absente de `init.sql`** : elle a été créée par le flux `/api/dev/submit-source`, pas par le socle. Une install neuve ne l'aurait pas. À retirer ou passer `enabled = false`, sauf si c'est volontaire.

### Hygiène (cosmétique, aucun impact fonctionnel)

- **12 collisions de `display_order`** (dont `order=51` à 3 sources, `order=56` à 3 sources).
- **25 combos orphelins** dans `source_param_states` (10 `vigilance-meteo`, 6 `ma-collectivite`, 4 `risque-secheresse`, 1 `iss-passages`, 1 `vigieau`) : reliquats normaux de désabonnements. La purge est une décision humaine.

---

## Non-sujets — à ne pas traiter

- **`risque-secheresse` (404)** : déjà diagnostiqué et documenté en tête du fichier (l. 17-19) — **fenêtre de régénération nocturne** de VigiEau, pas un changement d'API. Vérifié ce matin : HTTP 200, 101 départements. Le rapport de veille attribue ces 404 à la « fin de saison sèche » : c'est une **explication inventée**, la vraie cause est écrite dans le code.
- **`black-friday`** : le rapport affirme que le 17/11 est « le lendemain du Black Friday 2026 » et suspecte une détection ratée. **Faux.** Vérifié en exécutant la source : 4e jeudi de novembre 2026 = **25 novembre**, donc Black Friday = **vendredi 27 novembre**, et `announceDays: 5` → la carte s'active le **22 novembre**. Elle est simplement en avance de phase. Rien à corriger.
- **`pannes-hydro-quebec`** : le bug « `bisversion.json` illisible » noté dans `etat-projet.md` **est déjà corrigé** (`readVersion` accepte la chaîne nue et l'ancien `{ content }`). Endpoint testé : 200, `"20261117023021"`. RAS.
- **10 × `statut-*` + `rappel-conso` (timeouts)** : cluster de `last_failed_at` autour du 13/11 à 10h0x, et **37 des 38 endpoints répondent 200** depuis le poste. Congestion réseau ponctuelle, pas une anomalie.
- **`vigilance-meteo` (ECONNREFUSED)** : 3 occurrences le 15/11, poller reparti depuis.
- **États figés / 136 sources jamais actives** : saisonnières dormantes en novembre, paramétrées sans abonnés, combos orphelins. Bruit attendu.

---

# Prompts de correction — un par correctif

À copier tel quel dans Claude Code, dans cet ordre. Chaque prompt est autonome et finit par une vérification.

---

## Prompt 1 — `rappel-conso` : combler l'angle mort `asphyxie` / `dommage à la vue`

```
Dans server/sources/rappel-conso.js, la liste GRAVE (20 entrées) ne couvre pas les motifs
« asphyxie » ni « dommage à la vue », qui apparaissent en clair dans le champ
risques_encourus de l'API RappelConso (constatés sur des fiches réelles de la catégorie
« automobiles et moyens de déplacement »). Une fiche ne portant QUE ces motifs passe
actuellement sous le radar, sur les 10 catégories.

Travail attendu :

1. Lis server/sources/rappel-conso.js en entier, en particulier la normalisation des
   motifs (sans accent) et la façon dont GRAVE est confrontée à risques_encourus.
2. Ajoute à GRAVE les entrées manquantes, en respectant exactement la forme existante
   { kw, label } et la normalisation sans accent :
   - asphyxie / suffocation (vérifie quelle racine couvre le plus de formes réelles :
     « asphyxi » couvre asphyxie/asphyxiant)
   - dommage à la vue / lésion oculaire (choisis la ou les racines qui matchent
     réellement les libellés de l'API, pas une forme supposée)
   Ne devine aucun libellé : appelle l'API RappelConso et liste les valeurs réelles
   distinctes de risques_encourus contenant ces notions, puis choisis les racines.
3. Écris un test jetable (scripts/, hors dépôt si tu préfères) qui prouve, sur des
   libellés réels récupérés de l'API, qu'une fiche portant uniquement « asphyxie » et
   une fiche portant uniquement un dommage oculaire sont désormais retenues, et qu'aucune
   fiche anodine ne devient faussement grave (pas de régression anti-spam).
4. Vérifie node --check, puis fais tourner le check() de la source contre l'API réelle
   et montre-moi le nombre de fiches retenues avant/après, par catégorie.

Contraintes : aucune écriture en base, aucun cycle de poller. Commit dédié, message en
français sans ligne d'attribution. Montre-moi le diff avant de committer.
```

---

## Prompt 2 — `ecowatt` : cache de succès, fin des HTTP 429

```
server/sources/ecowatt.js appelle l'API RTE (ecowatt/v5/signals) à CHAQUE cycle de
30 min, sans aucun cache. RTE plafonne les appels : 8 × HTTP 429 relevés en 7 jours
en prod (dernier le 2026-11-16). Les signaux EcoWatt ne changent que quelques fois
par jour.

Travail attendu :

1. Lis server/sources/ecowatt.js, puis regarde comment les autres sources du projet
   cachent leurs succès : server/sources/veille-page.js, veille-rss.js et
   lib/panneaupocket-veille.js (TTL 6 h / 2 h / 2 h, et RETRY_MS sur échec).
   Reprends le MÊME patron, ne réinvente rien.
2. Ajoute à ecowatt un cache de succès en mémoire, TTL 1 h, et un cache d'échec court
   (RETRY_MS) pour ne pas marteler RTE après un 429.
3. Important : un 429 ne doit plus produire un 'failed' bruyant à chaque cycle. Regarde
   si server/sources/lib/fail-threshold.js (seuil N=3, déjà branché sur veille-rss,
   veille-page, veille-agenda et la fabrique panneaupocket) est le bon outil ici, et
   branche-le si oui — en respectant son contrat : recordSuccess sur TOUS les chemins
   de succès, y compris un « inactive » légitime.
4. Vérifie que le comportement d'alerte est inchangé : seuls les signaux ORANGE (2) et
   ROUGE (3) déclenchent, le since/until et le message sont identiques à l'octet près
   sur un payload RTE réel.
5. node --check + un test jetable qui simule : succès, puis 2e appel dans l'heure
   (doit servir le cache sans appel réseau), puis 429 (doit rester silencieux), puis
   3 × 429 (doit lever un incident si tu as branché le seuil).

Contraintes : aucune écriture en base, aucun cycle de poller, la clé RTE reste dans
l'environnement. Commit dédié, message en français sans ligne d'attribution.
Montre-moi le diff avant de committer.
```

---

## Prompt 3 — `lancement-spatial` + `asteroide-frole-terre` : timeouts et tolérance aux échecs

```
Deux sources accumulent des timeouts en prod alors que leurs API répondent parfaitement
depuis mon poste :
- lancement-spatial : 44 timeouts en 7 jours (TIMEOUT_MS = 10_000), checked_at figé au
  15 septembre. J'ai testé https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=40&mode=list
  depuis chez moi : 200 en 159-445 ms, 3 fois sur 3, 40 Ko de réponse. L'API n'est PAS
  en panne — c'est l'egress Railway qui est lent sur cet hôte.
- asteroide-frole-terre : 5 timeouts API JPL en 7 jours, même TIMEOUT_MS = 10_000.

Travail attendu :

1. Lis les deux fichiers. Relève TIMEOUT_MS de 10 s à 25 s dans les deux, en documentant
   la raison en commentaire daté (egress Railway lent, API mesurée à <500 ms depuis un
   poste tiers le 2026-11-17).
2. Ajoute un cache de succès à lancement-spatial s'il n'en a pas (le calendrier des
   lancements bouge peu : TTL 2 h), sur le patron de veille-rss.js.
3. Branche server/sources/lib/fail-threshold.js (seuil N=3) sur les deux sources, pour
   qu'un timeout isolé ne produise plus un 'failed' en base. Respecte son contrat :
   recordSuccess sur tous les chemins de succès, y compris un « inactive » légitime.
   Vérifie d'abord comment il est branché sur veille-rss.js et fais pareil.
4. Documente en commentaire, dans lancement-spatial.js, les deux replis identifiés et
   testés le 2026-11-17 (HTTP 200 tous les deux) — SANS les brancher :
   - API v2.3.0 : https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=40&mode=list
     (schéma différent, à valider avant bascule)
   - miroir de dev : https://lldev.thespacedevs.com/2.2.0/...
5. node --check sur les deux, puis exécute le check() réel des deux sources et montre-moi
   le résultat et le temps de réponse.

Contraintes : aucune écriture en base, aucun cycle de poller. Un seul commit pour les
deux sources (même cause, même correctif), message en français sans ligne d'attribution.
Montre-moi le diff avant de committer.
```

---

## Prompt 4 — `statut-datadog` : désactiver et documenter

```
La carte statut-datadog est cassée pour de bon : 130 échecs en 7 jours, dernier succès
le 2026-10-26. J'ai testé depuis mon poste le 2026-11-17 :
- https://status.datadoghq.com/api/v2/status.json   → 403 Forbidden
- https://status.datadoghq.com/api/v2/summary.json  → 403 Forbidden
- https://status.datadoghq.com/api/v2/components.json → 403 Forbidden
Ce n'est donc PAS un blocage d'IP Railway : Datadog a fermé son API Statuspage publique.
Les 37 autres cartes statut-* répondent 200 — Datadog est le seul cas.

Ce qui reste accessible (testé, HTTP 200) : history.rss et history.atom. Mais ces flux
ne portent AUCUN champ impact (major/critical) : impossible d'y reproduire la règle
anti-spam de lib/statuspage-factory.js (« on ne notifie que major/critical »). Une carte
branchée dessus alerterait sur tous les incidents, mineurs compris. Je ne veux pas de ça.

Décision : on désactive la carte proprement, réversiblement, et on documente.

Travail attendu :

1. Désactive la source dans server/db/init.sql sur le patron EXACT des autres sources
   désactivées (UPDATE ciblé idempotent, enabled = false), sans supprimer sa ligne ni
   son source_states : la désactivation doit rester réversible d'un UPDATE.
2. Donne-moi la requête SQL de désactivation À PART, une seule requête, prête à coller
   dans phpMyAdmin — n'en envoie pas plusieurs à la suite.
3. Garde server/sources/statut-datadog.js en place (2 lignes, inoffensif) mais ajoute en
   tête un commentaire daté expliquant le 403, les URL testées, la date du dernier succès,
   et pourquoi le repli RSS a été écarté (pas de champ impact → anti-spam impossible).
4. Ajoute statut-datadog à la liste des « ÉCARTÉES documentées » de .claude/etat-projet.md,
   au même format que Propluvia / veille-artiste-spotify / WHO DON, en précisant la
   condition de réouverture : « si Datadog réexpose un statut structuré avec niveau de
   gravité ».
5. Vérifie que la page /source/statut-datadog et le kiosque se comportent correctement
   avec une source disabled (il existe rapports/audit/sources-desactivees-affichage-2026-10-09.md
   sur ce sujet : lis-le avant).

Contraintes : aucune exécution SQL de ta part, c'est moi qui lance le migrate. Commit
dédié, message en français sans ligne d'attribution. Montre-moi le diff avant de committer.
```

---

## Prompt 5 — les deux échéances calendaires

```
Deux sources vont devenir muettes si rien n'est fait, l'une dans les jours qui viennent,
l'autre en janvier.

A. server/sources/grandes-causes.js (l. 11) — TODO « Restos du Cœur, lancement de la 42e
   campagne d'hiver, fin novembre 2026, à confirmer ». La fenêtre est MAINTENANT
   (nous sommes le 17 novembre).
B. server/sources/versement-prestations-caf.js (l. 12) — TODO « table VERSEMENTS[2027] à
   construire avant janvier 2027 ». Sans elle, la carte est muette dès janvier.

Travail attendu, dans cet ordre :

1. Pour les Restos du Cœur : va chercher la date OFFICIELLE du lancement de la campagne
   d'hiver 2026-2027 sur restosducoeur.org (et seulement là, ou sur un communiqué de
   presse de l'association). Si et seulement si tu trouves une date ferme et sourcée,
   transcris-la dans la config de grandes-causes.js au format exact des entrées
   existantes, avec l'URL de la source en commentaire. Si aucune date ferme n'est publiée :
   NE RIEN INVENTER, laisser le TODO, et me dire précisément ce que tu as trouvé ou pas.
   La règle du projet est « jamais de date inventée » — elle prime.

2. Pour la CAF : va voir si le calendrier des dates de versement 2027 est publié sur
   caf.fr. Si oui, construis VERSEMENTS[2027] au format exact de VERSEMENTS[2026], avec
   l'URL source en commentaire, et vérifie qu'aucune date n'est extrapolée. Si non
   publié : laisse le TODO, mais mets à jour le commentaire en tête du fichier avec la
   date de ta vérification (2026-11-17) et ce que tu as constaté, pour que la prochaine
   relecture ne reparte pas de zéro.

3. Dans les deux cas : node --check, puis exécute upcoming() de chaque source et
   montre-moi les événements renvoyés pour les 90 prochains jours, que je vérifie les
   dates à l'œil.

Contraintes : aucune date déduite, calculée ou « probable » — uniquement du transcrit
depuis une publication officielle. Aucune écriture en base. Un commit par source,
messages en français sans ligne d'attribution. Montre-moi les diffs avant de committer.
```

---

## Prompt 6 — hygiène : source de test, collisions d'ordre, combos orphelins

```
Trois points d'hygiène relevés dans l'audit des alertes du 2026-11-17, à traiter en
lecture d'abord, écriture seulement sur mon accord.

A. La source brouillon-dahu-concept-fr est enabled en prod, display_order 100 (en
   collision avec fetes-familiales), et ABSENTE de server/db/init.sql — elle a donc été
   créée par le flux /api/dev/submit-source, pas par le socle. Une install neuve ne
   l'aurait pas.
B. 12 collisions de display_order en base (dont order=51 à 3 sources : black-friday,
   soldes, statut-zoom ; order=56 à 3 sources : eclipse-solaire, geminides,
   nuits-des-etoiles). Cosmétique, aucun impact fonctionnel.
C. 25 combos orphelins dans source_param_states (sans abonnement actif correspondant) :
   10 vigilance-meteo, 6 ma-collectivite, 4 risque-secheresse, 1 iss-passages, 1 vigieau.

Travail attendu :

1. En LECTURE SEULE contre la base de prod (sur le patron de scripts/veille-readonly.js :
   SELECT uniquement, jamais d'écriture, jamais runCycle) : sors-moi la fiche complète de
   brouillon-dahu-concept-fr — created_at, abonnements actifs, points attribués, instances
   paramétrées, likes, présence dans un deck. Je veux savoir si quelqu'un y est abonné
   avant de décider.
2. Propose-moi, sans l'exécuter, la requête de désactivation (enabled = false, PAS de
   DELETE) et dis-moi si un DELETE serait sûr au vu du point 1. Une seule requête SQL
   à la fois dans ta réponse : mon phpMyAdmin n'affiche que la première quand plusieurs
   sont envoyées ensemble.
3. Pour les collisions de display_order : liste les 12, propose un rééchelonnement
   minimal (le moins de lignes touchées possible, ordre d'affichage actuel préservé au
   maximum) et donne-le sous forme d'UPDATE, une requête à la fois. N'exécute rien.
4. Pour les 25 combos orphelins : vérifie dans server/poller.js ce que coûte réellement
   un combo orphelin (est-il recalculé à chaque cycle, ou ignoré faute d'abonnement ?).
   Si le coût est nul, dis-le franchement et recommande de ne rien purger. Si le coût
   est réel, propose la requête de purge avec ses garde-fous, sans l'exécuter.

Contraintes : ZÉRO écriture en base de ta part, c'est moi qui exécute le SQL. Aucun
commit sur ce prompt sauf si tu touches du code — et dans ce cas, diff d'abord.
```

---

## Deux actions qui ne passent pas par Claude Code

1. **`SNCF_API_KEY`** — demander la clé sur `numerique.sncf.com`, puis la poser dans les variables Railway. Le code est déjà correct, rien à committer. Débloque `sncf-perturbations`, muette depuis juillet.
2. **PanneauPocket** — ouvrir l'appli et vérifier à la main si **Campagne de Caux** publie réellement des panneaux de collecte de déchets (carte vide depuis 4 mois), et jeter un œil à **Puisaye-Forterre** (69 jours). Jamais de désactivation automatique : le proxy `last_activated_at` sous-estime la vitalité.

---

## Remarque sur le robot de veille

Le rapport du 17/11 est globalement juste, mais trois écarts méritent d'être corrigés dans `robots/robot1-veille.prompt.md` :

- Il a **inventé deux explications** plausibles mais fausses : la « fin de saison sèche » pour les 404 VigiEau (la vraie cause, fenêtre de régénération nocturne, est écrite en tête du fichier source) et le « blocage IP de Railway » pour Datadog (le 403 se reproduit depuis n'importe quelle IP).
- Il a **affirmé une date fausse** (« Black Friday, hier ! » le 17 novembre, alors qu'il tombe le 27) et en a tiré un soupçon de bug. Le robot ne devrait jamais avancer une date d'événement sans l'avoir calculée en exécutant la source.
- Il a **omis `ecowatt` (8 × HTTP 429)** de sa section « sources en échec », alors que c'est le 3e plus gros compteur de la semaine et un vrai défaut de conception. Il a aussi passé `asteroide-frole-terre` sous silence.

Piste : lui interdire d'expliquer une erreur autrement qu'en citant le code ou un rapport existant, et lui imposer de lister **toutes** les lignes de `failing_sources` avant de les commenter.
