# Rapport de veille — 2026-08-15

> Généré automatiquement par Robot 1 (LECTURE SEULE). Aucune modification apportée à la base ou au code.
> Contexte : 266 sources enabled, 36 combinaisons paramétrées suivies.

---

## Résumé

3 points à traiter, aucun critique :

1. **`statut-anthropic`** — erreur de certificat TLS (6 échecs) : l'endpoint status.anthropic.com présente un certificat pour `*.statuspage.io` → URL probablement périmée.
2. **`lancement-spatial`** — timeouts persistants API Launch Library (50 échecs) : dégradation continue à surveiller.
3. **Slug orphelin `communaute`** — utilisé par `chat-perdu` en base, absent de la taxonomie `server/categories.js` → la carte affiche le slug brut.
4. **`echeances-fiscales` TF** dans ~61 jours (15 oct. 2026) — pas d'action requise côté code, mais à confirmer que l'annonce Bison Futé 2027 fera l'objet du TODO de début d'année.
5. Bison Futé : dernier jour 2026 = 28 août (dans 13 jours). TODO 2027 documenté, non urgent avant janvier.

---

## Cohérence schéma

`schema_check.ok === true` — 58 colonnes attendues, 0 manquante, 0 type_mismatch. **RAS.**

---

## Sources en échec

| Source | Échecs (7 j) | Dernier message | Analyse |
|---|---|---|---|
| `sncf-perturbations` | 133 | SNCF_API_KEY absente | **Connu, attendu.** Variable non configurée sur Railway. Pas un bug code. |
| `lancement-spatial` | 50 | Timeout API Launch Library (>10 000 ms) | **À surveiller.** Timeouts persistants depuis plusieurs jours ; API communautaire sans SLA. Pas de fausse alerte possible (still-inactive), mais la source est muette. |
| `bitcoin-mouvement` | 9 | Timeout CoinGecko (>10 000 ms) | **Probablement transitoire.** Dernier échec 14/08 21h30. CoinGecko connu pour des pics de latence. Aucun abonné actif (source jamais activée depuis 90+ jours). |
| `risque-secheresse` | 9 | Réponse HTTP inattendue VigiEau : 404 | **À vérifier.** VigiEau renvoie 404 depuis le 14/08 matin. Peut indiquer un changement d'endpoint. Les 4 combinaisons abonnées sont dans `orphan_param_states` (désabonnements) → aucun abonné actif impacté, mais la source est cassée. |
| `statut-anthropic` | 6 | TLS : Host status.anthropic.com hors altnames (DNS:*.statuspage.io) | **Bug réel.** Le certificat présenté par le serveur cible est pour `*.statuspage.io`, pas pour `status.anthropic.com`. L'endpoint ou la configuration TLS a changé côté Anthropic. |
| `ecowatt` | 5 | Timeout API EcoWatt (>10 000 ms) | **À surveiller.** EcoWatt est aussi en `never_active_90d` et `stale` (checked_at 11/07, très ancien). Timeouts récurrents ; API RTE parfois lente hors saison. Pas d'abonné actif connu. |

---

## États figés (stale)

Signal **secondaire** conformément au caveat : `checked_at` n'est rafraîchi que sur écriture ; une source `inactive` stable ne met jamais à jour ce champ. La quasi-totalité des entrées stale sont des sources saisonnières dormantes hors saison, des veilles paramétrées sans combinaison souscrite active, ou des sources techniques inactives. **Aucune entrée stale n'est corroborée par `failing_sources` à l'exception des 6 cas déjà traités ci-dessus.**

Les 9 vigilance-meteo actives en stale (checked_at mi-juillet) sont dans `orphan_param_states` — désabonnements intervenus depuis. Bruit attendu.

---

## Jamais actives depuis 90 jours

La liste `never_active_90d` compte environ 160 sources. Analyse de pertinence :

- **Saisons / événements futurs** : black-friday (nov.), beaujolais-nouveau (nov.), geminides (déc.), changement-heure (oct.), treve-hivernale (nov.), saint-nicolas (déc.), prime-noel (déc.), soldes (janv.), carnavals (fév.), saints-de-glace (mai), etc. → **totalement normal hors saison**.
- **Clés API absentes** : sncf-perturbations → **attendu**.
- **Sources récentes jamais déclenchées** : toutes les sources de la vague de fin juillet (vague L, vagues paramétrées) sont créées depuis <30 jours → **normal à l'amorçage**.
- **À noter** : `ecowatt` (energy) jamais activée depuis sa création (11/07) alors que la saison de tension réseau est hivernale → normal. `lancement-spatial` jamais active ET en timeout persistant → cohérent avec la dégradation API signalée ci-dessus.
- **`doomname`** (source externe, type `external`) : jamais activée depuis 11/07. Cohérent avec `doomname.com` qui ne signale une alerte que sur trigger produit.

