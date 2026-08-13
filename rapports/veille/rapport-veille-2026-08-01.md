# Rapport de veille — 2026-08-01

*Robot 1 — Veilleur de maintenance (lecture seule). Généré à partir de `node scripts/veille-readonly.js` (run 02:00 UTC) + lecture du code. Aucune modification effectuée.*

Cadre du run : **265 sources enabled**, **34 combinaisons paramétrées** souscrites. Schéma de base **cohérent** (`schema_check.ok = true`, 55 colonnes attendues, 0 manquante, 0 type inattendu) → pas de bandeau migration.

---

## Résumé (points saillants, par importance)

1. **Grappe INSEE en HTTP 500** — 5 sources INSEE (inflation, IRL, chômage, IPC alim, prix logements anciens) échouent toutes sur des `500` côté INSEE le 31/07. Panne API tierce, pas notre code. **À surveiller**, rien à faire côté LBA.
2. **risque-secheresse — VigiEau 404 persistant** (16 échecs, dernier 31/07 02:31). Un commit récent (`8497215 Fix risque-secheresse 404 nocturne`) cible précisément ce 404 → **vérifier qu'il est bien déployé** (les échecs peuvent être antérieurs au deploy).
3. **2 TODO calendaires datés dans la fenêtre 60 j** : `courses-mythiques` (config vide, TODO **septembre**) et `tour-de-france-passage` (config vide, TODO **octobre**). Sources muettes tant que non renseignées.
4. **26 combos orphelins** en `source_param_states` (reliquats de désabonnements) — purge = décision humaine.
5. Le reste = bruit attendu (clés API absentes connues, APIs tierces fragiles transitoires, sources saisonnières/inactives, collisions d'ordre cosmétiques).

---

## Cohérence schéma
`schema_check.ok = true` — schéma réel aligné sur l'attendu. RAS.

## Sources en échec (`failing_sources`)

Causes **connues / attendues** — aucune action :
- **sncf-perturbations** (141) — `SNCF_API_KEY absente`. Clé jamais souscrite, documenté. Normal.
- **leboncoin-livraison** (36) — blocage anti-bot DataDome (IP datacenter Railway). Phase d'observation silencieuse assumée. Normal.

Panne **API tierce à surveiller** (externe, pas notre code) :
- **Grappe INSEE — HTTP 500** : `inflation-insee` (12), `prix-logements-anciens` (12), `indice-reference-loyers` (11), `chomage-stats` (10), `ipc-alimentaire` (9). Toutes en `500` INSEE groupées autour du 31/07 02:00. Signature d'une indisponibilité serveur INSEE SDMX. Dégradation propre (inactive, pas de fausse alerte). À re-vérifier au prochain run : si les 500 persistent plusieurs jours, ouvrir un point.
- **risque-secheresse** (16) — `VigiEau : 404`, dernier 31/07 02:31. ⚠️ Un commit récent visait ce 404 nocturne → **confirmer le déploiement effectif** ; sinon, régression toujours active.

Fragiles connues, échecs **transitoires** (bas niveau) :
- **ecowatt** (39) — `HTTP 429` (appel trop fréquent), repli au cycle suivant. EcoWatt reste par ailleurs muet hors tension estivale (normal).
- **lancement-spatial** (39) — Timeout Launch Library (>10 s). API communautaire lente.
- **aurores-france** (10) / **tempete-solaire** (8) — réponse NOAA vide/JSON invalide. Fragiles documentées.
- **vigicrues-departement** (4) — Timeout Vigicrues, transitoire.
- **statut-twitch** (3) / **statut-airtable** (2) / **statut-scaleway** (2) — Timeouts Statuspage du 29/07, anciens. RAS.

## États figés (`stale_states`)
Aucun signal. Tous les `checked_at` anciens correspondent à des sources/combos **inactifs** (caveat du script : `checked_at` non rafraîchi en still-inactive tant que l'étape B n'est pas déployée) — bruit **attendu**. Les combinaisons `active` figées (vigilance-meteo depts, risque-secheresse depts, rappel-conso, iss/gap) sont cohérentes avec un état actif stable ; aucune n'est corroborée par `failing_sources` sauf risque-secheresse (déjà traité ci-dessus).

## Jamais actives < 90 j (`never_active_90d`)
Liste volumineuse **mais entièrement normale** : le projet a ~3 semaines (sources créées à partir du 11/07/2026), donc AUCUNE source n'a 90 j d'existence — le seuil ne discrimine rien pour l'instant. La majorité sont saisonnières hors saison (eclipse-solaire 12/08 à venir, beaujolais, black-friday, perséides, fêtes calendaires…) ou récemment ajoutées. Rien d'anormal.

## Collisions d'ordre d'affichage (`display_order_collisions`)
11 collisions, toutes dans la plage **40–59** (statuts cloud + événements saisonniers ajoutés en lot). Purement **cosmétique**. Les nouvelles vagues prennent des plages ≥ 384, donc pas de propagation. Ré-échelonnement possible sans urgence si Hugo veut un ordre déterministe dans le bas de grille.

## TODO calendaires ≤ 60 jours (fenêtre 01/08 → 30/09)

**Action datée dans la fenêtre** (sources muettes tant que non renseignées) :
- **`courses-mythiques.js`** — `COURSES` vide, TODO **septembre 2026** (transcrire les dates officielles à confirmation). Cohérent avec l'état-projet (« config vide TODO sept »).
- **`tour-de-france-passage.js`** — `PARCOURS` vide, TODO **octobre 2026** (parcours par dépt à publication letour.fr). Reste inactive d'ici là — assumé.

**Bascules saisonnières dans la fenêtre — SANS action** (les dates 2026 sont présentes, la carte se déclenche puis retombe dormante ; le renouvellement 2027 est un TODO futur, hors 60 j) : `allocation-rentree-scolaire` (19/08), `nuits-des-etoiles` (07–09/08), `eclipse-solaire` (12/08), `rentree-scolaire` (01/09), `braderie-lille` (05–06/09), `journees-patrimoine` (19–20/09), `fetes-juives` (Roch Hachana/Yom Kippour 12 & 21/09). **`bison-fute.js`** : calendrier 2026 épuisé après le 28/08 → dormance naturelle jusqu'aux données 2027 (parution début 2027), normal.

**Annexe > 60 j** (renouvellement 2027, aucune urgence) : `fete-science` (oct 26, TODO édition 2027), `semaine-du-gout` (oct 26), `grandes-marees` (oct 26), `gastronomie-terroir` / `patrimoine-nature` / `entrepreneuriat-seniors` (éditions annuelles TODO 2027), `taux-livret-a` (révision 01/02/2027), `prime-noel` (déc 26), `cheque-energie` (2027), `versement-prestations-caf` (table 2027 avant janvier).

## Slugs orphelins
**Aucun.** Taxonomie définie dans `server/categories.js` (337 slugs). Les 144 slugs réellement utilisés en base sont tous couverts → aucune carte ne s'affichera avec un slug brut. RAS.

## Vitalité PanneauPocket curée (`panneaupocket_vitality`)
Section **vide** — aucune carte curée ne franchit le seuil. Cohérent : les 18 cartes vague L + arrosage-canal-gap ont toutes été créées le 24/07/2026 (≈ 8 jours), donc aucune ne peut avoir `last_activated_at > 90 j`. Aucune candidate à désactivation ce run.

> ⚠️ **Limite de méthode** (à réénoncer) : la base ne stocke aucune date de publication de panneau — la colonne `ref` ne contient que des couples `[panneauId, hash]`. Le seul proxy est `last_activated_at` (dernier panneau *alertable*), qui **sous-estime** la vitalité (panneaux hors filtre thématique ou cosmétiques = aucun événement enregistré). Une carte curée sans alerte depuis longtemps peut rester parfaitement vivante. Le contrôle réel de vitalité restera imparfait tant qu'aucune date de dernier panneau n'est persistée (piste : enrichir `ref`) — non implémenté, RAPPORT seulement.

## Combos orphelins & ids `?panneau=`
- **Combos orphelins** (`orphan_param_states`) : **26** lignes `source_param_states` dont plus aucun abonnement ne porte le couple `(source_id, params)` — reliquats de désabonnements (échantillon : `vigilance-meteo` depts, `risque-secheresse` depts, `rappel-conso`, `iss-passages/gap`, `ma-collectivite` URLs). La purge est une **décision humaine** ; aucun `DELETE` effectué.
- **Stabilité des ids `?panneau=`** : point de vigilance ouvert (consigné en tête de `ma-collectivite.js`). Si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme « nouveau ». Non mesurable sans fetch réseau (interdit la nuit) — signalé, sans alarme.

---

*Aucun brouillon correctif ce run : les 2 points actionnables (déploiement du fix risque-secheresse ; renseignement des configs `courses-mythiques`/`tour-de-france-passage`) relèvent d'une action produite par Hugo, pas d'un correctif de code à valider.*
