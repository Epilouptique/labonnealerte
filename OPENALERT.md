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
- Pas de limite de fréquence imposée à la source, mais la plateforme
  ne poll jamais plus souvent que toutes les 15 minutes

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
