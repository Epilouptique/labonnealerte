# Rapport de veille de maintenance — 2026-07-17

_Agent Robot 1, lecture seule. Source : `node scripts/veille-readonly.js` (généré 2026-07-17T02:00Z) + lecture des fichiers `server/sources/*.js` et `server/categories.js`._
_Cadre : 129 sources enabled, 16 combinaisons paramétrées._

## Résumé

1. **RAS majeur.** Aucune régression franche ; les 6 sources en échec relèvent toutes de causes connues/attendues.
2. À surveiller (bas) : **ecowatt** en HTTP 429 récurrent (31 éch./7j) — possible calibrage de fréquence d'appel à revoir.
3. Les deux sources FRAGILES ciblées (meteo-suisse, pannes-hydro-quebec) : **aucun échec**, mais ajoutées le 15/07, historique quasi nul.
4. **0 slug orphelin** : les 72 slugs en base sont tous définis dans la taxonomie `server/categories.js`.
5. Aucune échéance calendaire n'exige de renouvellement strict sous 60 j ; **grandes-marees** est le prochain horizon (dormance ~fin oct 2026).

---

## Sources en échec (`failing_sources`)

| Source | Éch./7j | Dernier message | Lecture |
|---|---|---|---|
| leboncoin-livraison | 51 | Blocage anti-bot (IP datacenter, DataDome) | **Attendu.** Scraper fragile connu, DataDome par vagues. Pas d'action. |
| sncf-perturbations | 48 | `SNCF_API_KEY` absente | **Attendu.** Clé non encore souscrite (liste de courses). Pas d'action. |
| ecowatt | 31 | HTTP 429 (appel trop fréquent) | **À surveiller (bas).** Rate-limit RTE récurrent : soit borne côté RTE, soit fréquence de polling à espacer. Le repli « prochain cycle » semble en place ; à confirmer que ça ne masque pas d'alerte réelle. |
| vigicrues-05 | 21 | Timeout API Vigicrues (>10 s) | **Bas.** Timeouts transitoires sur le dump national. Source déjà connue comme non paramétrable proprement (candidate à remplacement par `vigicrues-departement`). |
| lancement-spatial | 18 | Timeout Launch Library (>10 s) | **Bas.** Timeouts transitoires d'une API tierce. Surveiller si ça persiste. |
| vigieau-gap | 2 | 502 Bad Gateway VigiEau | **Bruit.** 2 échecs, dernier le 15/07 (autour de la fusion vers `vigieau` paramétrée). 502 transitoire. À vérifier que l'ancienne `vigieau-gap` est bien `enabled=false` post-fusion. |

**Sources FRAGILES (consigne prioritaire) :** `meteo-suisse` et `pannes-hydro-quebec` **n'apparaissent pas** dans les échecs — bon signe. Réserve : créées le 15/07, elles n'ont pas encore d'historique significatif (voir « Jamais actives »). À re-surveiller aux prochains passages.

## États figés (`stale_states`) — signal SECONDAIRE

⚠️ Caveat du script : `checked_at` n'est rafraîchi que sur écriture. Un `checked_at` ancien sur une entrée **inactive** est NORMAL tant que l'étape B n'est pas déployée. La grande majorité des entrées listées sont dans ce cas — **bruit attendu, pas d'alarme**.

Seul point à noter (bas) : ~10 combinaisons `vigilance-meteo` en état **`active`** figées au 14–15/07 (dépts 24, 31, 33, 35, 38, 44, 67, 74, 75, 83). Deux lectures possibles :
- probable : vigilance réellement active et inchangée → `still-active` en `write:false`, donc `checked_at` gelé = **même caveat, normal** ;
- à écarter : combinaisons non repollées.

