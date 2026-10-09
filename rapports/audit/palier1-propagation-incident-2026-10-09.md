# Palier 1 — propagation des erreurs de surveillance (incident ≠ inactive)

**Date :** 2026-10-09 · **Statut :** FAIT en local, revue croisée OK, **NON déployé** (attend accord de Hugo).

## Règle appliquée

Quand `check()`/`checkWithParams()` rencontre une **erreur de surveillance** (réseau, HTTP non-2xx,
timeout, JSON/donnée illisible), la source **propage** (throw) au lieu de renvoyer `inactive`. Le
poller en fait alors un **incident** : un seul événement `failed` par heure (dédoublonnage), **aucune
notification** aux abonnés, et **l'état précédent est conservé** (`source_states` non modifié). Les
retours `inactive` **légitimes** (liste vide, 404 = ressource absente, 1er passage anti-rétroactif,
valeur sous le seuil, no-op quand une clé/URL n'est pas configurée) sont **inchangés**.

## Ce que voit l'utilisateur sur la page de statut (`/source/:id/statut`)

- **Avant** : en cas de panne, la source paraissait simplement « au calme » (`inactive`), **sans aucune
  trace** → l'utilisateur pouvait croire « rien à signaler » alors que la surveillance était aveugle.
- **Après** : l'**état connu précédent est conservé** (pas de bascule trompeuse), et une entrée
  « **Incident de surveillance** » apparaît dans la frise/timeline. Le message de diagnostic technique
  n'est **pas** publié (remplacé par « Source momentanément indisponible », cf. `public-events.js`).
  Aucune notification n'est envoyée. Identique pour les 10 sources.

## Détail par source (avant → après)

| source | type d'erreur (désormais propagée) | avant | après | `inactive` légitime conservé |
|---|---|---|---|---|
| `tempo` | timeout / HTTP non-2xx / JSON illisible | `inactive` muet (jour rouge EDF manquable) | `throw` → incident | jour bleu/blanc/non publié |
| `meteo-belgique` | timeout / HTTP (MeteoAlarm BE) | `combos.map(inactive)` | propage via `fetchFeed()` | flux vide, 0 combo |
| `meteo-quebec` | timeout / HTTP (ECCC) | `combos.map(inactive)` | propage via `fetchWarnings()` | aucun avertissement |
| `meteo-europe` | erreur par flux pays | `push(inactive)` par pays | propage via `alertsFor(feed)` | pays inconnu (`!c`) |
| `meteo-forets` | réseau/timeout/5xx (Météo-France) | « filet » → `inactive` | `throw` ; **404 = année non publiée → repli n-1** | hors-saison / bulletin périmé / 404 deux années |
| `vigilance-submersion` | timeout / HTTP (DPVigilance) | `combos.map(inactive)` | propage via `fetchVigilance()` | **no-op sans clé** préservé ; cache TTL |
| `cyclones-outremer` | téléchargement (réseau/HTTP/non-ZIP/volume) | `inactive` muet | `throw` au téléchargement | no-op `!OM_URL` ; territoire absent / couleur illisible / bulletin texte |
| `veille-hydrometrie` | timeout / HTTP (Hub'Eau) par station | `inactive` par station | `throw` par station ; **pas de `cache.set` sur erreur** (pas de fausse alerte au retour) | 404 = station inconnue |
| `indice-uv` | timeout / HTTP (Open-Meteo) | `combos.map(inactive)` | propage via `fetchUv(batch)` | UV sous le seuil |
| `domaine-securite` | timeout / 5xx / 401-403 / JSON (URLhaus) | `inactive` silencieux | `throw` contextualisé | **no-op sans clé** ; `query_status≠ok` / `no_results` |

## Revue croisée

Relue par un second agent (différent de l'auteur) : patron conforme au modèle de prod
(`qualite-air`, `eruption-volcanique`, `pannes-hydro-quebec`), séparation erreur/`inactive` correcte
partout, no-op « clé absente » (`domaine-securite`, `vigilance-submersion`) bien conservés, aucune
régression (dédoublonnage, anti-rétroactif, caches intacts). **Verdict : prêt à commiter.**

**Suivi recommandé (post-accord, non bloquant) :** `domaine-securite` (URLhaus/abuse.ch) est le seul
candidat à un 403-quota récurrent → à terme, l'envelopper avec le mécanisme « propager après N échecs »
(`server/sources/lib/fail-threshold.js`) pour amortir un quota dépassé. Les 9 autres sont des API
stables orientées données (pas d'anti-bot) : throw immédiat approprié.

## Test

`scripts/test-sources-incident-palier1.js` (calqué sur `test-sources-incident.js`, hors ligne, vrai
poller, stubs db/mailer/webpush/fetch) : **45/45 cas** — pour chaque source, 403 / 503 / timeout →
incident (non-paramétriques) ou levée (paramétriques via `checkWithParams`), plus les cas `inactive`
légitimes. Aucun réseau, aucune base.

**NON déployé.** Déploiement du palier 1 seulement après accord de Hugo.
