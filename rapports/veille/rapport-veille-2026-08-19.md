# Rapport de veille — 2026-08-19

_Généré le 2026-08-19 à 08:07 UTC par Robot 1 (lecture seule). 267 sources enabled, 36 combinaisons paramétrées actives._

---

## Résumé

1. **`statut-anthropic` : erreur TLS persistante** (cert mismatch) — URL à vérifier ou source à corriger.
2. **`lancement-spatial` & `ecowatt` : timeouts récurrents** — API tierces instables, à surveiller.
3. **`risque-secheresse` : 9 échecs, dernier le 14/08** — un fix a été commité récemment ; à confirmer que le compteur n'augmente plus.
4. **Slug orphelin `communaute`** — utilisé par chat-perdu et chien-perdu, absent de la taxonomie `server/categories.js` → libellé brut affiché à la place du label.
5. **6 cartes PanneauPocket curées jamais activées** — candidates à examen (décision humaine).
6. **Échéances calendaires immédiates** : allocation rentrée scolaire versée **aujourd'hui** (métropole), Rock en Seine dans 7 jours, rentrée scolaire dans 13 jours.

---

## Sources en échec

Seuil : ≥ 2 échecs sur 7 jours.

| Source | Échecs | Dernier message | Analyse |
|--------|--------|-----------------|---------|
| `sncf-perturbations` | 130 | SNCF_API_KEY absente | **Normal.** Clé non posée sur Railway ; documenté dans l'état projet. Aucune action code. |
| `lancement-spatial` | 49 | Timeout API Launch Library (>10 000 ms) | API tierce instable. Pas de régression LBA. À surveiller si le taux monte encore. |
| `ecowatt` | 10 | Timeout auth RTE (>10s) | Timeouts répétés côté RTE. Dernier échec ce matin (07:00). À surveiller. |
| `risque-secheresse` | 9 | Réponse HTTP inattendue VigiEau : 404 | Dernier échec **le 14/08** (5 jours). Un commit récent mentionne « Fix risque-secheresse 404 nocturne ». Si le compteur est resté à 9 depuis le 14/08, le fix est efficace. Vérifier en passant la semaine. |
| `statut-anthropic` | 6 | Cert mismatch : `status.anthropic.com` absent des altnames `*.statuspage.io` | **Vraie régression.** Le certificat TLS de l'endpoint ne couvre plus le domaine interrogé. L'URL de l'API de statut Anthropic a peut-être changé. Voir brouillon ci-dessous. |
| `bitcoin-mouvement` | 5 | Timeout CoinGecko (>10 000 ms) | Timeouts CoinGecko récurrents mais intermittents. Dernier échec 17/08. Pas de panne durable détectée. |
| `aurores-france` | 2 | JSON invalide NOAA (position 6824) | 2 seuls échecs sur 7 jours — probablement transitoire (troncature de réponse NOAA). À surveiller le prochain cycle. |

---

## États figés (stale_states)

Signal secondaire — le caveat du script s'applique intégralement : `checked_at` n'est mis à jour que sur écriture (transition ou amorçage). Une source `inactive` stable ne rafraîchit jamais son `checked_at`. **La grande majorité des entrées stale sont des sources inactives depuis les vagues juillet — comportement attendu.**

Seule exception notable : les 9 combinaisons `vigilance-meteo` avec état `active` et `checked_at` de mi-juillet → elles sont toutes dans `orphan_param_states` (désabonnements, voir section dédiée). Leur vieillissement est normal : le poller ne tourne plus pour elles.

---

## Sources jamais activées depuis 90 jours (never_active_90d)

La liste est longue (~150 sources) et largement normale : sources saisonnières (beaujolais, carnavals, changement-heure, saint-nicolas, trève hivernale, black-friday…), sources récemment ajoutées (vagues juillet), dormantes par conception (sncf-perturbations sans clé, risque-avalanche sans clé, ecowatt/ecogaz en attente de pic).

Rien à signaler dans ce lot en dehors des cartes PanneauPocket curées traitées ci-dessous.

---

## Collisions d'ordre d'affichage

11 collisions détectées (ordres 40, 42, 43, 50, 51×3, 52, 53, 54, 55, 56×3, 59). Cosmétique. Les sources affectées sont essentiellement des statuts de services (ajoutés en lot avec le même order) et quelques sources calendaires proches. Aucune urgence ; un ré-échelonnement peut se faire lors du prochain passage sur init.sql.

