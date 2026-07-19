# Rapport de veille — 2026-07-19

_Robot 1 (maintenance, lecture seule). Source : `node scripts/veille-readonly.js` (généré 2026-07-19T02:00Z) + lecture `server/sources/*.js` et `server/categories.js`. Aucune écriture hors ce rapport, aucun accès DB direct, aucun `runCycle()`._

## Résumé (rien de bloquant)

1. **Aucune source en échec anormale.** Les gros compteurs (`leboncoin-livraison` 87, `sncf-perturbations` 85) sont des causes connues et attendues (DataDome ; `SNCF_API_KEY` absente).
2. **`lancement-spatial` (35 éch.) et `vigicrues` (`-05` 21, `-departement` 5)** : timeouts répétés d'API tierces (>10 s). À surveiller, niveau bas — probables lenteurs côté fournisseur.
3. **Slugs orphelins : AUCUN.** Les 78 slugs utilisés en base sont tous définis dans `server/categories.js`. RAS.
4. **`vigilance-meteo` : 9 départements en `active` figés depuis le 14-15/07** — vraisemblablement vigilance en cours (mi-juillet) ou non-transition still-active ; à jeter un œil, niveau bas.
5. **TODO calendaires ≤ 60 j : aucun renouvellement requis d'ici le 17/09.** Les échéances 2027 (Bison Futé, rentrée, fêtes juives, Livret A…) tombent toutes début 2027 (annexe).

---

## Sources en échec (`failing_sources`)

`failing_sources` fait foi. Analyse au cas par cas :

| Source | Éch. 7j | Dernier message | Verdict |
|---|---|---|---|
| `leboncoin-livraison` | 87 | Blocage anti-bot leboncoin (IP datacenter) | **Normal.** DataDome par vagues, documenté (scraper). Pas d'action. |
| `sncf-perturbations` | 85 | `SNCF_API_KEY` absente de l'environnement | **Normal.** Clé attendue (liste de courses #5). Source en attente. Pas d'action. |
| `ecowatt` | 42 | HTTP 429 (appel trop fréquent), reporté au cycle suivant | **Bas.** Rate-limit géré (retry auto). Source hivernale, hors saison. À noter sans agir. |
| `lancement-spatial` | 35 | Timeout API Launch Library (>10 000 ms) | **Bas.** Timeouts répétés côté fournisseur. Si ça persiste plusieurs semaines, envisager d'augmenter le timeout ou revoir la source. |
| `vigicrues-05` | 21 | Timeout API Vigicrues (>10 000 ms) | **Bas.** Dernier échec 16/07. Doublon probable avec `vigicrues-departement` (param) — à vérifier (héritage ?). |
| `vigicrues-departement` | 5 | Timeout API Vigicrues (>10 000 ms) | **Bas.** Transitoire, API Vigicrues lente par moments. |
| `statut-twitch` | 2 | Timeout (status.twitch.tv, >10 000 ms) | **Bruit.** Transitoire, sous le seuil d'inquiétude. |
| `vigieau-gap` | 2 | 502 Bad Gateway VigiEau | **Bruit.** 502 transitoire API tierce, dernier 15/07. |

## États figés (`stale_states`) — signal SECONDAIRE

⚠️ Rappel du `caveat` du script : `checked_at` n'est rafraîchi qu'en écriture ; une source/combinaison **inactive** garde un `checked_at` ancien = **NORMAL** tant que l'étape B n'est pas déployée. La grande majorité des entrées `stale` sont des sources `inactive` → **bruit attendu, pas d'alarme.**

Seule catégorie méritant un coup d'œil (états `active` figés, non couverts par le caveat still-inactive) :

- **`vigilance-meteo`** en `active` avec `checked_at` figé au **14/07 ~23:04** pour les dépts **31, 33, 35, 38, 44, 67, 74, 75, 83** (et **24** au 15/07). Non corroboré par `failing_sources` (la source ne tombe pas en échec). Deux lectures possibles : (a) vigilance réellement en cours et reconduite (mécanisme still-active sans écriture → `checked_at` gelé, donc **normal**) ; (b) états qui ne redescendent pas en `inactive`. À noter que d'autres dépts (05, 10, 16, 69) sont bien repassés `inactive` avec `checked_at` récent (16-17/07), ce qui plaide plutôt pour (a). **Niveau bas** : Hugo peut confirmer qu'une vigilance est bien active sur ces dépts.

## Jamais activées en 90 j (`never_active_90d`)

**RAS — normal.** Toutes les sources listées ont été créées entre le **11 et le 18/07/2026** (projet récent) : elles n'ont mécaniquement pas 90 j d'existence. S'y ajoutent les saisonnières hors saison (Beaujolais, Black Friday, Perséides, soldes, fêtes…) et les dormantes/en attente de clé (météo OM, releases…). Aucune source censée s'activer souvent et restant muette anormalement.

## Collisions d'ordre d'affichage (`display_order_collisions`)

Cosmétique, sans urgence. 11 collisions concentrées sur la plage **40-59**, essentiellement des `statut-*` (pannes services) qui chevauchent des sources saisonnières/astro :

