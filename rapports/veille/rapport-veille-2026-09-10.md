# Rapport de veille — 2026-09-10

*Robot 1 — Veilleur de maintenance (lecture seule). Généré à partir de
`node scripts/veille-readonly.js` (`generated_at` 2026-09-10T02:00:12Z).
267 sources enabled, 36 combinaisons paramétrées.*

## Résumé

1. **Schéma cohérent** — 58 colonnes attendues, 0 manquante, 0 type inattendu. RAS.
2. **Sources en échec : aucune régression.** SNCF (clé absente, connu), plus des
   timeouts tiers transitoires (Launch Library, Gandi, Scaleway) et le throttle
   429 attendu d'EcoWatt.
3. **2 TODO calendaires à traiter sous 60 j** : `courses-mythiques` (échéance
   *septembre*, déjà dépassée ce mois) et `tour-de-france-passage` (échéance
   *octobre* pour le parcours 2027). Les deux ont une config vide → sources muettes.
4. **1 slug orphelin** : `communaute` (cartes `chat-perdu`/`chien-perdu`) absent de
   la taxonomie `/api/categories` → tag rendu en slug brut.
5. **3 cartes PanneauPocket curées jamais activées** depuis leur création (24/07) :
   `dechets-campagne-caux`, `dechets-la-saucelle`, `securite-gendarmerie-bayeux` —
   à surveiller (décision humaine, le proxy sous-estime).

---

## Sources en échec (≥ 2 échecs / 7 j)

| Source | Échecs | Dernier message | Lecture |
|---|---|---|---|
| `sncf-perturbations` | 131 | `SNCF_API_KEY absente de l'environnement` | **Attendu.** Clé jamais posée sur Railway (dette connue, cf. état-projet). Pas un bug de code. |
| `lancement-spatial` | 49 | `Timeout API Launch Library (>10000 ms)` | API tierce (Launch Library) lente/instable. Transitoire ; à surveiller si le compteur continue de grimper. |
| `ecowatt` | 15 | `HTTP 429, prochain cycle` | **Comportement normal** : auto-limitation, la source réessaie au cycle suivant. Aucune action. |
| `statut-gandi` | 3 | `Timeout status.gandi.net (>10000 ms)` | Timeout ponctuel d'une page de statut tierce. Bénin. |
| `statut-scaleway` | 2 | `Timeout status.scaleway.com (>10000 ms)` | Idem. Bénin. |

Aucune panne réelle à signaler : tout est soit une cause connue (clé SNCF), soit un
throttle attendu, soit un timeout tiers transitoire.

## Cohérence schéma

`schema_check.ok = true` — schéma cohérent (58 colonnes attendues présentes, aucun
type inattendu). RAS.

## États figés (`stale_states`)

Longue liste d'entrées `inactive` au `checked_at` ancien : **bruit attendu** selon le
`caveat` (le `checked_at` n'est réécrit que sur écriture ; une source/combinaison
inactive garde une date ancienne tant que l'étape B n'est pas déployée).

Les seules entrées `active` figées (vigilance-meteo dépts 13/16/24/31/33/35/38/44/67/74/75/83,
risque-secheresse 06/14/16/53, rappel-conso alimentation & bébés-enfants,
iss-passages/gap) sont **toutes présentes dans `orphan_param_states`** : ce sont des
combinaisons sans abonné, donc plus polées → leur état est gelé au dernier check
souscrit. Explication complète, **aucune alarme**.

## Jamais actives depuis 90 j (`never_active_90d`)

Rien d'anormal. La liste est dominée par des sources **saisonnières hors saison**
(beaujolais, black-friday, changement-heure, saints-de-glace, perséides, éclipse…),
des sources **événementielles non déclenchées** (statuts cloud, prix littéraires,
prix Nobel à venir en oct.), et des sources **récemment ajoutées** (cartes
communautaires, vagues d'été). Les nouveaux types (`tache-echeance-glissante` =
`user-task`, `chat-perdu`/`chien-perdu` = `community`) n'ont par nature pas d'état de
veille. Aucune source « censée s'activer souvent » n'est muette.

## Collisions d'ordre d'affichage (`display_order_collisions`)

11 collisions, **purement cosmétiques**. Elles opposent presque toutes une carte
saisonnière à une carte « statut » (ex. `black-friday`/`soldes`/`statut-zoom` sur 51,
`eclipse-solaire`/`geminides`/`nuits-des-etoiles` sur 56, `doomname`/`statut-github`
sur 40). Sans urgence. Un ré-échelonnement des `display_order` 40-59 lèverait le tout
si Hugo veut un ordre déterministe, mais rien ne le presse.

## TODO calendaires ≤ 60 j (fenêtre → 2026-11-09)

**À traiter sous 60 jours :**

- **`courses-mythiques`** (`server/sources/courses-mythiques.js:13`) — TODO *septembre
  2026* : transcrire les dates officielles 2027 à l'ouverture des inscriptions
  (~sept.). **Échéance déjà atteinte ce mois-ci**, config toujours vide → source muette.
  Rien à inventer : à renseigner dès qu'une page officielle confirme (Marathon de Paris
  pressenti 11 avr. 2027, Semi 7 mars 2027, Paris-Versailles non annoncé).
- **`tour-de-france-passage`** (`server/sources/tour-de-france-passage.js:17`) — TODO
  *octobre 2026* : à l'annonce du parcours 2027 (ASO, octobre N-1), transcrire
  département → dates depuis letour.fr. Config volontairement vide jusque-là.

**Événements datés qui se déclenchent dans la fenêtre, déjà codés (informatif, aucune
action) :** `echeances-fiscales` (taxe foncière 15/20 oct. 2026), `fete-science`
(2-12 oct. 2026), `journees-patrimoine` (3e week-end sept.), `treve-hivernale` (1er nov.),
`beaujolais-nouveau` (3e jeudi nov.) — tous calculés/renseignés pour 2026.

