# Rapport de veille — 2026-07-22

_Robot 1 (lecture seule). Source : `node scripts/veille-readonly.js` (généré 2026-07-22T02:00Z). 232 sources activées, 22 combinaisons paramétrées._

## Résumé (l'essentiel)

1. **RAS majeur** : aucune régression franche. Les 2 plus gros compteurs d'échec (SNCF, leboncoin) sont des causes **connues et attendues**.
2. **À regarder (bas niveau)** : `risque-secheresse` renvoie des **HTTP 404 VigiEau** sur la variante broadcast (params null) — possible évolution d'endpoint ; les combinaisons paramétrées, elles, restent `active`.
3. **Slugs orphelins : aucun.** Tous les slugs utilisés en base existent dans la taxonomie `server/categories.js`.
4. **TODO calendaires : aucune échéance de renouvellement ne tombe sous 60 jours.** Quelques fichiers saisonniers arrivent en fin de données 2026 (août-sept, normal) ; toutes les actions de renouvellement sont datées 2027.
5. **Cosmétique** : 11 collisions de `display_order` (plage 40-59), sans urgence.

---

## Sources en échec (`failing_sources`)

| Source | Échecs/7j | Dernier message | Lecture |
|---|---|---|---|
| `sncf-perturbations` | 135 | `SNCF_API_KEY absente` | **Attendu** — clé non souscrite (liste de courses #5). Pas une panne. |
| `leboncoin-livraison` | 133 | Blocage anti-bot (IP datacenter) | **Attendu** — DataDome par vagues, scraper documenté. Pas une panne. |
| `lancement-spatial` | 60 | Timeout Launch Library (>10 s) | Transitoire (API tierce). Dernier échec 2026-07-21 18:00. À surveiller si persiste. |
| `ecowatt` | 37 | HTTP 429 (appel trop fréquent) | Throttling géré (« prochain cycle »). EcoWatt muet en été (pas de tension) = normal. Signal bas. |
| `vigicrues-05` | 18 | Timeout Vigicrues (>10 s) | Transitoire. **Dernier échec 2026-07-16** (aucun depuis 6 j) → résorbé. |
| `vigicrues-departement` | 7 | Timeout Vigicrues (>10 s) | Transitoire, API tierce. Bas niveau. |
| `risque-secheresse` | 6 | **HTTP 404 VigiEau** | ⚠️ **À examiner (bas-moyen)** — voir ci-dessous. |
| `statut-twitch` | 2 | Timeout status.twitch.tv (>10 s) | Transitoire. Dernier échec 2026-07-17. Négligeable. |

### Point d'attention : `risque-secheresse` (404 VigiEau)
- 6 échecs, dernier **2026-07-22 01:31** (récent, récurrent).
- Le 404 frappe la variante **broadcast** (`params: null`). En parallèle, les **combinaisons paramétrées** (`departement` 06/14/16/53) sont bien passées `active` le 2026-07-19 → l'API répond pour les appels par département.
- Hypothèse : l'appel sans département (broadcast) cible un endpoint/paramètre que VigiEau/RegLeau ne sert plus (404 ≠ timeout). Propluvia étant mort (cf. état-projet), un changement côté VigiEau est plausible.
- **Action Robot 1 : signaler uniquement.** Vérification réelle de l'endpoint = appel réseau sortant → **interdit**. À trancher par Hugo (voir brouillon en fin de rapport).

---

## États figés (`stale_states`) — signal SECONDAIRE

Rappel du **caveat** du script : `checked_at` n'est réécrit que sur transition (`write:true`) ; un `checked_at` ancien sur une entrée **inactive** est **NORMAL** tant que l'étape B n'est pas déployée. Rien à signaler côté inactives.

**Entrées `active` figées au 2026-07-14 23:04** : `vigilance-meteo` départements 31, 33, 35, 38, 44, 67, 74, 75, 83.
- **Non corroboré par `failing_sources`** (vigilance-meteo n'échoue pas). Le poller tourne : d'autres départements ont des écritures récentes (13 le 19/07, 05/69 le 17/07, 10/16 le 16/07).
- Lecture : ces départements sont en **vigilance persistante** (jaune/orage/canicule d'été) sans transition depuis le 14/07, donc `checked_at` non rafraîchi **par design**. **Pas d'alarme.**

Toutes les autres entrées stale sont des sources/combinaisons inactives → bruit attendu.

---

## Jamais actives 90 j (`never_active_90d`) — signal non exploitable

La base a été créée à partir du **2026-07-11** (`created_at` les plus anciens). **Aucune source n'a 90 jours d'ancienneté** : la liste contient donc quasiment tout le catalogue. Signal **entièrement attendu, non exploitable en l'état**. Le contenu (soldes, Beaujolais, Perséides, statuts de services, sources ajoutées cette semaine…) est cohérent avec des sources saisonnières ou récentes. **RAS.**

---

## Collisions d'ordre d'affichage (`display_order_collisions`) — cosmétique

11 collisions dans la plage **40-59**, appariant surtout une source de statut avec un événement :

| ordre | sources |
|---|---|
| 40 | doomname, statut-github |
| 42 | statut-npm, statut-openai |
| 43 | statut-discord, statut-vercel |
| 50 | changement-heure, statut-twitch |
| 51 | black-friday, soldes, statut-zoom |
| 52 | perseides, statut-canva |
| 53 | beaujolais-nouveau, statut-dropbox |
| 54 | soldes-steam, statut-slack |
| 55 | aurores-france, cert-fr-alertes |
| 56 | eclipse-solaire, geminides, nuits-des-etoiles |
| 59 | echeances-fiscales, journees-patrimoine |

Purement esthétique (ordre de tri à égalité). Un ré-échelonnement de la plage 40-59 réglerait le point ; **sans urgence**.

---

## TODO calendaires (échéances ≤ 60 j, avant 2026-09-20)

**Constat principal : aucune action de renouvellement ne tombe dans la fenêtre de 60 jours.** Toutes les échéances 2026 restantes correspondent à des événements qui se déclencheront **normalement** ; les TODO de renouvellement sont datés **2027** (ou les données de l'année suivante ne sont pas encore publiées côté source officielle).

### Fichiers arrivant en fin de données 2026 sous 60 j (fin saisonnière normale — pour information)
- `nuits-des-etoiles.js` — dernière date 2026-08-09, puis dormant (édition 2027 à ajouter en 2027).
- `allocation-rentree-scolaire.js` — versement 2026-08-19, puis dormant.
- `bison-fute.js` — dernière date 2026-08-28, puis **plus de données trafic jusqu'au calendrier 2027** (non encore publié ; TODO « début 2027 »). À garder en tête : gap possible sept-déc 2026.
- `rentree-scolaire.js` — 2026-09-01, puis dormant (arrêté calendrier 2027 à paraître).

### Événements qui se déclencheront dans/juste après la fenêtre (fonctionnement normal, aucune action)
- `braderie-lille.js` — 2026-09-05/06.
- `fetes-juives.js` — Roch Hachana 2026-09-12, Yom Kippour 2026-09-21.
- `gastronomie-terroir.js` — Foire de Châlons dès 2026-08-28 ; `patrimoine-nature.js` — Nuit de la chauve-souris 2026-08-29/30 ; `entrepreneuriat-seniors.js` — GO Entrepreneurs Lyon 2026-09-24.

### Point de vigilance daté (> 60 j mais à ne pas rater)
- `versement-prestations-caf.js` — **table 2027 à construire avant le 2027-01-01** (échéance ferme, hors fenêtre 60 j mais bloquante). À planifier en décembre.

### Annexe (au-delà de 60 j / auto-calculés, aucune alerte)
`echeances-fiscales` (TF 2026-10-20, TH 2026-12-20 ; TODO 2027) · `semaine-du-gout` (10-2026) · `fete-science` (10-2026) · `nobel-prix` (10-2026) · `grandes-marees` (fin 10-2026, TODO 2027) · `rdv-gaming` (10/12-2026) · `prime-noel` (2026-12-16) · `cheque-energie` · `cfe-entreprises` (2026-12-15) · `bourses-scolaires` · `civisme-solidarite` (SEEPH 11-2026) · `taux-livret-a` (révision 2027-02-01) · `parcoursup`/`crous-dse` (session 2026 close, 2027 non publiée). Sources auto-calculées sans TODO : `soldes`, `journees-patrimoine`, `beaujolais-nouveau`, `black-friday`, `changement-heure`, `saint-nicolas`, `perseides`, `geminides`, `smic-revalorisation`.

---

## Slugs orphelins — RAS

Croisement des **139 slugs utilisés en base** (`category_slugs`) avec la taxonomie fermée définie dans **`server/categories.js`** (objet `GROUPS` / `VALID_SLUGS`) : **chaque slug utilisé possède une définition**. Aucun slug ne s'affichera en libellé brut. (L'inverse — slugs définis mais non utilisés — est normal et non signalé.)

---

## BROUILLON — à valider par Hugo avant toute exécution

> _Non validé, jamais exécuté par Robot 1. Décrit une piste de correctif possible._

**Objet : `risque-secheresse` — 404 VigiEau sur la variante broadcast (params null).**

Piste à examiner (hors ligne, sans appel réseau depuis un agent) :
1. Ouvrir `server/sources/risque-secheresse.js` et comparer l'URL/le paramétrage de l'appel **sans département** (broadcast) avec celui des appels **par département** (qui, eux, répondent — combinaisons 06/14/16/53 `active`).
2. Vérifier manuellement, côté navigateur/hors prod, que l'endpoint VigiEau/RegLeau du cas broadcast existe toujours (les 404 sont apparus alors que Propluvia est mort — évolution d'API plausible).
3. Deux issues possibles : (a) corriger l'URL/paramètre du cas broadcast ; (b) si VigiEau ne sert plus de vue nationale, **désactiver la variante broadcast** et ne conserver que le mode paramétré par département (déjà fonctionnel).

À trancher par Hugo. Aucune modification effectuée.
