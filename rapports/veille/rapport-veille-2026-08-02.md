# Rapport de veille — 2026-08-02

_Agent de veille en lecture seule. Aucune modification effectuée. Généré à partir de `node scripts/veille-readonly.js` (généré 2026-08-02T02:00Z) + lecture de `server/sources/*.js` et de la taxonomie front._

## Résumé (par importance)

1. **Grappe INSEE (5 sources) en HTTP 500** — `prix-logements-anciens`, `inflation-insee`, `indice-reference-loyers`, `ipc-alimentaire`, `chomage-stats` échouent toutes sur des `500` de l'API INSEE SDMX (dernier échec ~01:30 UTC ce matin). Panne côté INSEE, pas côté code — à surveiller, pas d'action tant que ça ne dure pas.
2. **Échéances calendaires ≤ 60 j** : 5 configs datées à rafraîchir en priorité avant le 1er oct (Parcoursup 2027, échéances fiscales TF 20 oct, Bourses scolaires 15 oct, Bison Futé 2027, Semaine du goût / Braderie de Lille édition 2027).
3. Reste des `failing_sources` = **causes connues ou transitoires** (clé SNCF absente, DataDome Leboncoin, 429 EcoWatt, timeouts NOAA/Launch Library/Vigicrues). Rien de neuf.
4. **Schéma cohérent** (`schema_check.ok = true`), **0 slug orphelin**, **vitalité PanneauPocket curée RAS**.
5. Bruit attendu : `stale_states` (combinaisons inactives, cf. caveat), `never_active_90d` (saisonnier / sources récentes), 11 collisions `display_order` (cosmétique), 26 combos orphelins (reliquat de désabonnements).

---

## Cohérence schéma

`schema_check.ok = true` (55 colonnes attendues, 0 manquante, 0 type inattendu). Schéma cohérent — aucune migration à proposer.

## Sources en échec (`failing_sources`)

### Signal réel à surveiller

