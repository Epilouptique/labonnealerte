# Rapport de veille — 2026-08-09

Généré par Robot 1 (lecture seule). Aucune modification effectuée.

---

## Résumé

1. **INSEE BDM indisponible** (4 sources économiques, derniers échecs 02-04/08) — panne externe probable, à surveiller.
2. **`lancement-spatial`** — 56 timeouts Launch Library sur 7 jours, dernier le 08/08 — API tierce instable, surveillance continue.
3. **`risque-secheresse`** — 30 échecs VigiEau 404, dernier le 05/08 — un fix a été commité (8497215 "Fix risque-secheresse 404 nocturne"), mais les échecs s'arrêtent le 05/08 : à confirmer que le fix est bien déployé en prod.
4. **Slug orphelin `communaute`** — présent en base (source `chat-perdu`, non encore déployée), absent de la taxonomie `server/categories.js` : à ajouter avant le déploiement de chat-perdu.
5. **26 combos orphelins** `source_param_states` — reliquat normal de désabonnements, aucune urgence.

RAS sur le schéma (ok:true), les cartes PanneauPocket curées, et les TODO calendaires ≤60 jours.

---

## Cohérence schéma

`schema_check.ok = true` — 56 colonnes attendues, 0 manquante, 0 type mismatch. Aucune migration oubliée.

---

## Sources en échec

### `sncf-perturbations` — 133 échecs, dernier 09/08
**Cause connue :** `SNCF_API_KEY absente de l'environnement`. Variable Railway non configurée, documentée dans l'état du projet. Normal.

### `lancement-spatial` — 56 échecs, dernier 08/08
**Cause :** timeout API Launch Library (> 10 000 ms). API tierce communautaire sans SLA garanti. Signal à surveiller sur plusieurs runs : si le taux d'échec reste ≥ 80 % au prochain rapport, envisager une hausse du timeout ou un repli.

### `risque-secheresse` — 30 échecs, dernier 05/08
**Cause :** `Réponse HTTP inattendue VigiEau : 404`. Un fix a été commité (commit 8497215 "Fix risque-secheresse 404 nocturne + unicite deck_reports"). Les échecs cessent le 05/08, ce qui suggère que le fix était actif à cette date ou que l'endpoint 404 s'est résolu côté VigiEau. À confirmer via les Deploy logs Railway. Des combos `risque-secheresse` restent en state `active` dans les orphelins (depts 06, 14, 16, 53) — leur état date du 19/07. Si le fix n'est pas déployé et que ces abonnements sont encore actifs, ils pourraient manquer des alertes.

### `ecowatt` — 15 échecs, dernier 09/08
**Cause :** `Réponse HTTP inattendue EcoWatt : 500 Internal Server Error`. Panne côté RTE, transitoire. `checked_at` stale du 11/07 : cohérent avec l'état `inactive` figé depuis le début (EcoWatt hors saison en août). Signal secondaire, bruit attendu.

### INSEE BDM — 4 sources, 12-14 échecs chacune, derniers échecs 02-04/08
Sources concernées : `indice-reference-loyers`, `inflation-insee`, `ipc-alimentaire`, `chomage-stats`. Toutes : `read ECONNRESET`. `prix-logements-anciens` : `500` INSEE. Même pattern, derniers échecs concentrés sur 02-04/08. Probable indisponibilité temporaire de `bdm.insee.fr`. Aucun échec signalé depuis le 04/08 → la connexion semble rétablie. À confirmer au prochain run.

---

## États figés (signal secondaire)

Tous les `stale_states` de type `inactive` sont cohérents avec le caveat du script : `checked_at` n'est mis à jour qu'à l'écriture, et une source en `still-inactive` ne génère pas d'écriture. Aucun bruit inattendu.

**Point d'attention :** 9 combos `vigilance-meteo` apparaissent en state `active` avec `checked_at` entre le 14 et le 19 juillet (depts 31, 33, 35, 38, 44, 67, 74, 75, 83, 24, 13). D'après le caveat, si la vigilance météo s'est maintenue en `still-active` depuis mi-juillet, le `checked_at` ne bouge pas — comportement attendu. La source `vigilance-meteo` n'apparaît **pas** dans `failing_sources`, donc elle fonctionne. Ce n'est pas une alarme, mais il est inhabituel qu'autant de départements restent en vigilance active depuis ~25 jours. À vérifier visuellement sur le site si un abonné signale un problème.

---

## TODO calendaires ≤ 60 jours (échéance avant 2026-10-08)

**Aucun TODO ne tombe dans cette fenêtre.** Tous les marqueurs `TODO` dans les sources visent 2027 ou plus.

