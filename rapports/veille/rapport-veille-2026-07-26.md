# Rapport de veille — 2026-07-26

> ⚠️ MIGRATION PROBABLEMENT NON APPLIQUÉE : colonnes manquantes en base —
> `subscribers.equipped_dashboard_skin_id`, `collections.equipped_skin_id`,
> `sources.description_long` — exécuter `node server/db/migrate.js` dans le shell Railway.
> (RAPPORT SEULEMENT : aucune migration ni `ALTER` lancé par le robot.)

## Résumé (par importance)

1. **Schéma incohérent** : 3 colonnes attendues par le code sont absentes en base (bandeau
   ci-dessus). `description_long` correspond aux commits récents (descriptions longue/courte) →
   migration poussée mais **non appliquée en prod** (symptôme connu « push ≠ déployé »).
2. **Sources en échec** : l'essentiel est du bruit attendu (SNCF_API_KEY absente,
   DataDome leboncoin). À surveiller : **grappe de timeouts INSEE BDM** (5 sources, cause commune
   probable côté lib) et **risque-secheresse : 404 VigiEau récurrent**.
3. Le reste est nominal : états figés = bruit attendu (sources inactives, caveat `checked_at`),
   sources jamais actives = saisonnier/hors-saison, collisions d'ordre = cosmétique.
4. Vitalité PanneauPocket curée : **aucune candidate** (cartes ajoutées il y a ~2 j, proxy non
   significatif). Combos orphelins : 23 (purge = décision humaine).

---

## Cohérence schéma (task e)

`schema_check.ok = false`, 45 colonnes attendues, 3 manquantes, aucun type_mismatch :

| Table | Colonne manquante |
|---|---|
| `subscribers` | `equipped_dashboard_skin_id` |
| `collections` | `equipped_skin_id` |
| `sources` | `description_long` |

`description_long` est directement lié aux commits récents (« colonne description_long +
backfill », « expose description_long dans les API »). Le code doit tolérer l'absence via
dégradation silencieuse, mais tant que `migrate.js` n'est pas exécuté à chaud, ces colonnes
restent absentes en prod. **Action Hugo : `node server/db/migrate.js` (shell Railway).**

## Sources en échec (task a)

Bruit attendu / cause connue — **ne rien faire** :
- `sncf-perturbations` (136) — `SNCF_API_KEY absente` : attendu (clé jamais posée, cf. liste de courses).
- `leboncoin-livraison` (134) — blocage anti-bot DataDome (IP datacenter) : connu et documenté.
- `ecowatt` (33) — HTTP 429 (appel trop fréquent) : throttling côté API, transitoire.
- `asteroide-frole-terre` (2) — timeout JPL : mineur, transitoire.

À surveiller (pas d'alarme, mais récurrent) :
- **Grappe INSEE BDM** : `indice-reference-loyers` (7), `prix-logements-anciens` (7),
  `inflation-insee` (6), `ipc-alimentaire` (6), `chomage-stats` (5) — toutes en
  `Timeout INSEE BDM (<idBank>)`. Même symptôme sur 5 sources partageant `lib/insee-bdm.js`
  → **cause probablement commune** (endpoint INSEE lent/instable), pas 5 pannes distinctes.
  Sources trimestrielles/mensuelles → impact réel faible, mais à re-regarder si ça persiste.
- `risque-secheresse` (13) — `Réponse HTTP inattendue VigiEau : 404`, dernier échec cette nuit.
  Récurrent ; l'API VigiEau/RegLeau a pu bouger un endpoint. Combinaisons souscrites (dépts
  06/14/16/53) `active` mais figées depuis le 19/07 → à confirmer côté API VigiEau.
