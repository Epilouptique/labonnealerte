<!-- Un badge d'état du kiosque pourra être ajouté ici plus tard. -->

# LaBonneAlerte

Le kiosque français d'alertes utiles : des alertes prêtes à l'emploi, activables en un clic, gratuites et open source. On surveille les sources qui comptent (promos, météo, énergie, domaines…) et on prévient par email uniquement quand ça devient intéressant.

→ <https://www.labonnealerte.fr>

## Le concept

Des **sources d'alerte** (promos, météo, énergie, noms de domaine…) sont surveillées en continu par un poller. L'utilisateur s'abonne à celles qui l'intéressent, **par email en un clic** — sans compte ni mot de passe : lien magique par email, ou connexion Google / GitHub (l'email vérifié est la clé d'identité).

Chaque source porte un **badge de confiance** — *vérifié* (source officielle ou relue) ou *communauté* (proposée par un tiers, non vérifiée) — et dispose d'une **page de statut publique** avec l'historique des déclenchements et 90 jours d'uptime.

<!-- Capture d'écran du kiosque à ajouter ici plus tard. -->

## Les sources actuelles

| Source | Type | Description |
|--------|------|-------------|
| Vigilance météo — Hautes-Alpes (05) | Interne — API officielle (Météo-France) | Alerte en vigilance orange ou rouge dans le 05 |
| EcoWatt | Interne — API officielle (RTE, OAuth2) | Signal de tension du réseau électrique (orange/rouge) |
| Livraison à 0,99 € | Interne — scraper (leboncoin) | Détecte la promo Mondial Relay à 0,99 € |
| DoomName | Service lié (partenaire) | Surveillance de disponibilité de noms de domaine |

## OpenAlert — proposer votre source

**OpenAlert** est un format minimal : votre service expose une URL publique qui répond en `GET` avec un JSON décrivant son état courant. Pas d'auth, pas de webhook, pas de SDK — juste un GET interrogé à intervalle régulier, comme un flux RSS. La plateforme s'occupe des abonnés, des emails et de la vitrine.

```json
{
  "id": "ma-super-alerte",
  "name": "Ma super alerte",
  "state": "active",
  "since": "2026-07-11T08:00:00Z",
  "until": null,
  "message": "C'est le moment !",
  "url": "https://exemple.fr",
  "checked_at": "2026-07-11T09:30:00Z"
}
```

- Spécification complète : **[OPENALERT.md](OPENALERT.md)**
- Validateur en ligne + soumission : **[/proposer](https://www.labonnealerte.fr/proposer)**

## Stack technique

Node.js / Express · PostgreSQL · JavaScript **vanilla** côté front (aucun framework) · [Resend](https://resend.com) (email) · déployé sur [Railway](https://railway.app).

Choix assumés : **simplicité radicale**. Pas de build front (les pages sont du HTML/CSS/JS servis en statique), dépendances runtime minimales (`express`, `pg`, `resend`, `node-cron`, `node-fetch`, `helmet`, `express-rate-limit`, `dotenv`).

## Lancer en local

**Prérequis** : Node.js 18+ et une base PostgreSQL accessible.

```bash
git clone https://github.com/Epilouptique/labonnealerte.git
cd labonnealerte
npm install
cp .env.example .env      # puis renseigner les variables (voir ci-dessous)
node server/db/migrate.js # crée / met à jour le schéma
npm run dev               # démarre sur http://localhost:3000
```

### Variables d'environnement

Les **sources sont indépendantes** : une clé manquante ne casse que la source concernée (sans clé Météo-France, seule la source Vigilance échoue à chaque cycle, le reste fonctionne). Idem pour l'email et l'OAuth : sans clé, la fonctionnalité correspondante est simplement indisponible.

| Variable | Rôle | Où l'obtenir |
|----------|------|--------------|
| `DATABASE_URL` | Connexion PostgreSQL | Votre serveur PostgreSQL (ou l'add-on Railway) |
| `BASE_URL` | URL publique de base (callbacks OAuth) | `http://localhost:3000` en dev, `https://www.labonnealerte.fr` en prod |
| `PORT` | Port du serveur (défaut 3000) | — |
| `RESEND_API_KEY` | Envoi des emails (confirmation, alertes, lien magique) | Tableau de bord [Resend](https://resend.com) |
| `METEOFRANCE_API_KEY` | Source Vigilance météo | Portail [portail-api.meteofrance.fr](https://portail-api.meteofrance.fr) (API « DPVigilance ») |
| `RTE_CLIENT_ID` / `RTE_CLIENT_SECRET` | Source EcoWatt (OAuth2) | Portail [data.rte-france.com](https://data.rte-france.com) (API EcoWatt) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Connexion Google | [Google Cloud Console](https://console.cloud.google.com) → OAuth 2.0 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Connexion GitHub | GitHub → Settings → Developer settings → OAuth Apps |

Pour l'OAuth, enregistrez les callbacks `BASE_URL/auth/google/callback` et `BASE_URL/auth/github/callback` chez chaque fournisseur.

## Avertissement légal

Le scraping de leboncoin.fr est réalisé dans un cadre non-commercial, informatif et gratuit, à des fins d'alerte pour les utilisateurs. Les CGU de leboncoin.fr interdisent formellement le scraping de leur site. Ce projet est fourni tel quel, sans garantie de continuité de service en cas de blocage ou de demande de retrait.

## Licence

MIT.
