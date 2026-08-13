# Rapport de veille — 2026-08-04

*Robot 1 (veilleur LECTURE SEULE). Source de vérité : `node scripts/veille-readonly.js`.
Aucune modification effectuée. Contrôle schéma : **cohérent** (pas de bandeau migration).*

## Résumé (rien de grave)

1. **Sources en échec** : quasi toutes connues/attendues ou transitoires (clé SNCF absente, ecowatt 429 auto-throttle, NOAA JSON illisible, timeouts API tierces). **Deux points à confirmer** : (a) `risque-secheresse` broadcast renvoie encore VigiEau 404 ce matin (06:31) alors que le dernier commit visait « Fix risque-secheresse 404 nocturne » → vérifier que le correctif est bien déployé ; (b) grappe de 5 sources INSEE en 500 (dernier 02/08) → panne serveur INSEE probablement transitoire, à re-vérifier.
2. **Schéma DB cohérent** (55 colonnes attendues, 0 manquante, 0 type inattendu).
3. **Slugs orphelins** : aucun (les 143 slugs utilisés en base existent tous dans `server/categories.js`).
4. **TODO calendaires ≤ 60 j** : plusieurs configs annuelles arrivent à terme cet automne (marées oct., prix littéraires, échéances fiscales oct., bourses 15/10, Bison Futé) — détail en section dédiée.
5. **Vitalité PanneauPocket curée** : section `panneaupocket_vitality` revenue **vide** ce run → aucun proxy émis, contrôle non concluant (voir limite de méthode).

`meta` : 265 sources enabled, 35 combinaisons paramétrées.

---

## Cohérence schéma

`schema_check.ok = true` — 55 colonnes attendues, aucune manquante, aucun type inattendu. RAS.

---

## Sources en échec (`failing_sources`)

