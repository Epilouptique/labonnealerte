# Rapport de veille — 2026-07-28

*Robot 1 (lecture seule). Généré à partir de `node scripts/veille-readonly.js` (run 02:00 UTC) + lecture de `server/sources/*.js` et `server/categories.js`. Aucune écriture hors ce fichier, aucune connexion DB directe, aucun `runCycle`.*

Cadre : 263 sources enabled, 32 combinaisons paramétrées souscrites.

## Résumé

1. **Schéma cohérent** — `schema_check.ok = true` (50 colonnes attendues, 0 manquante, 0 type inattendu). Aucune migration en attente. Pas de bandeau.
2. **Sources en échec : rien d'anormal.** Toutes les entrées `failing_sources` ont une cause connue/attendue (clés absentes, DataDome, timeouts transitoires d'API tierces). Seul point à garder à l'œil, niveau bas : `risque-secheresse` renvoie un **404 VigiEau** récurrent (15 échecs, dernier ce matin 01:31).
3. **Vitalité PanneauPocket curée : RAS ce run** — 19 cartes curées identifiées, section `panneaupocket_vitality` vide. Cartes semées il y a 4 jours (2026-07-24) → le proxy 90 j ne peut pas encore se déclencher.
4. **Calendaires : aucun renouvellement requis sous 60 jours.** Les configs 2026 couvrent la fenêtre ; les renouvellements annuels tombent tous début 2027 (annexe).
5. **Bruit attendu** : `stale_states`, `never_active_90d` (projet ~2 semaines), collisions d'ordre cosmétiques, 23 combos orphelins — détaillés ci-dessous, aucune action automatique.

## Cohérence schéma

`schema_check.ok = true` — schéma cohérent, RAS.

## Sources en échec (`failing_sources`)

| Source | Échecs (7 j) | Dernier message | Diagnostic |
|---|---|---|---|
| `sncf-perturbations` | 139 | `SNCF_API_KEY absente` | **Attendu** — clé non configurée sur Railway (connu, cf. état projet). Pas une régression. |
| `leboncoin-livraison` | 111 | Blocage anti-bot DataDome | **Attendu** — IP datacenter Railway, phase observation silencieuse assumée. |
| `ecowatt` | 38 | HTTP 429 (trop fréquent) | Transitoire, throttling côté RTE. Hors saison de tension. Bénin. |
| `lancement-spatial` | 36 | Timeout Launch Library (>10 s) | API communautaire lente. Bénin, se rétablit seul. |
| `risque-secheresse` | 15 | **404 VigiEau** | ⚠️ **niveau bas** — endpoint qui répond 404, dernier échec 2026-07-28 01:31 (récurrent). Peut signaler un changement d'URL/API VigiEau. À confirmer par Hugo (les combos souscrites 06/14/16/53 restent `active` mais figées). |
| `vigicrues-departement` | 15 | Timeout Vigicrues (>10 s) | Transitoire API tierce. Bénin. |
| `indice-reference-loyers`, `prix-logements-anciens`, `inflation-insee`, `ipc-alimentaire`, `chomage-stats` | 5–7 | Timeout INSEE BDM | **Grappe INSEE BDM** — timeouts groupés (25/07 midi), API INSEE lente. Transitoire, publications mensuelles/trimestrielles. Bénin. |
| `asteroide-frole-terre` | 3 | JPL 503 Service Unavailable | Transitoire côté JPL. Bénin. |

**Bilan** : aucune vraie régression. Le seul à surveiller est `risque-secheresse` (404 persistant, à trancher par un humain).

## États figés (`stale_states`) — bruit attendu

~150 entrées, en quasi-totalité des sources `inactive` dont le `checked_at` n'est pas rafraîchi tant que l'étape B n'est pas déployée (cf. `caveat`). Les combos `vigilance-meteo` / `rappel-conso` / `risque-secheresse` `active` figés au 14–19 juillet correspondent aux mêmes combos orphelins listés plus bas (plus aucun abonné → non recalculés). **Aucune entrée `stale` n'est corroborée par `failing_sources` de façon suspecte.** Rien à signaler.

## Jamais actives 90 j (`never_active_90d`) — bruit attendu

Toutes les sources listées ont été créées entre le 11 et le 26 juillet 2026 : le projet a ~2 semaines, « jamais activée depuis 90 j » est trivialement vrai pour l'ensemble non encore déclenché (événements saisonniers, statuts rarement en panne, sources récentes). Rien d'anormal.

## Collisions d'ordre d'affichage (`display_order_collisions`) — cosmétique

11 collisions, toutes dans la plage `display_order` 40–59, entre sources socle et pages « statut » :

`40` doomname/statut-github · `42` statut-npm/statut-openai · `43` statut-discord/statut-vercel · `50` changement-heure/statut-twitch · `51` black-friday/soldes/statut-zoom · `52` perseides/statut-canva · `53` beaujolais-nouveau/statut-dropbox · `54` soldes-steam/statut-slack · `55` aurores-france/cert-fr-alertes · `56` eclipse-solaire/geminides/nuits-des-etoiles · `59` echeances-fiscales/journees-patrimoine.

