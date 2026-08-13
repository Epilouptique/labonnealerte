# Rapport de veille — 2026-08-03

_Agent de veille en lecture seule. Aucune modification effectuée. Généré à partir de `node scripts/veille-readonly.js` (JSON généré 2026-08-03T07:19Z) + lecture de `server/sources/*.js` et de la taxonomie front. Cadre : 265 sources enabled, 34 combinaisons paramétrées._

## Résumé (par importance)

1. **Grappe INSEE (5 sources) toujours en HTTP 500, désormais sur plusieurs jours** — `prix-logements-anciens`, `inflation-insee`, `indice-reference-loyers`, `ipc-alimentaire`, `chomage-stats` échouent toutes sur des `500` de l'API INSEE SDMX. Derniers échecs 2026-08-02 (~15h30–16h30 UTC), pas de nouvel échec aujourd'hui (sources mensuelles/trimestrielles, faible fréquence de poll). Panne côté INSEE, pas côté code. C'est le 2ᵉ-3ᵉ jour consécutif → à garder à l'œil, mais toujours sans impact utilisateur immédiat.
2. **`risque-secheresse` (VigiEau 404) probablement résolu** — aucun échec depuis 2026-07-31, ce qui précède le commit `8497215 (Fix risque-secheresse 404 nocturne)`. À confirmer, mais le signal est éteint.
3. Reste des `failing_sources` = **causes connues ou transitoires** (clé SNCF absente, 429 EcoWatt, timeouts NOAA/Launch Library/Vigicrues, Statuspage isolés). Rien de neuf.
4. **Schéma cohérent** (`schema_check.ok = true`), **0 slug orphelin**, **vitalité PanneauPocket curée RAS**.
5. Bruit attendu inchangé : `stale_states` (combinaisons inactives, cf. caveat), `never_active_90d` (saisonnier / sources récentes), 11 collisions `display_order` (cosmétique), 26 combos orphelins.

---

## Cohérence schéma

`schema_check.ok = true` (55 colonnes attendues, 0 manquante, 0 type inattendu). Schéma cohérent — aucune migration à proposer.

## Sources en échec (`failing_sources`)

### Signal réel à surveiller

- **Grappe INSEE — HTTP 500 (5 sources)** : `prix-logements-anciens` (36 échecs cumulés), `inflation-insee` (35), `indice-reference-loyers` (34), `ipc-alimentaire` (34), `chomage-stats` (32). Toutes remontent `Réponse HTTP inattendue INSEE (<série>) : 500`, derniers échecs 2026-08-02 ~15h30–16h30 UTC. Point commun (même API SDMX INSEE, code 500 sur des séries différentes) → **indisponibilité côté INSEE**, pas une régression de `lib/insee-bdm.js`. Ces sources sont mensuelles/trimestrielles à publication définitive : un 500 transitoire n'a pas d'impact utilisateur. Le signal dure maintenant depuis quelques jours (compteurs +~12 depuis le 02/08) : **si les 500 persistent encore plusieurs jours, creuser** un éventuel changement d'endpoint/format INSEE.

### Causes connues / attendues (pas d'action)

- `sncf-perturbations` (135) — `SNCF_API_KEY absente`. Attendu et documenté (var Railway à configurer, pas du code).
- `ecowatt` (26) — `HTTP 429 appel trop fréquent`. Comportement de repli connu (throttle), pas une panne.
- `risque-secheresse` (11) — `VigiEau 404`, **dernier échec 2026-07-31** (avant le commit `8497215`). Probablement déjà résolu ; signal éteint.

### Transitoires (bas niveau, pas d'alarme)

- `lancement-spatial` (40) — `Timeout API Launch Library (>10 s)`. Source connue comme fragile.
- `aurores-france` (11) + `tempete-solaire` (8) — `Réponse NOAA illisible / Unexpected end of JSON`. NOAA renvoie ponctuellement un corps vide/tronqué ; l'anti-rétroactif traite ça en `inactive` (jamais de faux positif). Derniers échecs 2026-08-02 / 07-31.
- `vigicrues-departement` (4) — `Timeout (>10 s)`, transitoire (dernier 08-02).
- `statut-airtable` (2), `statut-twitch` (2) — timeouts Statuspage isolés du 2026-07-29, déjà anciens.

## États figés (`stale_states`) — bruit attendu

Rien de suspect. Les entrées `inactive` anciennes correspondent au cas `still-inactive` (write:false) décrit par le caveat du script, ou à des sources/combinaisons saisonnières hors saison. Les entrées `active` figées (`vigilance-meteo` dépts 13/24/31/33/35/…, `rappel-conso` alimentation, `risque-secheresse` 06/14/16/53, `iss-passages` gap) sont des états persistants normaux, **non corroborés par `failing_sources`** → non signalées.

## Jamais actives 90 j (`never_active_90d`) — RAS

Aucune anomalie. La liste ne contient que des sources **saisonnières hors saison** (Beaujolais, Perséides, Black Friday, éclipses, soldes, fêtes religieuses mobiles…), des **veilles d'état imprévisibles** qui n'ont rien déclenché (statuts services, veille-*), et des **sources récemment ajoutées** (toutes créées entre le 11 et le 27 juillet, donc mécaniquement < 90 j). Aucune source « censée s'activer souvent et muette ».

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

Sans urgence (inchangé depuis le 02/08). Un ré-échelonnement par pas de 10 lèverait l'ambiguïté si Hugo le souhaite.

## TODO calendaires ≤ 60 j (avant 2026-10-02)

Aucun changement dans `server/sources/*.js` depuis le 02/08 → liste identique, reproduite pour mémoire. Configs datées codées en dur dont l'échéance/l'événement tombe dans la fenêtre, **à rafraîchir en priorité** :

