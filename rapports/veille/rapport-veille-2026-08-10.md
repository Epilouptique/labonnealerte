# Rapport de veille — 2026-08-10

_Généré automatiquement à 02:01 UTC par Robot 1 (lecture seule). Aucune modification effectuée._

---

## Résumé (5 points)

1. **lancement-spatial** : 55 timeouts en 7 jours sur l'API Launch Library — taux d'échec ~16 %, API communautaire instable à surveiller.
2. **ecowatt** : 10 erreurs HTTP 500 côté RTE (dernier : 09/08) — panne ou maintenance côté opérateur, pas une régression code.
3. **Slug orphelin `communaute`** : présent en base (source `chat-perdu`) mais absent de la taxonomie `server/categories.js` → tag brut affiché.
4. **Grandes marées** : grande marée du 13-15 août dans 3 jours (source active sous peu), puis septembre et octobre. Dernière période codée = 27 oct 2026 ; TODO 2027 à planifier.
5. **26 combos orphelins** en `source_param_states` (reliquats de désabonnements, purge = décision Hugo).

---

## Cohérence schéma

`schema_check.ok === true` — aucune colonne manquante, aucun type inattendu. Rien à signaler.

---

## Sources en échec (`failing_sources`)

| Source | Échecs/7 j | Dernier message | Diagnostic |
|---|---|---|---|
| `sncf-perturbations` | 133 | `SNCF_API_KEY absente` | **Attendu.** Clé Railway non configurée, documenté dans l'état du projet. Pas de régression. |
| `lancement-spatial` | 55 | Timeout >10 000 ms | **À surveiller.** Launch Library est une API communautaire sans SLA. 55 timeouts sur ~336 cycles = 16 % d'échecs. La source n'a jamais activé depuis sa création (2026-07-14, 27 jours). Aucune alerte envoyée en conséquence, mais le check tourne à vide en permanence. |
| `risque-secheresse` | 30 | HTTP 404 VigiEau | **Résidu pré-fix.** `last_failed_at` = 2026-08-05 ; commit `8497215` (Fix risque-secheresse 404 nocturne) déployé ensuite. Aucun échec depuis le 05/08 → le correctif tient. |
| `ecowatt` | 10 | HTTP 500 EcoWatt | **API tierce.** RTE EcoWatt retourne 500 côté serveur. `last_failed_at` = 2026-08-09. Pas de régression code visible. À confirmer dans quelques heures ; si la série continue demain, signaler à RTE. |
| `bitcoin-mouvement` | 4 | Timeout CoinGecko | **Mineur/transitoire.** CoinGecko est soumis à du rate-limiting. 4 échecs en 7 jours, sans série continue. |
| `indice-reference-loyers` | 2 | ECONNRESET INSEE BDM | **Transitoire.** Coupure réseau fugace vers bdm.insee.fr. 2 échecs isolés, pas de tendance. |
| `inflation-insee` | 2 | ECONNRESET INSEE BDM | Idem ci-dessus. |

---

## États figés (`stale_states`)

Bruit attendu dans l'ensemble : la quasi-totalité des entrées sont en état `inactive` avec un `checked_at` ancien — comportement normal tant que l'étape B (refresh du `checked_at` même en `still-inactive`) n'est pas déployée, comme indiqué par le caveat du script.

Cas corroborés par `failing_sources` :
- `ecowatt` : stale (`checked_at` 2026-07-11) ET en échec actif → cohérent, source actuellement hors service côté API.
- `sncf-perturbations` : stale et en échec permanent → attendu (clé absente).
- `lancement-spatial` : stale et en timeout permanent → cohérent avec le diagnostic ci-dessus.

Les combos `vigilance-meteo` en état `active` avec `checked_at` ancien (juillet) font partie des 26 combos orphelins (plus aucun abonnement) — traité dans la section dédiée.

---

## Jamais actives depuis 90 jours (`never_active_90d`)

