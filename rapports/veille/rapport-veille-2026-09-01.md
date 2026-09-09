# Rapport de veille — 2026-09-01

_Généré par Robot 1 (lecture seule) à 02:00 UTC. Base : 267 sources enabled, 36 combos paramétrés actifs._

---

## Résumé

3 points à surveiller, aucun bloquant :

1. **`aurores-france`** — 4 échecs, réponse NOAA JSON invalide (position 6819). Régression technique récente à confirmer.
2. **`lancement-spatial`** — 49 timeouts persistants (API Launch Library). Source marquée FRAGILE dans l'état projet, comportement dans la norme mais à surveiller dans la durée.
3. **Slug orphelin `communaute`** — présent en base (cartes `chat-perdu` et `chien-perdu`), absent de la taxonomie `server/categories.js` → libellé brut affiché au lieu d'un groupe.

Reste : schéma cohérent, aucune migration oubliée, Braderie de Lille dans 4 jours (source enabled, se déclenchera automatiquement), PanneauPocket non interrogeable cette nuit (aucun fetch réseau autorisé), 26 combos orphelins (reliquat normal).

---

## Cohérence schéma

`schema_check.ok = true` — 58 colonnes attendues, 0 manquante, 0 type_mismatch. RAS.

---

## Sources en échec (`failing_sources`)

Seuil : ≥ 2 échecs sur 7 jours.

