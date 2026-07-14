# OpenAlert — spécification v0.1

## Objectif
Un format minimal en JSON permettant à n'importe quel service de
signaler l'état d'un événement surveillable (une promo active, un
domaine disponible, un stock revenu, etc.) pour être agrégé et
notifié par une plateforme comme labonnealerte.fr.

## Principe
Toute source expose une URL publique (son "manifeste") répondant en
GET avec un JSON décrivant son état courant. Pas d'auth, pas de
webhook, pas de SDK : juste un GET à intervalle régulier (polling),
comme un flux RSS.

## Format du manifeste

Endpoint recommandé : `/alert.json` à la racine du service, ou
n'importe quelle URL déclarée lors de l'enregistrement.

```json
{
  "id": "exemple-stock-produit",
  "name": "Exemple — Retour en stock d'un produit",
  "state": "active",
  "since": "2026-07-05T09:00:00.000Z",
  "until": null,
  "message": "Le produit est de nouveau disponible à l'achat",
  "url": "https://exemple.com/produit",
  "checked_at": "2026-07-05T17:32:36.606Z"
}
```

Champs :

- **id** (string, requis) : identifiant unique stable de la source
- **name** (string, requis) : nom lisible
- **state** (string, requis) : `"active"` | `"inactive"` | `"pending"`
- **since** (string ISO 8601 ou null) : début de l'état actuel
- **until** (string ISO 8601 ou null) : fin prévue si connue
- **message** (string ou null) : description courte à afficher
- **url** (string ou null) : lien vers la ressource concernée
- **checked_at** (string ISO 8601, requis) : horodatage de la dernière
  vérification par la source elle-même

## Règles
- L'endpoint doit répondre en moins de 5 secondes
- L'endpoint doit être accessible sans authentification
- Le champ `state` est la seule donnée qui déclenche une notification
  côté plateforme, sur la transition `inactive → active`
- Si une source active fait avancer son champ `since`, la plateforme
  considère qu'un nouvel épisode commence et peut notifier à nouveau.
  Utile pour les alertes récurrentes (offre hebdomadaire, etc.). Un
  seuil de 24h évite toute re-notification sur un simple flottement de
  la date renvoyée par la source.
- Pas de limite de fréquence imposée à la source, mais la plateforme
  ne poll jamais plus souvent que toutes les 15 minutes

## Sources paramétrées (v2)

Une source peut déclarer un schéma de **paramètres** : l'état de l'alerte est
alors évalué **par abonnement** (par exemple, un département de vigilance) et
non globalement.

- Champ `params` **absent** → source *broadcast* : comportement v1 strictement
  inchangé. **Tout manifeste v1 reste valide sans modification.**
- Champ `params` **présent** → source *paramétrée* : chaque abonnement porte des
  valeurs, et l'alerte est évaluée pour ces valeurs.

Un seul standard, deux modes, aucune rupture.

### Déclaration du schéma

`params` est un tableau de descripteurs de paramètre :

```json
{
  "id": "vigilance-meteo",
  "name": "Vigilance météo",
  "params": [
    {
      "key": "departement",
      "label": "Département",
      "type": "enum",
      "values": [
        { "value": "05", "label": "Hautes-Alpes" },
        { "value": "13", "label": "Bouches-du-Rhône" }
      ],
      "multiple": true,
      "required": true,
      "default": null
    }
  ]
}
```

Champs d'un descripteur :

- **key** (string, requis) : identifiant du paramètre (clé dans l'objet `params`
  de l'abonnement, ex. `{"departement":"05"}`)
- **label** (string, requis) : libellé lisible pour l'UI d'abonnement
- **type** (string, requis) : `"enum"` | `"string"` | `"number"`
- **values** (tableau, requis si `enum`) : liste fermée `{ value, label }` des
  valeurs acceptées
- **multiple** (bool, défaut `false`) : l'utilisateur peut créer plusieurs
  instances (plusieurs départements) ; chaque instance est un abonnement distinct
- **required** (bool, défaut `false`) : une valeur est obligatoire à l'abonnement
- **default** (défaut `null`) : valeur pré-sélectionnée proposée par l'UI

Types retenus pour la v2 initiale (volontairement peu nombreux) : `enum` (liste
fermée : département, catégorie…), `string` (texte libre validé par la source :
un domaine), `number` (seuil borné). Le type `geo` (lat/lon) est reporté à une
v2.1 (vie privée + UI).

### Sémantique

- **Absent = broadcast** : sans `params`, l'abonnement et l'état restent
  globaux, exactement comme en v1.
- **Interrogation des endpoints externes** : les valeurs sont passées en query
  string, `GET /alert.json?departement=05`. La réponse reste un **manifeste v1
  classique** (`id`, `state`, `since`, `message`…) évalué pour ces valeurs.
- **Déterminisme exigé** : pour un même jeu de paramètres, l'endpoint doit
  répondre de façon déterministe et documenter les valeurs qu'il accepte.
- **Validation côté plateforme** : les valeurs soumises doivent être ⊂ du schéma
  déclaré, sinon rejet (protection SSRF/injection du validateur d'enregistrement).

### Rétrocompatibilité

La v2 est strictement additive : un manifeste sans champ `params` est une source
broadcast v1, traitée à l'identique (même chemin d'abonnement, d'état et de
notification). Aucun changement n'est requis sur les sources existantes.

## Badges de confiance
- **official** : source développée et hébergée par labonnealerte.fr
- **verified** : source tierce dont le code est public et a été relu
- **community** : source tierce déclarée, non vérifiée

## Exemple réel en production
Pour un exemple de source réelle en production, voir le
README.md du projet et l'endpoint public
GET /api/sources/leboncoin-livraison/alert.json

## Comment proposer une source
Pour proposer une nouvelle source, ouvrez une issue ou une pull request
sur le dépôt GitHub
[github.com/Epilouptique/labonnealerte](https://github.com/Epilouptique/labonnealerte)
en indiquant l'URL du manifeste, un nom et une description. Chaque
proposition fait l'objet d'une revue manuelle avant activation en v1.

## Statut
v0.1 — standard expérimental, en cours de stabilisation avec le
premier cas d'usage (labonnealerte.fr). Des changements cassants
sont possibles avant une v1.0.
