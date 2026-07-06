# LaBonneAlerte

Plateforme d'alertes ouverte et gratuite. LaBonneAlerte agrège des
sources d'événements surveillables (promotions, disponibilités de
produits ou de domaines, etc.) et notifie ses abonnés dès qu'un
événement devient actif. Les notifications se font par email
aujourd'hui, avec d'autres canaux prévus ensuite (push, extension
navigateur, etc.). Développée par Dahu-Concept — Hugo Vial-Jaime,
webmaster freelance à Gap.

## Fonctionnement
Chaque source expose un **manifeste** JSON décrivant son état courant.
La plateforme interroge (poll) ces manifestes à intervalle régulier :
lorsqu'une source passe de l'état `inactive` à `active`, les abonnés à
cette source reçoivent une notification. Pas de webhook ni de SDK,
juste un simple GET périodique, à la manière d'un flux RSS.

Le format exact des manifestes (champs, états, règles de polling) est
décrit dans la spec **[OPENALERT.md](OPENALERT.md)**.

## Sources actuelles
- **leboncoin-livraison** (officielle) : surveille la page publique
  https://www.leboncoin.fr/service/bons-plans pour détecter la promo
  "Livraison à 0,99€" de leboncoin.fr et notifier les abonnés quand
  elle est active.
  Endpoint : `GET /api/sources/leboncoin-livraison/alert.json`

  Exemple de retour (état inactif) :

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

## Avertissement légal
Le scraping de leboncoin.fr est réalisé dans un cadre non-commercial,
informatif et gratuit, à des fins d'alerte pour les utilisateurs.
Les CGU de leboncoin.fr interdisent formellement le scraping de leur
site. Ce projet est fourni tel quel, sans garantie de continuité de
service en cas de blocage ou de demande de retrait.

## API publique
- `GET /api/sources` — liste des sources disponibles
- `GET /api/sources/:id/alert.json` — manifeste OpenAlert d'une source
- `POST /subscribe` — inscription à une source. Corps attendu :
  `{ "email": "toi@exemple.fr", "source_id": "leboncoin-livraison" }`
  (`source_id` optionnel, par défaut `leboncoin-livraison`)

## Stack technique
Node.js / Express, PostgreSQL, Resend (email), hébergé sur Railway.

## Contribuer une source
Voir **[OPENALERT.md](OPENALERT.md)** pour la spec du format et la
procédure de soumission.

## Licence
MIT
