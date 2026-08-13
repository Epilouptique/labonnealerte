# Rapport de veille — 2026-08-05

_Généré automatiquement par Robot 1 (lecture seule). Aucune modification de code ou de base n'a été effectuée._
_Périmètre : 266 sources enabled, 35 combinaisons paramétrées._

---

## Résumé (5 lignes)

1. **INSEE BDM en panne partielle** : 4 sources économiques (IRL, inflation, IPC alim, chômage) frappées par des ECONNRESET depuis ~12h34 le 04/08 — probablement une indisponibilité réseau côté bdm.insee.fr, à surveiller.
2. **prix-logements-anciens** : HTTP 500 INSEE depuis le 02/08, plus persistant que le cluster ECONNRESET — potentiellement un endpoint cassé, signalé séparément.
3. **aurores-france** : JSON NOAA invalide depuis le 02/08 (10 échecs) — peut indiquer un changement de format d'API.
4. **Slug orphelin** : `communaute` utilisé par `chat-perdu` est absent de la taxonomie `server/categories.js` → libellé brut affiché.
5. **Bug script** : `panneaupocket_vitality` retourne toujours `[]` (erreur PG silencieuse sur `jsonb_array_length` appliqué à des ref JSONB objets) — données PanneauPocket reconstituées par requête directe, aucune carte à désactiver aujourd'hui.

---

## Sources en échec

### INSEE BDM — panne de masse (niveau : surveillance)

Quatre sources frappées simultanément depuis **~12h34 le 04/08**, toutes par `read ECONNRESET` :

| Source | Fails (7j) | Dernier échec |
|---|---|---|
| `indice-reference-loyers` | 36 | 04/08 12:34 |
| `inflation-insee` | 36 | 04/08 12:34 |
| `ipc-alimentaire` | 35 | 04/08 12:34 |
| `chomage-stats` | 32 | 04/08 12:33 |

Toutes pointent `bdm.insee.fr` via `lib/insee-bdm.js`. La simultanéité et la coupure nette à 12h34 suggèrent une **maintenance ou incident réseau BDM**. Ces sources publient des données mensuelles/trimestrielles à faible fréquence de mise à jour réelle : pas d'alerte manquée à court terme. À surveiller 24-48h ; si la panne persiste en semaine, signaler à Hugo pour investigation de l'endpoint.

### prix-logements-anciens — HTTP 500 INSEE (niveau : bas)

- Fails : 34 sur 7 jours, **dernier le 02/08** (soit 3 jours sans fail récent).
- Message : `Réponse HTTP inattendue INSEE (010567118) : 500`.
- Le `500` vient d'un endpoint SDMX INSEE distinct du BDM standard. Peut-être une instabilité passagère. Pas de fail depuis le 02/08 dans la fenêtre de 7 jours : possiblement résolu seul. RAS si le prochain run est propre.

### aurores-france — JSON NOAA invalide (niveau : modéré)

- Fails : 10, **dernier le 02/08** (il y a 3 jours, aucun fail plus récent dans la fenêtre visible).
- Message : `Réponse NOAA illisible (JSON invalide)`.
- Même API que `tempete-solaire` (NOAA). `tempete-solaire` a eu 8 fails mais le dernier remonte au 31/07 — 5 jours sans incident → probablement résolu côté NOAA. Pour `aurores-france`, dernier fail au 02/08 → à surveiller. Si le JSON NOAA a changé de structure, la source ne se redressera pas seule et nécessitera un fix de parsing.

### risque-secheresse — 404 VigiEau (niveau : bas, comportement attendu)

- Fails : 33, dernier ce matin (01:31).
- Le code (commit `b9828ee`) documente explicitement ce comportement : VigiEau régénère ses ressources la nuit, produisant des 404 transitoires. La logique de cache-fallback est en place (`cache.data && cache.at`). Les 404 remontés sont des échecs nocturnes de la fenêtre de régénération : **normal**. Aucune alerte faussée.

### ecowatt — HTTP 429 RTE (niveau : bas)

- Fails : 29, dernier le 04/08 22:44.
- Message : `EcoWatt : appel trop fréquent (HTTP 429), prochain cycle`.
- Le code gère le 429 en sautant le cycle : comportement défensif correct. L'état EcoWatt en base est `inactive` stale depuis le 11/07 (source dormante hors saison — **normal en août**). RAS.

### sncf-perturbations — clé API absente (niveau : information)

- Fails : 134 (chronique depuis la création). Message : `SNCF_API_KEY absente de l'environnement`.
- Cause connue et documentée dans `etat-projet.md`. La variable est à poser sur Railway le moment venu. **Pas un bug de code.**

