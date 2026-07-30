# Rapport de veille — 2026-07-30

*Robot 1 — veilleur de maintenance, lecture seule. Généré à 02:00 UTC.
Périmètre : 265 sources enabled, 34 combinaisons paramétrées souscrites.*

## Résumé

**RAS structurel.** Aucun signal justifiant une action nocturne.

1. Schéma DB **cohérent** (54 colonnes attendues, 0 manquante, 0 type inattendu) — aucune migration en attente.
2. Sources en échec : **toutes de cause connue ou transitoire tierce** (clé API absente, DataDome, timeouts INSEE/Launch Library/Statuspage) — aucune régression réelle.
3. Deux TODO calendaires entrent dans la fenêtre 60 j : `courses-mythiques` (transcription **septembre 2026**, config vide) et `tour-de-france-passage` (parcours 2027, **octobre 2026**, en approche).
4. Slugs orphelins : **aucun**. Vitalité PanneauPocket curée : **RAS** (cartes trop récentes pour un seuil 90 j).
5. Bruit attendu : 23 combos orphelins (purge = décision humaine), 11 collisions d'ordre d'affichage (cosmétique).

---

## Cohérence schéma
`schema_check.ok = true` — schéma cohérent. Rien à signaler.

## Sources en échec (≥ 2 échecs / 7 j)
Aucune n'est une régression. Classées par nature :

**Causes connues / attendues (aucune action) :**
- `sncf-perturbations` (140) — `SNCF_API_KEY absente`. Variable d'environnement Railway non configurée (documenté, pas du code). Normal.
- `leboncoin-livraison` (72) — blocage DataDome (IP datacenter). Phase d'observation silencieuse assumée (`check()` renvoie toujours `inactive()`). Normal.

**Transitoire tierce (surveillance passive, aucune action) :**
- `ecowatt` (38) — HTTP 429 « appel trop fréquent », géré (repli cycle suivant). Récurrent mais sans conséquence.
- `lancement-spatial` (35) — timeout Launch Library (> 10 s). API communautaire lente.
- `risque-secheresse` (15) — VigiEau **404** (dernier échec ce jour 01:31). Source active avec combos abonnés (06/14/16/53) toujours en état `active` → pas de perte d'alerte visible, mais **le 404 mérite un œil** si la série persiste (possible évolution d'endpoint VigiEau/RegLeau). Signal **bas**.
- `vigicrues-departement` (10) — timeout API (> 10 s). Tierce.
- INSEE BDM (timeouts groupés) : `prix-logements-anciens` (5), `chomage-stats` (3), `indice-reference-loyers` (3), `inflation-insee` (3), `ipc-alimentaire` (2) — même cause (lenteur BDM), sources mensuelles/trimestrielles, sans impact.
- Statuspage (timeouts) : `statut-twitch` (3), `statut-airtable` (2), `statut-scaleway` (2) — transitoire.
- `asteroide-frole-terre` (2) — JPL 503 temporaire.

## États figés (caveat)
Le gros bloc `stale_states` (sources/combinaisons `inactive` avec `checked_at` ancien) est **normal** : `checked_at` n'est rafraîchi qu'à l'écriture, et l'étape B (refresh en still-inactive) n'est pas déployée. Aucune entrée `active`/`pending` figée n'est corroborée par `failing_sources` → **bruit attendu, aucune alarme**.

## Jamais actives (90 j)
Liste dominée par les sources saisonnières hors-saison (astro d'automne/hiver, soldes, Black Friday, Beaujolais, élections, fêtes) et les cartes de statut cloud (n'émettent qu'en cas de panne). Toutes créées mi-juillet 2026 (< 90 j d'existence réelle). **Aucune anomalie** : rien qui soit censé s'activer souvent et resterait muet.

## Collisions d'ordre d'affichage (cosmétique)
11 collisions, toutes entre une source de statut cloud et une source saisonnière (ex. `40` doomname/statut-github ; `51` black-friday/soldes/statut-zoom ; `56` eclipse-solaire/geminides/nuits-des-etoiles). Sans urgence. Ré-échelonnement possible un jour de nettoyage, non prioritaire.

## TODO calendaires ≤ 60 j (avant ~2026-09-28)
- **`courses-mythiques`** — `⚠️ TODO septembre 2026 : transcrire les dates officielles`. Config actuellement **vide**. Échéance **dans la fenêtre**. Dès annonce officielle des grandes courses 2027 (Marathon/Semi de Paris pressentis avril/mars 2027, Paris-Versailles), transcrire `{ name, start }` depuis une page officielle consultée (convention anti-hallucination : jamais de date de mémoire).
- **`tour-de-france-passage`** — `⚠️ TODO octobre 2026 : à l'annonce du parcours 2027`. Échéance **en approche** (bord haut de la fenêtre). Rappel : à la même échéance, création de **`tdf-villes-etapes`** (conception déjà tranchée, cf. etat-projet). Transcription letour.fr/ASO obligatoire.

**Annexe (au-delà de 60 j, pour mémoire, aucune action)** : renouvellements annuels `bison-fute` (calendrier 2027, début 2027), `echeances-fiscales` (entrée 2027), `cfe-entreprises` (15 déc), `bourses-scolaires` (limite 15 oct 2026 — déjà codée, échéance ~77 j), `fete-science` / `fete-bretagne` / `fashion-week` / `festival-livre-paris` (TODO annuels), nombreuses fêtes mobiles 2027/2028 déjà codées.

## Vitalité PanneauPocket curée (vague L)
`panneaupocket_vitality` renvoyée **vide** → aucune carte curée ne franchit le seuil (absence de `last_activated_at` ou > 90 j). **Attendu** : les 18 cartes vague L + `arrosage-canal-gap` ont été créées le 24/07/2026 (~6 jours) — aucune ne peut être stale à 90 j. **RAS**.

**Limite de méthode (à rappeler)** : la base ne stocke aucune date de publication de panneau (`ref` = couples `[panneauId, hash]`). Le seul proxy est `last_activated_at` (dernier panneau *alertable*), qui **sous-estime** la vitalité (panneaux hors filtre thématique ou cosmétiques = aucun événement). Une carte silencieuse au poll ne prouve pas une entité PanneauPocket morte. Le contrôle 90 j ne deviendra exploitable qu'à partir de ~fin octobre 2026. Meilleure mesure suggérée (non implémentée) : persister la date du dernier panneau vu dans `ref`.

## Combos orphelins & stabilité des ids `?panneau=`
- **Combos orphelins** : `orphan_param_states.count = 23` — lignes `source_param_states` dont plus aucun abonnement ne porte le couple `(source_id, params)`. Échantillon : combos `vigilance-meteo` (nombreux départements), `risque-secheresse` (06/14/16/53), `rappel-conso` (alimentation, bébés-enfants), `iss-passages` (gap), `ma-collectivite` (3 URLs 05). Reliquat de désabonnements. **Purge = décision humaine** — jamais de `DELETE` par le robot.
- **Stabilité des ids `?panneau=`** (point de vigilance ouvert) : si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme « nouveau » (fausse alerte). Non mesurable sans requête réseau (interdite la nuit). Signalé comme **vigilance ouverte**, sans alarme.

---

*Aucun brouillon correctif : rien ne requiert de correction à valider ce run.*