| Source | Échecs/7j | Dernier message | Lecture |
|---|---|---|---|
| sncf-perturbations | 134 | `SNCF_API_KEY absente` | **Normal** — clé non configurée sur Railway (var d'env, pas de code). Déjà consigné. |
| lancement-spatial | 48 | Timeout Launch Library (>10 s) | Transitoire — API communautaire lente, pas de régression. |
| prix-logements-anciens | 36 | INSEE 500 | Grappe INSEE (voir ci-dessous). |
| inflation-insee | 35 | INSEE 500 | idem. |
| indice-reference-loyers | 34 | INSEE 500 | idem. |
| ipc-alimentaire | 34 | INSEE 500 | idem. |
| chomage-stats | 32 | INSEE 500 | idem. |
| ecowatt | 23 | `HTTP 429, prochain cycle` | **Normal** — auto-throttle géré par la source (repli propre). |
| risque-secheresse | 19 | VigiEau 404 | **À confirmer** (voir ci-dessous). |
| aurores-france | 10 | NOAA JSON illisible | Réponse NOAA malformée, intermittent → `inactive`, pas de faux positif. |
| tempete-solaire | 8 | NOAA JSON illisible | Même famille NOAA, intermittent. |
| vigicrues-departement | 4 | Timeout Vigicrues (>10 s) | Transitoire. |
| statut-twitch | 2 | Timeout status.twitch.tv | Transitoire (2 occurrences). |

**Grappe INSEE (5 sources, HTTP 500)** — `prix-logements-anciens`, `inflation-insee`, `indice-reference-loyers`, `ipc-alimentaire`, `chomage-stats` échouent toutes sur des 500 renvoyés par l'API INSEE SDMX, tous datés du **02/08** (dernier échec). Signature typique d'une indisponibilité serveur INSEE côté amont, pas d'un bug local. Ces sources publient de toute façon rarement (publications définitives). **Action : aucune**, re-vérifier au prochain run que les 500 ont cessé ; si la grappe persiste plusieurs jours, escalader à Hugo.

**risque-secheresse (broadcast, VigiEau 404)** — le combo broadcast (`params:null`) échoue encore sur `VigiEau : 404`, dernier échec **2026-08-04 06:31** (donc ce matin). Le dernier commit du repo est `8497215 Fix risque-secheresse 404 nocturne`. Deux hypothèses, non tranchables sans intervention : soit le correctif n'est pas encore déployé en prod, soit il ne couvre pas ce chemin broadcast. **À noter** : les combinaisons paramétrées `risque-secheresse` (dépts 06/14/16/53) sont bien `active` — l'échec ne concerne que la sonde broadcast. RAPPORT uniquement : à confirmer par Hugo côté déploiement.

---

## États figés (`stale_states`) — bruit attendu

Long inventaire de `checked_at` anciens, **tous sur des états `inactive`** de sources/combinaisons inactives → **NORMAL** au vu du caveat (checked_at non rafraîchi en still-inactive tant que l'étape B n'est pas déployée). Aucune entrée figée n'est corroborée par `failing_sources` sur un état `active`/`pending`. Les quelques combos `active` figés (vigilance-meteo dépts 13/24/31/33/…, rappel-conso, risque-secheresse, iss-passages gap) correspondent à des états réellement actifs et stables, pas à un blocage. **Rien à signaler.**

---

## Jamais actives 90 j (`never_active_90d`) — normal

La liste est dominée par : sources **saisonnières hors saison** (Beaujolais, Black Friday, soldes, éclipses/géminides, prime de Noël, fêtes religieuses, prix Nobel, semaine bleue…), **cartes de statut** de services qui n'ont simplement pas eu de panne (statut-*), et **sources récemment ajoutées** (vagues juillet, cartes PanneauPocket curées, veille-agenda, tâche à échéance). Aucune source « censée s'activer souvent » et muette anormalement détectée. **Rien à signaler.**

---

## Collisions d'ordre d'affichage (`display_order_collisions`) — cosmétique

11 collisions, toutes dans la plage 40-59 (mélange sources de statut / événements calendaires). Exemples : `40` (doomname + statut-github), `51` (black-friday + soldes + statut-zoom), `56` (eclipse-solaire + geminides + nuits-des-etoiles). Impact = ordre d'affichage indéterministe entre ex-æquo, sans gravité. Un ré-échelonnement de la plage 40-59 est possible si Hugo veut un ordre stable, **sans urgence**.

---

## TODO calendaires — échéances ≤ 60 jours (04/08 → 03/10/2026)

Configs annuelles codées en dur dont les données courantes expirent ou dont l'édition en cours tombe dans la fenêtre. **Renouvellement à prévoir** (RAPPORT uniquement) :

| Fichier source | Échéance / dates | Renouvellement |
|---|---|---|
| `bison-fute.js` | derniers jours classés 08/08, 15/08, 28/08 | Calendrier 2026 épuisé fin août → TODO 2027 à charger dès publication. |
| `grandes-marees.js` | 13-15/08, 11-13/09, **27/10** | Config expire fin octobre → transcrire périodes coeff ≥ 100 (2027, maree.info/SHOM). |
| `echeances-fiscales.js` | TF 15-20/10, THRS 15-20/12 | Entrée 2027 à ajouter début 2027 (au-delà mais table pilotée par années). |
| `prix-litteraires.js` | Goncourt/Renaudot/… fin oct.-début nov. | TODO annuel : recurer à l'automne dès annonces. |
| `bourses-scolaires.js` | 15/10 | Fenêtre courante ; TODO 2027-2028 dès parution. |
| `semaine-bleue.js` | 05-11/10 | Dates officielles à confirmer (non annoncées au 18/07). |
| `fete-science.js` | 02-12/10 | Édition en cours OK ; TODO 2027 avant 30/09/2027. |
| `nobel-prix.js` | 05-12/10 | Dates à revérifier depuis nobelprize.org. |
| `patrimoine-nature.js` | 29-31/08, 10/10, 29/10-01/11 | Éditions à confirmer/compléter. |

Passé/récurrent sans action : `eclipse-solaire` (12/08, événement à venir), `perseides`/`nuits-des-etoiles` (07-13/08), `allocation-rentree-scolaire` (05 & 19/08), `rentree-scolaire` (01/09), `braderie-lille` (05-06/09), `jour-depassement` (30/07 passé), `soldes`/`changement-heure` (règles fixes calculées).

**> 60 jours (annexe courte)** : dates 2027 déjà codées pour carnavals, fashion-week, japan-expo, festival-livre-paris, francophonie (20/03), Cannes, rendez-vous-aux-jardins, fêtes religieuses (Roch Hachana 12/09, Yom Kippour 21/09, Hanoucca 12/2026…), plus fin d'année 2026 : prime-noel (16/12), cheque-energie (31/12), cfe-entreprises (15/12), fete-des-lumieres (05-08/12). Sources en sommeil assumé (config vide, TODO à parution) : `elections-france`, `tour-de-france-passage`, `tours-cyclistes-outremer`, `ouverture-ventes-sncf`.

---

## Slugs orphelins — RAS

Croisement de `category_slugs` (143 slugs réellement utilisés en base) avec la taxonomie fermée déclarée dans **`server/categories.js`** (constante `GROUPS`). **Aucun slug orphelin** : tous les slugs utilisés existent dans la taxonomie → aucune carte ne s'affichera avec un slug brut. (L'inverse — slugs définis mais non utilisés — est normal et non signalé.)