La liste est longue (~150 sources). L'essentiel est normal :
- **Saisonnières** hors saison : `beaujolais-nouveau`, `changement-heure`, `geminides`, `black-friday`, `treve-hivernale`, `loi-montagne`, `soldes-steam`, `premier-avril`, `vendredi-13`, etc.
- **Clé absente ou config vide** : `sncf-perturbations`, `ouverture-ventes-sncf`, `billetterie-concerts`, `courses-mythiques`, `tour-de-france-passage` (config vide documentée).
- **Observation silencieuse intentionnelle** : `leboncoin-livraison` (sonde promo, renvoie toujours `inactive()` par design).
- **Très récentes** (< 30 jours) : cartes vague L créées le 2026-07-24 (`cantine-a2m2v`, `dechets-campagne-caux`, `local-buech-devoluy`, etc.), `veille-agenda` (2026-07-27), `chat-perdu` (2026-08-04), `tache-echeance-glissante`.
- **New type `user-task`** : `tache-echeance-glissante` ne produit pas d'état `activated`, son absence ici est normale.
- **New type `community`** : `chat-perdu` idem.

Cas qui mérite attention :
- `ecowatt` (créé 2026-07-11, jamais activé) : l'absence d'activation en plein été est plausible (EcoWatt ne déclenche qu'en tension réseau, surtout en hiver). Mais combinée aux 10 erreurs 500 récentes, la source tourne en ce moment à vide. À confirmer à l'automne lors du retour en tension du réseau.
- `lancement-spatial` (créé 2026-07-14, jamais activé) : cohérent avec les 55 timeouts — si l'API ne répond pas, la source ne s'active pas. Décision à prendre sur le seuil de tolérance ou un remplacement d'API si la situation persiste.

---

## TODO calendaires ≤ 60 jours (échéance ≤ 2026-10-09)

| Fichier | Événement | Échéance | Action requise |
|---|---|---|---|
| `grandes-marees.js` | Grande marée — août | **2026-08-13** (dans 3 jours) | Aucune : date déjà codée, source active sous peu. |
| `eclipse-solaire.js` | Éclipse solaire partielle | **2026-08-12** (dans 2 jours) | Aucune : date codée, source active sous peu. |
| `allocation-rentree-scolaire.js` | Versement allocations rentrée | **2026-08-19** | Aucune : date codée. TODO 2027 noté en commentaire. |
| `bison-fute.js` | Dernier jour rouge/noir 2026 | **2026-08-28** | Aucune urgence immédiate. Après cette date, la source sera silencieuse jusqu'en 2027. TODO 2027 en début d'année. |
| `braderie-lille.js` | Braderie de Lille | **2026-09-05 / 06** | Aucune : date codée. TODO 2027 noté. |
| `grandes-marees.js` | Grande marée — septembre | **2026-09-11–14** | Aucune : date codée. |
| `fete-science.js` | Fête de la science | **2026-10-02–12** | Aucune : dates codées et vérifiées le 23/07. |
| `semaine-bleue.js` | Semaine Bleue | **2026-10-05–11** | Aucune : dates codées (confirmées semaine-bleue.org). |
| `nobel-prix.js` | Prix Nobel | **2026-10-05–12** | Aucune : dates codées. |

**Bison Futé** : la source deviendra silencieuse après le 28 août, ce qui est le comportement attendu (pas de jour rouge/noir en automne). Le calendrier 2027 devra être transcrit en début d'année (TODO déjà présent dans le code).

### Annexe — au-delà de 60 jours

| Fichier | Événement | Échéance approx. | Note |
|---|---|---|---|
| `grandes-marees.js` | Dernière grande marée codée | 2026-10-27 | Après cette date, source dormante jusqu'au TODO 2027. |
| `semaine-du-gout.js` | Semaine du goût | 2026-10-12–18 | Dates codées, aucune action. |
| `nuits-de-la-lecture.js` | Nuits de la lecture | Janv. 2027 | TODO 2027 noté. |
| `fete-science.js` | Édition 2027 | Non annoncée | TODO avant le 30/09/2027. |
| `echeances-fiscales.js` | Taxe foncière 2026 | 2026-10-15 / 20 | Dates calculées dynamiquement, aucune action. TODO 2027 noté. |

---

## Slugs orphelins

Un seul slug orphelin identifié :

- **`communaute`** : utilisé en base par la source `chat-perdu` (`ARRAY['communaute']` dans `init.sql` ligne 4634), mais **absent de la taxonomie** définie dans `server/categories.js` (tous les GROUPS parcourus, aucune mention). Conséquence : la carte s'affichera avec le tag brut `communaute` au lieu d'un libellé français. À ajouter dans un groupe pertinent (ex. `vie-locale` ou `solidarite`, ou un nouveau groupe `communaute-entraide`).

```
## BROUILLON — à valider par Hugo avant toute exécution

Dans server/categories.js, dans le groupe 'vie-locale' (ou dans 'solidarite',
ou dans un nouveau groupe dédié), ajouter 'communaute' :

  'vie-locale': [..., 'communaute'],

et dans SPECIAL si un libellé exact est préféré :
  'communaute': 'Communauté',

Ce brouillon n'est pas exécuté, il attend validation.
```

---

## Vitalité PanneauPocket curées (tâche f)

`panneaupocket_vitality` : **liste vide**. Aucune carte curée ne dépasse 90 jours d'inactivité — normal : les 19 cartes curées (vague L + `arrosage-canal-gap`) ont toutes été créées le 24 juillet 2026 ou après, soit moins de 20 jours d'ancienneté.

**Limite de méthode (à consigner)** : la base ne stocke aucune date de publication de panneau. Le seul proxy est `last_activated_at` (dernier panneau alertable), qui sous-estime la vitalité réelle (panneaux hors filtre thématique ou cosmétiquest = aucun événement). Sans fetch réseau vers PanneauPocket (interdit la nuit), impossible de confirmer que les entités publient encore. Un premier contrôle humain via l'application PanneauPocket est recommandé à ~90 jours (mi-octobre) pour les cartes gendarmerie, réputées à 85 % dormantes selon la prospection initiale.

---

## Collisions `display_order`

11 groupes en collision (cosmétique, sans impact fonctionnel) :

| Ordre | Sources en collision |
|---|---|
| 40 | `doomname`, `statut-github` |
| 42 | `statut-npm`, `statut-openai` |
| 43 | `statut-discord`, `statut-vercel` |
| 50 | `changement-heure`, `statut-twitch` |
| 51 | `black-friday`, `soldes`, `statut-zoom` |
| 52 | `perseides`, `statut-canva` |
| 53 | `beaujolais-nouveau`, `statut-dropbox` |
| 54 | `soldes-steam`, `statut-slack` |
| 55 | `aurores-france`, `cert-fr-alertes` |
| 56 | `eclipse-solaire`, `geminides`, `nuits-des-etoiles` |
| 59 | `echeances-fiscales`, `journees-patrimoine` |

Aucune urgence. Ordre d'affichage déterministe par `source_id` en tie-break côté SQL, pas de désordre visible.

---

## Combos orphelins & stabilité des ids `?panneau=` (tâche g)

### Combos orphelins

**26 lignes** dans `source_param_states` sans abonnement actif correspondant. Répartition :

| Source | Combos orphelins |
|---|---|
| `vigilance-meteo` | 14 (depts 10, 13, 16, 24, 31, 33, 35, 38, 44, 67, 69, 74, 75, 83) |
| `ma-collectivite` | 5 (URLs PanneauPocket diverses) |
| `risque-secheresse` | 4 (depts 06, 14, 16, 53) |
| `rappel-conso` | 2 (catégories alimentaire et bébés) |
| `iss-passages` | 1 (ville « gap ») |

Ce sont des reliquats de désabonnements — comportement normal, aucun dysfonctionnement. La purge est une décision humaine ; le script `DELETE` correspondant n'existe pas encore. À ne pas exécuter automatiquement.

### Stabilité des ids `?panneau=`

Point de vigilance ouvert (consigné en tête de `ma-collectivite.js`) : si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme « nouveau panneau » et déclencherait une alerte. Ce comportement ne peut pas être mesuré sans fetch réseau (interdit). Signalé sans alarme, à surveiller si des abonnés remontent des doublons d'alertes.

---

_Fin du rapport. Aucun fichier modifié hormis ce rapport._