- `vigicrues-departement` (15) — timeout Vigicrues, dernier échec 23/07 (s'est calmé depuis).
- `lancement-spatial` (53) — timeout Launch Library : source déjà marquée FRAGILE (API tierce sans SLA).

## États figés (task a — signal SECONDAIRE, avec caveat)

Rien de suspect. Le gros du lot `stale_states` = sources/combinaisons **inactive** avec
`checked_at` ancien : **NORMAL** tant que l'étape B (refresh en still-inactive) n'est pas
déployée (cf. caveat du script). Les entrées `active` figées ne sont corroborées par
`failing_sources` que pour `risque-secheresse` (voir ci-dessus) ; les `vigilance-meteo`
`active` figées relèvent du même caveat still-active sans réécriture. Aucun signalement.

## Jamais actives 90 j (task a)

RAS. Toutes normales : saisonnières hors-saison (Beaujolais, Black Friday, Perséides, soldes
Steam…), statuts qui ne s'activent que sur panne (statut-github/discord/cloudflare…),
événementiel daté, ou sources récemment ajoutées. Rien qui devrait s'activer souvent et reste muet.

## Collisions d'ordre d'affichage (task a — cosmétique)

12 collisions, sans urgence. Concentrées dans la plage **40–59** (sources statut + événementiel
saisonnier partageant un même `display_order`). Une seule notable côté données :
`display_order 432` = `veille-artiste-spotify` + `veille-legifrance` — rappel que
**`veille-artiste-spotify` est la ligne DB orpheline à purger** (DELETE manuel, cf. dette).
Ré-échelonnement possible un jour, non prioritaire.

## TODO calendaires ≤ 60 j (task b — jusqu'au 2026-09-24)

Échéances de **contenu actif** dans la fenêtre (les données 2026 sont en place ; il s'agit de
préparer le renouvellement annuel) :

| Fichier | Échéance dans la fenêtre | Renouvellement à préparer |
|---|---|---|
| `eclipse-solaire.js` | **2026-08-12** (éclipse partielle) | prochaine 2027-08-02 (hors fenêtre) |
| `nuits-des-etoiles.js` | 2026-08-07→09 | **TODO 2027** (édition 2027 absente) |
| `taux-livret-a.js` | 2026-08-01 (révision) | TODO révision 2027-02-01 |
| `bison-fute.js` | jours noirs août (01/08…28/08) | **TODO calendrier 2027** (à transcrire ~oct 2026) |
| `rentree-scolaire.js` | 2026-09-01 | **TODO 2027** (calendrier absent) |
| `braderie-lille.js` | 2026-09-05→06 | TODO édition 2027 |
| `fetes-juives.js` | Roch Hachana 12/09, Yom Kippour 21/09 | TODO 2027/2028 |
| `journees-patrimoine.js` | 2026-09-19→20 | calculé (nthWeekday), pas de TODO |
| `fetes-laiques.js` | équinoxe 23/09 | 2027 déjà pré-chargée |

**Aucun renouvellement n'est en rupture avant le 2026-09-24** : les dates 2026 sont présentes.
Les TODO 2027 (Bison Futé, rentrée scolaire, Nobel, fête de la science, semaine du goût…) ne
mordent pas encore la fenêtre active — à traiter au fil de l'automne, transcription officielle
obligatoire (convention anti-hallucination).

Annexe > 60 j (sans alerte) : `echeances-fiscales.js` (TF 20/10, THRS déc — TODO 2027),
`nobel-prix.js` (5-12 oct — TODO 2027), `fete-science.js` (2-12 oct — TODO 2027),
`semaine-du-gout.js` (12-18 oct — TODO 2027), `black-friday.js` (27/11, calculé).

## Slugs orphelins (task c)

RAS. Taxonomie front = `server/categories.js` (objet `GROUPS`, ~336 slugs définis). Les 142
slugs utilisés en base sont **tous** présents dans la taxonomie → **aucun orphelin**. (Les
slugs définis mais non utilisés sont normaux, non signalés.)

## Vitalité PanneauPocket curée (task f)

Jeu curé identifié dynamiquement = **19 cartes broadcast** (18 `makeCurated` + `arrosage-canal-gap`
en `createBroadcastSource`) : agenda-luc-en-diois, cantine-a2m2v, dechets-{campagne-caux,
la-saucelle, saulieu}, eau-{charles-chaigneau, coteaux-lizon, isle-dronne, provence-verte,
puisaye-forterre, regie-metz}, local-{agly-fenouilledes, buech-devoluy, chablis, chabris-bazelle},
securite-gendarmerie-{albi, bayeux, essarts}, arrosage-canal-gap. (`panneaupocket` et
`ma-collectivite` = paramétrées, exclues.)

`panneaupocket_vitality` du JSON = **`[]` (vide)** → **aucune candidate à désactivation** ce run.
C'est cohérent : ces cartes ont été ajoutées ~24/07 (il y a ~2 jours), leur `checked_at` le
confirme, et le seuil de 90 j est loin. **Le proxy `last_activated_at` n'est pas encore
significatif** à cet âge — rien à décider.

⚠️ **Limite de méthode (à énoncer)** : la base ne stocke **aucune date de publication de panneau**
(la colonne `ref` ne contient que des couples `[panneauId, hash]`). Le seul proxy est
`last_activated_at` (dernier panneau *alertable*), qui **sous-estime** la vitalité (panneaux
hors filtre thématique ou cosmétiques = aucun événement). Une vraie mesure de vitalité
nécessiterait de persister la date du dernier panneau dans `ref` — **piste proposée, non
implémentée**. Toute désactivation reste une décision humaine (jamais de modif de `enabled`).

## Combos orphelins & ids `?panneau=` (task g)

- **Combos orphelins** (`orphan_param_states`) : **23** lignes `source_param_states` dont plus
  aucun abonnement ne porte le couple `(source_id, params)` — reliquat de désabonnements
  (vigilance-meteo par dépts, risque-secheresse, ma-collectivite, iss-passages/gap…). Purge =
  **décision humaine**, aucun `DELETE` par le robot.
- **Stabilité des ids `?panneau=`** (point de vigilance ouvert, cf. `ma-collectivite.js`) : si
  PanneauPocket régénère les ids de panneau à l'édition, une simple modif apparaîtrait comme
  « nouveau ». **Non mesurable sans fetch réseau (interdit la nuit)** — signalé, sans alarme.

---

## BROUILLON — à valider par Hugo avant toute exécution

> Non validé. Le robot n'exécute rien de ce qui suit.

1. **Migration schéma** (le seul geste réellement requis) :
   ```
   node server/db/migrate.js   # shell Railway, PROD
   ```
   Puis contrôle à chaud (lecture seule) que `subscribers.equipped_dashboard_skin_id`,
   `collections.equipped_skin_id` et `sources.description_long` existent, et vérifier la ligne
   de démarrage `[poller] N source(s) chargée(s)`.
2. *(optionnel, non urgent)* Purger la ligne DB orpheline `veille-artiste-spotify` (DELETE
   manuel — `migrate.js` ne supprime pas) et, si souhaité, purger les 23 combos orphelins.
3. *(optionnel)* Regarder `lib/insee-bdm.js` si les timeouts INSEE persistent (timeout partagé /
   endpoint), et revérifier l'endpoint VigiEau de `risque-secheresse` (404 récurrent).