---

## Vitalité PanneauPocket curée (Vague L)

**Section `panneaupocket_vitality` revenue vide (`[]`) ce run** — aucun proxy émis pour le jeu curé. Le contrôle de vitalité n'est donc **pas concluant aujourd'hui** ; il ne faut pas en conclure que les cartes sont vivantes, seulement que la donnée n'a pas été produite.

Jeu curé attendu (bâti sur `lib/panneaupocket-veille.js`, `makeCurated`) : 18 cartes broadcast vague L (6 eau, 3 déchets, 3 gendarmerie, 4 infos locales, agenda-luc-en-diois, cantine-a2m2v) + `arrosage-canal-gap`.

**Limite de méthode (rappel, à énoncer tel quel)** : la base ne stocke **aucune date de publication de panneau** (`ref` = couples `[panneauId, hash]`). La « date du panneau le plus récent » n'est donc **pas dérivable** sans requêter PanneauPocket (interdit la nuit). Le seul proxy en base est `last_activated_at`, qui **sous-estime** la vitalité (panneaux hors filtre thématique ou cosmétiques = aucun événement alertable). **Proposition (non implémentée)** : persister la date du dernier panneau vu dans `ref` donnerait un proxy fiable sans fetch nocturne — à décider par Hugo. En attendant, aucune carte n'est marquée « candidate à désactivation » faute de données ce run.

---

## Combos orphelins & stabilité des ids `?panneau=`

- **Combos orphelins** (`orphan_param_states.count = 26`) : 26 lignes `source_param_states` sans abonnement portant encore le couple `(source_id, params)` — reliquat de désabonnements. Échantillon dominé par `vigilance-meteo` (dépts 10/13/16/24/31/33/35/38/44/67/69/74/75/83…), `ma-collectivite` (URLs PanneauPocket 05), `risque-secheresse` (06/14/16/53), `rappel-conso`, `iss-passages` (gap). **Purge = décision humaine**, aucun `DELETE` effectué. Sans impact fonctionnel (ces états ne sont plus calculés que s'ils sont re-souscrits).
- **Stabilité des ids `?panneau=`** (point de vigilance ouvert, consigné en tête de `ma-collectivite.js`) : si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme « nouveau ». Non mesurable sans fetch réseau (interdit) → **signalé comme vigilance, sans alarme**.

---

*Fin du rapport. Aucun fichier autre que celui-ci n'a été écrit ; aucune commande git/SQL/migration/réseau exécutée.*