**Aucun cas anormal détecté dans cette section au-delà de ce qui est déjà signalé.**

---

## Collisions d'ordre d'affichage

11 collisions `display_order` détectées (cosmétique, aucun impact fonctionnel) :

| Ordre | Sources en collision |
|---|---|
| 40 | doomname, statut-github |
| 42 | statut-npm, statut-openai |
| 43 | statut-discord, statut-vercel |
| 50 | changement-heure, statut-twitch |
| 51 | black-friday, soldes, statut-zoom (×3) |
| 52 | perseides, statut-canva |
| 53 | beaujolais-nouveau, statut-dropbox |
| 54 | soldes-steam, statut-slack |
| 55 | aurores-france, cert-fr-alertes |
| 56 | eclipse-solaire, geminides, nuits-des-etoiles (×3) |
| 59 | echeances-fiscales, journees-patrimoine |

Proposition de ré-échelonnement possible dans un prochain fil — aucune urgence.

---

## TODO calendaires (≤ 60 jours)

*Fenêtre : 2026-08-15 → 2026-10-14.*

| Source | Fichier | Échéance | Action requise |
|---|---|---|---|
| `bison-fute` | `server/sources/bison-fute.js` | **28 août 2026** (dans 13 j) = dernier jour couvert en 2026 | Aucune action avant 2027. TODO documenté en tête du fichier (ligne 17). Après cette date, aucune alerte n'est émise jusqu'à la mise à jour 2027. |
| `allocation-rentree-scolaire` | `server/sources/allocation-rentree-scolaire.js` | **19 août 2026** (dans 4 j) — date de versement métropole/Antilles-Guyane | Aucune action : date déjà codée en dur dans la source (ligne 16). TODO 2027 documenté. |
| `grandes-marees` | `server/sources/grandes-marees.js` | **11–13 septembre 2026** coeff 102 (dans 27 j) | Aucune action : période déjà codée (ligne 13). Dernière période 2026 = 27 oct. Après, source dormante jusqu'à la mise à jour 2027 (TODO documenté ligne 3). |
| `braderie-lille` | `server/sources/braderie-lille.js` | **5–6 septembre 2026** (dans 21 j) | Aucune action : dates codées (ligne 8). TODO 2027 documenté. |
| `echeances-fiscales` | `server/sources/echeances-fiscales.js` | **15 oct. 2026** (TF papier, dans 61 j) / **20 oct.** (TF online) | Légèrement hors fenêtre 60 j mais à signaler. Aucune action code requise : date déjà codée (ligne 24). TODO 2027 documenté (ligne 14). Les fenêtres d'annonce précèdent la date de ~10 j selon la config. |

**Au-delà de 60 jours (pour mémoire)** : TH/THRS 15 déc., prime-noël 16 déc., festival-livre-paris avr. 27, eclipse-solaire 2027-08-02, Hellfest juin 27, Japan Expo juil. 27.

---

## Slugs orphelins

**1 slug orphelin détecté** : **`communaute`**

Présent dans `category_slugs` (DB) — utilisé par la source `chat-perdu` (type `community`, ajoutée 04/08/2026). Absent de la taxonomie fermée de `server/categories.js` (aucun groupe ne le référence).

Conséquence : la carte `chat-perdu` affichera le slug brut `communaute` sans libellé résolu (selon la logique `toLabel()` du front, qui ne trouvera pas de SPECIAL ni ACCENTS correspondant — le rendu sera « Communaute » avec majuscule, sans accent).

**Suggestion** (décision Hugo) : ajouter `'communaute'` dans le groupe `vie-locale` de `server/categories.js`, ou créer un groupe `communaute` dédié si d'autres types communautaires sont prévus.

---

## Vitalité des cartes PanneauPocket curées (Vague L)

**Jeu curé identifié** (19 sources broadcast qui `require('./lib/panneaupocket-veille')` et utilisent `makeCurated`) :

- Eau (6) : eau-regie-metz, eau-provence-verte, eau-isle-dronne, eau-charles-chaigneau, eau-puisaye-forterre, eau-coteaux-lizon
- Déchets (3) : dechets-saulieu, dechets-la-saucelle, dechets-campagne-caux
- Gendarmerie (3) : securite-gendarmerie-albi, securite-gendarmerie-bayeux, securite-gendarmerie-essarts
- Locales (4) : local-chablis, local-agly-fenouilledes, local-buech-devoluy, local-chabris-bazelle
- Agenda / cantine : agenda-luc-en-diois, cantine-a2m2v
- Irrigation : arrosage-canal-gap