**Annexe (au-delà de 60 j, sans alerte) :** `bison-fute` (TODO début 2027),
`echeances-fiscales` THRS 15/20 déc. + entrées 2027, `evenements-astro` (Opposition
d'Uranus 25 nov. codée ; Quadrantides 3 janv. 2027 codés ; compléter 2027+),
`fete-science` 2027 (avant 30/09/2027), `grandes-causes` (Restos du Cœur lancement
~18 nov. 2026 **non codé**, ~69 j → juste hors fenêtre, à surveiller ; Téléthon 4-5 déc.
codé ; TODO Sidaction/Pièces Jaunes/Restos 2027).

## Slugs orphelins

**1 orphelin : `communaute`.** Présent en base (porté par les cartes `chat-perdu` et
`chien-perdu`, catégorie `communaute`) mais **absent de la taxonomie** déclarée dans
`server/categories.js` (servie au front via `/api/categories`). Conséquence :
`window.LBACat.label('communaute')` retombe sur le slug brut (`public/js/categories.js:12`),
le tag s'affiche « communaute » au lieu d'un libellé propre.

Correctif possible : ajouter `communaute` à un groupe de `GROUPS` dans
`server/categories.js` (par ex. un libellé « Communauté »). Voir brouillon ci-dessous.

## Vitalité PanneauPocket curée (Vague L)

Jeu curé identifié dynamiquement = 19 cartes broadcast bâties sur
`lib/panneaupocket-veille` via `makeCurated(…)`/`createBroadcastSource(…)` (hors
`panneaupocket` et `ma-collectivite` paramétrées).

> **Limite de méthode (rappel)** : la base ne stocke aucune date de publication de
> panneau (colonne `ref` = couples `[panneauId, hash]`). Seul proxy disponible :
> `last_activated_at` (dernier panneau *alertable* nouveau/modifié), qui **sous-estime**
> la vitalité (panneaux hors filtre thématique ou cosmétiques ne le rafraîchissent pas).
> Toute « candidate » ci-dessous est à confirmer par un humain via l'appli PanneauPocket.
> Jamais de désactivation automatique, jamais de modification de `enabled`.

**Candidates à désactivation (décision humaine) — jamais activées :**

- `dechets-campagne-caux` — aucun `last_activated_at` (créée le 24/07, ~48 j).
- `dechets-la-saucelle` — aucun `last_activated_at` (créée le 24/07, ~48 j).
- `securite-gendarmerie-bayeux` — aucun `last_activated_at` (créée le 24/07, ~48 j).

Nuance : ces 3 cartes n'ont **jamais** produit d'événement alertable, mais elles ont
< 90 j d'existence et le proxy sous-estime — donc **à surveiller** plutôt que candidates
fermes. La famille gendarmerie étant ~85 % dormante, `securite-gendarmerie-bayeux` est
la plus à re-vérifier en priorité (via l'appli PanneauPocket).

**Le reste du jeu est vivant** (dernier panneau alertable récent) : `local-chablis` &
`local-chabris-bazelle` (0 j), `local-agly-fenouilledes` & `eau-puisaye-forterre` (0 j),
`arrosage-canal-gap`, `eau-isle-dronne`, `eau-regie-metz` (1 j), `securite-gendarmerie-essarts`
(3 j), `cantine-a2m2v` & `local-buech-devoluy` (5 j), `agenda-luc-en-diois`,
`eau-charles-chaigneau`, `eau-provence-verte` (7 j), `eau-coteaux-lizon` (12 j),
`dechets-saulieu` (14 j), `securite-gendarmerie-albi` (23 j). Aucune > 90 j.

*Meilleure mesure proposée (non implémentée) : persister dans `ref` la date du dernier
panneau vu (même hors filtre thématique) donnerait un vrai proxy de vitalité sans
requêter PanneauPocket la nuit.*

## Combos orphelins & stabilité des ids `?panneau=`

- **Combos orphelins (`orphan_param_states`) : 26.** Lignes `source_param_states` sans
  aucun abonnement porteur du couple `(source_id, params)` — reliquat de
  désabonnements (vigilance-meteo & risque-secheresse par dépt, ma-collectivite 5 URLs,
  rappel-conso, iss-passages/gap…). Purge = **décision humaine** ; aucun `DELETE` par le
  robot. C'est aussi ce qui explique les états `active` figés (cf. « États figés »).
- **Stabilité des ids `?panneau=`** (consignée en tête de `server/sources/ma-collectivite.js`) :
  point de vigilance ouvert — si PanneauPocket régénère les ids de panneau à l'édition,
  une simple modification apparaîtrait comme « nouveau ». Non mesurable sans fetch réseau
  (interdit la nuit). Signalé sans alarme.

---

## BROUILLON — à valider par Hugo avant toute exécution

*Non validé, jamais exécuté par le robot. Corrige le slug orphelin `communaute`.*

Ajouter le slug `communaute` à la taxonomie fermée pour lui donner un libellé propre.
Dans `server/categories.js`, l'insérer dans un groupe existant (par ex. `vie-locale` ou
`solidarite`), ou créer une entrée dédiée :

```js
// server/categories.js — dans GROUPS
'vie-locale': ['vie-locale', 'communaute', /* … reste inchangé … */],
```

Optionnel, si un libellé exact est souhaité (sinon `toLabel` produit « Communaute ») :

```js
// server/categories.js — dans SPECIAL
'communaute': 'Communauté',
```

Aucune migration DB requise (le slug existe déjà en base) : le tag sera simplement
résolu en libellé au lieu du slug brut au prochain chargement de `/api/categories`.
