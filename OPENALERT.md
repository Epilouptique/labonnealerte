# OpenAlert — Spécification du manifeste

La Bonne Alerte expose chaque source d'alerte via un **manifeste OpenAlert** :
un document JSON décrivant l'état courant d'une source, servi à l'URL

```
GET /api/sources/:id/alert.json
```

## Exemple réel (source `leboncoin-livraison`, état actuel)

```json
{
  "id": "leboncoin-livraison",
  "name": "Leboncoin — Livraison à 0,99€",
  "state": "inactive",
  "since": null,
  "until": null,
  "message": null,
  "url": null,
  "checked_at": "2026-07-05T17:32:36.606Z"
}
```

## Champs

| Champ | Type | Description |
|---|---|---|
| `id` | string | Identifiant unique de la source (ex. `leboncoin-livraison`). |
| `name` | string | Nom lisible de la source. |
| `state` | string | État courant : `active`, `pending` ou `inactive`. |
| `since` | string (ISO 8601) \| null | Début de validité de l'alerte quand elle est active ; `null` sinon. |
| `until` | string (ISO 8601) \| null | Fin de validité de l'alerte quand elle est active ; `null` sinon. |
| `message` | string \| null | Message associé à l'alerte active ; `null` sinon. |
| `url` | string \| null | Lien vers l'offre/la ressource concernée ; `null` sinon. |
| `checked_at` | string (ISO 8601) | Horodatage de la dernière vérification par le poller. |

## États

- **`inactive`** — la source n'a rien détecté. `since`, `until`, `message`, `url` sont `null`.
- **`pending`** — une détection a eu lieu mais n'est pas encore confirmée (une détection unique
  ne suffit pas ; le poller attend un second cycle positif avant de basculer en `active`).
- **`active`** — l'alerte est confirmée. Les champs `since`, `until`, `message`, `url` sont
  renseignés lorsque la source les fournit.

## Découverte des sources

La liste des sources disponibles est exposée par :

```
GET /api/sources
```

Chaque entrée fournit `id`, `name`, `description`, `badge` (`official` | `verified` |
`community`) et le `state` courant. Le manifeste OpenAlert complet de chaque source est
ensuite accessible via son `alert.json`.
