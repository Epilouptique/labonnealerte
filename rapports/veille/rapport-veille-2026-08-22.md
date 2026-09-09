# Rapport de veille — 2026-08-22

_Généré par Robot 1 (lecture seule). Run : 2026-08-22T10:08 UTC._
_Périmètre : 267 sources enabled, 36 combos paramétrés actifs._

---

## Résumé

1. **Slug orphelin `communaute`** : utilisé par chat-perdu et chien-perdu, absent de la taxonomie `server/categories.js` — libellé brut affiché au lieu d'un label.
2. **`lancement-spatial` — 55 timeouts consécutifs** : à surveiller ; si le problème persiste au-delà de 2 semaines, l'API Launch Library est probablement morte.
3. **`ecowatt` — 8 échecs + état très ancien** : timeout RTE probable, à recroiser si tension réseau rouge survient cet automne.
4. **26 combos orphelins** : reliquats de désabonnements, à purger sur décision Hugo.
5. **Taxe foncière échéance en ligne : 20 oct (59 j)** — déclenchement imminent, aucune action requise (source correctement configurée).

Schéma DB : cohérent (`ok: true`). Aucune migration en attente.

---

## Sources en échec

| Source | Échecs (7j) | Dernier échec | Message | Analyse |
|---|---|---|---|---|
| `sncf-perturbations` | 130 | 22/08 10h01 | SNCF_API_KEY absente | **Normal** : clé non configurée sur Railway, documenté dans etat-projet.md. Aucune donnée disponible tant que la clé n'est pas posée. |
| `lancement-spatial` | 55 | 22/08 10h01 | Timeout API Launch Library (>10 s) | **À surveiller.** L'API communautaire Launch Library est fragile (documentée comme telle). 55 échecs consécutifs sans jamais avoir été activée depuis la création. Si le timeout persiste 2 semaines de plus, l'API est probablement morte — signaler à Hugo pour évaluation du repli. |
| `ecowatt` | 8 | 19/08 10h00 | Timeout auth RTE (>10 s) | **Bas niveau.** Timeout sur l'authentification RTE. La source n'a jamais été activée (EcoWatt rouge/orange absent cet été). Stale_state à juillet (normal pour une source inactive). À recroiser si tension réseau survient en automne. |
| `statut-twitch` | 2 | 20/08 21h32 | Timeout status.twitch.tv | **Probablement transitoire.** Seuil minimum (2 échecs/7j). Dernier check réussi visible en base. Aucune alarme. |

---

## États figés (stale_states)

Très nombreuses entrées stale — toutes normales au regard du caveat du script (`checked_at` non rafraîchi en still-inactive). Seuls points à commenter :

- **vigilance-meteo** : 13 combos paramétrés apparaissent en `state: active` avec des `checked_at` de mi-juillet. Ce sont des combos orphelins (désabonnements survenus après la dernière écriture) — traités en section « Combos orphelins » ci-dessous. Pas d'états actifs figés en prod actifs.
- Toutes les autres entrées stale sont `state: inactive` sur des sources saisonnières ou paramétrées inactives — comportement normal, conforme au caveat.

---

## Jamais actives (never_active_90d)

154 sources dans la liste — la quasi-totalité est normale :

- **Saisonnières muettes hors saison** : beaujolais-nouveau (nov), black-friday (nov), geminides (déc), saint-nicolas (déc), changement-heure (oct), carnavals (fév-mars), soldes-steam (hors période), etc. → RAS.
- **Clé API absente** : sncf-perturbations → attendu.
- **Timeouts récurrents** : lancement-spatial → corrélé aux échecs signalés.
- **Sources jamais déclenchées faute d'événement** : ecowatt (aucune tension réseau cet été), tempete-solaire, asteroide-frole-terre, ondes-gravitationnelles, exoplanete-habitable → normal.
- **Types virtuels sans source_states** : tache-echeance-glissante (user-task), chat-perdu, chien-perdu (community) → normal par construction.
- **Paramétrées avec combos sans abonné actif** : iss-passages, ma-collectivite, panneaupocket, etc. → normal.

Aucune source « censée s'activer souvent » ne ressort muette de façon anormale.

---

## Collisions d'ordre d'affichage

11 collisions cosmétiques détectées sur les `display_order` suivants :

| Order | Sources |
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

Cosmétique, sans urgence. Rééchelonnement à inclure dans un prochain lot de maintenance.

---

## TODO calendaires ≤ 60 jours

### Dans les 15 jours

| Source | Fichier | Échéance | Action requise |
|---|---|---|---|
| `bison-fute` | server/sources/bison-fute.js | **28 août** (retours, rouge) | Aucune — dernier jour 2026, source active. **TODO 2027** : à ajouter début 2027 (commentaire présent). |
| `echeances-fiscales` | server/sources/echeances-fiscales.js | **1er sept** (PAS : nouveau taux prélèvement source) | Aucune — calculé récursif, aucune config requise. |
| `rentree-scolaire` | server/sources/ | **1er sept** | Aucune a priori — à vérifier si la date est codée en dur ou calculée. |
| `braderie-lille` | server/sources/ | **5-6 sept** | Aucune — config 2026 présente (selon etat-projet.md). |

### 15–60 jours

