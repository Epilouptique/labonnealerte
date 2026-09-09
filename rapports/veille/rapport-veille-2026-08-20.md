# Rapport de veille — 2026-08-20

_Généré automatiquement par Robot 1 (agent LECTURE SEULE). Aucune modification de code ou de base n'a été effectuée._

---

## Résumé (5 lignes max)

1. **`lancement-spatial`** : 49 timeouts API Launch Library — pattern persistant, à surveiller.
2. **`statut-anthropic`** : 6 erreurs de certificat SSL (host mismatch `statuspage.io`) — bug source réel depuis le 14/08.
3. **`ecowatt`** : 12 timeouts auth RTE, dernier le 19/08 — à surveiller (hors saison, mais auth cassée).
4. **Slug orphelin `communaute`** : présent en base (chat-perdu, chien-perdu) mais absent de `server/categories.js` — les cartes affichent le slug brut, pas un libellé.
5. **26 combos param orphelins** : reliquats de désabonnements, purge à décider (aucune action automatique).

---

## Sources en échec

Seuil de signal : ≥ 2 échecs sur 7 jours. 7 sources concernées.

| Source | Échecs | Dernier message | Diagnostic |
|---|---|---|---|
| `sncf-perturbations` | 130 | `SNCF_API_KEY absente` | **Normal** — cause connue, clé à configurer dans Railway. |
| `lancement-spatial` | 49 | `Timeout API Launch Library (>10s)` | **À surveiller** — API tierce communautaire, timeouts répétés depuis plusieurs semaines. Pas de fausse alerte (inactive en cas d'échec), mais la source est muette de fait. |
| `ecowatt` | 12 | `Timeout auth RTE (>10s)` | **À surveiller** — dernière occurrence 19/08. Hors saison estivale (Tempo aussi dormant), mais l'auth RTE qui expire est un signal réel. Aucun abonné impacté à court terme. |
| `risque-secheresse` | 9 | `Réponse HTTP inattendue VigiEau : 404` | Dernier échec 14/08, soit 6 jours. Le fix 404 nocturne est documenté dans l'état projet (commit 8497215), mais des abonnements actifs orphelins restent en base (cf. combos orphelins). À confirmer si le 404 récidive. |
| `statut-anthropic` | 6 | `Hostname/IP does not match certificate's altnames: Host: status.anthropic.com is not in DNS:*.statuspage.io` | **Bug source réel** — le endpoint `status.anthropic.com/api/v2/status.json` présente un certificat `*.statuspage.io` non valide pour ce nom. Le fix nécessite soit de pointer l'URL Statuspage native (ex. `https://anthrostat.statuspage.io/api/v2/status.json`), soit de désactiver la vérification du CN (non recommandé). Dernier échec 16/08, la source est inactive de fait depuis. |
| `bitcoin-mouvement` | 3 | `Timeout CoinGecko (>10s)` | **Seuil marginal** (3 sur 7j). API publique CoinGecko réputée instable sous charge, timeouts transitoires habituels. Pas de pattern régulier apparent. Mentionné sans alarme. |
| `aurores-france` | 2 | `Réponse NOAA illisible (JSON invalide) : Unexpected non-whitespace character after JSON at position 6824` | **Seuil atteint (2/7j).** La NOAA a parfois des réponses mal formées lors de maintenances ou changements de format. Dernier échec 18/08. À surveiller pour confirmer si c'est récurrent ou transitoire. |

---

## États figés (stale_states)

La liste compte ~150 entrées. Conformément au caveat du script : `checked_at` n'est rafraîchi qu'en cas d'écriture (transition `active`↔`inactive` ou nouveau `ref`). Une source en `still-inactive` ne met jamais à jour `checked_at`. Toutes les entrées en `state: inactive` avec un `checked_at` ancien sont **normalement attendues** — ce bruit est inhérent à l'étape B non encore déployée.

**Seules anomalies potentielles à corroborer avec `failing_sources`** :
- `ecowatt` (inactive, checked_at 11/07) : corroboré par 12 timeouts → source effectivement muette.
- `aurores-france` (inactive, checked_at 14/07) : corroboré par 2 échecs JSON → source muette de fait.
- `sncf-perturbations` (inactive, checked_at 17/07) : corroboré par la clé absente — normal.

Les combos `vigilance-meteo` actifs avec `checked_at` mi-juillet : tous remontés dans `orphan_param_states` (cf. section dédiée). Anomalie de données, pas de rupture de service.

---

## Jamais actives depuis 90 jours

~150 sources dans cette liste. La grande majorité relève de cas normaux documentés :

- **Saisonnières attendues** : `beaujolais-nouveau`, `changement-heure`, `geminides`, `black-friday`, `saint-nicolas`, `prime-noel`, `treve-hivernale`, `carnavals`, `soldes` (terminées), `grandes-marees` (en cours), `ouverture-peche`, `saints-de-glace`, etc.
- **API key manquante** : `sncf-perturbations` (connue), `ecowatt` (auth RTE cassée).
- **Sources fraîchement ajoutées** (<90j) : `chat-perdu`, `chien-perdu`, la plupart des vagues juillet/août 2026.
- **Config vide ou cursor TODO** : `billetterie-concerts`, `ouverture-ventes-sncf`, `courses-mythiques`, `tour-de-france-passage`.
- **Fragiles documentées** : `meteo-suisse`, `pannes-hydro-quebec`, `iss-passages` (EXPÉRIMENTALE).

**Signal potentiellement anormal** : `ecogaz` (jamais actif depuis création 14/07). Source hivernale, situation normale en août — RAS.

Aucun élément de cette liste ne constitue une régression à signaler.

---

## Collisions d'ordre d'affichage

11 collisions détectées (display_order partagé par plusieurs sources) :

- `40` : doomname / statut-github
- `42` : statut-npm / statut-openai
- `43` : statut-discord / statut-vercel
- `50` : changement-heure / statut-twitch
- `51` : black-friday / soldes / statut-zoom _(triple)_
- `52` : perseides / statut-canva
- `53` : beaujolais-nouveau / statut-dropbox
- `54` : soldes-steam / statut-slack
- `55` : aurores-france / cert-fr-alertes
- `56` : eclipse-solaire / geminides / nuits-des-etoiles _(triple)_
- `59` : echeances-fiscales / journees-patrimoine

**Cosmétique uniquement** — l'ordre d'affichage dans la grille est secondaire, pas bloquant. Un ré-échelonnement peut être fait dans init.sql quand pratique.

---

## TODO calendaires ≤ 60 jours (avant 2026-10-19)

Fichiers concernés avec une date ou une config qui tombe dans la fenêtre :

### Dans les 60 jours — données déjà codées, aucun renouvellement requis

| Source | Fichier | Échéance | Action |
|---|---|---|---|
| Bison Futé 2026 | `server/sources/bison-fute.js` | Dernier jour rouge : 28 août 2026 (dans 8 jours) | Données complètes. Le **TODO 2027** est signalé en commentaire (`⚠️ TODO début 2027`). Rien à faire avant janvier. |
| PAS (acompte provisionnel) | `server/sources/echeances-fiscales.js` | 1er septembre 2026 (dans 12 jours) | Données codées pour 2026. RAS pour ce cycle. |
| Braderie de Lille | `server/sources/braderie-lille.js` | 5-6 septembre 2026 (dans 16 jours) | Données codées. `TODO 2027` noté. RAS. |
| Taxe foncière | `server/sources/echeances-fiscales.js` | 15/20 octobre 2026 (dans ~56 jours) | Données 2026 présentes. TODO 2027 prévu pour début 2027. |

### Hors fenêtre — mention pour planification

| Source | Fichier | Situation |
|---|---|---|
| Grandes marées | `server/sources/grandes-marees.js` | Dernière période 2026 : 27 oct. **Après cette date, source dormante** jusqu'à l'ajout des données 2027. `TODO 2027` commenté dans le fichier — à traiter avant fin octobre 2026. |
| Nuits des étoiles 2026 | `server/sources/nuits-des-etoiles.js` | Édition passée (7-9 août). Source dormante jusqu'au TODO 2027 (AFA). |
| Bison Futé 2027 | `server/sources/bison-fute.js` | À renouveler début 2027 (PDF officiel Bison Futé). |
| Écheances fiscales 2027 | `server/sources/echeances-fiscales.js` | Plusieurs TODO 2027 non confirmés (TF, non-résidents). À suivre sur impots.gouv.fr. |
| Éclipse solaire | `server/sources/eclipse-solaire.js` | Prochaine entrée : 2027-08-02. TODO pour les suivantes. |

---

## Slugs orphelins

Comparaison `category_slugs` (267 sources en base) vs taxonomie fermée (`server/categories.js`).

**1 orphelin identifié : `communaute`**

Ce slug est utilisé par `chat-perdu` et `chien-perdu` (type `community`), mais il est **absent de la liste `GROUPS` dans `server/categories.js`**. Conséquence : la carte s'affiche avec le slug brut `communaute` au lieu d'un libellé traduit dans le filtre de catégories et les chips.

Tous les autres slugs de la base sont présents dans la taxonomie. Aucun autre orphelin.

---

## Cohérence schéma

```
schema_check.ok = true
expected_columns = 58 | missing = [] | type_mismatch = []
```

**RAS** — schéma cohérent, aucune migration en attente détectable.

---

## Vitalité des cartes PanneauPocket curées (vague L)

Section `panneaupocket_vitality` du script : **liste vide** (`[]`).

19 sources broadcast curées identifiées (18 vague L + `arrosage-canal-gap`) :  
`agenda-luc-en-diois`, `arrosage-canal-gap`, `cantine-a2m2v`, `dechets-campagne-caux`, `dechets-la-saucelle`, `dechets-saulieu`, `eau-charles-chaigneau`, `eau-coteaux-lizon`, `eau-isle-dronne`, `eau-provence-verte`, `eau-puisaye-forterre`, `eau-regie-metz`, `local-agly-fenouilledes`, `local-buech-devoluy`, `local-chablis`, `local-chabris-bazelle`, `securite-gendarmerie-albi`, `securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts`.

La liste vide signifie qu'aucune de ces sources n'a un `last_activated_at` dépassant 90 jours — **elles ont toutes connu au moins une activation dans la fenêtre récente**. RAS.

**Limite de méthode à rappeler** : `last_activated_at` ne reflète que les panneaux alertables (filtre thématique). Un panneau hors-thème récent ne met pas à jour cette date. La vitalité réelle des collectivités ne peut être confirmée sans interroger PanneauPocket en direct (interdit la nuit). Ce résultat est un proxy optimiste.

**Point de vigilance ouvert** : stabilité des ids `?panneau=` à l'édition (documentée en tête de `server/sources/ma-collectivite.js`). Si PanneauPocket régénère l'id lors d'une modification de panneau, une mise à jour apparaît comme « nouveau ». Impossible à mesurer sans fetch réseau. Mentionné comme surveillance continue, pas d'alarme.

---

## Combos orphelins & ids `?panneau=`

**Combos orphelins** : `orphan_param_states.count = 26`

Échantillon (10 premiers) :
- `iss-passages` `{ ville: "gap" }` — état `active`, checked 23/07
- `ma-collectivite` — 5 URLs de collectivités 05 désabonnées (Ozé, Valserres, AMR 05, Veynes, La Bâtie-Vieille)
- `rappel-conso` — 2 catégories (`bébés-enfants`, `alimentation`) en état `active`
- `risque-secheresse` — 4 départements (06, 14, 16, 53) en état `active`
- `vigilance-meteo` — 13 départements en état `active` ou `inactive`

La présence de combos en état `active` sans abonnement signifie que le poller continue à les calculer. Pas de fausse alerte (aucun destinataire), mais coût CPU marginal. **Purge = décision humaine** via DELETE ciblé — jamais automatique.

**Stabilité des ids `?panneau=`** : point de vigilance consigné en tête de `ma-collectivite.js` — si PanneauPocket régénère les ids à l'édition, une modification apparaîtrait comme « nouveau ». Pas mesurable sans fetch réseau (interdit). Mentionné sans alarme.

---

## BROUILLON — À valider par Hugo avant toute exécution

### 1. Correctif `statut-anthropic` (certificat SSL)

**Non validé — brouillon descriptif uniquement.**

Le endpoint actuel `https://status.anthropic.com/api/v2/status.json` échoue avec un `HOST_MISMATCH` depuis le 14/08. Anthropic utilise Statuspage et expose probablement une URL native de type `https://anthrostat.statuspage.io/api/v2/status.json` (ou similaire — à vérifier sur la page status.anthropic.com).

Piste de correction dans `server/sources/statut-anthropic.js` :  
→ Remplacer l'URL actuelle par l'URL Statuspage native (à retrouver en inspectant le réseau depuis un navigateur sur status.anthropic.com).

### 2. Ajout du slug `communaute` à la taxonomie

**Non validé — brouillon descriptif uniquement.**

Dans `server/categories.js`, ajouter `'communaute'` dans le groupe `vie-locale` (ou créer un groupe dédié) et éventuellement un SPECIAL label :

```js
// Dans GROUPS, groupe 'vie-locale' (ligne ~29) :
'vie-locale': ['vie-locale', ..., 'mairie', 'communaute'],

// Dans SPECIAL (optionnel, pour un libellé précis) :
'communaute': 'Communauté',
```

Aucune migration DB requise — les sources portent déjà le slug.

---

_Fin du rapport. Durée d'exécution du script : ~2 s. Aucune écriture effectuée._
