# Rapport de veille maintenance — 2026-07-21

_Robot 1, lecture seule. Aucune modification effectuée. Source unique de données :_
_`node scripts/veille-readonly.js` (SELECT only). Cadre : 212 sources enabled, 21 combinaisons paramétrées._

## Résumé (l'essentiel)

1. **RAS régression.** Toutes les sources en échec relèvent de causes connues/attendues (anti-bot leboncoin, `SNCF_API_KEY` absente, API tierces fragiles ou rate-limitées). Rien à corriger en urgence.
2. **Point à l'œil (bas) : `risque-secheresse`** — VigiEau renvoie des **404** (dernier échec aujourd'hui 01h31), et 4 combinaisons `active` (dépt 06/14/16/53) sont figées depuis le 19/07. À surveiller : un 404 persistant empêcherait la mise à jour de ces états de sécheresse actifs.
3. **Slugs orphelins : 0.** Tous les slugs présents en base sont définis dans `server/categories.js`. Rien à signaler.
4. **`never_active_90d` = bruit intégral, ignoré.** Le projet a été créé à partir du 11/07/2026 (< 90 jours) : par construction, toutes les sources y figurent. Signal ininterprétable ce mois-ci.
5. **TODO calendaires ≤ 60 j :** préparer les renouvellements 2027 — `bison-fute` (calendrier 2026 expire fin août), `tour-de-france-passage` (parcours 2027 annoncé fin juillet), `courses-mythiques` (dates à saisir en septembre), `rentree-scolaire` / `allocation-rentree-scolaire` (arrêté + dates CAF 2027).

---

## Sources en échec (≥ 2 échecs / 7 j)

`failing_sources` fait foi. Toutes explicables :

| Source | Échecs 7j | Dernier message | Dernier | Lecture |
|---|---|---|---|---|
| `leboncoin-livraison` | 134 | Blocage anti-bot leboncoin (IP datacenter) | 21/07 11h30 | **Attendu** — DataDome par vagues, documenté (scraper). Aucune action. |
| `sncf-perturbations` | 132 | `SNCF_API_KEY` absente de l'environnement | 21/07 11h31 | **Attendu** — clé non fournie (liste de courses #5). Aucune action tant que la clé n'est pas souscrite. |
| `lancement-spatial` | 61 | Timeout API Launch Library (>10 s) | 21/07 10h01 | API tierce fragile sans SLA. Bruit récurrent, se rétablit seul. Surveillance passive. |
| `ecowatt` | 43 | HTTP 429 (appel trop fréquent), prochain cycle | 20/07 22h54 | Rate-limit RTE, auto-géré (retard au cycle suivant). Hors saison EcoWatt. Bénin. |
| `vigicrues-05` | 21 | Timeout API Vigicrues (>10 s) | 16/07 16h01 | Transitoire, s'est **arrêté le 16/07**. Bénin. |
| `vigicrues-departement` | 6 | Timeout API Vigicrues (>10 s) | 19/07 13h30 | Transitoire côté Hub'Eau/Vigicrues. Bénin. |
| `risque-secheresse` | 4 | Réponse HTTP inattendue VigiEau : 404 | **21/07 01h31** | **À surveiller (bas).** Voir résumé §2 — corrobore des états `active` figés. |
| `statut-twitch` | 2 | Timeout status.twitch.tv (>10 s) | 17/07 15h01 | Transitoire Statuspage. Bénin. |
| `vigieau-gap` | 2 | VigiEau : 502 Bad Gateway | 15/07 00h00 | Transitoire tiers. Bénin. |

Note : la famille VigiEau (`risque-secheresse` 404, `vigieau-gap` 502) montre une instabilité côté API. Les 502 sont transitoires ; les **404 de `risque-secheresse` sont à surveiller** car plus spécifiques (endpoint/ressource introuvable plutôt que panne passagère). Pas d'alarme à ce stade — la source fonctionne pour d'autres combinaisons (dépt 06/14/16/53 sont passés `active`).

## États figés (`stale_states`) — signal SECONDAIRE

