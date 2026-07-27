# Rapport de veille — 2026-07-27

> ⚠️ **MIGRATION PROBABLEMENT NON APPLIQUÉE : colonne `subscribers.view_mode` manquante en base (attendue par `init.sql`, absente en prod) → exécuter `node server/db/migrate.js` dans le shell Railway.**
> RAPPORT SEULEMENT — aucun `ALTER`/`migrate` lancé par le robot.
> Contexte probable : chantier « mode d'affichage (liste/grille) » en cours et **non déployé** (fichiers `public/js/view-mode.js` + `public/js/list-view.js` non versionnés, `init.sql` + `routes/myalerts.js` modifiés localement d'après `git status`). Cas classique « push ≠ déployé » : si le code partait en prod sans migrate, la colonne manquerait. Dégradation silencieuse attendue côté code, mais à régulariser **avant** tout déploiement du chantier view_mode.

---

## Résumé (points saillants, par importance)

1. **Schéma** : `subscribers.view_mode` manquante en prod (cf. bandeau). Seul vrai signal du run.
2. **Sources en échec** : toutes explicables. Causes connues/attendues (SNCF sans clé, leboncoin DataDome) ou transitoires (timeouts INSEE/Vigicrues, 429 EcoWatt, 503 JPL). **Une seule à surveiller** : `risque-secheresse` = VigiEau **404** persistant (15 échecs) — possible changement d'endpoint, à confirmer.
3. **Combos orphelins** : 23 lignes `source_param_states` sans abonnement (reliquat de désabonnements) — purge = décision humaine.
4. **Vitalité PanneauPocket curée** : RAS — les 19 cartes ont été créées le 24/07 (il y a 3 j), aucune n'atteint le seuil 90 j ; section `panneaupocket_vitality` vide (proxy non disponible).
5. **Cosmétique** : 11 collisions `display_order` (plage 40-59, statuts/saisonniers). Slugs orphelins : **aucun**.

Cadre du run : 262 sources enabled, 32 combinaisons paramétrées.

---

## Cohérence schéma
`schema_check.ok = false` — 1 colonne manquante : `subscribers.view_mode` (aucun `type_mismatch`). Voir bandeau en tête. À rapprocher du chantier view_mode local non déployé.

## Sources en échec (`failing_sources` = signal qui fait foi)

**Causes connues / attendues — aucune action, comportement normal :**
- `sncf-perturbations` (138) — `SNCF_API_KEY absente`. Clé attendue non posée (liste de courses n°5). Normal.
- `leboncoin-livraison` (130) — blocage anti-bot DataDome (IP datacenter). Connu, par vagues. Normal.
- `ecowatt` (37) — HTTP 429 « appel trop fréquent, prochain cycle ». Auto-throttle bénin.
- `asteroide-frole-terre` (3) — JPL 503 transitoire. Normal.

**Transitoires (timeouts) — à surveiller sans alarme :**
- Cluster **INSEE BDM** : `indice-reference-loyers` (7), `prix-logements-anciens` (7), `inflation-insee` (6), `ipc-alimentaire` (6), `chomage-stats` (5). Tous « Timeout INSEE BDM », derniers échecs 24-25/07. Endpoint INSEE lent par moments — sources mensuelles/trimestrielles, impact faible. À reconfirmer au prochain run.
- `vigicrues-departement` (15) — « Timeout API Vigicrues ». Transitoire, dernier échec 26/07 16h.
- `lancement-spatial` (42) — « Timeout Launch Library (>10s) ». Récurrent mais non bloquant ; candidat à surveiller si persistance.

**À confirmer (niveau bas) :**
- `risque-secheresse` (15) — « Réponse HTTP inattendue VigiEau : **404** », dernier échec 27/07 01h. Un 404 **persistant** (≠ timeout) peut indiquer un changement de route côté VigiEau/RegLeau. À vérifier par Hugo (test manuel de l'endpoint). Les combinaisons souscrites (dépts 06/14/16/53) restent `active` en base — pas de perte d'état.

## États figés (`stale_states` — signal SECONDAIRE, caveat appliqué)
Rien de suspect. Conformément au caveat (`checked_at` non rafraîchi en still-inactive tant que l'étape B n'est pas déployée), les nombreux `checked_at` anciens sur sources/combos **inactives** sont **normaux**. Les entrées `active` figées (vigilance-meteo dépts, risque-secheresse, rappel-conso, iss-passages/gap) ne sont pas corroborées par `failing_sources` (hors risque-secheresse, déjà traité ci-dessus) → bruit attendu.

## Jamais actives (90 j)
RAS notable. La liste est dominée par des sources **saisonnières hors saison** (beaujolais, black-friday, soldes-steam, geminides, changement-heure, prime-noel…), des **statuts cloud** (rarement en incident) et des sources **récemment ajoutées** (vagues 2026, cartes vague L du 24/07). Aucune source censée s'activer souvent et anormalement muette.

## Collisions d'ordre d'affichage (cosmétique)
11 collisions, toutes dans la plage **40-59** (mélange statuts cloud / sources saisonnières) :
`40` doomname+statut-github · `42` statut-npm+statut-openai · `43` statut-discord+statut-vercel · `50` changement-heure+statut-twitch · `51` black-friday+soldes+statut-zoom (×3) · `52` perseides+statut-canva · `53` beaujolais-nouveau+statut-dropbox · `54` soldes-steam+statut-slack · `55` aurores-france+cert-fr-alertes · `56` eclipse-solaire+geminides+nuits-des-etoiles (×3) · `59` echeances-fiscales+journees-patrimoine.
Sans urgence. Un ré-échelonnement de la plage 40-59 est possible si l'ordre d'affichage de ces cartes gêne, mais l'impact est purement visuel.

## TODO calendaires — échéance ≤ 60 j (avant 2026-09-25)
**Aucun rechargement de config codée en dur n'est réellement requis dans les 60 j.** Les événements qui « tombent » dans la fenêtre sont soit **auto-calculés** (perséides 12/08, journées-patrimoine 19-20/09, changement d'heure, jours fériés, vacances scolaires), soit de simples **dates 2026 déjà transcrites** qui se déclencheront normalement (rentrée 01/09, ARS 19/08, braderie-lille 05-06/09). Les **renouvellements 2027** des sources annuelles ont leurs échéances **en octobre+** (hors fenêtre, cf. annexe).

