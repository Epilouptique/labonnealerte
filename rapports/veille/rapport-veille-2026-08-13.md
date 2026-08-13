# Rapport de veille — 2026-08-13

Généré par Robot 1 (lecture seule). Base : 266 sources enabled, 36 combos paramétrés.

---

## Résumé (5 lignes)

1. **`lancement-spatial` : timeout systématique** — 51 échecs, API Launch Library inaccessible ; aucune activité depuis le 14 juillet. Signal réel à surveiller.
2. **`bitcoin-mouvement` : timeout CoinGecko** — 7 échecs depuis hier soir (12 août 21h) ; probablement rate-limit ou indisponibilité ponctuelle. Niveau bas.
3. **Slug orphelin `communaute`** — utilisé par `chat-perdu`, absent de la taxonomie `server/categories.js` ; la carte s'affiche avec le slug brut.
4. **TODO calendaire urgent** — Grandes marées 13-15 août **dans 2 jours** et allocation rentrée scolaire (métropole) 19 août **dans 6 jours** : dates bien en dur dans le code, RAS. Rentrée scolaire 1er sept et Braderie de Lille 5-6 sept à venir : OK.
5. **Vitalité PanneauPocket indisponible** ce run (`panneaupocket_vitality: []`, vraisemblablement erreur silencieuse dans le script — voir section f).

---

## Sources en échec

### `lancement-spatial` — ⚠️ Timeout répété (51 échecs)

- **Cause** : `Timeout API Launch Library (>10000 ms)` — dernier échec 2026-08-13 07:01.
- **51 échecs sur 7 jours**, `checked_at` stale depuis le 14 juillet → source jamais revenue active.
- L'API Launch Library (ll2.thespacedevs.com) est connue pour des lenteurs mais 51 timeouts consécutifs depuis 4 semaines est inhabituel. Possible dégradation prolongée côté tiers.
- **Action suggérée (décision Hugo)** : vérifier manuellement si ll2.thespacedevs.com répond ; si la dégradation est confirmée, envisager un allongement du timeout (actuellement 10 s) ou un repli.

### `bitcoin-mouvement` — ℹ️ Timeout CoinGecko (7 échecs, depuis hier)

- **Cause** : `Timeout CoinGecko (>10000 ms)` — premier échec 2026-08-12 21:00.
- 7 échecs en ~11 h ; probable limitation de débit ou micro-indisponibilité de CoinGecko.
- Niveau bas : à surveiller au prochain run. Si > 15 échecs demain, investiguer.

### `sncf-perturbations` — ✅ Cause connue, RAS

- 133 échecs, `SNCF_API_KEY absente de l'environnement`. Variable Railway à configurer, pas du code. Situation connue documentée dans l'état du projet.

---

## États figés (stale_states)

Bruit attendu dans l'ensemble : quasi-totalité des sources inactives avec `checked_at` ancien est cohérente avec le caveat (étape B non déployée, `checked_at` non rafraîchi en still-inactive).

**Points spécifiques relevés :**
- `vigilance-meteo` params 31/33/35/38/44/67/74/75/83 : état `active` avec `checked_at` du 14-19 juillet. Ces combos sont orphelins (voir section g) — plus d'abonné actif. Leur état figé est donc normal (jamais remis à jour sans abonné).
- `iss-passages {ville: "gap"}` : état `active`, `checked_at` 2026-07-23. Combo orphelin (désabonnement). Normal.
- `rappel-conso` params alimentation/bébés-enfants : états `active`, `checked_at` juillet. Orphelins. Normal.

Aucun état `active` ou `pending` figé non orphelin détecté.

---

## Sources jamais actives en 90 jours

Très nombreuses (~160 sources). La quasi-totalité est normale :
- **Saisonnières hors saison** : beaujolais-nouveau, changement-heure, black-friday, geminides, treve-hivernale, saint-nicolas, fete-des-lumieres, nuits-de-la-lecture, carnavals, etc. → attendu.
- **Clé API absente** : sncf-perturbations → attendu.
- **Broadcast jamais déclenché** : cyclones-outremer (hors saison cyclonique côté sources), seisme-mondial-majeur (seuil M≥7,5 non atteint), tempete-solaire (seuil G≥4 non atteint), etc. → attendu.
- **Nouvelles sources vagues 2026** (depuis juillet) : toutes normales, aucune n'a encore eu le temps de s'activer.
- **`pannes-hydro-quebec`** : noté FRAGILE dans l'état du projet (bisversion.json illisible) — jamais active, cohérent.

**Aucune source anormalement silencieuse détectée.**

---

## Collisions d'ordre d'affichage

11 collisions dans la plage 40-59 :

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

Cosmétique, sans impact fonctionnel. Un ré-échelonnement peut être fait lors d'un prochain fil.

---

## TODO calendaires — échéances ≤ 60 jours (avant 2026-10-12)

### ✅ Imminent mais en ordre