⚠️ **Caveat rappelé par le script :** `checked_at` n'est rafraîchi que sur écriture (`write:true`). Une source/combinaison **inactive** (cas `still-inactive`, `decideTransition`) garde un `checked_at` ancien — c'est **NORMAL** tant que l'étape B n'est pas déployée. La grande majorité des entrées `stale` (sources d'événements saisonniers inactives, statuts cloud inactifs) relève de ce bruit attendu. **Non signalé.**

Seules les entrées corroborées ou en état `active`/`pending` figé sont retenues :

- **`risque-secheresse` (dépt 06/14/16/53), `active`, figé au 19/07** — corroboré par les 404 dans `failing_sources`. C'est le seul croisement réellement à surveiller (cf. résumé §2). Si les 404 persistent, ces états actifs ne seront ni rafraîchis ni éventuellement clôturés.
- **`vigilance-meteo` (dépt 31/33/35/38/44/67/74/75/83/24/13), `active`, figés du 14 au 19/07** — `vigilance-meteo` **n'est pas** dans `failing_sources` : la source polle correctement. Ces `active` figés relèvent du même caveat `still-active` (pas de réécriture tant que la vigilance persiste, plausible en épisode caniculaire estival). **Bruit attendu**, mentionné pour traçabilité, sans alarme.

## Jamais actives 90 j (`never_active_90d`)

**Ininterprétable ce cycle → ignoré.** Le projet ayant été créé à partir du 11/07/2026, aucune source n'a plus de ~10 jours d'existence : la requête « aucun `activated` depuis 90 j » capture donc l'intégralité du parc. Le signal redeviendra exploitable une fois passé le seuil des 90 jours d'ancienneté (≈ mi-octobre 2026). Rien à conclure aujourd'hui.

## Collisions d'ordre d'affichage (`display_order_collisions`)

Cosmétique, sans urgence. 11 valeurs partagées, plage 40–59, essentiellement entre statuts cloud et sources événementielles :

40 (`doomname`/`statut-github`) · 42 (`statut-npm`/`statut-openai`) · 43 (`statut-discord`/`statut-vercel`) · 50 (`changement-heure`/`statut-twitch`) · **51 ×3** (`black-friday`/`soldes`/`statut-zoom`) · 52 (`perseides`/`statut-canva`) · 53 (`beaujolais-nouveau`/`statut-dropbox`) · 54 (`soldes-steam`/`statut-slack`) · 55 (`aurores-france`/`cert-fr-alertes`) · **56 ×3** (`eclipse-solaire`/`geminides`/`nuits-des-etoiles`) · 59 (`echeances-fiscales`/`journees-patrimoine`).

Impact : ordre d'affichage indéterminé entre sources d'une même valeur (départage par tri secondaire). Aucun impact fonctionnel. Un ré-échelonnement propre (plage dédiée par vague, cf. convention `display_order` jusqu'à ~365) pourrait être fait au prochain nettoyage, sans urgence.

## TODO calendaires — échéances ≤ 60 j (21/07 → 19/09/2026)

Renouvellements à préparer dans la fenêtre (dates en dur / TODO datés relevés en lecture dans `server/sources/*.js`) :

| Source | Fichier | Nature | À faire avant |
|---|---|---|---|
| **Bison Futé** | `bison-fute.js` (~l.17) | Calendrier routier 2026 (dernier jour rouge/noir ~28/08) ; TODO 2027 explicite | Fin août 2026 — dès septembre, plus de calendrier valide |
| **Tour de France** | `tour-de-france-passage.js` (~l.9) | `PARCOURS = []` ; parcours 2027 annoncé pendant le Tour 2026 (fin juillet) | Août 2026 (saisir dès annonce) |
| **Courses mythiques** | `courses-mythiques.js` (~l.13) | `COURSES = []` ; TODO « septembre 2026 : transcrire les dates officielles » | Septembre 2026 |
| **Rentrée scolaire** | `rentree-scolaire.js` (~l.2) | Date 2026 en dur (01/09) ; TODO arrêté calendrier 2027 | Avant la rentrée (arrêté déjà paru) |
| **Allocation rentrée** | `allocation-rentree-scolaire.js` (~l.8) | Versements 2026 (05/08, 19/08) ; TODO date CAF 2027 | Mi-août 2026 (dates CAF) |
| **Grandes marées** | `grandes-marees.js` (~l.3) | Fenêtres 2026 présentes (13-16/08, 11-14/09) ; TODO périodes 2027 | Fin 2026 (données SHOM 2027) |
| **Nuits des Étoiles** | `nuits-des-etoiles.js` (~l.6) | Édition 2026 (07-09/08) ; TODO édition 2027 (AFA) | Dès publication AFA (sept. 2026) |
| **Grandes causes** | `grandes-causes.js` (~l.8) | Téléthon 2026 présent ; Restos du Cœur 42e (~fin nov.) non confirmé | Fin septembre 2026 (confirmer Restos) |

Événements de la fenêtre déjà correctement configurés (aucune action) : `eclipse-solaire` (12/08), `perseides` (12-13/08), `journees-patrimoine` (calcul dynamique), `braderie-lille` (05-06/09).

### Annexe — au-delà de 60 j (pour mémoire, sans alerte)

`echeances-fiscales` (TF 20/10, THRS 20/12 ; TODO 2027) · `fete-science` (02-12/10) · `nobel-prix` (05-12/10) · `semaine-du-gout` (12-18/10) · `bourses-scolaires` (15/10 ; campagne 2027-2028) · `cheque-energie` (31/12 ; TODO printemps 2027) · `versement-prestations-caf` (table 2027 avant janv.) · `cfe-entreprises` (15/12) · `crous-dse` (campagne 2027-2028) · `elections-france` (`ELECTIONS = []` ; présidentielle 18/04 & 02/05 2027 à saisir dès parution du décret de convocation, attendu ~fév. 2027) · fêtes mobiles chrétiennes/musulmanes/juives 2027-2028 · `carnavals` (Dunkerque/Nice 2027) · `geminides` / `beaujolais-nouveau` / `black-friday` (calcul dynamique, RAS).

## Slugs orphelins

**Aucun.** Croisement de `category_slugs` (117 slugs distincts réellement portés par les sources enabled) avec la taxonomie fermée définie dans **`server/categories.js`** (`GROUPS` → `VALID_SLUGS`) : **0 slug orphelin**. Chaque slug en base possède un libellé. (L'inverse — slugs définis mais non utilisés — est normal et non listé.)

## Modération UGC

`suspended_decks` : vide. Aucun deck suspendu par signalements. RAS.

---

_Aucun brouillon correctif nécessaire ce cycle : les seuls points ouverts (404 VigiEau, collisions `display_order`, préparation des calendriers 2027) relèvent soit de la surveillance passive, soit d'une décision produit de Hugo, pas d'un correctif mécanique urgent._
