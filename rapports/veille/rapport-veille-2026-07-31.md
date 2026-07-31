# Rapport de veille — 2026-07-31 (Robot 1, lecture seule)

Généré à partir de `node scripts/veille-readonly.js` (run 2026-07-31T02:00Z) + lecture
du code. Aucune écriture hors ce fichier, aucune requête SQL directe, aucun `runCycle()`.
Cadre : **265 sources enabled**, **34 combinaisons paramétrées** souscrites.

## Résumé (par importance)

1. **Cluster INSEE HTTP 500** — 5 sources adossées à INSEE SDMX (`inflation-insee`,
   `chomage-stats`, `ipc-alimentaire`, `indice-reference-loyers`, `prix-logements-anciens`)
   échouent toutes en **500** cette nuit (9–12 échecs chacune). Signature commune =
   panne amont INSEE probable, **à confirmer qu'elle se résorbe** (pas de code à toucher).
2. **`risque-secheresse` : VigiEau 404 récurrent** (17 échecs, dernier 01:31). À vérifier
   côté endpoint — signal bas/moyen, isolé (le reste des sources eau va bien).
3. **Tout le reste des `failing_sources` = connu/attendu ou transitoire** : SNCF_API_KEY
   absente, DataDome leboncoin (observation silencieuse), EcoWatt 429, timeouts épars.
4. Schéma **cohérent** (aucune migration en attente). Slugs orphelins : **aucun**.
   Cartes PanneauPocket curées : **aucune candidate à désactivation** (toutes très récentes).
5. 1 TODO calendaire ≤ 60 j : **`courses-mythiques`** (config vide, à renseigner ~septembre).

---

## Cohérence schéma
`schema_check.ok = true` (55 colonnes attendues, 0 manquante, 0 type inattendu). **RAS** —
aucune migration à lancer.

## Sources en échec (`failing_sources`)

**Attendu / connu — aucune action :**
- `sncf-perturbations` (141) — `SNCF_API_KEY absente`. Documenté (var Railway non posée), pas un bug.
- `leboncoin-livraison` (55) — blocage DataDome sur IP datacenter. Phase d'observation silencieuse assumée.
- `ecowatt` (41) — HTTP 429 (appel trop fréquent, repli au cycle suivant). Throttling normal.

**À surveiller (probable amont, bas/moyen) :**
- **INSEE 500 ×5** — `inflation-insee` (11), `chomage-stats` (10), `ipc-alimentaire` (9),
  `indice-reference-loyers` (11), `prix-logements-anciens` (12). Toutes via `lib/insee-bdm.js`,
  séries distinctes, même code 500 la même nuit → **panne INSEE côté serveur la plus probable**
  (pas une régression de code : sinon toutes les séries échoueraient de la même façon depuis
  plus longtemps). À reconfirmer au prochain run : si le 500 persiste plusieurs jours, ouvrir
  un ticket endpoint. Aucune notification n'est envoyée (échec → inactive, pas de faux positif).