- **Grappe INSEE — HTTP 500 (5 sources)** : `prix-logements-anciens` (24 échecs), `inflation-insee` (23), `indice-reference-loyers` (22), `ipc-alimentaire` (22), `chomage-stats` (21). Toutes remontent `Réponse HTTP inattendue INSEE (<série>) : 500`, dernier échec 2026-08-02 ~01:30 UTC. Le point commun (même API SDMX INSEE, même code 500 sur des séries différentes) pointe vers une **indisponibilité côté INSEE**, pas une régression du code `lib/insee-bdm.js`. Ces sources sont mensuelles/trimestrielles à publication définitive : un 500 transitoire n'a pas d'impact utilisateur immédiat. **À re-vérifier au prochain run** ; si les 500 persistent plusieurs jours, creuser (changement d'endpoint/format INSEE).

### Causes connues / attendues (pas d'action)

- `sncf-perturbations` (137) — `SNCF_API_KEY absente`. Attendu et documenté (var Railway à configurer, pas du code).
- `leboncoin-livraison` (16) — `Blocage anti-bot (IP datacenter)`. Attendu : phase d'observation silencieuse, `check()` renvoie toujours `inactive()`. Dernier échec 2026-07-26.
- `ecowatt` (31) — `HTTP 429 appel trop fréquent`. Comportement de repli connu (throttle), pas une panne.
- `risque-secheresse` (14) — `VigiEau 404`, dernier échec 2026-07-31. Le commit récent `8497215 (Fix risque-secheresse 404 nocturne)` cible précisément ce point → **probablement déjà résolu**, à confirmer au prochain run.

### Transitoires (bas niveau, pas d'alarme)

- `lancement-spatial` (35) — `Timeout API Launch Library (>10 s)`. Source connue comme fragile.
- `aurores-france` (10) + `tempete-solaire` (8) — `Réponse NOAA illisible / Unexpected end of JSON`. NOAA renvoie ponctuellement un corps vide ; l'anti-rétroactif traite ça en `inactive` (jamais de faux positif). Derniers échecs 2026-07-31.
- `vigicrues-departement` (4) — `Timeout (>10 s)`, transitoire.
- `statut-twitch` (3), `statut-airtable` (2), `statut-scaleway` (2) — timeouts Statuspage isolés du 2026-07-29, déjà anciens.

## États figés (`stale_states`) — bruit attendu

Rien de suspect. Toutes les entrées `inactive` anciennes correspondent au cas `still-inactive` (write:false) décrit par le caveat du script, ou à des sources/combinaisons saisonnières hors saison. Les entrées `active` figées (`vigilance-meteo` dépts 13/24/31/33/35/…, `rappel-conso` alimentation, `risque-secheresse` 06/14/16/53, `iss-passages` gap) sont des états persistants normaux et sont **corroborées ni par `failing_sources`, ni par une anomalie** → non signalées.

## Jamais actives 90 j (`never_active_90d`) — RAS

Aucune anomalie. La liste ne contient que des sources **saisonnières hors saison** (Beaujolais, Perséides, Black Friday, éclipses, soldes, fêtes religieuses mobiles…), des **veilles d'état imprévisibles** qui n'ont simplement rien déclenché (statuts services, veille-*), et des **sources récemment ajoutées** (toutes créées entre le 11 et le 27 juillet, donc mécaniquement < 90 j). Aucune source « censée s'activer souvent et muette ».

## Collisions d'ordre d'affichage (`display_order_collisions`) — cosmétique

11 collisions, toutes dans la plage 40–59, entre cartes `statut-*` (pannes services / uptime) et cartes événementielles :

| display_order | sources |
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

Sans urgence. Un ré-échelonnement (par pas de 10, ou séparation des familles statut-* / événements) lèverait l'ambiguïté d'ordre si Hugo le souhaite.

## TODO calendaires ≤ 60 j (avant 2026-10-01)

Configurations datées codées en dur dont l'échéance ou l'événement tombe dans la fenêtre, **à rafraîchir en priorité** :

| Fichier | Échéance / événement dans la fenêtre | Action |
|---|---|---|
| `server/sources/parcoursup.js` | Calendrier session 2027 attendu **automne 2026** (TODO explicite « avant octobre 2026 ») | Ajouter `SESSIONS[2027]` dès parution parcoursup.gouv.fr |
| `server/sources/echeances-fiscales.js` | **Taxe foncière 20 oct 2026** (+ TH secondaires 20 déc) | Vérifier/ajouter `ECHEANCES[2027]` + `REMBOURSEMENTS` dès publication DGFiP |
| `server/sources/bourses-scolaires.js` | **Date limite 15 oct 2026** (campagne 2026-2027) | Ajouter `CAMPAGNES[2027]` dès circulaire de rentrée |
| `server/sources/bison-fute.js` | Calendrier annuel — TODO 2027 ; besoin avant Toussaint | Remplacer `JOURS_2026` par le calendrier officiel 2027 |
| `server/sources/semaine-du-gout.js` | Édition **12-18 oct 2026** en dur, pas de 2027 | Ajouter l'édition 2027 |
| `server/sources/braderie-lille.js` | Édition **5-6 sept 2026** en dur, pas de 2027 | Ajouter l'édition 2027 |
| `server/sources/cfe-entreprises.js` | **Échéance 15 déc 2026** ; 2027 à confirmer | Ajouter `ECHEANCES[2027]` (avis mi-nov) |
| `server/sources/cheque-energie.js` | Deadline **31 déc 2026** en dur | Ajouter dates 2027 dès annonce |
| `server/sources/rentree-scolaire.js` | Rentrée **1er sept 2026** en dur, pas de 2027 | Ajouter la date 2027 (arrêté calendrier scolaire) |
| `server/sources/allocation-rentree-scolaire.js` | Versements 2026 (5 & 19 août) ; 2027 à venir | Ajouter la date 2027 dès publication CAF (mi-août) |

**Annexe > 60 j (pas d'alerte)** : `taux-livret-a.js` (révision 1er fév 2027), `fetes-musulmanes.js` (dates prévisionnelles 2027 à confirmer début 2027), `fetes-juives.js` (Roch Hachana/Yom Kippour/Hanoucca 2027, avant sept 2027), `fetes-chretiennes.js` / `fetes-laiques.js` (données 2028), `nuits-des-etoiles.js` (édition 2027), `civisme-solidarite.js` (SEEPH 2027), `crous-dse.js` (campagne 2027-2028), `grands-festivals.js` (Avignon 2027), `grandes-marees.js` (coefficients 2027+), `ceremonies.js` / `nuits-de-la-lecture.js` (2028), `rdv-gaming.js` (2027).

## Slugs orphelins — RAS

Taxonomie front : `server/categories.js` (exposée côté client par `public/js/categories.js`), structure `GROUPS` fermée (24 groupes, ~180 slugs). Croisée avec les 145 slugs réellement utilisés en base (`category_slugs`) : **0 orphelin**. Tous les slugs en base sont définis dans la taxonomie ; aucune carte ne s'affichera avec un slug brut.

## Vitalité PanneauPocket curée (Vague L) — RAS (avec limite de méthode)

Jeu curé identifié dynamiquement (fichiers `require('./lib/panneaupocket-veille')` + `makeCurated`/`createBroadcastSource`, hors `panneaupocket` et `ma-collectivite`), **19 cartes** :
`agenda-luc-en-diois`, `arrosage-canal-gap`, `cantine-a2m2v`, `dechets-campagne-caux`, `dechets-la-saucelle`, `dechets-saulieu`, `eau-charles-chaigneau`, `eau-coteaux-lizon`, `eau-isle-dronne`, `eau-provence-verte`, `eau-puisaye-forterre`, `eau-regie-metz`, `local-agly-fenouilledes`, `local-buech-devoluy`, `local-chablis`, `local-chabris-bazelle`, `securite-gendarmerie-albi`, `securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts`.

La section `panneaupocket_vitality` du JSON est **vide** → aucune carte curée signalée comme candidate à désactivation ce run. Cohérent : toutes ces cartes ont été créées le 2026-07-24 (≈ 9 jours), le seuil de 90 j de silence ne peut donc pas encore être atteint.

**Limite de méthode (rappel)** : la base ne stocke aucune date de publication de panneau (`ref` = couples `[panneauId, hash]` seulement). Le seul proxy disponible est `last_activated_at`, qui **sous-estime** la vitalité (panneaux hors filtre thématique ou cosmétiques → aucun événement). Une carte réellement moribonde ne pourra être confirmée que par un humain via l'appli PanneauPocket. Piste d'amélioration (non implémentée) : persister la date du dernier panneau vu dans `ref` pour disposer d'un vrai proxy de vitalité — à arbitrer par Hugo.

## Combos orphelins & ids `?panneau=`

- **Combos orphelins** (`orphan_param_states`) : **26** lignes `source_param_states` sans abonnement porteur du couple `(source_id, params)` — reliquat de désabonnements. Échantillon : `iss-passages{ville:gap}`, plusieurs `ma-collectivite{url:…}` (Oze, Valserres, AMR-05, Veynes, La Bâtie-Vieille), `rappel-conso{alimentation / bébés-enfants}`, `risque-secheresse{06/14/16/53}`, `vigilance-meteo` (nombreux dépts). **Purge = décision humaine** ; aucun `DELETE` effectué. Sans impact fonctionnel (ces lignes ne déclenchent aucune notification).
- **Stabilité des ids `?panneau=`** (point de vigilance ouvert, consigné en tête de `ma-collectivite.js`) : si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme un « nouveau » panneau. Non mesurable la nuit (nécessiterait un fetch réseau, interdit). Signalé comme point de vigilance, sans alarme.

---

_Aucun geste d'écriture, aucune requête SQL directe, aucun `runCycle()`, aucun appel réseau vers les sources ni vers PanneauPocket n'a été effectué. Seul ce fichier a été produit._
