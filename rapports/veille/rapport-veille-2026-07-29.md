# Rapport de veille — 2026-07-29

*Robot 1 · veilleur de maintenance · LECTURE SEULE. Aucune modification effectuée ;
ce rapport est la seule production. Snapshot `veille-readonly.js` généré à 02:00 UTC —
263 sources enabled, 32 combinaisons paramétrées.*

## Résumé (RAS pondéré)

Nuit sans régression. Cohérence schéma **OK**. Les sources en échec relèvent toutes de
causes connues (clé API absente, anti-bot, timeouts/429 d'API tierces). Trois points de
bas niveau seulement :

1. `risque-secheresse` : **404 VigiEau** récurrent (14 échecs, dernier cette nuit) — à
   surveiller (un 404 diffère d'un timeout : possible changement d'endpoint).
2. 11 collisions d'`display_order` (cosmétique, sans urgence).
3. 23 `source_param_states` orphelins (reliquats de désabonnements) + section
   `panneaupocket_vitality` **vide** ce run → vitalité des cartes curées non calculable.

Slugs orphelins : **aucun**. Échéances calendaires ≤ 60 j : **aucune action requise**
(occurrences 2026 déjà couvertes ; renouvellements planifiés en 2027).

---

## Cohérence schéma
`schema_check.ok = true` — 50 colonnes attendues, aucune manquante, aucun type inattendu.
**Schéma cohérent.** (Pas de bandeau migration.)

## Sources en échec (`failing_sources`)
Toutes attendues / hors périmètre d'action nocturne :

| Source | Échecs 7 j | Cause | Statut |
|---|---|---|---|
| `sncf-perturbations` | 139 | `SNCF_API_KEY` absente de l'env | **Attendu** (clé non provisionnée) |
| `leboncoin-livraison` | 92 | Blocage anti-bot DataDome (IP datacenter) | **Attendu** (connu) |
| `ecowatt` | 35 | HTTP 429 (appel trop fréquent) | Transitoire, hors saison |
| `lancement-spatial` | 35 | Timeout Launch Library (>10 s) | Transitoire (API tierce) |
| `risque-secheresse` | 14 | **404 VigiEau** | ⚠️ **À surveiller** (voir ci-dessous) |
| `vigicrues-departement` | 14 | Timeout Vigicrues (>10 s) | Transitoire |
| `prix-logements-anciens` / `indice-reference-loyers` / `inflation-insee` / `chomage-stats` / `ipc-alimentaire` | 6–9 | Timeouts INSEE BDM | Transitoire (API lente, séries mensuelles) |
| `asteroide-frole-terre` | 2 | 503 JPL (temporairement indisponible) | Transitoire |

**Point de vigilance bas niveau — `risque-secheresse`** : un `404` répété (dernier
2026-07-29 00:31) n'est pas un timeout ; il peut signaler un changement de route de
l'API VigiEau. À vérifier côté code source lors d'une session de jour. Les combos
`risque-secheresse` (dép. 06/14/16/53) sont par ailleurs marqués `active` — cf. combos
orphelins.

## États figés (`stale_states`) — signal secondaire
Conformément au `caveat` du script (`checked_at` non rafraîchi en still-inactive tant
que l'étape B n'est pas déployée), la grande majorité des entrées figées sont des sources
**inactives** → **bruit attendu**, non suspect.

Seules les entrées `active` figées méritent un œil, et elles sont toutes corroborées par
les combos orphelins (abonnements disparus) plutôt que par une panne :
- `vigilance-meteo` dép. 13/24/31/33/35/38/44/67/74/75/83 — `active`, `checked_at` mi-juillet.
- `risque-secheresse` dép. 06/14/16/53 — `active` (à recouper avec le 404 ci-dessus).
- `rappel-conso` (alimentation, bébés-enfants), `iss-passages` (gap) — `active`.

Aucune de ces entrées ne pointe une régression : ce sont des combinaisons dont
l'abonnement a été retiré (voir « Combos orphelins »).

## Jamais actives 90 j (`never_active_90d`)
Liste longue mais **normale** : événements saisonniers hors saison (Beaujolais, Perséides,
Black Friday, soldes, fêtes, éclipses, éphémérides…), pages de statut cloud (silence = bonne
nouvelle), et surtout la vague de sources récemment ajoutées (fin juillet : cartes PP curées,
`veille-agenda` créé le 27/07, sources outre-mer/Québec). **Aucune anomalie** : pas de source
« censée s'activer souvent » restée muette.

## Collisions d'ordre d'affichage (`display_order_collisions`)
11 collisions, **cosmétique** (l'ordre départage alors par un critère secondaire) :

| `display_order` | Sources |
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

Ré-échelonnement possible mais non urgent. Pattern récurrent : des pages `statut-*`
partagent l'ordre d'une source événementielle — probablement deux lots insérés sur la
même plage. À trancher par Hugo si l'affichage gêne.

## TODO calendaires ≤ 60 jours (avant 2026-09-27)
**Aucune action requise sous 60 jours.** Les configurations datées couvrent bien leurs
occurrences 2026 à venir ; les TODO de renouvellement sont tous planifiés pour 2027.

Occurrences 2026 **déjà couvertes** dans la fenêtre :
- `nuits-des-etoiles` — 07–09 août 2026 (édition présente ; TODO ajout 2027 « début 2027 »).
- `perseides` — pic 12-13 août (recalculé dynamiquement, OK).
- `allocation-rentree-scolaire` — versement 19 août 2026 (présent ; TODO 2027).
- `bison-fute` — dernières journées rouges 01/08, 08/08, 15/08, 28/08 2026 présentes ;
  TODO explicite « **début 2027** : remplacer JOURS_2026 ». → couvert, pas d'action avant 2027.
- `braderie-lille` — 05–06 sept. 2026 présent ; TODO 2027.

Annexe (au-delà de 60 j, pour mémoire, renouvellements 2027 à prévoir plus tard) :
`echeances-fiscales` (TF 20/10, IR/THRS déc. — présents ; TODO 2027), `taux-livret-a`
(prochaine révision 01/02/2027), `semaine-du-gout` (12–18 oct. 2026 présent, TODO 2027),
`fetes-juives` (Roch Hachana/Yom Kippour sept. présents, TODO automne 2027), `rentree-scolaire`,
`fete-bretagne`, calendriers Québec, `festivals-musique`/`grands-festivals`/`carnavals`
(éditions 2027 non encore annoncées par les organisateurs). `soldes`, `black-friday`,
`journees-patrimoine`, `vacances-scolaires`, `geminides` sont calculés dynamiquement → sans TODO.

*(Analyse dérivée d'une lecture des `server/sources/*.js` ; dates recoupées sur
`bison-fute.js` et `braderie-lille.js`.)*

## Slugs orphelins
**RAS.** Les 142 slugs réellement utilisés en base (`category_slugs`) sont **tous** présents
dans la taxonomie fermée `server/categories.js` (336 slugs définis, groupés). Aucune carte
ne s'affichera avec un slug brut. (L'inverse — slugs définis non utilisés — est normal et non signalé.)

## Vitalité PanneauPocket curée (Vague L)
**Jeu curé identifié dynamiquement** (fichiers `server/sources/*.js` requérant
`./lib/panneaupocket-veille` en mode broadcast, hors `panneaupocket`/`ma-collectivite`/
`veille-agenda` paramétrés) — **19 cartes** :

`makeCurated` (18) : `agenda-luc-en-diois`, `cantine-a2m2v`, `dechets-campagne-caux`,
`dechets-la-saucelle`, `dechets-saulieu`, `eau-charles-chaigneau`, `eau-coteaux-lizon`,
`eau-isle-dronne`, `eau-puisaye-forterre`, `eau-provence-verte`, `eau-regie-metz`,
`local-agly-fenouilledes`, `local-buech-devoluy`, `local-chablis`, `local-chabris-bazelle`,
`securite-gendarmerie-albi`, `securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts`.
`createBroadcastSource` (1) : `arrosage-canal-gap`.

⚠️ **Limite de méthode (à énoncer telle quelle)** : la base ne stocke **aucune date de
publication de panneau** (`ref` = couples `[panneauId, hash]`). La « date du panneau le
plus récent » n'est donc pas dérivable sans requêter PanneauPocket (interdit la nuit). Le
seul proxy est `last_activated_at`, qui **sous-estime** la vitalité.

**Ce run : `panneaupocket_vitality` est vide (`[]`)** — aucun proxy émis pour le jeu curé.
Ces cartes ont par ailleurs été **créées le 24/07/2026** (states `inactive`, `checked_at`
2026-07-24) : elles sont **trop récentes** pour qu'un `last_activated_at` > 90 j puisse
exister. **Aucune candidate à désactivation ce run** — et de toute façon aucune désactivation
automatique n'est faite (décision humaine uniquement).

*Suggestion (non implémentée)* : pour mesurer réellement la vitalité, persister la **date du
dernier panneau** dans `ref` (au-delà du seul hash) permettrait un proxy fiable sans fetch
réseau nocturne. À arbitrer par Hugo.

## Combos orphelins & stabilité des ids `?panneau=`
- **Combos orphelins** (`orphan_param_states`) : **23** lignes `source_param_states` sans
  abonnement porteur (reliquats de désabonnements) — majoritairement `vigilance-meteo`
  (dép. 10/13/16/24/31/33/35/38/44/67/69/74/75/83), `risque-secheresse` (06/14/16/53),
  `rappel-conso` (alimentation, bébés-enfants), `iss-passages` (gap), `ma-collectivite`
  (Oze, Valserres). Purge = **décision humaine** ; aucun `DELETE` effectué.
- **Stabilité des ids `?panneau=`** (vigilance consignée en tête de `ma-collectivite.js`) :
  point ouvert rappelé — si PanneauPocket régénère les ids de panneau à l'édition, une simple
  modification apparaîtrait comme « nouveau ». Non mesurable sans fetch réseau (interdit) →
  **point de vigilance ouvert, sans alarme**.

---

*Rien ne justifie une intervention urgente. Le seul élément à examiner de jour est le
404 récurrent de VigiEau (`risque-secheresse`). Tout le reste est du bruit attendu ou
cosmétique.*