---

## TODO calendaires — échéances ≤ 60 jours (avant le 2026-10-18)

| Échéance | Source | Détail |
|----------|--------|--------|
| **Aujourd'hui 19/08** | `allocation-rentree-scolaire` | Versement ARS métropole + Antilles-Guyane le 19/08/2026. La source devrait être ou avoir été active. **TODO 2027** : ajouter la date dès publication CAF (mi-août). |
| **26-30/08** | `festivals-musique` | Rock en Seine (Saint-Cloud) — dernier festival de la config 2026. Aucun TODO immédiat ; **TODO 2027** pour Vieilles Charrues et Solidays (non annoncés à la rédaction). |
| **28/08** | `bison-fute` | Dernier jour rouge 2026 (retours, vendredi). Après cette date la config 2026 est épuisée. **TODO début 2027** : mettre à jour `JOURS_2026` → `JOURS_2027` dès parution du calendrier officiel. |
| **1er/09** | `rentree-scolaire` | Rentrée des élèves 2026 — config codée en dur. **TODO 2027** à compléter dès parution de l'arrêté. |
| **5-6/09** | `braderie-lille` | Braderie de Lille — config codée en dur. **TODO 2027** à compléter dès annonce. |
| **11-13/09** | `grandes-marees` | Grandes marées coeff 102. Config couvre jusqu'au 27/10 inclus. **TODO 2027** à faire dès parution SHOM. |
| **2-12/10** | `fete-science` | Fête de la Science 2026 (thème « Saveurs savantes »). **TODO 2027** : dates non annoncées au 23/07 → à ajouter avant le 30/09/2027. |
| **5-11/10** | `semaine-bleue` | Semaine Bleue 2026 confirmée. **TODO 2027** : dates non encore annoncées. |
| **5-12/10** | `nobel-prix` | Semaine des Nobel 2026 (5 oct. Médecine → 12 oct. Économie). **TODO 2027** : mettre à jour depuis nobelprize.org dès annonce. |
| **15-20/10** | `echeances-fiscales` | Taxe foncière 2026 : papier 15/10, en ligne 20/10. Config 2026 en place. **TODO 2027** : dates THRS (déc) et TF non encore annoncées par la DGFiP. |

