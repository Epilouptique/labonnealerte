# Rapport de veille — nouvelles sources candidates
**Date :** 2026-08-21  
**Robot :** 4 — Veilleur de nouvelles sources (lecture seule + web)

---

## Intro

3 pistes examinées ce cycle (2 fiches retenues + 1 fiche retenue avec incertitude sur l'accès structuré) ; aucune source déjà couverte en dépôt n'a été reproposée.

---

## Fiche 1 — Hub'Eau · Écoulement des cours d'eau (ONDE)

**Nom :** API Hub'Eau — Écoulement des cours d'eau  
**URL :** https://hubeau.eaufrance.fr/page/api-ecoulement  
**URL data.gouv :** https://www.data.gouv.fr/dataservices/hubeau-ecoulement-des-cours-deau

**Accès :**  
Accès libre, sans clé API déclarée dans la documentation publique consultée. Aucun rate-limit annoncé sur la page officielle. Licence non identifiée précisément dans les sources consultées (plateforme Eau France / BRGM / OFB — données issues du SIE).

**Description constatée :**  
L'API diffuse les données de l'observatoire national des étiages (ONDE), géré par l'Office français de la biodiversité (OFB). Il s'agit d'**observations visuelles de terrain** — des agents OFB évaluent l'état d'écoulement (écoulement visible, écoulement non visible, assec) sur de petits et moyens cours d'eau. Réseau de plus de 3 200 stations couvrant la France hexagonale (incluant Corse).

**Format de réponse constaté :**  
JSON, GeoJSON et CSV selon la documentation officielle. Exemple d'URL d'appel documenté :  
`https://hubeau.eaufrance.fr/api/v1/ecoulement/observations?format=json&code_station=A0220651&size=20`  
Structure réelle de la réponse (champs, pagination) non vérifiée dans ce cycle — la documentation indique une API OpenAPI 3.

**Fréquence de mise à jour apparente :**  
Les observations terrain sont produites **une fois par mois** (autour du 25 du mois ± 2 jours), **de mai à septembre uniquement**. Des observations « complémentaires » peuvent être déclenchées par le préfet en dehors de ce calendrier. La base ONDE est mise à jour **quotidiennement** selon la documentation — les nouvelles observations sont intégrées au fil de leur saisie.

**Repère interne :**  
Par la thématique eau/sécheresse, structure comparable à `vigieau.js` (restrictions préfectorales d'usage de l'eau) et `risque-secheresse.js` (arrêtés préfectoraux sécheresse). Par la logique station + seuil, la structure d'appel est plus proche de `veille-hydrometrie.js` (stations hydrométriques, niveaux de débit). Ces trois sources couvrent des angles distincts : état réglementaire des usages, niveau de débit, et ici état d'écoulement visuel constaté sur petits cours d'eau.

---

## Fiche 2 — SNCF · Alertes de service GTFS-RT via le Point d'Accès National

**Nom :** SNCF Service Alerts — flux GTFS-RT via proxy PAN  
**URL ressource :** https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-service-alerts  
**URL jeu de données :** https://transport.data.gouv.fr/datasets/horaires-sncf  
**URL doc PAN API :** https://doc.transport.data.gouv.fr/outils/outils-disponibles-sur-le-pan/api

**Accès :**  
Le proxy `proxy.transport.data.gouv.fr` est décrit par le PAN comme accessible **sans authentification et sans quota**. Le jeu de données parent (SNCF TGV, Intercités et TER) est en open data sur transport.data.gouv.fr. La ressource spécifique « service alerts » correspond au flux d'alertes de service en temps réel.

**Description constatée :**  
Flux d'alertes de perturbations en temps réel sur le réseau ferroviaire SNCF (TGV, Intercités, TER), distribué au format **GTFS-RT** via le proxy du Point d'Accès National. GTFS-RT est un format binaire (Protocol Buffers / protobuf) défini par MobilityData. La ressource identifiée porte le numéro `83196` dans le catalogue du PAN. La relation entre ce flux PAN et l'API SNCF directe (qui, selon `etat-projet.md`, requiert une clé non encore obtenue pour `sncf-perturbations.js`) n'a pas été vérifiée dans ce cycle.

**Format de réponse constaté :**  
GTFS-RT (Protocol Buffers binaire). **Non lisible directement en JSON** — un décodeur protobuf est requis (ex. package npm `gtfs-realtime-bindings` ou équivalent). La structure réelle de la réponse n'a pas été vérifiée par appel direct dans ce cycle.

**Fréquence de mise à jour apparente :**  
Les flux GTFS-RT sont par nature **temps réel** (mis à jour à chaque cycle du producteur). La documentation PAN indique que le validateur GTFS-RT est appliqué quotidiennement sur les flux publiés.

**Repère interne :**  
Même domaine que `sncf-perturbations.js` (perturbations réseau ferroviaire SNCF), dont `etat-projet.md` indique qu'il « attend clé ». Structurellement proche des sources de statut temps réel (`statut-*.js` Statuspage), à la différence que le format ici est GTFS-RT (protobuf) et non JSON.

---

## Fiche 3 — ANSM · Ruptures et risques de rupture de stock de médicaments

**Nom :** ANSM — Médicaments en rupture ou risque de rupture de stock  
**URL page ANSM :** https://ansm.sante.fr/disponibilites-des-produits-de-sante/medicaments  
**URL liste signalements :** https://ansm.sante.fr/page/medicaments-ayant-fait-lobjet-dun-signalement-de-rupture-ou-de-risque-de-rupture-de-stock  
**URL data.ansm :** https://data.ansm.sante.fr/ruptures

**Accès :**  
La page ANSM et la plateforme data.ansm sont **publiquement accessibles**. Aucun endpoint JSON public officiel n'a été identifié de manière certaine dans les sources consultées : les données semblent disponibles sous forme de **listes téléchargeables** (format non vérifié) et via une interface web. Des APIs tierces commerciales (Claude Bernard, Synapse Medicine) agrègent ces données — elles ne constituent pas un accès libre public. L'existence d'un endpoint REST structuré directement sur data.ansm.sante.fr **n'a pas pu être confirmée dans ce cycle** — à vérifier par inspection directe de la page.

**Description constatée :**  
La plateforme data.ansm agrège les déclarations de rupture de stock ou de risque de rupture depuis 2014, issues du système Trustmed de l'ANSM. Les ruptures de stock concernent des médicaments indisponibles ou en tension d'approvisionnement en pharmacie. La page de situation publiée le 8 janvier 2026 portait sur les médicaments psychotropes — ce format de « points de situation » est distinct de la liste continue des signalements.

**Format de réponse constaté :**  
**Non vérifié** dans ce cycle. La plateforme data.ansm est une interface web de consultation. L'existence d'un flux JSON ou XML exploitable par polling automatique n'a pas été confirmée par les sources documentaires consultées.

**Fréquence de mise à jour apparente :**  
La liste des signalements est mise à jour par l'ANSM de façon **continue** au fil des déclarations (selon la description de Trustmed). La liste téléchargeable vue dans les résultats datait du 1er avril 2026 pour les exercices 2025 et 2024 — ce qui suggère aussi des exports périodiques.

**Repère interne :**  
Même organisme source que `ansm-rappels-medicaments.js` (rappels = alertes de retrait de produits du marché). Les ruptures de stock constituent un concept distinct : il s'agit de l'indisponibilité temporaire d'un médicament, non d'un danger de sécurité entraînant un retrait.

---

## Doublons évités

| Piste écartée | Raison |
|---|---|
| **Hub'Eau — Piézométrie (nappes souterraines)** | `nappes` figure explicitement dans les écartées de `.claude/etat-projet.md`. De plus, la documentation consultée indique que l'**API Hub'Eau Piézométrie ferme le 10 septembre 2026**. |
| **Météo-France Open Data — API Indice UV (juin 2026)** | Doublon de `indice-uv.js`, déjà en production via Open-Meteo (param 101 départements, mentionné dans `etat-projet.md`). |
| **Baignade (eaux de baignade)** | Piste explicitement écartée dans `.claude/etat-projet.md` (« PISTE REPORTÉE — EAUX DE BAIGNADE : aucune source NATIONALE ouverte »). Instrucion : ne pas retenter l'angle national sans signal nouveau. |
| **ZFE (Zones à Faibles Émissions) — dataset transport.data.gouv.fr** | `ZFE` figure dans les écartées de `.claude/etat-projet.md` (« légalement instable — seuls Paris/Lyon certains »). |
| **SNCF GTFS — données horaires statiques** | Données théoriques, non des alertes de perturbation. Sans rapport avec une logique d'alerte. |