| Source | Échecs | Dernier message | Diagnostic |
|--------|-------:|-----------------|------------|
| `sncf-perturbations` | 129 | SNCF_API_KEY absente | **Connu et documenté.** Clé à configurer sur Railway (liste de courses n°5 dans l'état projet). Pas de régression, pas d'action Robot. |
| `lancement-spatial` | 49 | Timeout API Launch Library (>10 000 ms) | Source marquée **FRAGILE** dans l'état projet (iss-api.fly.dev communautaire sans SLA). Timeouts récurrents, comportement dans la norme pour une API sans SLA. À surveiller si > 60 échecs au prochain run. |
| `statut-grafana` | 5 | Timeout status.grafana.com | API Statuspage tierce. 5 timeouts sur 7 j = signal faible. Probablement transitoire (cf. même pattern statut-gandi/scaleway). À reclasser si récurrence la semaine prochaine. |
| `aurores-france` | 4 | Réponse NOAA illisible (JSON invalide, position 6819) | ⚠️ **Régression à surveiller.** L'API NOAA renvoie un JSON mal formé depuis le 2026-08-31. Ce n'est pas un timeout mais une rupture de format — possible changement côté NOAA ou injection de contenu parasite (bannière, maintenance). La source était inactive depuis juillet (stale), donc aucun abonné ne peut avoir raté une aurore. Sans action immédiate, mais à mentionner à Hugo pour vérification manuelle du flux NOAA. |
| `statut-gandi` | 4 | Timeout status.gandi.net | API Statuspage tierce. Probablement transitoire (pic de latence côté hébergeur). Signal faible. |
| `statut-scaleway` | 4 | Timeout status.scaleway.com | Idem. |
| `statut-twitch` | 4 | Timeout status.twitch.tv | Idem. |
| `statut-pypi` | 3 | Timeout status.python.org | Idem. |
| `statut-proton` | 2 | Timeout status.proton.me | Seuil minimal, probablement transitoire. |
| `statut-vimeo` | 2 | Timeout vimeostatus.com | Idem. |

**Seule `aurores-france` mérite une attention réelle** : les 7 autres timeouts Statuspage sont un pattern connu sur les API tierces hébergées sur Railway (IP datacenter → latences variables). `sncf-perturbations` est documentée comme clé manquante.

---

## États figés (`stale_states`)

Le caveat du script s'applique intégralement : `checked_at` n'est rafraîchi que sur écriture (`write:true`). Une source/combinaison **inactive** garde un `checked_at` ancien tant que l'étape B n'est pas déployée. **Signal secondaire uniquement.**

Les sources broadcast inactives avec `checked_at` de juillet–août 2026 représentent la quasi-totalité de la liste et sont toutes explicables :
- Sources saisonnières hors saison (Géminides, Perséides passées, Braderie, Soldes, etc.)
- Sources power-user sans abonné actif (veille-page, veille-stock, domaine-*, etc.)
- Sources dormantes connues (EcoWatt, Ecogaz, leboncoin-livraison en phase observation)

**Un seul cas croisé avec `failing_sources`** : `aurores-france` (stale inactive + échecs JSON NOAA) — corroboré, signalé ci-dessus.

**Combos `vigilance-meteo` en état `active` avec `checked_at` de juillet** : ces 10+ combos (dépts 31, 33, 35, 38, 44, 67, 74, 75, 83, 24, 13…) apparaissent aussi dans `orphan_param_states`. Voir section dédiée.

---

## Jamais actives depuis 90 jours (`never_active_90d`)

La liste compte ~160 sources — vaste mais normale dans son ensemble. Quasi-totalité sont saisonnières ou power-user sans abonné. Focus sur les cas qui méritent attention :

**Cartes PanneauPocket curées jamais activées** (parmi les vague L) : `cantine-a2m2v`, `dechets-campagne-caux`, `dechets-la-saucelle`, `eau-puisaye-forterre`, `securite-gendarmerie-bayeux` — créées le 2026-07-24, jamais passées `activated`. Pour les gendarmeries, l'état projet rappelle que la famille gendarmerie est massivement dormante (~85 %) — comportement attendu. Pour les déchets et la cantine, c'est cohérent si les entités PanneauPocket concernées n'ont rien publié depuis la mise en ligne. Ces 5 cartes sont candidates naturelles à la section vitalité PanneauPocket (cf. ci-dessous).

**Sources communautaires** (`chat-perdu`, `chien-perdu`) et `tache-echeance-glissante` : logique — ces types n'ont pas de cycle poller, leur absence de `last_activated_at` est structurelle et normale.

**`leboncoin-livraison`** : en phase observation silencieuse documentée, normal.

**`ecowatt`, `ecogaz`** : hors saison. Normaux.

**Sources à config vide** (`billetterie-concerts`, `ouverture-ventes-sncf`, `courses-mythiques`, `tour-de-france-passage`) : documentées comme "config vide TODO" dans l'état projet. Normales.

---

## Collisions d'ordre d'affichage (`display_order_collisions`)

11 collisions identifiées (ordres 40, 42, 43, 50, 51, 52, 53, 54, 55, 56, 59). Cosmétique. Exemples : `doomname`/`statut-github` à l'ordre 40, triplet `black-friday`/`soldes`/`statut-zoom` à l'ordre 51. Sans impact fonctionnel (le tri est stable par id en cas d'égalité). Pas d'urgence — à rééchelonner lors d'un prochain lot de nettoyage init.sql.

---

## TODO calendaires — échéances ≤ 60 jours (d'ici au 2026-10-31)

| Source | Fichier | Échéance | Action |
|--------|---------|----------|--------|
| **Braderie de Lille** | `braderie-lille.js` | **5–6 sept. 2026** (dans 4 jours) | Source enabled, logique calendar-factory → alerte automatique J-7/J-1. Aucune action manuelle requise. |
| **Nobel** | `nobel-prix.js` | 5–12 oct. 2026 (dans ~34 j) | Config 2026 vérifiée. TODO 2027 noté dans le fichier, hors fenêtre. |
| **Fête de la science** | `fete-science.js` | 2–12 oct. 2026 (dans ~31 j) | Config 2026 vérifiée sur fetedelascience.fr (23/07). TODO 2027 noté dans le fichier. |
| **Semaine Bleue** | `semaine-bleue.js` | 5–11 oct. 2026 (dans ~34 j) | Config 2026 confirmée. TODO 2027 noté. |
| **Écheances fiscales — Taxe foncière** | `echeances-fiscales.js` | Papier 15/10/2026 · En ligne 20/10/2026 (dans ~44 j) | Config 2026 en place. TODO 2027 noté (dates DGFiP non encore publiées à ce jour). |
| **Rendez-vous tech — Ubuntu 26.10** | `rdv-tech.js` | 15 oct. 2026 (dans ~44 j) | Config vérifiée. |
| **Semaine du goût** | `semaine-du-gout.js` | 12–18 oct. 2026 (dans ~41 j) | Config 2026 vérifiée. TODO 2027 noté. |
| **rdv-gaming — Paris Games Week** | `rdv-gaming.js` | 22–25 oct. 2026 (dans ~51 j) | Config vérifiée. Steam Next Fest 19–26 oct. aussi dans la fenêtre. TODO 2027 noté. |

Toutes ces sources ont leur config 2026 posée ; aucune action corrective n'est requise avant le 31/10. Les TODO 2027 sont tous au-delà de 60 jours.

**Au-delà de 60 jours (pour mémoire, sans alerte)** : changement d'heure (dernier dimanche d'octobre), black-friday (~27 nov.), beaujolais-nouveau (3e jeudi de novembre), fête des Lumières (décembre), prime-noel (16 déc.), Géminides (décembre), taxe d'habitation des résidences secondaires (15 déc.), Téléthon (4–5 déc.).

---

## Slugs orphelins (base vs taxonomie)

**1 orphelin identifié** : le slug `communaute` est utilisé en base (cartes `chat-perdu` et `chien-perdu`) mais **absent de `server/categories.js`** (taxonomie fermée exposée par `/api/categories`).

Conséquence : sur l'interface, ces deux cartes s'affichent avec le slug brut `communaute` au lieu d'un libellé de groupe lisible. La carte `chat-perdu` a été déployée le 14/08 et `chien-perdu` le 15/08 ; l'entrée taxonomie n'a vraisemblablement pas été ajoutée en même temps.

**Tous les autres slugs de la base sont présents dans la taxonomie.** Aucun autre orphelin.

---

## Vitalité des cartes PanneauPocket curées (tâche f)

**Limite de méthode (à énoncer clairement)** : la section `panneaupocket_vitality` du script est revenue **vide** (`[]`). La base ne stocke aucune date de publication de panneau — la colonne `ref` ne contient que des couples `[panneauId, hash]`. Le seul proxy en base est `last_activated_at` (dernière alerte envoyée), non accessible sans requête réseau vers PanneauPocket (interdit cette nuit). **Je ne peux pas dériver de date de vitalité fiable sans fetch réseau.**

Ce que les données disponibles permettent d'inférer :

**Jamais activées** (dans `never_active_90d`, probablement `last_activated_at = NULL`) :
- `cantine-a2m2v` — créée 2026-07-24
- `dechets-campagne-caux` — créée 2026-07-24
- `dechets-la-saucelle` — créée 2026-07-24
- `eau-puisaye-forterre` — créée 2026-07-24
- `securite-gendarmerie-bayeux` — créée 2026-07-24

→ Ces 5 cartes sont **candidates à désactivation (décision humaine)**. Le proxy `last_activated_at = NULL` sous-estime la vitalité (panneaux publiés mais hors filtre thématique ne déclenchent aucune alerte). **À confirmer manuellement via l'application PanneauPocket avant toute décision.**

Les gendarmeries sont particulièrement suspectes : l'état projet rappelle que ~85 % des brigades PanneauPocket sont dormantes.

**Autres curées visibles dans `stale_states` (inactives, `last_activated_at` non null mais état inactif depuis une date récente)** :
- `eau-charles-chaigneau` (stale 2026-08-17), `securite-gendarmerie-albi` (2026-08-17), `eau-provence-verte` (2026-08-19), `securite-gendarmerie-essarts` (2026-08-24), `dechets-saulieu` (2026-08-26), `local-agly-fenouilledes` (2026-08-26), `eau-coteaux-lizon` (2026-08-28), `agenda-luc-en-diois` (2026-08-29), `local-buech-devoluy` (2026-08-30), `local-chabris-bazelle` (2026-08-30)

→ Ces cartes ont eu de l'activité dans les 15 derniers jours au plus tôt. Le statut `inactive` est attendu entre deux panneaux. Pas de signal d'alerte sur ce groupe.

**Amélioration suggérée** : persister la date du dernier panneau reçu dans `ref` (ex. `ref.lastSeenAt`) permettrait un proxy de vitalité sans fetch réseau. À soumettre à Hugo pour décision.

---

## Combos orphelins & stabilité des ids `?panneau=` (tâche g)

**Combos orphelins** : **26 lignes** `source_param_states` sans abonnement actif correspondant. Échantillon représentatif :
- 10+ combos `vigilance-meteo` (dépts 10, 13, 16, 24, 31, 33, 35, 38, 44, 67, 74, 75, 83) — tous à l'état `active` ou `inactive` avec `checked_at` de juillet 2026. Ces abonnements ont vraisemblablement été créés lors de tests ou désabonnés depuis.
- 6 combos `ma-collectivite` (URLs Oze, Valserres, AMR05, Veynes, La Bâtie-Vieille) — collectivités PanneauPocket désabonnées.
- 4 combos `risque-secheresse` (dépts 06, 14, 16, 53) — désabonnés depuis la fin de l'épisode de sécheresse.
- 2 combos `rappel-conso` (bébés/enfants, alimentation) — désabonnés.
- 1 combo `iss-passages` (gap).

**Purge** : décision humaine, jamais automatique. Le volume (26 lignes) est faible et sans impact sur la prod. À purger lors d'un prochain lot de maintenance.

**Stabilité des ids `?panneau=`** : point de vigilance ouvert (consigné en tête de `server/sources/ma-collectivite.js`). Si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme « nouveau » pour les cartes à anti-rétroactif id→hash. Impossible à mesurer sans fetch réseau (interdit). Signal à garder en tête sans alarme.

---

## BROUILLON — À valider par Hugo avant toute exécution

### Correctif : ajouter `communaute` à la taxonomie

**Contexte** : le slug `communaute` est utilisé par `chat-perdu` et `chien-perdu` mais absent de `server/categories.js`.

**Action proposée** : ajouter une entrée de groupe dans `CATEGORIES` :

```js
// Dans server/categories.js, à placer dans le groupe approprié
{ slug: 'communaute', label: 'Communauté', icon: '🤝' }
```

La position dans le tableau détermine l'ordre d'affichage. À choisir par Hugo selon l'ergonomie souhaitée (probablement près de `vie-locale`).

**⚠️ Ce brouillon n'est pas exécuté par Robot 1. À valider par Hugo avant toute modification.**
