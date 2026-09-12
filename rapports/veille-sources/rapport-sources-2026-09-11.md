# Rapport de veille — nouvelles sources candidates — 2026-09-11

3 pistes ce cycle. Constats factuels uniquement (structure, accès, format, fréquence) ; aucun tri, aucune recommandation. La décision revient entièrement à Hugo.

Référentiel anti-doublon utilisé : `server/sources/*.js` (273 fichiers recensés) + tableau « Les sources actuelles » du `README.md` + backlog écarté de `.claude/etat-projet.md`.

---

## Piste 1 — Hub'Eau : API « Qualité des cours d'eau » (v2, physico-chimie)

- **Nom** : Hub'Eau — Qualité des cours d'eau (qualité physico-chimique des fleuves, rivières, plans d'eau ; données Naïades / Agences de l'Eau).
- **URL** : https://hubeau.eaufrance.fr/page/api-qualite-cours-deau — base des endpoints `https://hubeau.eaufrance.fr/api/v2/qualite_rivieres/`.
- **Accès** : constaté libre, aucune clé/API key mentionnée. Rate-limit non spécifié sur la page de doc. Licence non précisée sur cette page (renvoi CGU non lu).
- **Format de réponse constaté** : la page de doc annonce JSON, GeoJSON et CSV. **Non vérifié par appel réel** d'un endpoint (structure de payload non confirmée ici, seulement la doc).
- **Endpoints listés** : `station_pc` (stations de mesure), `operation_pc` (opérations), `condition_environnementale_pc` (conditions), `analyse_pc` (analyses).
- **Fréquence de mise à jour apparente** : la doc indique « données synchronisées en continu avec la base Naïades » (mise à jour majeure datée 19/07/2022 ; v1 fermée le 03/01/2023). Cadence réelle par station non vérifiée.
- **Repère interne** : même famille Hub'Eau que `veille-hydrometrie.js` (station + seuil) et `eau-potable-commune.js` ; structure d'appel REST comparable. Repère descriptif, pas une recommandation.

---

## Piste 2 — Hub'Eau : API « Température des cours d'eau » (continu)

- **Nom** : Hub'Eau — Température des cours d'eau (mesures de capteurs automatiques en continu, France métropolitaine ; données Naïades).
- **URL** : https://hubeau.eaufrance.fr/page/api-temperature-continu — base `https://hubeau.eaufrance.fr/api/v1/temperature/`.
- **Accès** : constaté libre, aucune clé requise. Rate-limit non spécifié. Licence : renvoi vers « Conditions générales d'utilisation » (page CGU non lue ici). Pagination profondeur max 20 000 enregistrements ; longueur d'URL max ~2083 caractères ; CORS/JSONP supportés (d'après la doc).
- **Format de réponse constaté** : doc annonce JSON, GeoJSON, CSV. **Structure de payload non vérifiée par appel réel.**
- **Endpoints listés** : `/station` (stations du réseau), `/chronique` (séries temporelles de température).
- **Fréquence de mise à jour apparente** : doc indique synchronisation temps réel avec Naïades (depuis 19/07/2022) ; capteurs relevant « d'une minute à plusieurs heures ». La doc mentionne ~760 stations dont ~50 opérationnelles (chiffre non recoupé).
- **Repère interne** : même famille Hub'Eau que `veille-hydrometrie.js` (station + seuil), logique station→série chronologique proche. Repère descriptif.

---

## Piste 3 — API Tabulaire data.gouv.fr (beta) — mécanisme d'accès générique

- **Nom** : API Tabulaire data.gouv.fr (interroge en REST les jeux de données tabulaires référencés sur data.gouv.fr). Ce n'est pas une source thématique mais un **mécanisme d'accès** transversal.
- **URL** : https://www.data.gouv.fr/dataservices/api-tabulaire-data-gouv-fr-beta — base `https://tabular-api.data.gouv.fr/api` ; doc technique `https://tabular-api.data.gouv.fr/api/doc` (**page Swagger rendue en JavaScript, non lisible via fetch — structure d'endpoints non vérifiée directement ; constats ci-dessous tirés de la fiche dataservice**).
- **Accès** : constaté libre, aucune authentification requise (d'après la fiche). Rate-limit annoncé : 100 requêtes/seconde. Statut : **beta**.
- **Format de réponse constaté** (d'après fiche, pas par appel réel) : JSON. L'endpoint `/data/` renverrait 3 clés : `data` (lignes en dictionnaires), `links` (`next`/`prev`/`profile`/`swagger`), `meta` (pagination : page, page_size, total). Export possible CSV/JSON.
- **Filtres annoncés** : tri `col__sort=asc|desc` ; `__exact`, `__contains`, `__less`/`__greater`/`__strictly_less`/`__strictly_greater`, `__in`/`__notin`, `__isnull`/`__isnotnull` ; pagination `page`/`page_size`. Formats de fichiers sources acceptés : CSV, CSV.gz, XLS, XLSX, Parquet (plafonds 12,5–100 Mo selon format).
- **Fréquence de mise à jour apparente** : dépend de chaque jeu de données sous-jacent (l'API n'a pas de fréquence propre).
- **Repère interne** : famille des veilles génériques par requête (`veille-boamp.js`, `veille-page.js`) plutôt qu'une source figée ; un tel accès pourrait, en théorie, adresser des jeux tabulaires variés sans code d'appel dédié par jeu. Repère descriptif, pas une recommandation.

---

## Doublons évités

- **RappelConso V2** (data.economie.gouv.fr, dataset `rappelconso-v2-*`) — déjà couvert par `server/sources/rappel-conso.js`. (V1 déprécié, V2 remplace fin 2025 ; ajout GTIN 29/11/2024 ; page dataviz 04/02/2026 — écarté car source déjà en prod.)
- **Hub'Eau — Hydrométrie** — déjà couvert par `server/sources/veille-hydrometrie.js` (station + seuil).
- **Hub'Eau — Eau potable / qualité au robinet** — recoupe `server/sources/eau-potable-commune.js`.
- **Eaux de baignade** — au backlog écarté d'`etat-projet.md` (Hub'Eau sans API baignade, SISE-Baignades non ouvert en open data) — écarté, aucun signal nouveau ce cycle.
- **Qualité de l'air / pollens** — déjà couverts par `qualite-air.js` et `pollens.js` (Atmo France).

---

*Note de méthode : les formats de réponse des pistes 1 à 3 proviennent des pages de documentation / fiches dataservice ; aucun endpoint n'a été appelé (contrainte lecture web documentaire). La structure réelle des payloads reste donc à confirmer. La doc Swagger de l'API tabulaire (piste 3) n'a pas pu être lue (rendu JavaScript).*