- **`risque-secheresse`** (17) — `Réponse HTTP inattendue VigiEau : 404`. Récurrent. À vérifier
  que l'endpoint VigiEau/RegLeau n'a pas bougé. Isolé (la source `vigieau` n'apparaît pas en échec).

**Transitoire — bruit :**
- `lancement-spatial` (36, timeout Launch Library), `vigicrues-departement` (3, timeout),
  `aurores-france` (10) & `tempete-solaire` (8) (`Unexpected end of JSON input` = réponse NOAA
  tronquée), `asteroide-frole-terre` (2, JPL 503), `statut-twitch`/`statut-airtable`/`statut-scaleway`
  (2–3, timeouts). Rien de structurel.

## États figés (`stale_states`) — bruit attendu
Le `caveat` du script s'applique : `checked_at` n'est rafraîchi que sur écriture. La très
grande majorité des entrées figées sont des sources **inactive** (saisonnières, dormantes,
statuts cloud calmes) — **NORMAL**. Les seules entrées `active` figées
(`vigilance-meteo` dépts 13/24/31/33/35/38/44/67/74/75/83, `risque-secheresse` 06/14/16/53,
`rappel-conso` alimentation/bébés-enfants, `iss-passages` gap) correspondent à des états
persistants légitimes, non corroborés par `failing_sources` (hors `risque-secheresse`, déjà
traité ci-dessus). **Aucune alarme.**

## Jamais actives 90 j (`never_active_90d`) — non pertinent ce run
Toutes les sources listées ont été créées entre le **11 et le 24 juillet 2026** (projet âgé
de < 3 semaines). « Jamais activée en 90 j » est donc trivialement vrai pour tout le socle —
**aucun signal exploitable** tant qu'on n'a pas 90 j d'historique. À rejouer plus tard.

## Collisions d'ordre d'affichage (`display_order_collisions`) — cosmétique
11 collisions, toutes dans la plage **40–59**, systématiquement entre une source `statut-*`
(statut cloud) et une source thématique (ex. `40` doomname/statut-github, `51`
black-friday/soldes/statut-zoom, `56` eclipse-solaire/geminides/nuits-des-etoiles). Ressemble
à deux schémas d'ordre historiques qui se chevauchent. Sans urgence ; un ré-échelonnement des
`statut-*` sur une plage dédiée lèverait l'ambiguïté si l'ordre d'affichage devient gênant.

## TODO calendaires ≤ 60 jours (fenêtre → ~29/09/2026)

- **`courses-mythiques`** — `COURSES = []` (config **VIDE**). Commentaire en tête :
  « ⚠️ TODO septembre 2026 : transcrire les dates officielles » (à l'ouverture des inscriptions
  Marathon/Semi de Paris). La source reste **muette** jusque-là. C'est le seul TODO dont
  l'échéance d'action tombe dans les 60 jours. Rien à inventer avant confirmation officielle.

**Événements datés 2026 déjà présents et corrects (fonctionnement normal, pas d'action) :**
`allocation-rentree-scolaire` (19 août / 5 août Réunion-Mayotte — après quoi la source se tait
jusqu'au TODO 2027, mi-août), `bison-fute` (table `JOURS_2026` jusqu'au 28/08/2026 inclus, puis
silence jusqu'au TODO début 2027), `rentree-scolaire`, `journees-patrimoine` (19–20 sept),
`braderie-lille` (5–6 sept). Ces cartes ont leurs dates 2026 codées — elles se déclencheront
seules, aucun renouvellement requis sous 60 j.

**Annexe (au-delà de 60 j, pour mémoire, pas d'alerte) :** `echeances-fiscales` (TF 15/10,
TH 15/12 — présentes pour 2026), `bourses-scolaires` (limite 15/10/2026 — présente),
`cfe-entreprises` (déc. 2026), `tour-de-france-passage` (config vide, TODO octobre), et une
longue série de TODO **2027** (Bison Futé, ARS, CFE, CROUS/bourses 2027-2028, carnavals,
cérémonies, fashion-week, élections présidentielle 2027, etc.).

## Slugs orphelins — RAS
Croisement de `category_slugs` (145 slugs réellement portés en base) avec la taxonomie fermée
définie dans **`server/categories.js`** (`GROUPS`/`VALID_SLUGS`) : **tous les slugs de la base
sont définis** dans la taxonomie. Aucune carte ne s'affichera avec un slug brut. (Le sens
inverse — slugs définis mais non portés — est normal et non signalé.)

## Vitalité PanneauPocket curée (Vague L)

Jeu curé identifié dynamiquement (fichiers `server/sources/*.js` requérant
`./lib/panneaupocket-veille` via `makeCurated` ou `createBroadcastSource`, hors `panneaupocket`
et `ma-collectivite` qui sont paramétrées) = **19 cartes broadcast** :
`arrosage-canal-gap`, `eau-regie-metz`, `eau-provence-verte`, `eau-isle-dronne`,
`eau-charles-chaigneau`, `eau-puisaye-forterre`, `eau-coteaux-lizon`, `dechets-saulieu`,
`dechets-la-saucelle`, `dechets-campagne-caux`, `securite-gendarmerie-albi`,
`securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts`, `local-chablis`,
`local-agly-fenouilledes`, `local-buech-devoluy`, `local-chabris-bazelle`,
`agenda-luc-en-diois`, `cantine-a2m2v`.

**Constat :** la section `panneaupocket_vitality` du JSON est **vide (`[]`)** ce run — aucun
proxy `last_activated_at` renvoyé pour le jeu curé. Indépendamment, ces 19 cartes apparaissent
toutes dans `source_states` en `inactive` avec `checked_at` au **24/07/2026** (créées il y a
~7 jours), jamais activées. **Aucune ne dépasse donc le seuil de 90 j → aucune candidate à
désactivation ce run.**

**Limite de méthode (à énoncer telle quelle) :** la base ne stocke aucune date de publication
de panneau (`ref` = couples `[panneauId, hash]`). Le seul proxy serait `last_activated_at`
(dernier panneau *alertable*), qui **sous-estime** la vitalité (panneaux hors filtre thématique
ou cosmétiques ne produisent aucun événement). La vraie « date du dernier panneau » n'est pas
dérivable sans requêter PanneauPocket — interdit la nuit. **Point ouvert pour Hugo :** vérifier
pourquoi `panneaupocket_vitality` ressort vide (probable `last_activated_at` NULL sur tous ces
broadcasts fraîchement amorcés) ; si l'on veut une mesure fiable à terme, persister la date du
dernier panneau vu dans `ref` (proposition, non implémentée).

## Combos orphelins & stabilité des ids `?panneau=`

- **Combos orphelins** (`orphan_param_states`) : **23** lignes `source_param_states` sans
  abonnement correspondant (reliquat de désabonnements) — principalement `vigilance-meteo`
  (dépts), `risque-secheresse` (dépts), `rappel-conso` (catégories), `ma-collectivite` (URLs),
  `iss-passages` (gap). **Purge = décision humaine**, aucun `DELETE` de ma part. Rappelé pour
  information ; volume faible, non bloquant.
- **Stabilité des ids `?panneau=`** (point de vigilance consigné en tête de
  `server/sources/ma-collectivite.js`) : si PanneauPocket régénère les ids de panneau à
  l'édition, une simple modification apparaîtrait comme un « nouveau » panneau. **Non mesurable
  sans fetch réseau (interdit)** → point de vigilance ouvert, sans alarme.

---

*Fin du rapport. Robot 1 — lecture seule, aucune modification effectuée.*
