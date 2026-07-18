# Rapport de veille de maintenance — 2026-07-18

_Robot 1 (lecture seule). Base : `node scripts/veille-readonly.js` (SELECT only) +
lecture de `server/sources/*.js` et `server/categories.js`. Aucune écriture, aucun
accès direct DB, aucun `runCycle()`._

Cadre : 135 sources enabled, 17 combinaisons paramétrées.

## Résumé

- **Aucune régression franche.** Les 8 `failing_sources` sont toutes des causes
  connues/attendues (DataDome leboncoin, `SNCF_API_KEY` absente, timeouts tiers,
  502 transitoires). Les deux sources FRAGILES surveillées (meteo-suisse,
  pannes-hydro-quebec) ne sont **pas** en échec.
- Point bas à surveiller : **EcoWatt** enchaîne des HTTP 429 (« appel trop
  fréquent », 37 échecs) — probable cadence trop serrée côté RTE, pas une panne.
- **Slugs orphelins : RAS.** Les 74 slugs utilisés en base existent tous dans la
  taxonomie `server/categories.js`.
- Calendaire : événements datés qui se déclencheront **normalement** dans les 60 j
  (jour du dépassement, ARS, Perséides, éclipse partielle, rentrée, gamescom…).
  Aucun renouvellement de config n'est réellement dû sous 60 j — les TODO de
  renouvellement sont tous « début 2027 ».
- 11 collisions de `display_order` (cosmétique, sans urgence).

---

## Sources en échec (`failing_sources`)

| Source | Échecs 7 j | Dernier message | Lecture |
|---|---|---|---|
| leboncoin-livraison | 69 | Blocage anti-bot (IP datacenter) | **Attendu** — DataDome par vagues, documenté. Pas d'action. |
| sncf-perturbations | 66 | `SNCF_API_KEY` absente | **Attendu** — clé sur la liste de courses. Pas d'action. |
| ecowatt | 37 | HTTP 429 « appel trop fréquent » | **À surveiller (bas)** — rate-limit RTE récurrent, pas une panne. Voir si la cadence de poll EcoWatt peut s'espacer. |
| lancement-spatial | 27 | Timeout Launch Library (>10 s) | API tierce lente/instable. Bas, transitoire. |
| vigicrues-05 | 21 | Timeout Vigicrues (>10 s) | Dump national lourd, timeouts connus. Dernier échec 16/07. Bas. |
| vigicrues-departement | 4 | Timeout Vigicrues (>10 s) | Même cause. Source récente (créée 16/07). Bas. |
| statut-twitch | 2 | Timeout status.twitch.tv | Bruit transitoire. |
| vigieau-gap | 2 | 502 Bad Gateway VigiEau | Bruit transitoire (dernier 15/07). |

Aucune source FRAGILE (meteo-suisse, pannes-hydro-quebec) ne remonte en échec.

## États figés (`stale_states`) — signal SECONDAIRE

⚠️ Rappel caveat : `checked_at` n'est rafraîchi qu'à l'écriture ; un `checked_at`
ancien sur une source/combinaison **inactive** est NORMAL tant que l'étape B n'est
pas déployée. La quasi-totalité de la liste (statuts cloud, sources saisonnières,
fêtes…) tombe dans ce cas → **bruit attendu, sans alarme**.

Seule mention non-bruit (états `active` figés, à titre informatif) : plusieurs
combinaisons **vigilance-meteo** sont `active` avec un `checked_at` figé au
**2026-07-14 ~23:04** (dépts 24, 31, 33, 35, 38, 44, 67, 74, 75, 83). Deux
lectures possibles, indistinguables en lecture seule :
- un épisode de vigilance réellement en cours depuis le 14/07 (orages d'été
  plausibles sur ces départements), auquel cas c'est nominal ;
- ou des états `active` restés figés (le cas « still-active » ne réécrit pas non
  plus `checked_at`).

Non corroboré par `failing_sources` (vigilance-meteo ne remonte aucun échec) →
je le signale en **niveau bas** pour information, sans conclure.

## Jamais actives depuis 90 j (`never_active_90d`)

