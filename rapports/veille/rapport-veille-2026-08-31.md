# Rapport de veille — 2026-08-31

_Généré le 2026-08-31 à ~02h00 UTC. Sources actives : 267. Combinaisons paramétrées suivies : 36._

---

## Résumé (5 lignes max)

1. **`aurores-france` : JSON NOAA malformé (3 échecs)** — source fragile déjà signalée ; à surveiller, mais pas encore en panne durable.
2. **`lancement-spatial` : 52 timeouts en 7 jours** — API Launch Library lente/instable de manière récurrente ; à surveiller.
3. **Slug orphelin `communaute`** — absent de la taxonomie `server/categories.js`, utilisé par `chat-perdu` et `chien-perdu`.
4. **26 combos orphelins** (désabonnements anciens, purge = décision humaine).
5. Tout le reste est RAS : schéma cohérent, statuts Statuspage en timeouts transitoires normaux, PanneauPocket curée OK, aucun TODO à exécuter dans les 60 jours.

---

## Sources en échec (`failing_sources`)

| Source | Nb échecs | Dernier message | Diagnostic |
|---|---|---|---|
| `sncf-perturbations` | 130 | SNCF_API_KEY absente | **Normal** — clé jamais configurée sur Railway, attendu (documenté dans etat-projet.md) |
| `lancement-spatial` | 52 | Timeout API Launch Library (>10 000 ms) | **À surveiller** — 52 échecs sur 7 jours suggère une instabilité durable de l'API tierce, pas un pic ponctuel |
| `statut-grafana` | 5 | Timeout | Timeouts Statuspage transitoires depuis Railway — pattern récurrent, pas de panne réelle |
| `statut-gandi` | 4 | Timeout | Idem |
| `statut-scaleway` | 4 | Timeout | Idem |
| `statut-twitch` | 4 | Timeout | Idem |
| `aurores-france` | 3 | Réponse NOAA illisible (JSON invalide à pos. 6819) | **À surveiller** — l'API NOAA renvoie occasionnellement du JSON tronqué/malformé ; 3 échecs sur 7j = pas encore en crise, mais source déjà fragile |
| `statut-proton` | 3 | Timeout | Transitoire |
| `statut-pypi` | 3 | Timeout | Transitoire |
| `statut-canva` | 2 | Timeout | Seuil minimum, transitoire probable |
| `statut-flyio` | 2 | Timeout | Idem |
| `statut-vimeo` | 2 | Timeout | Idem |