| Source | Échéance | Statut |
|---|---|---|
| **grandes-marees** | 13-15 août (dans 2 j) | Dates 2026 en dur — OK |
| **allocation-rentree-scolaire** | 19 août métropole (dans 6 j) | Date en dur — OK |
| **perseides** | pic 12-13 août (passé hier) | Annuel calculé — OK |
| **nuits-des-etoiles** | 7-9 août (passé) | Date 2026 en dur — OK |
| **eclipse-solaire** | 12 août (passé hier) | Date en dur, prochaine = 2027-08-02 — OK |
| **rentree-scolaire** | 1er sept | Date en dur — OK |
| **braderie-lille** | 5-6 sept | Date en dur — OK |
| **semaine-bleue** | 5-11 oct | Date en dur — OK |

### ⚠️ Fin de couverture 2026 — grandes-marees

La source couvre les périodes jusqu'au 27 oct. 2026 (coeff 100). Après, **aucune date 2027** → source dormante dès novembre 2026. Le commentaire indique `TODO 2027 : transcrire les périodes coeff ≥ 100 depuis maree.info / SHOM`. Délai recommandé : fin octobre 2026. **Hors fenêtre 60 j**, mais à noter pour la prochaine itération.

### Annexe — échéances > 60 j

| Source | Échéance | Note |
|---|---|---|
| echeances-fiscales | TF 15 oct / 20 oct (papier/en ligne) | À 63 j, dates en dur OK |
| echeances-fiscales | THRS 15 déc / 20 déc | OK |
| grandes-causes | Téléthon 4-5 déc | OK |
| bison-fute | Dernière date : 28 août 2026 (retours) | TODO 2027 : calendrier rouge/noir à transcrire |
| nuits-des-etoiles | TODO 2027 (dates AFA non annoncées) | Normal |
| rentree-scolaire | TODO 2027 (arrêté non paru) | Normal |

---

## Slugs orphelins (tâche c)

**1 slug orphelin détecté :** `communaute`

- Présent en base (utilisé par la source `chat-perdu`, type `community`).
- **Absent de `server/categories.js`** (la taxonomie serveur ne déclare pas ce slug).
- Conséquence : le label de la catégorie s'affichera comme le slug brut `communaute` sur le front (via `LBACat.label(slug)` qui retourne le slug si inconnu).
- La source `chat-perdu` est documentée comme non déployée/non migrée au 05/08/2026 — ce slug sera à ajouter à la taxonomie lors du déploiement de cette famille.

---

## Cohérence schéma (tâche e)

`schema_check.ok === true` — 56 colonnes attendues, 0 manquante, 0 type_mismatch. **RAS.**

---

## Vitalité PanneauPocket curée (tâche f)

**Contrôle indisponible ce run.**

La section `panneaupocket_vitality` du JSON est vide (`[]`). D'après le code de `scripts/veille-readonly.js` (lignes 311-313), cette valeur vide correspond au chemin d'erreur (`catch`) : la requête `Q_PP_VITALITY` a vraisemblablement échoué silencieusement (erreur DB non fatale). Il n'est donc **pas possible** d'évaluer la vitalité des 19 cartes broadcast curées (vague L + arrosage-canal-gap) ce run.

**Rappel de la limite de méthode** (à énoncer même quand le contrôle fonctionne) : la colonne `ref` ne stocke que des couples `[panneauId, hash]`, sans date de publication. Le seul proxy en base est `last_activated_at` (dernier panneau alertable), qui **sous-estime** la vitalité (panneaux hors-filtre thématique ou cosmétiques = aucun événement). La confirmation doit toujours rester humaine.

**Point de vigilance ouvert — stabilité des ids `?panneau=`** : si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme « nouveau panneau ». Ce point ne peut être mesuré sans fetch réseau (interdit) ; il reste ouvert en surveillance continue (cf. en-tête de `ma-collectivite.js`).

---

## Combos orphelins & ids `?panneau=` (tâche g)

### Combos orphelins

**26 lignes `source_param_states` orphelines** (aucun abonnement actif correspondant) :

| Source | Paramètres (exemples) | Nb |
|---|---|---|
| vigilance-meteo | dépts 31, 33, 35, 38, 44, 67, 74, 75, 83, 24, 16, 10, 69, 13 | 14 |
| ma-collectivite | oze-05400, valserres-05130, amr-05-05000, veynes-05400, la-batie-vieille-05000 | 5 |
| risque-secheresse | dépts 06, 14, 16, 53 | 4 |
| rappel-conso | alimentation, bébés-enfants | 2 |
| iss-passages | `{ville: "gap"}` (ancien format slug) | 1 |

Reliquats de désabonnements et de tests de développement. **Décision de purge = Hugo.** La commande type serait un `DELETE FROM source_param_states WHERE NOT EXISTS (SELECT 1 FROM subscriptions ...)` — jamais exécutée par ce robot.

### Stabilité des ids `?panneau=`

Point de vigilance ouvert (voir section f). Sans capacité de fetch réseau, il n'est pas possible de vérifier si PanneauPocket a régénéré des ids depuis le dernier run.