**Annexe — au-delà de 60 jours (pour mémoire, pas d'alerte)** :
- `grandes-marees` : 27/10 (coeff 100) — couvert par la config 2026.
- `echeances-fiscales` : THRS papier 15/12, en ligne 20/12 — couvert par la config 2026. TODO 2027 signalé dans le fichier.
- `grandes-causes` : Restos du Cœur fin novembre (non confirmé), Téléthon 4-5/12/2026 (confirmé), Sidaction/Pièces Jaunes 2027 non annoncés.
- `braderie-lille`, `bison-fute`, `festivals-musique`, `fete-science` : tous avec TODO 2027 explicite dans le fichier source.

---

## Slug orphelin

La taxonomie fermée est définie dans `server/categories.js`. Croisement avec `category_slugs` du JSON :

**`communaute`** — présent en base (cartes `chat-perdu` et `chien-perdu`) mais **absent de `server/categories.js`**. Ces deux cartes s'affichent avec le slug brut `communaute` au lieu d'un libellé localisé dans le kiosque, et ne seront pas associées à un groupe de la taxonomie.

Suggestion : ajouter `communaute` dans le groupe `vie-locale` ou créer un groupe `communaute` dédié (selon la roadmap). Ce n'est pas bloquant mais visible dans le filtre du kiosque.

---

## Cohérence schéma

`schema_check.ok === true` — 58 colonnes attendues présentes, aucune manquante, aucun type incohérent. RAS.

---

## Vitalité des cartes PanneauPocket curées

**Méthode et limite** : `panneaupocket_vitality` retourne un tableau vide (`[]`) pour ce run. La base ne stocke aucune date de publication de panneau ; le seul proxy disponible est `last_activated_at` (dernier panneau nouveau/modifié alertable). Celui-ci sous-estime la vitalité (panneaux hors filtre thématique ou cosmétiques = aucun événement). Les cartes curées identifiées (fichiers utilisant `makeCurated` dans `server/sources/*.js`) : 18 cartes (agenda-luc-en-diois, arrosage-canal-gap, cantine-a2m2v, dechets-campagne-caux, dechets-la-saucelle, dechets-saulieu, eau-charles-chaigneau, eau-coteaux-lizon, eau-isle-dronne, eau-provence-verte, eau-puisaye-forterre, eau-regie-metz, local-agly-fenouilledes, local-buech-devoluy, local-chablis, local-chabris-bazelle, securite-gendarmerie-albi, securite-gendarmerie-bayeux, securite-gendarmerie-essarts).

**6 cartes jamais activées depuis ≥90 jours (`never_active_90d`)** — candidates à examen humain :

| Carte | last_activated_at | Note |
|-------|-------------------|------|
| `cantine-a2m2v` | NULL | Menus scolaires — inactivité plausible en été (vacances). À re-vérifier à la rentrée. |
| `dechets-campagne-caux` | NULL | Aucun panneau thématique déchets depuis la création. |
| `dechets-la-saucelle` | NULL | Idem. |
| `eau-puisaye-forterre` | NULL | Aucune coupure d'eau thématique depuis la création. |
| `local-buech-devoluy` | NULL | Aucune info locale thématique depuis la création. |
| `securite-gendarmerie-bayeux` | NULL | Brigade de gendarmerie — inactivité cohérente avec la note projet (famille gendarmerie ~85% dormante). |

**Recommandation** : passer un œil humain via l'appli PanneauPocket avant de désactiver. Le proxy sous-estime (panneaux hors filtre thématique invisibles). **Aucune désactivation automatique effectuée.**

Les 12 autres cartes curées ont été vérifiées récemment (checked_at en août 2026) et ne figurent pas dans `never_active_90d`.

---

## Combos orphelins & stabilité des ids `?panneau=`

**Combos orphelins** : 26 lignes `source_param_states` sans abonnement correspondant. Répartition :

- `vigilance-meteo` : 13 combos (dépts 31, 33, 35, 38, 44, 67, 74, 75, 83, 24, 16, 10, 69, 13) — probables désabonnements de l'utilisateur pilote.
- `ma-collectivite` : 5 URLs (Ozé, Valserres, AMR05, Veynes, La Bâtie-Vieille) — collectivités testées puis désabonnées.
- `risque-secheresse` : 4 dépts (06, 14, 16, 53).
- `rappel-conso` : 2 catégories (bébés-enfants, alimentation).
- `iss-passages` : 1 (gap).

Volume modeste. Purge = décision humaine (aucun `DELETE` effectué).

**Stabilité des ids `?panneau=`** : point de vigilance ouvert (consigné en tête de `server/sources/ma-collectivite.js`). Si PanneauPocket régénère les ids à l'édition d'un panneau, une modification apparaîtrait comme « nouveau ». Non mesurable sans appel réseau (interdit la nuit). Aucune alarme à ce stade.

---

## Decks signalés

`suspended_decks: []` — aucun deck suspendu. RAS.

---

## BROUILLON — à valider par Hugo avant toute exécution

### Correctif `statut-anthropic` : erreur TLS cert mismatch

**Contexte** : depuis le 14/08/2026, la source échoue avec `Hostname/IP does not match certificate's altnames: Host: status.anthropic.com. is not in the cert's altnames: DNS:*.statuspage.io, DNS:statuspage.io`. Cela indique que l'endpoint `https://status.anthropic.com/api/v2/status.json` renvoie désormais un certificat qui ne couvre pas ce domaine (peut-être une migration CDN côté Anthropic).

**Action suggérée** : vérifier l'URL actuelle de l'API de statut Anthropic et mettre à jour `server/sources/statut-anthropic.js` si l'endpoint a changé. Possiblement `https://www.anthropicstatus.com/api/v2/status.json` ou similaire — à vérifier manuellement avant tout commit.

**Ce brouillon n'est pas exécuté par Robot 1. Validation Hugo requise.**

---

### Slug `communaute` manquant dans la taxonomie

**Action suggérée** : dans `server/categories.js`, ajouter `'communaute'` à la liste du groupe `vie-locale` (ou créer un groupe dédié si la roadmap communautaire l'exige) :

```js
// groupe vie-locale (ligne ~29 de server/categories.js) :
'vie-locale': [..., 'communaute'],
```

Puis vérifier que l'`init.sql` des cartes `chat-perdu` / `chien-perdu` référence bien `communaute` en catégorie (déjà le cas selon l'état projet).

**Ce brouillon n'est pas exécuté par Robot 1. Validation Hugo requise.**