Les événements **déjà configurés** qui approchent (RAS, aucune action requise) :
- Éclipse solaire partielle : **12/08/2026** — dans 3 jours. Déjà dans `eclipse-solaire.js`.
- Nuits des étoiles : **7-9/08/2026** — ce week-end. Configuré.
- Grandes marées : 13/08, 11/09, 27/10. Configuré.
- Bison Futé : 15/08, 28/08. Configuré.
- Allocation rentrée scolaire : **19/08/2026**. Configuré.
- Braderie de Lille : **5-6 sept**. Configuré.
- Nobel Prix : **5-12 oct**. Configuré.
- Fête de la Science : **2-12 oct**. Configuré.
- Semaine Bleue : **5-11 oct**. Configuré.
- Semaine du goût : **12-18 oct**. Configuré (légèrement hors-fenêtre).
- Taxe foncière : **15/20 oct** (papier/en ligne). Configuré.

**Annexe — TODOs hors fenêtre 60 j (pour mémoire) :**

| Source | Délai | Description |
|---|---|---|
| `grandes-marees` | Avant fin oct. 2026 | "Sans mise à jour, la source reste dormante après octobre 2026" — transcrire les périodes 2027 depuis maree.info/SHOM. |
| `bison-fute` | Début 2027 | Remplacer `JOURS_2026` par le calendrier officiel 2027. |
| `echeances-fiscales` | Début 2027 | Ajouter l'entrée 2027 (TF + THRS + remboursements + non-résidents). |
| `nuits-des-etoiles` | Début 2027 | Ajouter l'édition 2027 (dates publiées par l'AFA). |
| `allocation-rentree-scolaire` | Mi-août 2027 | Ajouter la date de versement dès publication CAF. |
| `braderie-lille` | Début 2027 | Mettre à jour avec les dates 2027. |
| `semaine-bleue` | Avant oct. 2027 | Ajouter les dates officielles 2027. |
| `fete-science` | Avant 30/09/2027 | Ajouter l'édition 2027 dès parution. |
| `nobel-prix` | Début 2027 | Mettre à jour les dates depuis nobelprize.org. |
| `rdv-tech` | Dès annonce | Google I/O 2027, Apple WWDC 2027, keynote Apple sept. 2026 → ajouter dès annonce. |

---

## Slugs orphelins

**1 orphelin détecté :** slug `communaute` utilisé en base par la source `chat-perdu` (type `community`, display_order 500, créée le 04/08/2026), **absent de la taxonomie** `server/categories.js`.

Conséquence : les cartes avec `categories: ['communaute']` afficheraient le slug brut « communaute » au lieu d'un libellé lisible dans le filtre du kiosque.

À ajouter dans `server/categories.js` avant le déploiement de `chat-perdu`. Aucune urgence tant que la carte n'est pas déployée (non migrée, non validée manuellement d'après l'état du projet).

---

## Vitalité PanneauPocket curées (Vague L)

La section `panneaupocket_vitality` du script est vide (`[]`). Interprétation : toutes les sources curées qui font l'objet du contrôle ont soit une `last_activated_at` < 90 jours, soit le script n'a pas identifié de candidat dépassant le seuil.

**Rappel de la limite de méthode :** la base ne stocke aucune date de publication de panneau — seul `last_activated_at` (dernier panneau *alertable* selon le filtre thématique) est disponible comme proxy. Ce proxy sous-estime la vitalité (panneaux hors filtre ou cosmétiques ne génèrent pas d'événement). Un résultat vide est donc rassurant mais non conclusif.

Aucune carte à signaler comme candidate à désactivation ce run.

---

## Combos orphelins & ids `?panneau=`

**26 combos orphelins** dans `source_param_states` (lignes sans abonnement actif correspondant). Échantillon :
- `iss-passages` / `{"ville":"gap"}` — ancienne forme avant la migration vers coords (`44.5797|6.0616|Gap`) ; l'entrée récente est bien présente dans les stale_states.
- `ma-collectivite` / 4 URLs de collectivités des Hautes-Alpes (Oze, Valserres, AMR 05, Veynes, La Bâtie-Vieille).
- `rappel-conso` / catégories "bébés-enfants" et "alimentation".
- `risque-secheresse` / depts 06, 14, 16, 53.
- `vigilance-meteo` / 13 combinaisons (depts 10, 13, 16, 24, 31, 33, 35, 38, 44, 67, 69, 74, 75, 83).

Tous reliquats de désabonnements ou de migrations de paramètres. La purge est une décision humaine ; la table restera cohérente tant qu'aucun DELETE n'est lancé. Aucune urgence.

**Stabilité des ids `?panneau=` :** point de vigilance ouvert (consigné en tête de `ma-collectivite.js`). Non mesurable sans fetch réseau (interdit). Si PanneauPocket régénère les ids à l'édition d'un panneau, une modification apparaîtrait comme « nouveau ». Aucune alarme ce run — à surveiller si des abonnés signalent des notifications en doublon sur une même collectivité.

---

## Collisions `display_order`

11 collisions détectées (cosmétique) :

| order | sources |
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

Sans impact fonctionnel (le tri par `display_order` reste déterministe en cas d'égalité via l'id). À rééchelonner au prochain chantier init.sql si souhaité.
