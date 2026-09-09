# Rapport de veille — 2026-08-16

> Robot 1 — veille automatique nocturne. Lecture seule. Aucune modification effectuée.
> Base : 267 sources enabled, 36 combinaisons paramétrées actives.

---

## Résumé (5 lignes max)

1. **`statut-anthropic` — erreur TLS réelle** (6 échecs) : le cert présenté par `status.anthropic.com` est pour `*.statuspage.io`, pas pour le domaine Anthropic → source en échec permanent jusqu'à correction.
2. **`lancement-spatial` — timeout répété** (48 échecs) : API Launch Library instable côté serveur tiers. À surveiller dans la durée.
3. **Slug `communaute` orphelin** : utilisé par `chat-perdu` et `chien-perdu`, absent de la taxonomie `server/categories.js` → ces cartes affichent le slug brut au lieu d'un libellé.
4. **`grandes-marees.js` — calendrier 2026 épuisé fin octobre** : sans mise à jour, la source sera dormante après le 27 oct 2026. TODO 2027 à anticiper idéalement en septembre.
5. **`panneaupocket_vitality` non disponible** : la requête du script a échoué (array vide inattendu), vitalité des curées non évaluable ce run.

---

## Sources en échec

### ⚠️ `statut-anthropic` — 6 échecs, dernier 14/08

Erreur : `Hostname/IP does not match certificate's altnames: Host: status.anthropic.com. is not in the cert's altnames: DNS:*.statuspage.io, DNS:statuspage.io`

Le domaine `status.anthropic.com` est probablement un CNAME vers un hébergeur Statuspage. Node.js valide le cert contre l'hôte de l'URL d'origine (`status.anthropic.com`) : si le cert présenté ne couvre que `*.statuspage.io`, la connexion échoue. Ce n'est pas un problème transitoire — la source échoue à chaque cycle depuis plusieurs jours. Un brouillon de correctif est proposé en fin de rapport.

### ⚠️ `lancement-spatial` — 48 échecs, dernier 15/08 22h

Timeout API Launch Library (>10 000 ms). Fréquence élevée (48/7j = ~7 échecs/jour). L'API launch-library.net est connue pour des lenteurs ponctuelles mais ce volume est élevé. À noter dans la durée ; si ça persiste la semaine prochaine, envisager d'allonger le timeout ou de changer de source.

### ℹ️ `risque-secheresse` — 9 échecs, dernier 14/08 09h31

404 VigiEau. Un fix pour ce bug avait été commité récemment (commit « Fix risque-secheresse 404 nocturne »). Le dernier échec remonte au 14/08 et il n'y en a pas eu depuis (le script tourne jusqu'au 16/08 01h30) → semble résolu. Signal résiduel du passé.

### ℹ️ `sncf-perturbations` — 134 échecs, CONNU

Clé `SNCF_API_KEY` absente de l'environnement Railway. Documenté dans l'état du projet comme « var à configurer ». Aucune alerte — comportement attendu.

### ℹ️ `ecowatt` — 7 échecs, dernier 15/08

