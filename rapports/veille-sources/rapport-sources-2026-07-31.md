# Veille de nouvelles sources — 2026-07-31

2 pistes documentées ce cycle. Constats factuels uniquement ; le tri et toute
décision d'adoption appartiennent à Hugo. Aucune recommandation, aucun classement.

---

## Piste 1 — Belib' : disponibilité temps réel des bornes de recharge (Paris)

- **Nom** : Belib' — Points de recharge pour véhicules électriques, disponibilité
  temps réel.
- **URL** : https://www.data.gouv.fr/datasets/belib-points-de-recharge-pour-vehicules-electriques-disponibilite-temps-reel
- **Accès** : accès libre constaté (exploration via explore.data.gouv.fr, aucune
  mention de clé/API key sur la page du jeu de données). Rate-limit non affiché
  sur la page consultée.
- **Licence affichée** : Open Data Commons Open Database License (ODbL).
- **Format de réponse constaté** : téléchargements CSV (~864 Ko) et JSON (~1,2 Mo),
  plus archive ZIP. Le jeu de données est hébergé sur une plateforme de type
  Opendatasoft (explore.data.gouv.fr) — **je n'ai pas vérifié la structure exacte
  de l'endpoint records/API ni les noms de champs** ; seuls les formats de
  fichiers en téléchargement ont été constatés sur la page.
- **Fréquence de mise à jour apparente** : « Mis à jour hier » sur la page du jeu
  de données ; l'intitulé du jeu indique une « disponibilité temps réel » pour les
  points du réseau Belib' supervisés.
- **Périmètre** : Paris uniquement (réseau Belib' / opéré par Total Marketing
  France ; ~433 stations annoncées). Non national.
- **Repère interne** : famille « géo fine + disponibilité d'un état » ; structure
  d'appel Opendatasoft comparable aux sources ÉCONOMIE INSEE/data.economie
  (`rappel-conso.js` interroge un dataset Opendatasoft `records` v2.1). Périmètre
  strictement local, à rapprocher de la logique des cartes locales curées
  (vague L / PanneauPocket) plutôt que d'une source nationale. Repère descriptif,
  pas une recommandation.

---

## Piste 2 — Enedis : coupures d'électricité (structure temps réel NON confirmée)

- **Nom** : Enedis — données de coupures / interruptions du réseau de distribution.
- **URL** : https://www.data.gouv.fr/organizations/electricite-reseau-distribution-france/datasets
  (organisation Enedis sur data.gouv.fr) ; portail complémentaire
  https://data.enedis.fr/
- **Accès** : jeux de données open data sous Licence Ouverte 2.0 (accès libre
  constaté pour les jeux statistiques). Le service grand public « Enedis Info
  Coupure » (carte temps réel des coupures en cours) est accessible sans compte,
  **mais aucune documentation d'API publique de ce flux temps réel n'a été
  constatée** au cours de cette veille.
- **Format de réponse constaté** : **non vérifié pour le temps réel.** Les jeux
  data.gouv.fr identifiés (ex. « Durée moyenne de coupure par client HTA »,
  fréquence de coupures BT/HTA) sont des **indicateurs statistiques annuels**, pas
  un flux d'incidents en cours. La carte « Info Coupure » d'enedis.fr affiche des
  coupures en cours et une heure de rétablissement estimée, mais **je n'ai pas pu
  confirmer qu'un endpoint ouvert et documenté expose ces données** (structure,
  format, conditions d'accès non vérifiés). Des sites tiers (CoupureCourant.fr,
  GeoBlackout) affichent un suivi temps réel, dont l'un cite « données officielles
  Enedis via data.gouv.fr, Licence Ouverte 2.0 » — origine non re-vérifiée à la
  source.
- **Fréquence de mise à jour apparente** : temps réel pour la carte grand public
  Info Coupure ; **annuelle** pour les jeux open data statistiques constatés.
- **Repère interne** : famille ÉNERGIE, à rapprocher des sources de disponibilité
  réseau (`pannes-hydro-quebec.js`, périmètre Québec) et des sources énergie
  existantes (`ecowatt.js`, `ecogaz.js`). En l'état, l'écart entre la carte temps
  réel (structure non documentée constatée) et l'open data (statistiques
  annuelles) est le seul fait établi. Repère descriptif, pas une recommandation.

---

## Doublons évités

- **RappelConso V2** (data.economie.gouv.fr, dataset `rappelconso-v2-gtin-trie`,
  API Opendatasoft v2.1 `records`) : **déjà couvert** — la source
  `server/sources/rappel-conso.js` interroge déjà exactement ce dataset V2
  (constaté dans le fichier : `DATASET = 'rappelconso-v2-gtin-trie'`). La nouveauté
  publique 2026 (page de dataviz mise en ligne le 04/02/2026) ne change pas le flux
  déjà consommé. Aucune fiche.
- **API Offres d'emploi / France Travail temps réel** : **déjà couvert** —
  `server/sources/veille-emploi.js` (+ `actualisation-france-travail.js`).
- **Base nationale IRVE (localisation statique des bornes)** : hors périmètre
  d'alerte (données de localisation/caractéristiques techniques, non événementiel).
  Distincte de la piste 1 (Belib' = disponibilité temps réel, retenue en fiche).
- **Qualité de l'air / pollens** : **déjà couvert** (`qualite-air.js`,
  `pollens.js`, Atmo France) — rappel du backlog `etat-projet.md` (qualité de l'air
  Gap couverte par Atmo Data).
- **Eaux de baignade** : **déjà au backlog écarté** (`etat-projet.md`, piste
  reportée 29/07 : aucune source nationale ouverte, SISE-Baignades hors open data).
  Non re-testée ce cycle.
