# Rapport de veille — 2026-08-11

_Généré le 2026-08-11 à 02h00 UTC par Robot 1 (lecture seule). 266 sources enabled, 36 combinaisons paramétrées._

---

## Résumé (5 points)

1. **⚠️ `risque-secheresse` : VigiEau renvoie 404 depuis le 05/08** — 25 échecs cumulés, API potentiellement restructurée. À investiguer.
2. **⚠️ `lancement-spatial` : 52 timeouts sur 7 jours** — Launch Library (API communautaire) systématiquement lente ou indisponible.
3. **Slug orphelin : `communaute`** — utilisé par `chat-perdu` (non déployé) mais absent de la taxonomie `server/categories.js`. Carte silencieuse si déployée en l'état.
4. **TODO calendaire actionnable en septembre : `courses-mythiques`** — config vide, dates à saisir dès l'ouverture des inscriptions.
5. **26 combos orphelins** en `source_param_states` — reliquat de désabonnements, purge à décider par Hugo.

---

## Sources en échec

| Source | Échecs (7j) | Dernier échec | Message | Diagnostic |
|---|---|---|---|---|
| `sncf-perturbations` | 133 | 2026-08-11 00:31 | `SNCF_API_KEY absente` | **Connu** — variable d'environnement manquante sur Railway. RAS. |
| `lancement-spatial` | 52 | 2026-08-10 21:01 | `Timeout >10000 ms` | **À surveiller** — Launch Library est une API communautaire sans SLA. 52 timeouts en 7j = quasi-systématique. La source n'a jamais été active depuis sa création (90j+). |
| `risque-secheresse` | 25 | 2026-08-05 07:31 | `HTTP 404 VigiEau` | **⚠️ Régression probable** — VigiEau retournait 200 avant. 404 persistant depuis le 5/08. L'endpoint API a peut-être changé de chemin ou le paramètre dépt a été restructuré. Dernier succès antérieur au 5/08. Les 4 combinaisons paramétrées actives (dépts 06, 14, 16, 53) sont maintenant orphelines (désabonnements) — non bloquant pour des utilisateurs réels, mais la source est muette. |
| `ecowatt` | 8 | 2026-08-09 01:30 | `HTTP 500 EcoWatt` | Probablement transitoire — RTE EcoWatt a des maintenances nocturnes. 8 échecs depuis le 9/08, à surveiller lors du prochain run si la tendance se poursuit. |
| `bitcoin-mouvement` | 4 | 2026-08-09 15:00 | `Timeout CoinGecko` | Transitoire — 4 échecs ponctuels, CoinGecko throttle par IP. |
| `indice-reference-loyers` | 2 | 2026-08-04 12:34 | `ECONNRESET INSEE BDM` | Transitoire — ECONNRESET = déconnexion réseau isolée. 2 échecs anciens, RAS. |
| `inflation-insee` | 2 | 2026-08-04 12:34 | `ECONNRESET INSEE BDM` | Idem — même origine, même moment. RAS. |

### Focus risque-secheresse

La source a 25 échecs 404 depuis le 05/08 et n'a plus retourné d'état valide depuis. L'API VigiEau (RegLeau / DnBSH) peut modifier ses endpoints sans préavis. Les 4 combinaisons paramétrées avec `state=active` dans le tableau orphelin (dépts 06, 14, 16, 53) n'ont plus de souscripteur actif — il n'y a donc pas d'abonné impacté, mais la source est en panne silencieuse. Il est conseillé de relire `server/sources/risque-secheresse.js` et de comparer l'endpoint utilisé avec la documentation VigiEau actuelle.

---

## États figés (stale_states)

Bruit attendu dans sa quasi-totalité. L'étape B (refresh `checked_at` en still-inactive) n'est pas déployée — tous les `checked_at` anciens sur des états `inactive` sont normaux.

Cas corroborés par `failing_sources` (donc non-alarmants en eux-mêmes) :
- `ecowatt` — state: inactive, checked_at 11/07 (vieux mais cohérent avec les 500 récents)
- `lancement-spatial` — state: inactive, checked_at 14/07

