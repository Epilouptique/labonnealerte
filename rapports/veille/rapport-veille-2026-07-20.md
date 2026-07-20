# Rapport de veille — 2026-07-20

## Résumé (Robot 1, lecture seule)

1. **Aucune régression réelle.** Les 9 `failing_sources` sont toutes des causes connues ou des timeouts tiers transitoires (voir détail) — rien de neuf à corriger.
2. **TODO calendaires ≤ 60 j : 7 configs annuelles arrivent à échéance d'ici le 2026-09-18** (bison-fute, rentree-scolaire, braderie-lille, nuits-des-etoiles, fetes-juives, semaine-du-gout, echeances-fiscales) — préparation à anticiper, aucune casse imminente.
3. **Aucun slug orphelin** : les 78 slugs en base sont tous définis dans `server/categories.js`.
4. **11 collisions de `display_order`** (plages 40-59) — cosmétique, sans urgence.
5. `meta` : 176 sources enabled, 21 combinaisons paramétrées.

---

## Sources en échec (`failing_sources`)

Signal qui fait foi. Toutes classées après croisement avec l'état du projet :

| Source | Éch. 7 j | Dernier message | Verdict |
|---|---|---|---|
| leboncoin-livraison | 117 | Blocage anti-bot (IP datacenter) | **Normal** — DataDome par vagues, documenté (scraper). |
| sncf-perturbations | 115 | `SNCF_API_KEY` absente | **Normal** — clé attendue (liste de courses #5). |
| lancement-spatial | 54 | Timeout Launch Library (>10 s) | Bas — API tierce lente/instable ; à surveiller si ça persiste. |
| ecowatt | 45 | HTTP 500 EcoWatt | Bas — hors saison (énergie hiver) ; 500 côté RTE plausible. À revoir avant l'hiver. |
| vigicrues-05 | 21 | Timeout Vigicrues (>10 s) | Bas — timeout transitoire API Vigicrues. |
| vigicrues-departement | 6 | Timeout Vigicrues (>10 s) | Bas — idem, factory. |
| risque-secheresse | 2 | HTTP 404 VigiEau | Bas — réponse ponctuelle VigiEau/RegLeau. |
| statut-twitch | 2 | Timeout status.twitch.tv | Bas — Statuspage tiers, transitoire. |
| vigieau-gap | 2 | HTTP 502 VigiEau | Bas — 502 transitoire VigiEau (dernier 07-15). |

Aucune source ne bascule d'un état sain vers un état cassé : pas d'alerte.

## États figés (`stale_states`) — signal SECONDAIRE (caveat appliqué)

Le `checked_at` n'est rafraîchi qu'en écriture ; un `checked_at` ancien sur une entrée **inactive** est NORMAL tant que l'étape B n'est pas déployée. La grande majorité des entrées figées sont des sources `inactive` (saisonnières ou pannes non survenues) → **bruit attendu, pas d'alarme**.

Seules entrées `active` figées, à mentionner en niveau bas :
- `vigilance-meteo` dépts 13, 24, 31, 33, 35, 38, 44, 67, 74, 75, 83 — `active`, `checked_at` du 2026-07-14/15. Non corroborées par `failing_sources`. Explication la plus probable : vigilance continue (épisode caniculaire estival) sans transition, donc `write:false` — même mécanique que le still-inactive. **Pas un échec**, mais à re-vérifier si l'étape B (refresh en still-active) est déployée, car ce serait alors anormal.
- `rappel-conso` (alimentation, bébés-enfants) et `risque-secheresse` (06/14/16/53) : `active` avec `checked_at` récent (19 juil.) → sain.

## Jamais actives 90 j (`never_active_90d`)

Rien d'anormal. La liste est dominée par :
- des **sources saisonnières hors saison** (black-friday, beaujolais-nouveau, geminides, soldes-steam, treve-hivernale, changement-heure, nobel-prix, prime-noel…) — normal ;
- des **sources récemment ajoutées** (créées entre le 11 et le 19 juillet 2026, dont le lot Québec du 19 juil. : education-quebec, fiscalite-quebec, sport-quebec…, et arts-visuels / bd-manga / theatre) — jamais eu le temps de s'activer, normal ;
- des **sources dormantes / en attente de clé** (sncf-perturbations, ecowatt, tempo) — normal.

Aucune source « censée s'activer souvent mais muette » détectée.

## Collisions d'ordre d'affichage (`display_order_collisions`)

11 collisions, toutes dans la plage 40-59 (premiers statuts + événements) :

| ordre | sources |
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

Cosmétique (ordre d'affichage seulement). Un ré-échelonnement de cette plage est possible sans urgence — voir brouillon en fin de rapport.

## TODO calendaires ≤ 60 jours (échéance d'ici le 2026-09-18)

Configs annuelles codées en dur dont l'édition 2026 expire / le renouvellement se profile dans les 60 jours. **Aucune casse immédiate** : les dates 2026 sont valides, ce sont les éditions suivantes à préparer.

| Fichier | Échéance dans la fenêtre | Renouvellement |
|---|---|---|
| `bison-fute.js` | derniers jours rouges/noirs 2026 (01/08, 08/08, 15/08, 28/08) — calendrier épuisé après le 28/08 | TODO début 2027 (remplacer `JOURS_2026`) |
| `rentree-scolaire.js` | rentrée 2026-09-01 | TODO 2027 (arrêté calendrier scolaire à paraître) |
| `braderie-lille.js` | 2026-09-05/06 | TODO 2027 (une seule édition codée) |
| `nuits-des-etoiles.js` | 2026-08-07 → 08-09 | TODO début 2027 (dates AFA) |
| `fetes-juives.js` | Roch Hachana 2026-09-12, Yom Kippour 2026-09-21 | TODO automne 2027 |
| `semaine-du-gout.js` | 2026-10-12 → 18 (limite de fenêtre) | TODO 2027 |
| `echeances-fiscales.js` | Taxe foncière 2026-10-15/20 (annonce J-7 ≈ 08-10) | TODO 2027 (entrée à ajouter) |
| `eclipse-solaire.js` | éclipse partielle 2026-08-12 (dans 3 semaines) | Config OK, TODO long terme seulement |
| `evenements-astro.js` | éclipse partielle de Lune 2026-08-28 | Config OK, TODO 2027+ |
| `fetes-laiques.js` | équinoxe d'automne 2026-09-23 | Config OK, TODO 2028 |

Point d'attention : **bison-fute** est la seule dont le calendrier devient réellement vide après le 28/08 (les autres ont leur date 2026 en base) — à recharger dès parution du calendrier Bison Futé 2027.

### Annexe — échéances au-delà de 60 j (pour mémoire, sans alerte)
echeances-fiscales (THRS 2026-12-20) · fetes-chretiennes (Toussaint 11-01, Noël 12-25 ; TODO 2028) · fetes-juives (Hanoucca 12-05) · fetes-laiques (Halloween 10-31, solstice 12-21) · evenements-astro (conjonction J-M 10-14→18, opposition Uranus 10-25) · ceremonies (Césars/Oscars 2027) · grands-festivals (Cannes 2027) · nuits-de-la-lecture (2027-01) · fetes-gourmandes (Mardi Gras 2027) · tour-de-france-passage (data vide, TODO 2027).

## Slugs orphelins

**RAS.** Croisement des 78 slugs réellement utilisés en base (`category_slugs`) avec la taxonomie fermée définie dans `server/categories.js` (objet `GROUPS`) : **tous les slugs en base sont définis**. Aucune carte ne s'affichera avec un slug brut. (L'inverse — slugs définis mais non utilisés — est normal et non signalé.)

---

## BROUILLON — à valider par Hugo avant toute exécution

> Non validé. Robot 1 ne l'exécute pas. Purement cosmétique.

Ré-échelonner les `display_order` en collision (plage 40-59) pour que chaque source ait un ordre distinct, sans chevaucher les vagues supérieures (état-projet : ordres utilisés jusqu'à ~365, nouvelles vagues au-dessus). Piste : réserver une sous-plage dédiée aux `statut-*` (ex. décaler les statuts en collision vers une plage libre) afin de séparer statuts et événements saisonniers qui se télescopent aujourd'hui sur 40-59. À cadrer manuellement source par source ; aucune urgence, aucun impact fonctionnel (tri d'affichage uniquement).