**`panneaupocket_vitality` = tableau vide** — interprétation : `last_activated_at` est NULL pour toutes les cartes curées (aucun panneau alertable depuis leur création).

**Contexte** : toutes ces sources ont été ajoutées autour du 24 juillet 2026 (il y a 22 jours). `last_activated_at = NULL` à J+22 est **normal** pour des sources à filtre thématique strict : la probabilité qu'un panneau d'une entité locale corresponde exactement aux mots-clés du filtre dans ce délai est faible. Les 3 gendarmeries étaient parmi les brigades actives retenues, mais le filtre thématique ne déclenche que sur un sous-ensemble de leurs panneaux.

**⚠️ Limite de méthode (rappel)** : la base ne stocke aucune date de publication de panneau (le `ref` contient des couples `[panneauId, hash]`). Le seul proxy est `last_activated_at`, qui sous-estime la vitalité. Confirmation humaine via l'appli PanneauPocket recommandée à J+90 (autour du 24 octobre 2026) pour les 3 gendarmeries en priorité (famille la plus massivement dormante selon etat-projet.md).

**Statut** : bruit attendu à ce stade — aucune candidate à désactivation identifiable avec certitude avant le seuil des 90 jours.

**Point de vigilance ouvert** : stabilité des ids `?panneau=` à l'édition d'un panneau (consignée en tête de `ma-collectivite.js`). Non mesurable sans appel réseau PanneauPocket. Rien de nouveau à signaler cette nuit.

---

## Combos orphelins & ids `?panneau=`

**Combos orphelins** : 26 entrées `source_param_states` sans abonnement actif. Échantillon :

| Source | Params | État |
|---|---|---|
| iss-passages | `{"ville":"gap"}` | active |
| ma-collectivite | 5 URLs PanneauPocket (oze, valserres, amr-05, veynes, la-batie-vieille) | inactive |
| rappel-conso | alimentation, bébés-enfants | active |
| risque-secheresse | dépts 06, 14, 16, 53 | active |
| vigilance-meteo | 13 combinaisons de départements | active/inactive |

Ces lignes sont des reliquats de désabonnements (tests ou anciens abonnés). **Aucune purge automatique** — décision et exécution réservées à Hugo (DELETE ciblé sur `source_param_states` où la requête ne trouve aucun abonnement correspondant).

**Ids `?panneau=`** : point de vigilance documenté dans `ma-collectivite.js` — si PanneauPocket régénère les ids à l'édition, une modification apparaîtrait comme « nouveau ». Non mesurable cette nuit (interdiction d'appel réseau).

---

## Decks suspendus

`suspended_decks = []` — **RAS.**

---

## BROUILLON — À valider par Hugo avant toute exécution

### [NON VALIDÉ] Correctif statut-anthropic (certificat TLS)

Le code (`server/sources/statut-anthropic.js:6`) pointe sur `https://status.anthropic.com/api/v2/status.json`. Le certificat TLS présenté par le serveur est pour `*.statuspage.io` — ce qui indique que le vrai endpoint est désormais sur un sous-domaine de `statuspage.io` (ex. `anthropicstatus.com` ou similaire, à confirmer sur le site public d'Anthropic).

**À faire par Hugo** :
1. Vérifier l'URL réelle du status Anthropic (ex. chercher `anthropicstatus.com` ou consulter la page status.anthropic.com dans un navigateur pour voir la vraie URL finale).
2. Mettre à jour `server/sources/statut-anthropic.js` (champ `url` + éventuellement `statusHost`).
3. Tester localement avant de pusher.

### [NON VALIDÉ] Slug `communaute` à ajouter à la taxonomie

Dans `server/categories.js`, ajouter `'communaute'` dans un groupe (suggestion : `vie-locale` ou nouveau groupe `communaute` si d'autres cartes communautaires arrivent) :

```js
// Dans GROUPS['vie-locale'] — à vérifier avec Hugo si ce groupe est le bon :
'vie-locale': [...existants..., 'communaute'],

// ou nouveau groupe dédié :
'communaute': ['communaute', 'signalements'],
```

Et dans `SPECIAL` si un libellé exact non dérivable est préféré :
```js
'communaute': 'Communauté',
```

**Décision Hugo** : quel groupe d'appartenance pour `chat-perdu` ?

### [NON VALIDÉ] risque-secheresse — vérification endpoint VigiEau

9 échecs 404 depuis le 14/08. La source était dans les combinaisons testées en juillet (4 combos orphelins). Aucun abonné actif à date. À vérifier : l'endpoint VigiEau `/api/v1/restrictions` (ou équivalent) a-t-il changé ? Consulter [la documentation VigiEau](https://www.vigieau.gouv.fr) hors du contexte nocturne avant de relancer.