**Conclusion** : deux sources méritent une attention lors de la prochaine vérification humaine : `lancement-spatial` (volume d'échecs anormalement élevé) et `aurores-france` (JSON malformé répété). Les statuts Statuspage en timeout sont un bruit de fond attendu sur Railway.

---

## États figés (`stale_states`)

Caveat rappelé par le script : `checked_at` n'est rafraîchi que sur écriture ; un état `inactive` ancien sur une source non abonnée est **normal** tant que l'étape B (refresh même en still-inactive) n'est pas déployée.

Toutes les entrées stale en `source_states` (broadcast) sont en état `inactive`, avec des `checked_at` datant du 14-18 juillet 2026. Cela correspond exactement au déploiement initial des vagues : ces sources ont été checkées une fois, n'ont rien déclenché, et n'ont pas eu d'écriture depuis. **Bruit attendu, aucune alarme.**

Les entrées `source_param_states` stale avec état `active` (vigilance-meteo sur 9 départements, rappel-conso sur 2 catégories, risque-secheresse sur 4 départements) sont toutes des **combos orphelins** (abonnements résiliés depuis juillet) : cf. tâche g.

---

## Jamais actives en 90 jours (`never_active_90d`)

Longue liste (~80 sources), essentiellement normale :

- **Saisonnières hors-saison** : `beaujolais-nouveau` (novembre), `changement-heure` (octobre), `black-friday` (novembre), `geminides` (décembre), `saint-nicolas` (décembre), `treve-hivernale` (novembre-mars), `cheque-energie` (automne-hiver), `loi-montagne` (novembre-mars), `saints-de-glace` (mai), `carnavals` (février-mars), `premier-avril`, `vendredi-13`, `ouverture-peche` (mars), etc. → **Normal**.
- **Sources sans config curation / config vide** : `billetterie-concerts`, `ouverture-ventes-sncf`, `courses-mythiques` → **Normal**, config à remplir au fil de l'eau.
- **Sources en repli saisonnier** : `ecowatt`, `ecogaz`, `tempo` → hors pic de consommation, **Normal**.
- **`cyclones-outremer`** : activée le 25/07/2026, jamais déclenchée en 90j → **Normal**, saison cyclonique mais pas de cyclone en territoire ultramarin depuis l'activation.
- **`meteo-forets`** : activée le 29/07, jamais déclenchée — la fin de saison feux approche, **Normal**.
- **`aurores-france`** : jamais active ET en échec JSON (cf. ci-dessus) — la source n'a donc pas produit d'alerte ET elle échoue épisodiquement. Non bloquant (l'état reste `inactive`, pas de fausse alerte), mais confirme la fragilité de l'API NOAA.
- **Sources paramétrées sans abonné** : `seismes-departement`, `steam-jeu-promo`, `veille-hackernews`, `veille-rss`, `taux-de-change`, `pannes-hydro-quebec`, `meteo-suisse`, `meteo-quebec`, `meteo-belgique`, `npm-release`, `pypi-release`, etc. → **Normal** (aucune combinaison souscrite = aucun poll).

Rien d'anormal dans cette liste.

---

## Collisions de display_order (cosmétique)

11 collisions détectées sur les orders 40-59 (introduites lors des vagues d'ajout successives) :

| Order | Sources en collision |
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

Cosmétique (les cartes s'affichent toutes, l'ordre entre collisions est indéterministe). À rééchelonner lors d'un prochain chantier SQL de routine.

---

## TODO calendaires ≤ 60 jours (jusqu'au 2026-10-30)

**Aucun TODO à exécuter dans la fenêtre.** Toutes les configs 2026 sont en place. Détail des événements à venir avec leur config :

| Source | Événement | Date | Config |
|---|---|---|---|
| `braderie-lille` | Braderie de Lille | 5-6 sept 2026 | ✅ codée en dur |
| `fetes-juives` | Roch Hachana / Yom Kippour | 12 & 21 sept 2026 | ✅ codée en dur |
| `journees-patrimoine` | Journées du patrimoine | 19-20 sept 2026 | ✅ calculée automatiquement (3e samedi de septembre) |
| `fetes-laiques` | Équinoxe d'automne | 23 sept 2026 | ✅ codée en dur |
| `grandes-causes` | Octobre Rose | 1er-5 oct 2026 | ✅ codée en dur |
| `nobel-prix` | Prix Nobel | 5-12 oct 2026 | ✅ codée en dur |
| `semaine-bleue` | Semaine bleue (seniors) | 5-11 oct 2026 | ✅ codée en dur |
| `fete-science` | Fête de la science | 2-12 oct 2026 | ✅ codée en dur |
| `semaine-du-gout` | Semaine du goût | 12-18 oct 2026 | ✅ codée en dur |
| `echeances-fiscales` | Taxe foncière | paper 15 oct / online 20 oct 2026 | ✅ codée en dur |
| `fetes-laiques` | Halloween | 31 oct 2026 | ✅ codée en dur |

**Annexe — TODOs au-delà de 60 jours (pour mémoire) :**
- `bison-fute` : TODO début 2027 — remplacer `JOURS_2026` par le calendrier officiel 2027 (dès publication Bison Futé, en général janvier).
- `echeances-fiscales` : TODO début 2027 — ajouter l'entrée 2027 (TF/THRS) ; dates PAS-1er-sept-2027 et non-résidents non annoncées.
- `rentree-scolaire` : TODO 2027 — arrêté scolaire à paraître.
- `braderie-lille`, `semaine-du-gout`, `semaine-bleue`, `fete-science`, `nobel-prix`, `allocation-rentree-scolaire`, `grandes-causes` : tous en TODO 2027, dates 2027 non annoncées au moment de l'écriture.
- `elections-france` : TODO dès parution du décret de convocation de la présidentielle 2027.

---

## Slugs orphelins (catégories)

**1 orphelin détecté : `communaute`**

Ce slug est utilisé par les sources `chat-perdu` et `chien-perdu` (type `community`, `display_order` 500 et 501, ajoutées en août 2026), mais il est **absent** de la taxonomie définie dans `server/categories.js` (qui alimente `/api/categories`).

Conséquence : sur les cartes de ces deux sources, le filtre par catégorie affichera le slug brut `communaute` au lieu d'un libellé humain lisible.

La correction est simple : ajouter une entrée `{ slug: 'communaute', label: 'Communauté', … }` dans `server/categories.js`.

---

## Schéma base de données

`schema_check.ok = true` — aucune colonne manquante, aucun type incohérent. **RAS.**

---

## Vitalité PanneauPocket curée (vague L)

Le script retourne `panneaupocket_vitality = []` : **aucune carte curée n'est signalée au seuil des 90 jours**. Les 19 cartes broadcast (18 vague L + `arrosage-canal-gap`) ont toutes un `last_activated_at` dans les 90 derniers jours, ou le script n'en a détecté aucune en alerte.

**Limite de méthode (à rappeler)** : `last_activated_at` n'est rafraîchi qu'en cas de panneau *alertable* (nouveau ou modifié, passant le filtre thématique). Un panneau hors-thème ou cosmétique n'incrémente pas ce proxy — ce qui peut **sous-estimer** la vitalité réelle d'une collectivité. Aucune conclusion définitive sur la « mort » d'une carte ne peut être tirée sans un fetch réseau sur PanneauPocket (interdit la nuit).

**Point de vigilance ouvert** : si PanneauPocket régénère les identifiants `?panneau=` à l'édition, une simple modification de panneau apparaîtrait comme un « nouveau panneau » côté LBA. Ce comportement ne peut pas être vérifié sans appel réseau — signalé tel quel, sans alarme.

---

## Combos orphelins & stabilité des ids `?panneau=`

**26 combos orphelins** dans `source_param_states` (reliquats de désabonnements) :

| Source | Nb combos orphelins (estimé depuis le sample) |
|---|---|
| `vigilance-meteo` | 12 (départements 10, 13, 16, 24, 31, 33, 35, 38, 44, 67, 69, 74, 75, 83) |
| `ma-collectivite` | 5 (URLs PanneauPocket 05) |
| `risque-secheresse` | 4 (dépts 06, 14, 16, 53) |
| `rappel-conso` | 2 (catégories alimentation, bébés-enfants) |
| `iss-passages` | 1 (ville: gap) |

Ces lignes sont des traces normales de désabonnements survenus depuis juillet 2026. **La purge est une décision humaine** — aucun `DELETE` effectué ici.

**Stabilité des ids `?panneau=`** : rappel du point de vigilance consigné en tête de `server/sources/ma-collectivite.js` — si PanneauPocket régénère les ids à l'édition d'un panneau, une modification apparaîtrait comme « nouveau » pour LBA. Impossible à mesurer sans fetch réseau (interdit) ; point ouvert, sans alarme à ce stade.
