# Veille de sources — rapport du 2026-07-24

3 pistes documentées ce cycle (constats factuels uniquement). Référentiel
anti-doublon établi sur les 251 fichiers `server/sources/*.js` du dépôt (hors
`lib/`) et le backlog écarté d'`etat-projet.md`. Aucun jugement de valeur ni
recommandation ci-dessous — le tri appartient à Hugo.

---

## Piste 1 — API DPE Logements (ADEME)

- **Nom** : API DPE Logements (diagnostics de performance énergétique des logements existants), portée par l'ADEME.
- **URL** : page catalogue `https://www.data.gouv.fr/dataservices/api-dpe-logements` ; base API constatée `https://data.ademe.fr/data-fair/api/v1/datasets/dpe-france` ; documentation métier + Swagger renvoyés vers `https://data.ademe.fr/datasets/dpe-france`.
- **Accès** : annoncé comme accès libre, aucune clé API mentionnée sur la fiche catalogue. Rate-limit affiché : « 10 appels / seconde / IP ». Licence affichée : Licence Ouverte Etalab.
- **Format de réponse constaté** : plateforme DataFair (API REST). La fiche mentionne une documentation Swagger mais **je n'ai pas ouvert le Swagger ni exécuté d'appel** — le format exact (JSON et/ou export CSV, schéma des champs, filtres par adresse/commune/coordonnées) n'est **pas vérifié de première main**. À confirmer sur le endpoint réel.
- **Fréquence de mise à jour apparente** : « régulière » d'après la fiche ; jeux associés datés « il y a 3 jours » / « il y a 7 jours » au moment de la consultation.
- **Repère interne** : famille « données ouvertes filtrables par entité géographique / commune » comparable, dans la mécanique d'appel, à `catnat-commune.js` et `eau-potable-commune.js` (résolution commune → requête filtrée). Aucune source en prod n'appelle aujourd'hui une API DataFair. Repère descriptif, pas une reco.

---

## Piste 2 — API Air France-KLM (programme des vols temps réel + Flight Status)

- **Nom** : jeux open data Air France-KLM Group — « programme des vols en temps réel ainsi que les offres tarifaires » (data.gouv.fr) et « Flight Status API » (portail développeur).
- **URL** : fiche `https://www.data.gouv.fr/datasets/informations-temps-reel-via-nos-api` ; portail développeur `https://developer.airfranceklm.com/` ; documentation `https://klmprod.mashery.com/`.
- **Accès** : la fiche data.gouv.fr indique une licence ODbL (Open Database License) et ne précise pas la clé. La documentation du portail développeur indique en revanche qu'il faut **s'enregistrer sur `developer.airfranceklm.com`, souscrire au produit Open Data voulu (au moins Flight Status API) et générer une clé API**. Rate-limit non relevé. Constat : accès subordonné à inscription + clé, malgré la mention « open data ».
- **Format de réponse constaté** : la fiche data.gouv.fr annonce du JSON (fichier de 71,6 Ko). La doc mentionne une « JSON Specification ». **Je n'ai pas exécuté d'appel authentifié** (clé requise) — le schéma réel des réponses (champs vol, horaires, statut, tarifs) n'est **pas vérifié de première main**.
- **Fréquence de mise à jour apparente** : présentée comme temps réel (horaires et statuts de vols) ; fiche data.gouv.fr marquée « mis à jour aujourd'hui » (24 juillet 2026).
- **Repère interne** : côté mécanique « source à clé + réponse JSON », famille comparable aux sources en attente de clé du dépôt (ex. `sncf-perturbations.js`, marquée « attend clé »). Périmètre thématique (aérien) non couvert par une source existante. Repère descriptif.

---

## Piste 3 — Point d'Accès National aux données de transport (transport.data.gouv.fr) — volet temps réel

- **Nom** : Point d'Accès National (PAN) aux données de transport — agrégation données statiques **et temps réel** (transports en commun, cars longue distance, ferroviaire, vélos en libre-service, ZFE, bornes de recharge).
- **URL** : fiche `https://www.data.gouv.fr/dataservices/le-point-dacces-national-aux-donnees-de-transport` ; API `https://transport.data.gouv.fr/api/datasets` ; Swagger `https://transport.data.gouv.fr/swaggerui` ; doc métier `https://doc.transport.data.gouv.fr/outils/outils-disponibles-sur-le-pan/api`.
- **Accès** : décrit comme « Ouvert », aucune clé mentionnée sur la fiche catalogue. Rate-limit non relevé.
- **Format de réponse constaté** : l'API catalogue expose les jeux (endpoint `/api/datasets`) ; la fiche **ne liste pas explicitement** les formats des flux temps réel (GTFS-RT / SIRI attendus dans ce domaine mais **non vérifiés ici**). **Je n'ai pas ouvert le Swagger ni un flux réseau précis** — la couverture temps réel par réseau local et le format exact ne sont **pas vérifiés de première main**.
- **Fréquence de mise à jour apparente** : temps réel annoncé pour la partie « temps-réel » ; catalogue mis à jour en continu.
- **Repère interne** : recoupement partiel avec `sncf-perturbations.js` (ferroviaire) et, pour la route, `bison-fute.js`. Le volet non-ferroviaire (bus/tram/vélos par réseau local) n'est pas couvert par une source existante. Voir aussi « Doublons évités » ci-dessous pour la part ferroviaire.

---

## Doublons évités

- **Perturbations ferroviaires (SNCF)** — déjà couvert par `sncf-perturbations.js` (en attente de clé). Le volet ferroviaire du PAN recoupe cette source ; seul le volet transports locaux du PAN est décrit en Piste 3 comme périmètre distinct.
- **Qualité de l'air / pollens** — déjà couverts (`qualite-air.js`, `pollens.js`, attribution Atmo France/AASQA) ; « qualité de l'air Gap » figure au backlog écarté d'`etat-projet.md` (couvert par le futur Atmo Data). Non re-fiché.
- **Tarifs / chèque énergie** — `energie-tarifs.js`, `cheque-energie.js` couvrent le prix de l'énergie ; distincts de la Piste 1 (DPE = performance énergétique d'un logement donné), mais signalés ici pour éviter toute confusion de périmètre.
- **Rappels de produits / médicaments** — déjà couverts (`rappel-conso.js`, `ansm-rappels-medicaments.js`). Aucune piste rappels retenue ce cycle.
- **Vols / spatial** — `lancement-spatial.js` concerne les lancements spatiaux, sans rapport avec l'aérien commercial de la Piste 2 ; noté pour lever l'ambiguïté « vols ».

---

*Limites de ce cycle : les trois formats de réponse restent partiellement non
vérifiés (Swagger non ouvert, appels authentifiés/DataFair non exécutés) —
signalé explicitement dans chaque fiche. Lecture seule sur le dépôt, aucune
écriture hors ce rapport.*