Non corroboré par `failing_sources` (vigilance-meteo n'échoue pas). Classé bas ; le déploiement de l'étape B lèverait l'ambiguïté.

## Jamais actives 90 j (`never_active_90d`)

Liste longue mais **entièrement attendue** :
- toutes les sources ont été créées entre le 11/07 et le 16/07 → « jamais active depuis 90 j » est trivialement vrai (elles existent depuis quelques jours) ;
- beaucoup sont **saisonnières hors saison** (Black Friday, Beaujolais, soldes-steam, éclipse, Géminides, Nobel, trêve hivernale…) ou **dormantes en attente de clé** (avalanche, météo-forêts, cyclones-outremer, DoomName) ou **à seuil rare** (bitcoin, pannes-hydro-quebec, séismes).

**Aucune anomalie** : pas de source censée s'activer souvent qui resterait muette. Pas d'action.

## Collisions d'ordre d'affichage (`display_order_collisions`)

11 collisions, **cosmétique**, sans urgence. Elles opposent surtout des pages de statut à des sources événementielles/saisonnières :

| `display_order` | Sources |
|---|---|
| 40 | doomname, statut-github |
| 42 | statut-npm, statut-openai |
| 43 | statut-discord, statut-vercel |
| 50 | changement-heure, statut-twitch |
| 51 | black-friday, soldes, statut-zoom |
| 52 | perseides, statut-canva |
| 53 | beaujolais-nouveau, statut-dropbox |
| 54 | soldes-steam, statut-slack |
| 55 | aurores-france, cert-fr-alertes |
| 56 | eclipse-solaire, geminides, nuits-des-etoiles |
| 59 | echeances-fiscales, journees-patrimoine |

Suggestion sobre : ré-échelonner sur des plages hautes distinctes lors d'une prochaine passe (l'existant max est à ~172, marge disponible). Non urgent.

## TODO calendaires ≤ 60 j (fenêtre 2026-07-17 → 2026-09-15)

**Aucun renouvellement de config n'expire strictement sous 60 jours.** Les événements suivants **tombent dans la fenêtre et disposent déjà de leur config 2026** (donc se déclencheront normalement — informatif, rien à faire) :

- `grands-rendez-vous-sportifs.js` — fin Coupe du monde 19/07, Tour de France ~26/07 (config présente).
- `bison-fute.js` — samedis noirs/rouges d'été (18/07, 25/07, 01/08, 08/08, 15/08) — `JOURS_2026` présent.
- `nuits-des-etoiles.js` (07–09/08), `perseides.js` (12–13/08), `eclipse-solaire.js` (12/08) — configs 2026 présentes.
- `grandes-marees.js` — coeff 102 les 13–16/08 et 11–14/09 (config présente).
- `rdv-gaming.js` — gamescom 26–30/08 ; `braderie-lille.js` — 05–06/09.

**Point d'attention (horizon proche, > 60 j mais à préparer) :**
- **`grandes-marees.js`** — dernier créneau 2026 les 27–28/10 ; **la source devient dormante après fin octobre 2026** faute de données 2027. TODO 2027 à honorer avant fin octobre (transcription coeff ≥100 depuis maree.info/SHOM). C'est l'échéance utile la plus rapprochée.
- `echeances-fiscales.js` — Taxe foncière (~15–20/10) : entrée 2026 présente ; renouvellement 2027 marqué « début 2027 ».

**Au-delà de 60 j (annexe, pour mémoire, non urgent) :** TODO « début 2027 » sur bison-fute, echeances-fiscales, taux-livret-a (01/02/2027), fêtes chrétiennes/juives/musulmanes/laïques, ceremonies, nuits-de-la-lecture, grands-festivals, grands-salons, nobel-prix, fete-science, semaine-du-gout, cheque-energie, hausses-tarifs, sorties-cinema/jeux-majeures, rdv-planete, evenements-astro, ouverture-ventes-sncf (config vide), guide-michelin, elections-france (attente décret).

## Slugs orphelins

**Aucun.** Croisement des 72 slugs réellement utilisés en base (`category_slugs`) avec la taxonomie fermée définie dans `server/categories.js` (constante `GROUPS`) : **tous les slugs en base sont définis**. Aucune carte ne s'affichera avec un slug brut. (L'inverse — slugs définis mais non utilisés — est normal et non signalé.)

---

_Fin du rapport. Aucune modification effectuée. Aucun brouillon correctif nécessaire ce jour._