- 40 : `doomname`, `statut-github`
- 42 : `statut-npm`, `statut-openai`
- 43 : `statut-discord`, `statut-vercel`
- 50 : `changement-heure`, `statut-twitch`
- 51 (×3) : `black-friday`, `soldes`, `statut-zoom`
- 52 : `perseides`, `statut-canva`
- 53 : `beaujolais-nouveau`, `statut-dropbox`
- 54 : `soldes-steam`, `statut-slack`
- 55 : `aurores-france`, `cert-fr-alertes`
- 56 (×3) : `eclipse-solaire`, `geminides`, `nuits-des-etoiles`
- 59 : `echeances-fiscales`, `journees-patrimoine`

Suggestion (non urgente) : ré-échelonner cette plage 40-59, ou attribuer aux `statut-*` une plage dédiée continue, pour un tri déterministe. Voir brouillon en fin de rapport.

## TODO calendaires — échéances ≤ 60 j (jusqu'au 17/09/2026)

Vérification des configs datées de `server/sources/*.js`. **Bilan : aucun renouvellement de données codées en dur n'est requis d'ici 60 j.** Les événements ci-dessous sont déjà configurés et se déclencheront normalement — pas d'action code :

- `bison-fute.js` : jours classés 25/07, 01/08, 08/08, 15/08, 28/08 (calendrier 2026 présent).
- `eclipse-solaire.js` : éclipse partielle **12/08/2026** (dans ~3 semaines).
- `nuits-des-etoiles.js` : **07-09/08/2026**.
- `evenements-astro.js` : éclipse lunaire partielle **28/08/2026**.
- `allocation-rentree-scolaire.js` : **05/08** (Réunion/Mayotte), **19/08** (métropole).
- `braderie-lille.js` : **05-06/09/2026**.
- `rentree-scolaire.js` : **01/09/2026**.
- `echeances-fiscales.js` : remboursements **24/07** et **31/07** ; bascule taux PAS **01/09**.
- `fetes-chretiennes.js` : Assomption **15/08**.
- `fetes-juives.js` : Roch Hachana **12/09**, Yom Kippour **21/09**.
- `fetes-laiques.js` : équinoxe d'automne **23/09**.
- `taux-livret-a.js` : révision **01/08** (1,5 % → 1,8 %) — donnée déjà présente.

**Point d'attention (léger)** : les sources astro/événementielles ci-dessus figurent en `inactive` dans `stale_states` (normal hors fenêtre) ; elles doivent basculer `active`/`upcoming` à l'approche. Rien à faire, juste à constater au prochain run que l'éclipse du 12/08 et les Nuits des Étoiles (07-09/08) remontent bien.

### Annexe — échéances > 60 j & TODO de renouvellement (pas d'urgence)

Renouvellements de données codées en dur, tous datés **début/automne 2027** (à traiter le moment venu) :

- `bison-fute.js` (≈l.17) : TODO début 2027 — remplacer `JOURS_2026` par calendrier officiel 2027.
- `echeances-fiscales.js` (≈l.14) : TODO début 2027 — entrées 2027 ; d'ici là échéances TF **15-20/10/2026** et THRS **15-20/12/2026** déjà présentes.
- `fetes-juives.js` (≈l.11) : TODO automne 2027 — Roch Hachana/Yom Kippour/Hanoucca 2027 (Hanoucca 2026 : 05-12/12).
- `taux-livret-a.js` (≈l.14) : TODO 01/02/2027 — prochaine révision.
- `rentree-scolaire.js` (≈l.2) : TODO 2027 — en attente du décret calendrier scolaire.
- `nuits-des-etoiles.js` (≈l.6) : TODO début 2027 — édition 2027 (publication AFA).
- `fete-science.js` (≈l.2) : TODO 2027 — dates via fetedelascience.fr (édition 2026 : 02-12/10).
- `prime-noel.js` : **16/12/2026** ; TODO 2027 sur confirmation CAF.
- `fete-des-lumieres.js` : **05-08/12/2026** ; TODO annuel sur publication.
- `cheque-energie.js` : réclamation jusqu'au **31/12/2026** ; TODO 2027 au printemps.

## Slugs orphelins

**AUCUN orphelin.** Fichier de taxonomie localisé : **`server/categories.js`** (313 slugs définis, groupés). Les 78 slugs réellement utilisés par les sources en base (`category_slugs`) sont **tous** présents dans la taxonomie. Aucune carte ne s'affichera avec un slug brut. (L'inverse — slugs définis mais non utilisés — est normal et non signalé.)

## Decks signalés

`suspended_decks` : vide. RAS.

---

## BROUILLON — à valider par Hugo avant toute exécution

> ⚠️ **NON VALIDÉ. Robot 1 n'exécute rien.** Simple proposition, purement cosmétique, à revoir par Hugo.

**Objet** : résorber les 11 collisions de `display_order` sur la plage 40-59 pour un tri déterministe.

Piste : réserver une plage continue aux `statut-*` (pannes services), distincte des sources saisonnières/astro, en réutilisant la convention « toute nouvelle vague prend une plage au-dessus » (display_order utilisés jusqu'à ~365). Exemple de démarche (à instruire dans un fil normal, pas ici) :

1. Lister en lecture les `display_order` actuels des `statut-*` et des sources en collision.
2. Décider une plage libre dédiée aux `statut-*` (p. ex. au-dessus de 365) OU réordonner finement 40-59.
3. Migration idempotente `UPDATE sources SET display_order = ...` (une source par valeur), appliquée via la séquence habituelle (migration + Railway), jamais depuis un agent.

Aucune urgence : impact purement visuel sur l'ordre de tri en cas d'égalité.