### lancement-spatial — Timeout API (niveau : bas)

- Fails : 51, dernier cette nuit (00:31).
- API Launch Library communautaire, marquée fragile dans `etat-projet.md`. Timeouts chroniques attendus.

### Statuts cloud — Timeouts isolés (niveau : bruit)

5 sources (`statut-twitch` 3, `statut-airtable` 2, `statut-canva` 2, `statut-gandi` 2, `statut-grafana` 2) avec 2-3 timeouts chacune. Transitoires, pas de signal de panne réelle.

---

## États figés (stale_states)

273 entrées stale au total. Conformément au caveat du script : `checked_at` n'est rafraîchi qu'à l'écriture ; une source still-inactive conserve un ancien horodatage. **Bruit attendu** dans l'état actuel (étape B non déployée).

Point notable : parmi les stale actives figurent **10 combinaisons `vigilance-meteo`** (dépts 31, 33, 35, 38, 44, 67, 74, 75, 83, 24) avec état `active` daté du 14-15/07 et **aucun abonné actif** (confirmé : ces combos sont dans `orphan_param_states`). Pas de fausse alerte envoyée (plus d'abonné), mais données périmées en base. Purge = décision Hugo (cf. section combos orphelins).

---

## Jamais activées depuis 90 jours — sources notables

La liste `never_active_90d` contient ~115 entrées. La quasi-totalité est **normale** : sources saisonnières hors saison, sources récentes, ou sources documentées comme dormantes (clé API manquante, blocage DataDome, config vide).

Sources qui pourraient attirer l'attention mais restent normales :
- `ecowatt`, `ecogaz`, `tempo` : hors saison estivale.
- `beaujolais-nouveau`, `black-friday`, `changement-heure`, `geminides`, `perseides` : événements automne-hiver, muets en été.
- `sncf-perturbations` : clé absente.
- `cyclones-outremer` : activée 25/07, saison cyclonique démarrant — muette hors événement, normal.
- `meteo-forets` : source ajoutée récemment, normale hors épisode.

Aucun signal anormal dans cette liste.

---

## Collisions display_order (cosmétique)

11 collisions dans la plage 40-59, dont une triple (order 51 : `black-friday`, `soldes`, `statut-zoom`). Issues des vagues successives. Sans impact fonctionnel, à rééchelonner lors d'une prochaine maintenance d'`init.sql`.

---

## TODO calendaires (≤ 60 jours)

Aujourd'hui = 2026-08-05. Fenêtre : jusqu'au 2026-10-04.

| Événement | Échéance | Fichier | Statut |
|---|---|---|---|
| Éclipse solaire totale/partielle | 12/08/2026 | `eclipse-solaire.js` | ✅ Configurée |
| Grandes marées (août) | 13-15/08/2026 | `grandes-marees.js` | ✅ Configurées |
| Braderie de Lille | 5-6/09/2026 | `braderie-lille.js` | ✅ Configurée |
| Grandes marées (sept) | 11-13/09/2026 | `grandes-marees.js` | ✅ Configurées |
| Fashion Week PE2027 | 28/09-6/10/2026 | `fashion-week.js` | ✅ Configurée |
| Fête de la science | 2-12/10/2026 | `fete-science.js` | ✅ Configurée |

**Aucune action requise dans les 60 jours** : tout ce qui était à configurer l'est déjà.

### Annexe — TODO 2027 au-delà de 60 jours (liste courte, sans urgence)

À traiter en début 2027 ou dès publication officielle :
- `bison-fute.js` : JOURS_2027 à transcrire depuis le PDF officiel BF.
- `echeances-fiscales.js` : entrée 2027 à ajouter (TF oct, THRS déc, PAS, remboursements).
- `grandes-marees.js` : périodes 2027 à transcrire depuis maree.info/SHOM (la source sera dormante après oct 2026 sans cette mise à jour).
- `allocation-rentree-scolaire.js`, `rentree-scolaire.js`, `prime-noel.js` : dates 2027 à ajouter dès publication CAF/MENESR.
- `braderie-lille.js`, `rdv-gaming.js`, `nobel-prix.js` : TODO 2027 notés dans les fichiers.
- `fete-science.js` : TODO 2027 (dates non annoncées au 23/07/2026, à surveiller courant 2027).

---

## Slug orphelin

**`communaute`** est utilisé comme catégorie par la source `chat-perdu` (seule source concernée). Ce slug **n'est pas défini** dans la taxonomie `GROUPS` de `server/categories.js`.

Conséquence : la carte `chat-perdu` affiche le slug brut `"communaute"` au lieu d'un libellé lisible dans les filtres et le menu de catégories.

Correction à envisager : ajouter `'communaute'` dans un groupe approprié (ex. `vie-locale` ou `solidarite`) dans `server/categories.js`, ou renommer la catégorie côté `init.sql`.

---

## Vitalité des cartes PanneauPocket curées (Vague L)

⚠️ **Bug du script détecté** : `panneaupocket_vitality` retourne `[]` car la requête `Q_PP_VITALITY` échoue silencieusement. La cause probable est l'appel à `jsonb_array_length(ss.ref)` sur des lignes dont `ref` est un objet JSONB `{}` (sources comme `ondes-gravitationnelles`), ce qui lève une erreur PostgreSQL capturée par le bloc `try/catch` sans être journalisée dans la sortie JSON. Correction à apporter au script : utiliser `CASE WHEN jsonb_typeof(ss.ref) = 'array' THEN jsonb_array_length(ss.ref) ELSE NULL END`. Les données ci-dessous ont été reconstituées par requête directe.

**Limite de méthode** (rappel) : `last_activated_at` est le dernier panneau nouveau/modifié ayant déclenché une alerte. Les panneaux hors-filtre thématique ou purement cosmétiques n'alimentent pas ce proxy → sous-estimation de la vitalité. Toute décision de désactivation nécessite une vérification humaine dans l'app PanneauPocket.

### Cartes actives récemment (≤ 30 jours)

| Source | Dernier last_activated_at |
|---|---|
| `arrosage-canal-gap` | 04/08/2026 14:00 |
| `local-chabris-bazelle` | 04/08/2026 22:01 |
| `local-agly-fenouilledes` | 04/08/2026 08:01 |
| `eau-charles-chaigneau` | 04/08/2026 14:25 |
| `eau-coteaux-lizon` | 03/08/2026 15:30 |
| `eau-provence-verte` | 03/08/2026 15:30 |
| `securite-gendarmerie-albi` | 31/07/2026 20:01 |
| `dechets-saulieu` | 31/07/2026 15:00 |
| `local-chablis` | 31/07/2026 08:01 |
| `agenda-luc-en-diois` | 31/07/2026 10:00 |

**→ 10 cartes vivantes et actives, RAS.**

### Cartes sans last_activated_at (jamais activées)

| Source | Date de création |
|---|---|
| `cantine-a2m2v` | 24/07/2026 |
| `dechets-campagne-caux` | 24/07/2026 |
| `dechets-la-saucelle` | 24/07/2026 |
| `eau-isle-dronne` | 24/07/2026 |
| `eau-puisaye-forterre` | 24/07/2026 |
| `local-buech-devoluy` | 24/07/2026 |
| `securite-gendarmerie-bayeux` | 24/07/2026 |
| `securite-gendarmerie-essarts` | 24/07/2026 |

Toutes créées le 24/07/2026, soit **12 jours avant ce rapport**. Le seuil de 90 jours n'est pas atteint : **aucune candidate à désactivation aujourd'hui**. Ces 8 cartes sont à recontroler vers le **~22/10/2026** (90j). Le proxy sous-estime : une entité publiant des panneaux hors-filtre thématique apparaît muette alors qu'elle est vivante.

---

## Combos orphelins & stabilité des ids `?panneau=`

### Combos orphelins

**26 lignes** `source_param_states` sans abonnement actif (résidus de désabonnements). Répartition :
- `vigilance-meteo` : 12 combos (dépts 31, 33, 35, 38, 44, 67, 74, 75, 83, 24, 16, 10, 69, 13)
- `ma-collectivite` : 5 combos (URLs PanneauPocket 05)
- `risque-secheresse` : 4 combos (dépts 06, 14, 16, 53)
- `rappel-conso` : 2 combos (catégories bébés-enfants, alimentation)
- `iss-passages` : 1 combo (ville Gap)
- `vigilance-meteo` dépt 13 : 1 combo supplémentaire

Plusieurs `vigilance-meteo` et `risque-secheresse` sont en état `active` figé — sans abonné actif, aucune notification ne leur est envoyée. **Purge = décision humaine** ; ne pas supprimer ici.

### Stabilité des ids `?panneau=`

Point de vigilance ouvert (consigné en tête de `ma-collectivite.js`) : si PanneauPocket régénère les ids de panneau lors d'une édition, une simple modification apparaîtrait comme « nouveau panneau ». Impossible à mesurer sans appel réseau (interdit la nuit). Signal à surveiller par Hugo via l'app PanneauPocket, pas d'alarme.

---

_Fin du rapport. Aucune action automatique effectuée._