Sans urgence. Un ré-échelonnement de la plage 40–59 lèverait l'ambiguïté d'ordre si Hugo le souhaite.

## TODO calendaires ≤ 60 jours (fenêtre 2026-07-28 → 2026-09-26)

**Aucun renouvellement requis dans les 60 jours.** Les configurations 2026 couvrent déjà la fenêtre et se déclencheront correctement pour les événements à venir (Perséides 12/08, éclipse solaire 12/08, Nuits des Étoiles 07–09/08, Assomption 15/08, jours Bison Futé d'août, ARS 19/08, braderie de Lille 05–07/09, Roch Hachana/Yom Kippour 12 & 21/09, équinoxe 23/09, rentrée 01/09). Ce sont des dates **actives**, pas des actions.

### Annexe — renouvellements au-delà de 60 j (aucune urgence)
- `bison-fute.js` — `JOURS_2026`, TODO calendrier 2027 (début 2027).
- `nuits-des-etoiles.js` — édition 2027 à ajouter (début 2027, dès publication AFA).
- `allocation-rentree-scolaire.js` — dates 2027 (début 2027).
- `rentree-scolaire.js` — calendrier 2027 (début 2027).
- `braderie-lille.js` — dates 2027 à confirmer.
- `taux-livret-a.js` — prochaine révision de taux 2027-02-01.
- `echeances-fiscales.js` — TF en ligne ~20/10/2026 (juste hors fenêtre 60 j).

## Slugs orphelins — aucun

Taxonomie définie dans **`server/categories.js`** (objet `GROUPS`). Les 140 slugs réellement utilisés en base (`category_slugs`) sont **tous** définis dans la taxonomie. Aucun orphelin, aucune carte n'affichera un slug brut.

## Vitalité PanneauPocket curée (Vague L)

Jeu curé identifié dynamiquement (19 cartes broadcast `require('./lib/panneaupocket-veille')`, via `makeCurated()`/`createBroadcastSource()`, hors `panneaupocket` et `ma-collectivite` paramétrées) :
`agenda-luc-en-diois`, `cantine-a2m2v`, `local-chabris-bazelle`, `local-agly-fenouilledes`, `local-buech-devoluy`, `local-chablis`, `securite-gendarmerie-albi`, `securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts`, `dechets-campagne-caux`, `dechets-la-saucelle`, `dechets-saulieu`, `eau-coteaux-lizon`, `eau-puisaye-forterre`, `eau-charles-chaigneau`, `eau-isle-dronne`, `eau-provence-verte`, `eau-regie-metz`, `arrosage-canal-gap`.

**Résultat : `panneaupocket_vitality` vide → aucune carte candidate à désactivation ce run.** Les cartes ont été semées le 2026-07-24 (il y a 4 jours) ; le seuil de 90 j sans panneau ne peut structurellement pas encore se déclencher.

**Limite de méthode (rappel)** : la base ne stocke aucune date de publication de panneau (la colonne `ref` ne contient que des couples `[panneauId, hash]`). Le seul proxy disponible est `last_activated_at` (dernier panneau *alertable*), qui **sous-estime** la vitalité (panneaux hors filtre thématique ou cosmétiques n'y apparaissent pas). Une vraie mesure exigerait de requêter PanneauPocket (interdit la nuit). **Proposition (non implémentée)** : persister dans `ref` la date du dernier panneau vu (même hors filtre thématique) pour disposer d'un proxy de vitalité fiable — à décider par Hugo. Toute désactivation reste une **décision humaine** ; jamais de modification de `enabled` par le robot.

## Combos orphelins & stabilité des ids `?panneau=`

- **Combos orphelins** (`orphan_param_states`) : **23 lignes** `source_param_states` dont plus aucun abonnement ne porte le couple `(source_id, params)` — reliquat de désabonnements. Échantillon : `iss-passages{ville:gap}`, `ma-collectivite{oze, valserres}`, `rappel-conso{alimentation, bébés-enfants}`, `risque-secheresse{06,14,16,53}`, `vigilance-meteo{~15 départements}`. Purge = **décision humaine** (aucun `DELETE` par le robot). Non bloquant.
- **Stabilité des ids `?panneau=`** (point de vigilance ouvert, consigné en tête de `ma-collectivite.js`) : si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme « nouveau ». Non mesurable sans fetch réseau (interdit). Aucune anomalie constatable ici ; signalé comme vigilance ouverte, sans alarme.

---

*Fin du rapport. Aucune action corrective proposée pour exécution : les seuls points « à trancher » (404 VigiEau, purge des 23 combos orphelins, proxy de vitalité PanneauPocket) relèvent d'une décision humaine et ne justifient pas de brouillon de correctif automatisable.*
