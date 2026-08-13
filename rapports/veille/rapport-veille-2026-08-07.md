# Rapport de veille — 2026-08-07

_Généré par Robot 1 (lecture seule) — 02h00 Paris. Base : 266 sources enabled, 35 combos paramétrées actives._

---

## Résumé

3 points à surveiller, aucune alarme critique :

1. **INSEE BDM (ECONNRESET) — 4 sources, ~24–27 échecs chacune** : `indice-reference-loyers`, `inflation-insee`, `ipc-alimentaire`, `chomage-stats`. Instabilité réseau persistante depuis plusieurs jours. Dernier échec constaté le 04/08. À surveiller.
2. **`risque-secheresse` broadcast — 31 échecs, dernier le 05/08** : VigiEau 404. Le commit `8497215` ("Fix risque-secheresse 404 nocturne") figure dans l'historique récent ; si le fix est déployé, l'absence d'échec depuis le 05/08 (2 jours) est encourageante. À confirmer à J+3.
3. **Slug orphelin `communaute`** : utilisé par `chat-perdu` (non encore déployé), absent de la taxonomie `server/categories.js`. Sans impact visible aujourd'hui ; à ajouter avant le déploiement de cette carte.

Les autres signaux (`sncf-perturbations`, `lancement-spatial`, `ecowatt`, `vigicrues-departement`) sont des causes connues ou des incidents transitoires — voir détail.

---

## Cohérence schéma

`schema_check.ok = true` — 56 colonnes attendues, 0 manquante, 0 type_mismatch. **RAS.**

---

## Sources en échec (failing_sources)

| Source | Échecs (7j) | Dernier échec | Message | Verdict |
|---|---|---|---|---|
| `sncf-perturbations` | 133 | 07/08 00:31 | `SNCF_API_KEY absente` | **Connu/attendu** — clé à configurer (liste de courses §5) |
| `lancement-spatial` | 54 | 06/08 23:01 | Timeout API Launch Library (>10 s) | API tierce instable, marquée FRAGILE. Transitoire — pas de panne structurelle identifiable |
| `risque-secheresse` | 31 | 05/08 07:31 | VigiEau HTTP 404 | Commit fix `8497215` en historique. Aucun échec depuis le 05/08 (48h). À surveiller 3 jours de plus pour confirmer la résolution |
| `indice-reference-loyers` | 27 | 04/08 12:34 | ECONNRESET INSEE BDM | Instabilité réseau INSEE persistante — source trimestrielle, aucun faux positif généré |
| `inflation-insee` | 27 | 04/08 12:34 | ECONNRESET INSEE BDM | Idem |
| `ipc-alimentaire` | 27 | 04/08 12:34 | ECONNRESET INSEE BDM | Idem |
| `prix-logements-anciens` | 26 | 02/08 15:31 | HTTP 500 INSEE | Erreur serveur transitoire côté INSEE, aucun échec depuis 5 jours — résolu spontanément |
| `chomage-stats` | 24 | 04/08 12:34 | ECONNRESET INSEE BDM | Idem INSEE BDM |
| `ecowatt` | 21 | 05/08 07:37 | HTTP 429 (rate limit RTE) | Appel trop fréquent — aucune alerte manquée (hors saison de tension), à surveiller en période de chaleur |
| `vigicrues-departement` | 2 | 02/08 13:47 | Timeout Vigicrues | 2 échecs seulement sur 7 jours — transitoire, RAS |

**Point d'attention INSEE BDM** : les 4 sources économiques (`indice-reference-loyers`, `inflation-insee`, `ipc-alimentaire`, `chomage-stats`) cumulent ~100 échecs répartis sur plusieurs jours avec des ECONNRESET. L'API BDM est publique, la cause est probablement un reset de la connexion côté INSEE lors de pics de charge. Ces sources sont trimestrielles/mensuelles — aucun abonné ne rate d'alerte tant que les nouvelles données ne sont pas publiées. Pas d'action urgente, mais si la situation dure au-delà de 7 jours, envisager un retry exponentiel ou un timeout plus court.

---

## États figés (stale_states)

La liste est longue (~150 entrées) mais elle correspond entièrement au bruit attendu décrit dans le `caveat` du script : `checked_at` n'est rafraîchi que sur écriture (still-inactive = pas d'écriture). L'étape B n'étant pas déployée, tous les `checked_at` anciens sur sources/combos **inactive** sont normaux.

