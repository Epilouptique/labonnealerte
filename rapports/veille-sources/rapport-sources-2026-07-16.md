# Rapport de veille — nouvelles sources — 2026-07-16

## Intro

2 pistes ce cycle. Robot 4 (lecture seule sur le dépôt + recherche web
documentaire). Ce document ne contient que des **constats** ; aucun tri, aucune
recommandation, aucune priorité — la décision reste à Hugo.

---

## Piste 1 — Changelog Open Data Météo-France (nouveaux flux 2026)

- **Nom** : plusieurs entrées récentes du portail Open Data Météo-France
  (Confluence / meteo.data.gouv.fr).
- **URL** : https://confluence-meteofrance.atlassian.net/wiki/spaces/OpenDataMeteoFrance/overview
- **Constats sur les entrées relevées dans le changelog** :
  - **08/07/2026** — « Ressources de prévision enrichies » : trois nouveaux
    types cités (AROME IFS, UV, vagues).
  - **18/06/2026** — nouvelle **API Indice UV** de Météo-France.
  - **17/06/2026** — **Messages Climat mensuels** annoncés disponibles sur
    meteo.data.gouv.fr (portail présenté en accès libre).
  - **16/03/2026** — **Indice d'humidité des sols (SWI)** publié, mentionné pour
    le dispositif CatNat.
  - **11/02/2026** — **Archives BMS** (Bulletins Météorologiques Spéciaux) en
    archive annuelle.
- **Accès** : le changelog ne précise pas, entrée par entrée, le modèle
  d'authentification (clé de portail MF ou accès libre) ni les rate-limits.
  meteo.data.gouv.fr est présenté comme accès libre pour les Messages Climat ;
  pour l'API Indice UV et les ressources AROME IFS/UV/vagues, **je n'ai pas pu
  vérifier** si une clé de portail est requise.
- **Format de réponse constaté** : **non vérifié**. La page d'aperçu ne montre
  pas les schémas (JSON/XML/GRIB/CSV). Le détail renvoie vers la page
  « Documentation sur les APIs » (pages/853737487) que je n'ai pas ouverte pour
  en extraire la structure réelle. Je ne présume d'aucun schéma.
- **Fréquence de mise à jour apparente** : variable selon le flux — Messages
  Climat annoncés « mensuels » ; les autres (UV, SWI, vagues) non précisée dans
  le changelog.
- **Repère interne** : même famille « portail Météo-France » que
  `vigilance-meteo.js`, `indice-uv.js`, `risque-avalanche.js` et
  `meteo-forets.js` (ces deux dernières DORMANTES en attente de clés de portail
  MF). L'entrée « API Indice UV » recoupe la nature de `indice-uv.js`, qui
  s'appuie aujourd'hui sur Open-Meteo (voir « Doublons évités »).

---

## Piste 2 — Base Nationale consolidée des Zones à Faibles Émissions (BNZFE)

- **Nom** : Base Nationale des Zones à Faibles Émissions (BNZFE), publiée par
  l'équipe transport.data.gouv.fr (Point d'Accès National).
- **URL** : https://transport.data.gouv.fr/datasets/base-nationale-consolidee-des-zones-a-faibles-emissions
  (miroir : https://www.data.gouv.fr/datasets/base-nationale-consolidee-des-zones-a-faibles-emissions)
- **Accès** : accès libre annoncé, **Licence Ouverte Etalab 2.0**. Aucun élément
  de clé/API key ni de rate-limit relevé sur les pages de listing consultées
  (**non vérifié** au-delà de ces pages).
- **Format de réponse constaté** : les pages de dataset annoncent des
  ressources **GeoJSON et CSV** (certaines déclinaisons métropolitaines ajoutent
  JSON/ZIP). Deux fichiers consolidés cités : `aires.geojson` (règles de
  limitation de circulation par type de véhicule selon vignette Crit'Air) et
  `voies.geojson` (exceptions sur certains axes). Constat issu des pages de
  listing ; **je n'ai pas téléchargé** les fichiers pour vérifier le schéma
  interne champ par champ (schéma déclaré : schema.data.gouv.fr/etalab/schema-zfe/).
- **Fréquence de mise à jour apparente** : « régulièrement mis à jour au fur et
  à mesure que les métropoles fournissent des données conformes au schéma »
  (formulation du portail). Pas de cadence fixe affichée ; pas de flux
  d'événement temporel — il s'agit d'un jeu de données géographique de
  périmètres/règles, pas d'un état qui bascule.
- **Repère interne** : famille des sources géographiques officielles adossées à
  un jeu de données Etalab, structure d'accès comparable à `vigieau.js` (données
  officielles indexées, granularité territoriale). Nature statique/cartographique
  proche des jeux consommés par `vigicrues-05.js` (dump national à mapper), sans
  seuil d'alerte temporel intrinsèque tel que constaté ici.

---

## Doublons évités

- **API Indice UV Météo-France** — recoupe `indice-uv.js` déjà en prod (indice
  UV paramétré 101 départements via Open-Meteo, mutualisé multi-points ; a
  remplacé `indice-uv-gap.js`). Écarté comme piste nouvelle : la fonction UV est
  déjà couverte ; l'entrée n'est notée que comme **changelog** d'une source de
  même nature (Piste 1).
- **Ressources AROME / prévision météo Météo-France** — même famille que
  `vigilance-meteo.js` (vigilance officielle MF déjà paramétrée 101
  départements). Écarté : couvert.
- **Bulletin Vigilance (API data.gouv)** — apparu dans les résultats de
  recherche ; correspond au flux déjà exploité par `vigilance-meteo.js`. Écarté :
  couvert.
- **Météo des forêts / avalanche** — les mentions de nouveaux flux MF recoupent
  `meteo-forets.js` et `risque-avalanche.js`, déjà codées et DORMANTES en attente
  de clés de portail MF (liste de courses `etat-projet.md`). Écarté : déjà au
  dépôt.
- **Qualité de l'air / pollution / pollens** — non retenu comme piste : déjà au
  backlog `etat-projet.md` sous « Atmo Data » (inscription en attente, futur
  pollens-gap + épisodes de pollution). Écarté : backlog connu.
- **Offres d'emploi France Travail (API)** — apparue dans les résultats ; nature
  non alertante (flux d'offres, pas d'état qui bascule). Écarté : hors périmètre
  d'alerte, aucun rapprochement avec une source du dépôt.