Cas `active` dans les stale_states : ce sont exclusivement des combinaisons orphelines (cf. section Combos orphelins ci-dessous). Pas d'état actif figé sur un abonné réel.

---

## Jamais actives (never_active_90d)

**170+ sources** dans la liste — principalement :
- **Saisonnières normales** (beaujolais-nouveau, changement-heure, black-friday, treve-hivernale, soldes-steam, saints-de-glace, premier-avril, geminides…) — hors saison, RAS.
- **Paramétrées sans souscription** (veille-emploi, veille-arxiv, vigicrues-departement, seismes-departement, carburant, fin-de-vie-logicielle…) — nécessitent un paramètre, aucun abonné actif sur ces combos, RAS.
- **Cartes curées PanneauPocket** (eau-puisaye-forterre, securite-gendarmerie-bayeux, local-buech-devoluy, cantine-a2m2v…) — entités tierces qui n'ont peut-être pas publié depuis l'activation. Cf. section Vitalité PanneauPocket.
- **Config vide** (courses-mythiques, billetterie-concerts, ouverture-ventes-sncf…) — normal, aucune date transcrite.

Cas méritant attention :
- `lancement-spatial` — jamais actif + 52 timeouts. Voir section Sources en échec.
- `doomname` — source externe (www.doomname.com/alert.json), jamais activée depuis le 11/07. Pas alarmant — DoomName est un projet frère, l'alerte ne se déclenche que sur un événement spécifique. À vérifier manuellement si le flux est accessible.

---

## TODO calendaires ≤ 60 jours

Horizon : 2026-08-11 → 2026-10-10.

### Actionnables dans la fenêtre

| Source | Fichier | Échéance | Action requise |
|---|---|---|---|
| **courses-mythiques** | `server/sources/courses-mythiques.js` | **Septembre 2026** | Config vide — le TODO demande de transcrire les dates officielles des marathons 2027 dès l'ouverture des inscriptions (~sept. 2026). Marathon de Paris pressenti 11 avril 2027, Semi de Paris 7 mars 2027. Pas urgent avant l'annonce officielle, mais à scruter en septembre. |
| **allocation-rentree-scolaire** | `server/sources/allocation-rentree-scolaire.js` | **19 août 2026** (dans 8 jours) | Date déjà codée — RAS pour cette année. TODO 2027 hors fenêtre. |
| **braderie-lille** | `server/sources/braderie-lille.js` | **5-6 sept. 2026** | Dates 2026 déjà codées — RAS. TODO 2027 hors fenêtre. |
| **bison-fute** | `server/sources/bison-fute.js` | **28 août 2026** (dernier jour de la liste) | Après cette date, le calendrier 2026 sera épuisé et la source sera inactive jusqu'en 2027. Aucune action urgente — le TODO 2027 est explicitement positionné « début 2027 ». |

### Signalement (à l'horizon ou légèrement au-delà)

- `bourses-scolaires` : date limite 15 octobre 2026 (~65 jours) — déjà codée, RAS.
- `echeances-fiscales` : TF papier 15 oct / en ligne 20 oct — déjà codées, RAS.
- `cfe-entreprises` : 15 décembre 2026 — hors fenêtre, RAS.
- `cheque-energie` : 31 décembre 2026 — hors fenêtre, RAS.

---

## Slugs orphelins

La liste `category_slugs` du JSON contient **`communaute`** (utilisé par la source `chat-perdu`, type `community`). Ce slug est **absent** de `server/categories.js` (taxonomie officielle).

Conséquence : si `chat-perdu` est déployée, la pastille de catégorie affichera le slug brut `communaute` au lieu d'un libellé lisible. La source est actuellement non déployée (fil 04-05/08/2026 en revue) — l'ajout du slug à la taxonomie devrait faire partie du même lot de déploiement.

Tous les autres slugs de `category_slugs` sont présents dans `server/categories.js`.

---

## Cohérence schéma