RAS anormal. La liste est cohérente avec un kiosque récent (la plupart des sources
ont un `created_at` de juillet 2026) et avec des sources **saisonnières hors
saison** ou **dormantes en attente de clé** : Black Friday, Beaujolais, Perséides,
soldes, cyclones OM, avalanche, météo forêts, DoomName, releases (github/npm/pypi),
etc. Aucune source censée s'activer souvent n'est muette de façon suspecte.

## Collisions d'ordre d'affichage (`display_order_collisions`)

Cosmétique. 11 valeurs de `display_order` partagées par 2–3 sources :

`40` (doomname, statut-github) · `42` (statut-npm, statut-openai) · `43`
(statut-discord, statut-vercel) · `50` (changement-heure, statut-twitch) · `51`
(black-friday, soldes, statut-zoom) · `52` (perseides, statut-canva) · `53`
(beaujolais-nouveau, statut-dropbox) · `54` (soldes-steam, statut-slack) · `55`
(aurores-france, cert-fr-alertes) · `56` (eclipse-solaire, geminides,
nuits-des-etoiles) · `59` (echeances-fiscales, journees-patrimoine).

Sans effet fonctionnel (tri secondaire départage). Un ré-échelonnement pourra être
fait à l'occasion d'une prochaine vague, sans urgence.

## TODO calendaires ≤ 60 j (fenêtre 2026-07-18 → 2026-09-16)

Distinction importante : ci-dessous, des **événements datés qui vont se
déclencher normalement** — la source fera son travail, **aucune action requise**.
Le seul « besoin de renouvellement » réel est pour l'après-saison, et tous les
TODO de renouvellement pointent **début 2027**. Rien n'est donc à renouveler sous
60 j.

Vérifiés en lecture directe des fichiers :

| Fichier | Échéance datée (2026) | Renouvellement | Action ≤ 60 j |
|---|---|---|---|
| `jour-depassement.js` | 30 juil | TODO 2027 (non publié) | Non — se déclenche seul |
| `allocation-rentree-scolaire.js` | 5 août (Réunion/Mayotte), 19 août (métropole/Antilles) | TODO 2027 (mi-août) | Non |
| `echeances-fiscales.js` | TF 15/20 oct, THRS 15/20 déc | TODO début 2027 | Non (au-delà de 60 j) |

Événements datés supplémentaires tombant dans la fenêtre (déclenchement nominal,
renouvellement noté « début 2027 » dans chaque fichier) : `nuits-des-etoiles.js`
(7–9 août), `perseides.js` (12–13 août), `eclipse-solaire.js` (partielle 12 août),
`bison-fute.js` (calendrier 2026 jusqu'au 28 août), `rdv-gaming.js` (gamescom
26–30 août), `mercato-foot.js` (clôture 1er sept), `rentree-scolaire.js`
(1er sept), `braderie-lille.js` (5–6 sept), `fetes-juives.js` (Roch Hachana
12 sept).

**Rien à faire d'ici le 16/09.** Prochaine vraie session de renouvellement :
**début 2027** (Bison Futé 2027, échéances fiscales 2027, fêtes mobiles 2027,
fêtes musulmanes à confirmer, marées ≥100 2027, élections dès décret). En annexe,
au-delà de 60 j mais avant fin 2026 : TF (oct), THRS (déc), Black Friday, Beaujolais,
prix littéraires, Nobel, cérémonies, salons — tous avec config déjà en place, sans
échéance de renouvellement imminente.

## Slugs orphelins

**RAS.** Croisement de `category_slugs` (74 slugs réellement utilisés en base)
avec la taxonomie fermée définie dans `server/categories.js` (objet `GROUPS`) :
**tous les slugs de la base sont présents dans la taxonomie**. Aucune carte ne
risque d'afficher un slug brut. (L'inverse — slugs définis mais non utilisés — est
normal et non listé.)

---

_Fin du rapport. Aucun correctif appliqué. Aucun brouillon de prompt nécessaire ce
jour : les seuls points ouverts (cadence EcoWatt, ré-échelonnement display_order,
états vigilance figés) relèvent d'un arbitrage de Hugo, pas d'un correctif
mécanique évident._