Point de vigilance proche de la fenêtre :
- `ouverture-ventes-sncf.js` — config **vide**, TODO « septembre 2026 » (dates non annoncées au 15/07). À surveiller à l'ouverture des ventes.
- `tour-de-france-passage.js` — config **vide** (parcours 2027 à transcrire dès l'annonce officielle **octobre 2026**) + créer `tdf-villes-etapes` à la même échéance (conception tranchée). Hors 60 j mais rappel calendaire ferme.

### Annexe — renouvellements au-delà de 60 j (consultatif, pas d'alerte)
`bison-fute.js` (calendrier 2026 en dur → 2027 attendu oct.) · `echeances-fiscales.js` (TF ~20/10, THRS déc. ; 2027 dès parution impots.gouv.fr) · `nobel-prix.js` (05-13/10/26) · `semaine-du-gout.js` (12/10) · `semaine-bleue.js` (05-11/10) · `fete-science.js` (02-12/10) · `grandes-marees.js` (27/10 ; 2027 à transcrire) · `cheque-energie.js` / `prime-noel.js` / `cfe-entreprises.js` (déc.) · `taux-livret-a.js` (révision 01/02/27) · fêtes religieuses (dates 2027 déjà codées, TODO 2028).

## Slugs orphelins
RAS. Taxonomie front = `server/categories.js`. Tous les slugs utilisés en base y sont définis — **aucun orphelin** (aucune carte ne s'affichera avec un slug brut).

## Vitalité PanneauPocket curée (Vague L)
Jeu curé identifié dynamiquement (19 cartes broadcast via `lib/panneaupocket-veille`, hors `panneaupocket`/`ma-collectivite`) :
`arrosage-canal-gap`, `eau-regie-metz`, `eau-provence-verte`, `eau-isle-dronne`, `eau-charles-chaigneau`, `eau-puisaye-forterre`, `eau-coteaux-lizon`, `dechets-saulieu`, `dechets-la-saucelle`, `dechets-campagne-caux`, `securite-gendarmerie-albi`, `securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts`, `local-chablis`, `local-agly-fenouilledes`, `local-buech-devoluy`, `local-chabris-bazelle`, `agenda-luc-en-diois`, `cantine-a2m2v`.

**RAS — aucune candidate à désactivation.** Ces cartes ont été créées le **24/07/2026** (il y a 3 jours) ; aucune n'atteint le seuil de 90 j sans panneau. La section `panneaupocket_vitality` du JSON est **vide** (aucun proxy `last_activated_at` émis à ce stade).

**Limite de méthode (à énoncer)** : la base ne stocke **aucune date de publication de panneau** (`ref` = couples `[panneauId, hash]` uniquement). La « vitalité » réelle n'est pas dérivable sans requêter PanneauPocket (interdit la nuit). Le seul proxy futur, `last_activated_at`, **sous-estime** la vitalité (panneaux hors filtre thématique = aucun événement alertable). Recommandation (non implémentée) : pour fiabiliser le contrôle 90 j, **persister la date du dernier panneau vu dans `ref`** — sinon la première évaluation utile n'aura de sens qu'après ~90 j d'observation. La priorité de re-vérification humaine reste la famille **gendarmerie** (massivement dormante ~85 %, cf. état-projet).

## Combos orphelins & stabilité des ids `?panneau=`
- **Combos orphelins** : `orphan_param_states.count = 23` — lignes `source_param_states` dont plus aucun abonnement ne porte le couple `(source_id, params)` (reliquat de désabonnements). Échantillon : `iss-passages/gap`, plusieurs `ma-collectivite` (URLs Oze/Valserres…), `rappel-conso` (alimentation, bébés-enfants), `risque-secheresse` (06/14/16/53), nombreux `vigilance-meteo` (dépts). **Purge = décision humaine** (aucun `DELETE` par le robot). ⚠️ rappel méthode : comparer les `params` jsonb via `IS NOT DISTINCT FROM`, pas `=`.
- **Stabilité des ids `?panneau=`** (point de vigilance ouvert, non mesurable sans fetch réseau interdit) : si PanneauPocket régénère l'id d'un panneau à l'édition, une simple modification apparaîtrait comme « nouveau ». À basculer sur un id interne si le symptôme est constaté côté humain. Signalé sans alarme.

---

## BROUILLON — à valider par Hugo avant toute exécution

Ce brouillon décrit un correctif possible pour le **seul** vrai signal du run. Il n'est **pas** exécuté par le robot et n'est **pas** validé.

**Migration `subscribers.view_mode`** — dans le shell **Railway** (pas en local : le `.env` local pointe la PROD) :

```
node server/db/migrate.js
```

Puis contrôle schéma à chaud (lecture seule, `information_schema`) pour vérifier la présence de la colonne, et vérifier au démarrage la ligne `[poller] N source(s) chargée(s)`. Ordre recommandé pour ce chantier à colonne nouvelle : **migrate → push → redeploy → vérif** (le code doit tolérer l'absence de colonne via dégradation silencieuse). À ne faire **qu'au moment de déployer** le chantier view_mode (fichiers actuellement non versionnés).