`schema_check.ok === true` — 56 colonnes attendues, 0 manquante, 0 type_mismatch. **RAS.**

---

## Vitalité PanneauPocket curées

`panneaupocket_vitality` retourné par le script = tableau vide `[]`.

Interprétation : aucune des cartes curées identifiées (via `makeCurated`) ne remonte de signal d'alerte dans cette section, ce qui signifie soit que toutes ont une `last_activated_at` dans les 90 derniers jours, soit que le script les a exclues de sa requête. **Limite à énoncer** : la colonne `ref` ne stocke que des couples `[panneauId, hash]` — aucune date de publication de panneau n'est disponible sans appel réseau. La `last_activated_at` sous-estime la vitalité (panneaux hors filtre thématique = aucun événement). Aucune carte curée ne peut être désactivée sur la base de ce run.

Cartes curées dans `never_active_90d` (proxy insuffisant mais listables) :
`eau-puisaye-forterre`, `securite-gendarmerie-bayeux`, `local-buech-devoluy`, `cantine-a2m2v`, `dechets-la-saucelle`, `dechets-campagne-caux`, `dechets-saulieu`, `eau-regie-metz`, `eau-charles-chaigneau`, `local-agly-fenouilledes`, `eau-isle-dronne`, `local-chablis`, `eau-provence-verte`, `securite-gendarmerie-essarts`, `local-chabris-bazelle`, `securite-gendarmerie-albi` + `arrosage-canal-gap` (présent dans stale_states, non dans never_active mais pas dans panneaupocket_vitality).

Ces cartes n'ont jamais déclenché d'alerte depuis leur activation. Rappel : la famille gendarmerie est documentée comme « massivement dormante (~85 %) » — les cartes albi/bayeux/essarts retenues avaient été choisies parmi les brigades actives, mais une désactivation de l'entité PanneauPocket depuis lors ne serait pas détectable sans appel réseau. **Décision humaine requise** : une vérification manuelle des pages PanneauPocket de ces cartes permettrait de confirmer si elles publient encore.

**Point de vigilance ids `?panneau=`** : si PanneauPocket régénère les ids de panneau à l'édition, une modification apparaîtra comme « nouveau panneau ». Ce point ne peut pas être mesuré sans fetch réseau — consigné en tête de `server/sources/ma-collectivite.js`, ouvert.

---

## Combos orphelins & ids `?panneau=`

**26 lignes orphelines** dans `source_param_states` (aucun abonnement actif correspondant).

Échantillon représentatif :
- `iss-passages` — ville "gap" (state: active, 23/07) : ancien abonnement de test, désabonné.
- `ma-collectivite` — 5 URLs (Oze, Valserres, AMR-05, Veynes, La Bâtie-Vieille) : tests de prospection, désabonnés.
- `rappel-conso` — "bébés-enfants" et "alimentation" : anciens abonnements.
- `risque-secheresse` — dépts 06, 14, 16, 53 : anciens abonnements (la source est en panne, de toute façon).
- `vigilance-meteo` — 13 combinaisons de départements : anciens abonnements.

Ces 26 entrées sont des reliquats normaux de désabonnements. **Aucune purge automatique** — décision Hugo, commande à valider si le volume devient gênant.

---

## Collisions d'ordre d'affichage

11 collisions dans la plage 40-59, toutes cosmétiques (résolu par le tri secondaire côté front) :

| Ordre | Sources concernées |
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

Sans urgence — à rééchelonner lors d'un prochain lot de maintenance display_order.

---

## BROUILLON — À valider par Hugo avant toute exécution

### Correctif slug `communaute` dans la taxonomie

Si le déploiement de `chat-perdu` est validé, ajouter une entrée dans `server/categories.js` :

```js
{ slug: 'communaute', label: 'Communauté', group: 'vie-locale' }
```

(Le groupe `vie-locale` est existant ; ajuster selon la hiérarchie souhaitée.)

**Non exécuté. À valider par Hugo lors du lot de déploiement `chat-perdu`.**

---

_Fin du rapport — Robot 1, 2026-08-11._