| Source | Échéance approx. | Note |
|---|---|---|
| `journees-patrimoine` | 19-20 sept (≈28j) | Config 2026 connue selon etat-projet.md. |
| `grandes-marees` | 11-13 sept (≈20j) | Entrée suivante dans la config. |
| `semaine-bleue` | 5-11 oct (≈44j) | Dates 2026 connues. |
| `fete-science` | 2-12 oct (≈41j) | Dates 2026 connues. |
| `nobel-prix` | 5-12 oct (≈44j) | Dates 2026 connues. |
| `echeances-fiscales — Taxe foncière` | 20 oct en ligne (≈59j) | **Attention : à 59j, dans la fenêtre.** Config 2026 présente, aucune action requise. TODO 2027 : date non encore annoncée. |

### Annexe — Au-delà de 60 jours (pour mémoire)

- `echeances-fiscales` — Taxe d'habitation (résidences secondaires) : 20 déc 2026 ; ouverture déclaration 2027 : TODO non renseigné (normal, date non encore publiée par impots.gouv.fr).
- `bison-fute` — Calendrier 2027 : TODO début 2027.
- Hellfest : 17-20 juin 27. Japan Expo : 8-11 juil 27. Festival du Livre de Paris : 16-18 avr 27. Bocuse d'Or : 24-25 janv 27.

---

## Slugs orphelins (tâche c)

**1 orphelin détecté : `communaute`**

Le slug `communaute` est utilisé en base par les sources `chat-perdu` et `chien-perdu` (cartes communautaires, vague 15/08/2026). Il est **absent** de la taxonomie fermée définie dans `server/categories.js`. Ces cartes s'affichent actuellement avec le slug brut au lieu d'un libellé traduit.

**Fichier de référence** : `server/categories.js` — liste `GROUPS` (taxonomie fermée).

## BROUILLON — À valider par Hugo avant toute exécution

Ajouter `communaute` à la taxonomie dans `server/categories.js`, par exemple dans le groupe `vie-locale` ou dans un nouveau groupe dédié :

```js
// Dans GROUPS, exemple dans 'vie-locale' ou nouveau groupe 'communaute-entraide' :
'communaute-entraide': ['communaute', 'animaux-perdus', /* ... */],
```

Et ajouter le label exact dans `SPECIAL` si le mot capitalisé souhaité n'est pas « Communaute » :
```js
'communaute': 'Communauté',
```

_Non validé — décision Hugo._

---

## Cohérence schéma (tâche e)

`schema_check.ok === true` — 58 colonnes vérifiées, aucun `missing`, aucun `type_mismatch`. **RAS.**

---

## Vitalité des cartes PanneauPocket curées (tâche f)

La section `panneaupocket_vitality` du script est **vide** (`[]`). Aucune anomalie remontée automatiquement.

**Limite de méthode à conserver en tête** : la base ne stocke aucune date de publication de panneau. Le seul proxy disponible est `last_activated_at` (dernier panneau nouveau/modifié alertable), qui sous-estime fortement la vitalité : un panneau hors filtre thématique, ou n'ayant subi que des modifications cosmétiques, ne génère aucun événement DB.

Les cartes broadcast curées identifiées (`makeCurated` dans server/sources/) sont : eau-regie-metz, eau-provence-verte, eau-isle-dronne, eau-charles-chaigneau, eau-puisaye-forterre, eau-coteaux-lizon, dechets-saulieu, dechets-la-saucelle, dechets-campagne-caux, securite-gendarmerie-albi, securite-gendarmerie-bayeux, securite-gendarmerie-essarts, local-chablis, local-agly-fenouilledes, local-buech-devoluy, local-chabris-bazelle, agenda-luc-en-diois, cantine-a2m2v, arrosage-canal-gap.

**Recommandation** : une confirmation humaine via l'app PanneauPocket reste nécessaire, notamment pour les 3 cartes gendarmerie (famille notoriellement dormante à ~85 % selon etat-projet.md). Si une carte semble silencieuse depuis plusieurs mois, consulter la page de l'entité directement sur app.panneaupocket.com avant de la candidater à la désactivation.

**Amélioration possible** : persister la date du dernier panneau vu (toutes catégories confondues) dans la colonne `ref` de `source_states`, séparément du filtre thématique. Cela permettrait un proxy de vitalité fiable sans fetch réseau nocturne.

---

## Combos orphelins & stabilité des ids `?panneau=` (tâche g)

### Combos orphelins

**26 combos orphelins** dans `source_param_states` (aucun abonnement actif correspondant) :

| Source | Nb combos orphelins |
|---|---|
| vigilance-meteo | 13 (dépts 31, 33, 35, 38, 44, 67, 74, 75, 83, 24, 16, 10, 69, 13) |
| ma-collectivite | 5 (oze-05400, valserres-05130, amr-05, veynes-05400, la-batie-vieille) |
| risque-secheresse | 4 (06, 14, 16, 53) |
| rappel-conso | 2 (bébés-enfants, alimentation) |
| iss-passages | 1 (gap) |
| hausse-tarif-streaming | 1 (netflix) |

Reliquats de désabonnements — comportement normal. **Aucune purge automatique** ; décision à Hugo si le volume devient gênant.

### Stabilité des ids `?panneau=`

Point de vigilance ouvert (consigné en tête de `server/sources/ma-collectivite.js`) : si PanneauPocket régénère les identifiants de panneau à l'édition, une simple modification apparaîtrait comme « nouveau panneau » pour le système anti-rétroactif. Ce risque **ne peut pas être mesuré sans fetch réseau** (interdit la nuit). Il reste un point de surveillance humaine à recroiser en cas de signalement d'alertes inhabituellement fréquentes sur une carte `?panneau=`.