HTTP 429 (trop d'appels). Rate limiting RTE : normal, le poller retente au prochain cycle. Pas d'action requise.

### ℹ️ `bitcoin-mouvement` — 8 échecs, dernier 14/08

Timeout CoinGecko. API tierce, intermittent. Pas de tendance persistante sur les derniers jours.

---

## États figés (stale_states)

La majorité des stale_states sont des sources `inactive` avec un `checked_at` datant de mi-juillet — comportement attendu (étape B non déployée, `checked_at` non rafraîchi en still-inactive). Ce bruit est normal, signalé ici pour mémoire.

**Cas à croiser avec `failing_sources`** : `ecowatt` (figé au 11/07) est aussi dans les failing_sources → confirmé, la source échoue en boucle depuis lors (429 répétés). Cohérent.

**Combos `vigilance-meteo` avec `state: active` et `checked_at` mi-juillet** (9 dépts : 31, 33, 35, 38, 44, 67, 74, 75, 83, 24, 13) : ces combos sont aussi dans les orphelins (cf. section dédiée). Ce sont d'anciens abonnements supprimés, leur état actif figé est le vestige attendu d'un désabonnement sans purge. Sans inquiétude.

---

## Sources jamais actives depuis 90 jours (`never_active_90d`)

La liste est longue (~150 sources). La quasi-totalité sont normales :

- **Saisonnières hors saison** : `beaujolais-nouveau`, `changement-heure`, `black-friday`, `soldes` (hiver), `geminides`, `carnavals`, `saint-nicolas`, `treve-hivernale`… → normal en août.
- **Clé API absente** : `sncf-perturbations` → attendu.
- **Sources de veille sans seuil franchi** : `aurores-france`, `tempete-solaire`, `asteroide-frole-terre`, `ondes-gravitationnelles`… → normal, événements rares.
- **Sources récentes** : `chien-perdu` (créé 15/08), `chat-perdu` (4/08), cartes vague L, `cyclones-outremer` (activée 25/07 mais pas de cyclone en cours)… → trop récentes pour avoir un historique.
- **Sources paramétrable non souscrites** : `veille-page`, `veille-stock`, `veille-emploi`… → aucun abonnement actif = aucun check effectué.
- **Sources config vide** : `billetterie-concerts`, `ouverture-ventes-sncf`, `courses-mythiques`, `tour-de-france-passage`… → attendu (config intentionnellement vide).

Aucun signal anormal dans cette liste.

---

## Collisions d'ordre d'affichage

11 collisions cosmétiques. Les plus notables :

| display_order | Sources en collision |
|---|---|
| 51 | `black-friday`, `soldes`, `statut-zoom` (3 sources) |
| 56 | `eclipse-solaire`, `geminides`, `nuits-des-etoiles` (3 sources) |
| 40 | `doomname`, `statut-github` |
| 42 | `statut-npm`, `statut-openai` |
| 43 | `statut-discord`, `statut-vercel` |
| 50 | `changement-heure`, `statut-twitch` |
| 52 | `perseides`, `statut-canva` |
| 53 | `beaujolais-nouveau`, `statut-dropbox` |
| 54 | `soldes-steam`, `statut-slack` |
| 55 | `aurores-france`, `cert-fr-alertes` |
| 59 | `echeances-fiscales`, `journees-patrimoine` |

Cosmétique pur (ordre de tri secondaire aléatoire). À rééchelonner quand l'occasion se présente, sans urgence.

---

## TODO calendaires ≤ 60 jours (fenêtre jusqu'au 15 octobre 2026)

### ⚠️ `grandes-marees.js` — À planifier avant fin septembre

Commentaire en tête du fichier : *"TODO 2027 : transcrire les périodes de coeff ≥ 100 depuis maree.info / SHOM. Sans mise à jour, la source reste dormante après octobre 2026."*

Dernière période codée : **27 oct 2026**. Sans mise à jour, la source s'éteint silencieusement début novembre. Délai conseillé : renseigner les dates 2027 en septembre, avant la grande marée d'octobre (la source doit rester active sans trou). Source : maree.info / SHOM.

### ℹ️ `bison-fute.js` — Dernière date le 28 août

Dernière date codée : `2026-08-28` (retours). Après cette date la source renvoie `inactive` automatiquement — comportement correct, pas d'alarme. Le TODO 2027 ne sera actionnable qu'en début 2027 (calendrier officiel non publié avant). Aucune action requise dans les 60 jours.

### ℹ️ `echeances-fiscales.js` — TF le 15/10 (exactement J+60)

Taxe foncière : papier le **15 oct 2026**, en ligne le **20 oct 2026**. La source est déjà configurée et fonctionnelle. Aucune action requise, la date est en place.

### ℹ️ `allocation-rentree-scolaire.js` — Versement le 19 août (dans 3 jours)

Dates codées : 5 août (Réunion/Mayotte, déjà passé) et **19 août 2026** (métropole/Antilles). La source est configurée et active. À surveiller que l'alerte parte bien le 19 août. TODO 2027 à faire mi-2027.

### ℹ️ `rdv-gaming.js` — gamescom 26-30 août (dans 10 jours)

Date codée, source configurée. RAS. Paris Games Week (22-25 oct) est juste au-delà de la fenêtre des 60 jours mais déjà codée.

**Annexe — au-delà de 60 jours (pas d'alerte) :** `fete-science` (2-12 oct), `semaine-bleue` (5-11 oct), `nobel-prix` (5-12 oct), `braderie-lille` (5-6 sept — déjà codée), `rentree-scolaire` (1er sept — déjà codée), `journees-patrimoine` (calculée dynamiquement). Tous configurés.

---

## Slug orphelin

Le slug **`communaute`** est utilisé en base par `chat-perdu` et `chien-perdu` mais est absent de la taxonomie fermée définie dans `server/categories.js`. Ces cartes afficheront le slug brut `communaute` au lieu d'un libellé humain (ex. « Communauté »).

C'est vraisemblablement un oubli au moment de l'ajout des cartes communautaires (les fils 04/08 et 15/08). L'ajout du slug est une opération mineure dans `server/categories.js`.

---

## Cohérence schéma

`schema_check.ok: true` — aucune colonne manquante, aucun type inattendu. RAS.

---

## Vitalité des cartes PanneauPocket curées (tâche f)

**⚠️ Limite de ce run — données non disponibles.** La section `panneaupocket_vitality` du JSON est retournée vide (`[]`), ce qui est anormal : la requête Q_PP_VITALITY porte sur les 267 sources enabled non-linked et ne peut logiquement pas renvoyer 0 ligne. Le bloc `try/catch` du script a vraisemblablement intercepté une exception (la cause la plus probable est l'absence de la table `source_events` en base, ou un problème sur la colonne `ref` — je ne peux pas le confirmer sans DB directe). En conséquence, **la vitalité des 19 cartes curées n'est pas évaluable ce run**.

**Jeu curé identifié dynamiquement** (19 sources) : les fichiers `server/sources/*.js` qui `require('./lib/panneaupocket-veille')` ET utilisent `makeCurated`/`createBroadcastSource` (hors `panneaupocket` et `ma-collectivite`, paramétrées exclues) :

| Famille | Sources |
|---|---|
| Eau (6) | `eau-regie-metz`, `eau-provence-verte`, `eau-isle-dronne`, `eau-charles-chaigneau`, `eau-puisaye-forterre`, `eau-coteaux-lizon` |
| Déchets (3) | `dechets-saulieu`, `dechets-la-saucelle`, `dechets-campagne-caux` |
| Gendarmerie (3) | `securite-gendarmerie-albi`, `securite-gendarmerie-bayeux`, `securite-gendarmerie-essarts` |
| Infos locales (4) | `local-chablis`, `local-agly-fenouilledes`, `local-buech-devoluy`, `local-chabris-bazelle` |
| Agenda/cantine (2) | `agenda-luc-en-diois`, `cantine-a2m2v` |
| Arrosage (1) | `arrosage-canal-gap` |

**Rappel de méthode** : même si les données avaient été disponibles, `last_activated_at` sous-estime la vitalité (panneaux hors filtre thématique ou cosmétiques ne déclenchent pas d'événement). Toute conclusion sur la désactivation d'une carte doit être confirmée manuellement via l'application PanneauPocket.

**Point de vigilance — stabilité des ids `?panneau=`** : si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme « nouveau panneau ». Non mesurable sans fetch réseau (interdit ce run). Point ouvert, documenté en tête de `server/sources/ma-collectivite.js`.

---

## Combos orphelins (source_param_states sans abonnement)

**26 lignes orphelines** dans `source_param_states`. Échantillon représentatif :

- `iss-passages` / `{"ville":"gap"}` (state: active) — abonnement de test probable
- `ma-collectivite` / 5 URLs de collectivités Hautes-Alpes — désabonnements
- `rappel-conso` / `alimentation` et `bébés-enfants` — désabonnements
- `risque-secheresse` / dépts 06, 14, 16, 53 — désabonnements
- `vigilance-meteo` / 13 combos de département — désabonnements (la famille la plus représentée)

Compte total : 26. Reliquat normal de désabonnements. **Aucune purge effectuée.** La décision de purger appartient à Hugo.

---

## BROUILLON — À valider par Hugo avant toute exécution

### Correctif `statut-anthropic` — erreur TLS

**Problème :** `status.anthropic.com/api/v2/status.json` présente un cert `*.statuspage.io` → TLS mismatch fatal.

**Cause probable :** `status.anthropic.com` est un CNAME vers un endpoint Atlassian Statuspage hébergé sous leur domaine propre, mais le cert TLS servi par le CDN est celui de Statuspage et non un cert couvrant `status.anthropic.com`. Ce n'est pas un bug du code — c'est la config côté Anthropic/Atlassian.

**Option à tester :** Certains services Statuspage sont aussi accessibles via leur endpoint Statuspage natif (ex. `anthropic.statuspage.io`). Si ce domaine existe et renvoie les mêmes données, remplacer `statusHost` dans `server/sources/statut-anthropic.js` :

```js
// AVANT
module.exports = createStatusSource({
  id: 'statut-anthropic', serviceName: 'Anthropic',
  statusHost: 'https://status.anthropic.com', url: 'https://status.anthropic.com',
});

// APRÈS (à vérifier manuellement qu'anthropic.statuspage.io est accessible et renvoie le bon JSON)
module.exports = createStatusSource({
  id: 'statut-anthropic', serviceName: 'Anthropic',
  statusHost: 'https://anthropic.statuspage.io', url: 'https://status.anthropic.com',
});
```

Le champ `url` (lien public) resterait sur `status.anthropic.com` (URL visible par l'utilisateur) ; seul `statusHost` (URL de l'API) changerait.

**⚠️ À vérifier manuellement avant d'appliquer :** `curl https://anthropic.statuspage.io/api/v2/status.json` (depuis le shell Railway ou un terminal) pour confirmer que l'endpoint existe et renvoie le bon format JSON.

**Non exécuté par le robot.**

---

### Correctif slug `communaute` manquant dans la taxonomie

**Problème :** Le slug `communaute` est utilisé en base par `chat-perdu` et `chien-perdu` mais absent de `server/categories.js`.

**Correctif à valider :** Ajouter `communaute` dans le groupe approprié de `server/categories.js` (exemple : groupe `vie-locale` ou un nouveau groupe `communaute`). Le libellé exact et le groupe sont à décider par Hugo.

**Non exécuté par le robot.**