Deux sous-groupes méritent une mention (signal secondaire, corroboré par d'autres sections) :

- **`risque-secheresse` combos paramétrées** (dépts 06, 14, 16, 53) : état `active`, `checked_at` du 19/07 → ces combos sont dans `orphan_param_states` (aucun abonnement actif). Elles ne seront pas rafraîchies, comportement attendu.
- **`vigilance-meteo` combos** (13 dépts en `active`, `checked_at` juillet) : idem, toutes dans `orphan_param_states`.

Pas d'état `active` figé sur des sources ou combos réellement souscrites.

---

## TODO calendaires ≤ 60 jours

| Source | Fichier | Échéance | Nature |
|---|---|---|---|
| **Nuits des étoiles** | `nuits-des-etoiles.js` | **7–9 août 2026** (dans 0–2 jours) | Événement dans la fenêtre d'annonce J-3 → NORMAL, l'alerte devrait se déclencher aujourd'hui ou demain si des abonnés existent |
| **Éclipse solaire** | `eclipse-solaire.js` | **12 août 2026** (dans 5 jours) | Config à jour (date vérifiée juillet 2026). Fenêtre d'annonce intégrée, RAS |
| **Bison Futé** | `bison-fute.js` | 08/08/2026 (chassé-croisé rouge), 15/08 (retours) | Dates 2026 en dur dans `JOURS_2026`, couverture août encore active. **TODO début 2027** noté dans le fichier — hors fenêtre 60 j |
| **Allocation rentrée scolaire** | `allocation-rentree-scolaire.js` | **19 août 2026** (dans 12 jours) | Date vérifiée en dur (métropole/Antilles). Config à jour. **TODO 2027** noté dans le fichier |
| **Festivals musique** (Rock en Seine) | `festivals-musique.js` | 26–30 août 2026 | À vérifier que la config est à jour — non inspecté directement, mais mentionné dans l'état projet |
| **Braderie de Lille** | `braderie-lille.js` | **5–6 sept 2026** (dans ~29 jours) | Config à jour (dates 2026 en dur, `TODO 2027` noté) |
| **Rentrée scolaire** | source calendar | **1er sept. 2026** | Calendrier fixe, RAS |
| **Journées du patrimoine** | `echeances-fiscales.js` & sources | **19–20 sept. 2026** (dans ~43 jours) | Dans la fenêtre de 60 jours — vérifier que la config est à jour si pas encore fait |
| **Taxe foncière** | `echeances-fiscales.js` | 15/20 oct. 2026 (papier/en ligne) | Dates 2026 en dur, OK. **TODO 2027** noté |

**Annexe (> 60 jours, pour mémoire)** : Beaujolais Nouveau (3e jeudi nov.) ; Black Friday (27 nov.) ; Géminides (13–14 déc.) ; Fête des Lumières (8 déc.) ; Prime Noël (16 déc.) ; THRS (15/20 déc.) ; Bison Futé TODO 2027 (à faire début 2027) ; Tour de France TODO 2027 (octobre 2026 = rechargement du parcours).

---

## Slugs orphelins

Un slug présent en base mais absent de la taxonomie `server/categories.js` :

- **`communaute`** : utilisé par la source `chat-perdu` (type `community`, display_order 500, créée le 04/08/2026). Cette carte **n'est pas encore déployée** (fil "cartes communautaires — Chat perdu" : NON migré, NON déployé). Le slug `communaute` devra être ajouté à `CATEGORIES` dans `server/categories.js` avant ou lors du déploiement, sinon le libellé affiché sera le slug brut `« communaute »` au lieu d'un libellé lisible.

Aucun autre orphelin.

---

## Vitalité PanneauPocket curées (vague L)

`panneaupocket_vitality: []` — le script n'a signalé aucune carte curée broadcast sans panneau alertable depuis 90 jours ou plus.

**Limite de méthode (à rappeler)** : la base ne stocke aucune date de publication de panneau ; le proxy utilisé est `last_activated_at` (dernier panneau new/modifié passant le filtre thématique), qui sous-estime la vitalité réelle (panneaux hors filtre ou cosmétiques sont ignorés). La liste vide signifie que toutes les cartes curées de la vague L ont eu au moins un panneau alertable dans les 90 derniers jours — mais ce résultat doit être confirmé par une consultation humaine de l'appli PanneauPocket si un doute apparaît.

**Point de vigilance permanent** : si PanneauPocket régénère les ids `?panneau=` à l'édition d'un panneau, une simple modification apparaîtrait comme « nouveau ». Ce risque ne peut pas être mesuré sans appel réseau (interdit la nuit). Consigné en tête de `ma-collectivite.js`.

---

## Combos orphelins & stabilité ids `?panneau=`

**Combos orphelins** : 26 lignes `source_param_states` sans abonnement actif correspondant.

Répartition du sample (26 lignes affichées = total) :

| Source | Nb combos orphelines |
|---|---|
| `vigilance-meteo` | 13 (dépts 31, 33, 35, 38, 44, 67, 74, 75, 83, 24, 16, 10, 69) |
| `risque-secheresse` | 4 (dépts 06, 14, 16, 53) |
| `ma-collectivite` | 5 (URLs Ozé, Valserres, AMR-05, Veynes, La Bâtie-Vieille) |
| `iss-passages` | 1 (`gap`, ancien format pré-résolveur) |
| `rappel-conso` | 2 (catégories bébés-enfants, alimentation) |
| `panneaupocket` | 1 (ASA Canal de Gap) |

Ces combos sont des reliquats de désabonnements ou de tests. Aucune action nocturne : la purge est une décision humaine (les données stale ne génèrent aucune alerte, elles occupent de l'espace sans impact fonctionnel).

**Stabilité des ids `?panneau=`** : point de vigilance ouvert — PanneauPocket pourrait régénérer les ids à l'édition, faisant apparaître une modification comme un nouveau panneau. Non mesurable sans fetch réseau. Signalé à titre de rappel, sans alarme.

---

## Collisions d'ordre d'affichage

11 collisions dans la plage `display_order` 40–59 (cosmétique, n'affecte pas le fonctionnement) :

- order 40 : `doomname` / `statut-github`
- order 42 : `statut-npm` / `statut-openai`
- order 43 : `statut-discord` / `statut-vercel`
- order 50 : `changement-heure` / `statut-twitch`
- order 51 (triple) : `black-friday` / `soldes` / `statut-zoom`
- order 52 : `perseides` / `statut-canva`
- order 53 : `beaujolais-nouveau` / `statut-dropbox`
- order 54 : `soldes-steam` / `statut-slack`
- order 55 : `aurores-france` / `cert-fr-alertes`
- order 56 (triple) : `eclipse-solaire` / `geminides` / `nuits-des-etoiles`
- order 59 : `echeances-fiscales` / `journees-patrimoine`

Ces collisions sont anciennes et sans impact sur les alertes. À ré-échelonner lors d'un prochain nettoyage cosmétique.

---

## Jamais actives (90 jours) — note sommaire

La liste `never_active_90d` compte ~160 sources, toutes créées entre le 11 juillet et le 5 août 2026. La quasi-totalité sont des sources saisonnières muettes hors saison (météo, fêtes, événements culturels annuels), des sources récemment ajoutées sans abonnés encore, ou des sources sans clé API (`sncf-perturbations`). Aucun signal anormal.

Deux sources méritent une mention sans alarme :
- `tache-echeance-glissante` (type `user-task`, disabled) : normal, activation prod = geste manuel planifié
- `chat-perdu` (type `community`) : non migré, non déployé — normal
- `cyclones-outremer` : hors saison cyclonique officielle — normal

---

## BROUILLON — à valider par Hugo avant toute exécution

### Slug `communaute` à ajouter dans la taxonomie

Avant le déploiement de `chat-perdu`, ajouter dans `server/categories.js` une entrée pour le slug `communaute`. Exemple (groupe et libellé à ajuster selon la charte) :

```js
// À intégrer dans CATEGORIES, groupe 'vie-locale' ou nouveau groupe 'communaute' :
{ slug: 'communaute', label: 'Communauté', group: 'vie-locale' }
```

Ce brouillon est indicatif. Le groupe exact et le libellé restent à décider par Hugo. **Ne pas exécuter sans validation.**
