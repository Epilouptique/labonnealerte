# Seuil « propager après N échecs consécutifs » — câblage (N=3)

**Date :** 2026-10-09 · **Statut :** FAIT en local, revue croisée OK, **NON déployé**.

## Principe

Module `server/sources/lib/fail-threshold.js` (API `recordFailure`/`recordSuccess`, seuil
`SOURCE_FAIL_THRESHOLD`, défaut **3**). Pour les sources dont l'aléa (403 anti-bot, SSRF bloqué,
pages/flux instables) est NORMAL et fréquent : un échec **par combo** reste toléré (`inactive` +
`warn`) tant qu'il n'a pas échoué **N fois d'affilée** ; au Nᵉ échec consécutif, la source **lève** →
le poller en fait un **incident** (1 `failed`/h, aucune notification, état précédent conservé). Tout
**succès** de fetch+parse — y compris un résultat légitime `inactive` (« rien à signaler ») —
**réinitialise** le compteur du combo (`recordSuccess`).

Sources câblées : `veille-rss`, `veille-page`, `veille-agenda`, et la fabrique
`lib/panneaupocket-veille` (couvre `ma-collectivite` + cartes PanneauPocket). Clé par combo
(`<id>::<url>` ; `<id>` seul pour une carte broadcast).

## Délai réel avant incident (selon la fréquence de vérification)

Le poller tourne toutes les **30 min**, MAIS un fetch n'est tenté que quand le cache interne de la
source est périmé — c'est donc la **cadence de re-tentative sur échec** qui compte, pas le cycle brut.
Un échec n'est compté que lorsqu'un fetch est réellement tenté.

| source | cache sur échec | cadence de re-tentative | délai avant incident (N=3) |
|---|---|---|---|
| `veille-page` | oui, `RETRY_MS = 1h` | ~1 h | **~2 h** (échecs à 0, +1 h, +2 h) |
| `panneaupocket` (`ma-collectivite` + cartes) | oui, `RETRY_MS = 1h` | ~1 h | **~2 h** |
| `veille-agenda` | oui, résultat mis en cache `TTL = 1h` | ~1 h | **~2 h** |
| `veille-rss` | non (échec non mis en cache) | ~30 min une fois le cache de succès (2 h) périmé | **~1 h** après péremption du cache (soit jusqu'à ~3 h après le début de la panne si un succès venait d'avoir lieu) |

Note : après un **succès** récent, s'ajoute un délai jusqu'à la péremption du cache de succès
(veille-page 6 h, panneaupocket 2 h, veille-agenda 1 h, veille-rss 2 h) avant que le premier échec ne
soit même tenté. Les durées ci-dessus mesurent la **panne continue** à partir du moment où les fetchs
recommencent à être tentés.

## Revue croisée (second agent, ≠ auteur)

Verdict **prêt à commiter**. Vérifié : `recordSuccess` posé sur **tous** les chemins de succès (y
compris `inactive` légitime) sur les 5 fabriques → pas de fausse escalade d'une source saine ; échec
compté uniquement sur vraie erreur de surveillance ; clés par combo disjointes ; **confidentialité**
(veille-agenda n'expose pas l'URL : `refKey(url)` dans logs et message d'escalade) ; aucune régression
(TTL/RETRY, anti-rétroactif, dédoublonnage, schémas inchangés).

**Réserve mineure (pré-existante, hors de ce lot) :** dans `veille-rss`, `parseFeed(xml)` est hors
`try` → une erreur de **parse** RSS se propagerait immédiatement (hors mécanisme de seuil), alors que
`veille-agenda` compte l'échec de parse. Comportement d'origine ; à harmoniser un jour si souhaité.

## Tests (hors ligne, aucun réseau/base)

- `scripts/test-fail-threshold.js` — mécanisme + API bas niveau : **12/12**.
- `scripts/test-fail-threshold-sources.js` — les 4 sources : pour chacune, 3 échecs → toléré/toléré/LÈVE,
  et échec/échec/**succès**/échec → ne lève pas (série réinitialisée) : **35/35**. Stub `safe-fetch`,
  horloge simulée pour contourner les TTL internes.

**NON déployé.** À déployer avec le palier 1 (ou séparément) après accord de Hugo.