| Fichier | Échéance / événement dans la fenêtre | Action |
|---|---|---|
| `server/sources/parcoursup.js` | Calendrier session 2027 attendu **automne 2026** (TODO explicite « avant octobre 2026 ») | Ajouter `SESSIONS[2027]` dès parution parcoursup.gouv.fr |
| `server/sources/echeances-fiscales.js` | **Taxe foncière 20 oct 2026** (+ TH secondaires 20 déc) | Vérifier/ajouter `ECHEANCES[2027]` + `REMBOURSEMENTS` dès publication DGFiP |
| `server/sources/bourses-scolaires.js` | **Date limite 15 oct 2026** (campagne 2026-2027) | Ajouter `CAMPAGNES[2027]` dès circulaire de rentrée |
| `server/sources/bison-fute.js` | Calendrier annuel — TODO 2027 ; besoin avant Toussaint | Remplacer `JOURS_2026` par le calendrier officiel 2027 |
| `server/sources/semaine-du-gout.js` | Édition **12-18 oct 2026** en dur, pas de 2027 | Ajouter l'édition 2027 |
| `server/sources/braderie-lille.js` | Édition **5-6 sept 2026** en dur, pas de 2027 | Ajouter l'édition 2027 |
| `server/sources/rentree-scolaire.js` | Rentrée **1er sept 2026** en dur, pas de 2027 | Ajouter la date 2027 (arrêté calendrier scolaire) |
| `server/sources/allocation-rentree-scolaire.js` | Versements 2026 (5 & 19 août) ; 2027 à venir | Ajouter la date 2027 dès publication CAF (mi-août) |

**Annexe > 60 j (pas d'alerte)** : `cfe-entreprises.js` (15 déc 2026), `cheque-energie.js` (31 déc 2026), `taux-livret-a.js` (1er fév 2027), `fetes-musulmanes.js` / `fetes-juives.js` (2027), `fetes-chretiennes.js` / `fetes-laiques.js` (2028), `nuits-des-etoiles.js` (2027), `civisme-solidarite.js` (SEEPH 2027), `crous-dse.js` (2027-2028), `grands-festivals.js` (Avignon 2027), `grandes-marees.js` (coefficients 2027+), `ceremonies.js` / `nuits-de-la-lecture.js` (2028), `rdv-gaming.js` (2027).

## Slugs orphelins — RAS

Taxonomie front : `server/categories.js` (exposée côté client par `public/js/categories.js`), structure `GROUPS` fermée. Croisée avec les 145 slugs réellement utilisés en base (`category_slugs`) : **0 orphelin**. Tous les slugs en base sont définis dans la taxonomie ; aucune carte ne s'affichera avec un slug brut.

## Vitalité PanneauPocket curée (Vague L) — RAS (avec limite de méthode)

Jeu curé identifié dynamiquement (fichiers `require('./lib/panneaupocket-veille')` + `makeCurated`/`createBroadcastSource`, hors `panneaupocket` et `ma-collectivite`), **19 cartes** :
`agenda-luc-en-diois`, `arrosage-canal-gap`, `cantine-a2m2v`, `dechets-campagne-caux`, `dechets-la-saucelle`, `dechets-saulieu`, `eau-charles-chaigneau`, `eau-coteaux-lizon`, `eau-isle-dronne`, `eau-provence-verte`, `eau-puisaye-forterre`, `eau-regie-metz`, `local-agly-fenouilledes`, `local-buech-devoluy`, `local-chablis`, `local-chabris-bazelle`, `securite-gendarmerie-albi`, `securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts`.

La section `panneaupocket_vitality` du JSON est **vide** → aucune carte curée signalée comme candidate à désactivation ce run. Cohérent : ces cartes ont été créées le 2026-07-24 (~10 jours), le seuil de 90 j de silence ne peut pas encore être atteint.

**Limite de méthode (rappel)** : la base ne stocke aucune date de publication de panneau (`ref` = couples `[panneauId, hash]` seulement). Le seul proxy est `last_activated_at`, qui **sous-estime** la vitalité (panneaux hors filtre thématique ou cosmétiques → aucun événement). Une carte réellement moribonde ne pourra être confirmée que par un humain via l'appli PanneauPocket. Piste d'amélioration (non implémentée) : persister la date du dernier panneau vu dans `ref` pour disposer d'un vrai proxy de vitalité — à arbitrer par Hugo.

## Combos orphelins & ids `?panneau=`

- **Combos orphelins** (`orphan_param_states`) : **26** lignes `source_param_states` sans abonnement porteur du couple `(source_id, params)` — reliquat de désabonnements. Échantillon : `iss-passages{ville:gap}`, plusieurs `ma-collectivite{url:…}` (Oze, Valserres, AMR-05, Veynes, La Bâtie-Vieille), `rappel-conso{alimentation / bébés-enfants}`, `risque-secheresse{06/14/16/53}`, `vigilance-meteo` (nombreux dépts). **Purge = décision humaine** ; aucun `DELETE` effectué. Sans impact fonctionnel (ces lignes ne déclenchent aucune notification).
- **Stabilité des ids `?panneau=`** (point de vigilance ouvert, consigné en tête de `ma-collectivite.js`) : si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme un « nouveau » panneau. Non mesurable la nuit (fetch réseau interdit). Signalé comme point de vigilance ouvert, sans alarme.

---

_Aucun geste d'écriture, aucune requête SQL directe, aucun `runCycle()`, aucun appel réseau vers les sources ni vers PanneauPocket n'a été effectué. Seul ce fichier a été produit._
</content>
</invoke>
