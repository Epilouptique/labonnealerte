# Rapport de veille de maintenance — 2026-07-16

Script : `node scripts/veille-readonly.js` (généré à 2026-07-16T17:45Z).
Périmètre : 130 sources enabled, 16 combinaisons paramétrées.

## Résumé (5 lignes max)

1. **Aucune régression sur les sources FRAGILES surveillées** (meteo-suisse, pannes-hydro-quebec) : absentes de `failing_sources`. RAS de ce côté.
2. Sources en échec = **causes connues/attendues** : DataDome leboncoin, `SNCF_API_KEY` absente, timeouts d'API tierces (EcoWatt, Vigicrues, Launch Library). Aucune panne interne nouvelle.
3. **Un seul TODO calendaire actionnable ≤ 60 j** : `ouverture-ventes-sncf` — recheck manuel début septembre 2026 (config vide, ouverture hiver 2026-27 non annoncée).
4. `never_active_90d` et la majorité des `stale_states` = **bruit attendu** (toute la base a < 90 j — créée à partir du 11/07/2026 — et le caveat `checked_at`/still-inactive s'applique).
5. **Aucun slug orphelin.** 11 collisions `display_order` (cosmétique, sans urgence).

---

## Sources en échec (`failing_sources`)

| Source | Échecs 7j | Dernier message | Lecture |
|---|---|---|---|
| `leboncoin-livraison` | 45 | Blocage anti-bot leboncoin (IP datacenter) | **Attendu.** Scraper DataDome par vagues, connu et documenté. Pas d'action. |
| `sncf-perturbations` | 41 | `SNCF_API_KEY` absente de l'environnement | **Attendu.** Clé sur la liste de courses ; source non fonctionnelle tant que la clé n'est pas posée. Pas d'action technique. |
| `ecowatt` | 28 | Timeout API EcoWatt (>10000 ms) | À surveiller (niveau bas). Dernier échec 11:30 (plus ancien que les autres). RTE OAuth2 — timeout côté API. À reconfirmer au prochain rapport ; pas de régression code visible. |
| `vigicrues-05` | 21 | Timeout API Vigicrues (>10000 ms) | Attendu/connu : dump national lourd sans mapping département (déjà signalé comme non paramétrable proprement). Timeouts récurrents cohérents avec la nature de la source. |
| `lancement-spatial` | 14 | Timeout API Launch Library (>10000 ms) | Transitoire côté API tierce (Launch Library rate-limite/ralentit). Pas d'action. |
| `vigieau-gap` | 2 | Réponse HTTP inattendue VigiEau : 502 Bad Gateway | Transitoire (502), dernier échec 15/07. Sous le seuil d'inquiétude. Simple mention. |

**Conclusion :** aucune panne exigeant une intervention nocturne. `ecowatt` est le seul point à re-regarder si le compteur continue de monter au prochain passage.

## États figés (`stale_states`) — signal SECONDAIRE

Le caveat s'applique : `checked_at` n'est rafraîchi que sur écriture ; un `checked_at` ancien sur une source/combinaison **inactive** est **normal** tant que l'étape B n'est pas déployée. La grande majorité des entrées listées sont `inactive` → **bruit attendu, aucune alarme**.

Entrées `active` figées (les seules à examiner car corroborées par un état actif, non par `failing_sources`) :
- `vigilance-meteo` combos (dép. 31, 33, 35, 38, 44, 67, 74, 75, 83) : `active`, `checked_at` ≈ 2026-07-14T23:04 (~42 h). Probablement le même comportement write:false en still-active (pas d'écriture tant que l'état ne change pas). **Niveau bas** — à confirmer une fois l'étape B déployée ; pas de signe de régression (vigilance-meteo n'est pas dans `failing_sources`).
- `rappel-conso` (categorie=alimentation) : `active`, `checked_at` ≈ 2026-07-15T06:30 (~35 h). Même lecture, niveau bas.

Aucune de ces entrées n'est corroborée par `failing_sources` → pas d'action, simple veille.

## Jamais actives 90 j (`never_active_90d`)

**Signal actuellement non exploitable / bruit intégral.** Toutes les sources ont un `created_at` compris entre le 11/07/2026 et le 15/07/2026 : **la base entière a moins de 90 jours**. Le critère « jamais activée depuis 90 j » ne peut donc rien révéler avant ~octobre 2026. À réévaluer plus tard. Rien à signaler.

## Collisions d'ordre d'affichage (`display_order_collisions`)

11 collisions, **cosmétique**, sans urgence. Elles opposent surtout des cartes `statut-*` à des cartes saisonnières/événementielles :

- 40 : doomname / statut-github
- 42 : statut-npm / statut-openai
- 43 : statut-discord / statut-vercel
- 50 : changement-heure / statut-twitch
- 51 : black-friday / soldes / statut-zoom (triple)
- 52 : perseides / statut-canva
- 53 : beaujolais-nouveau / statut-dropbox
- 54 : soldes-steam / statut-slack
- 55 : aurores-france / cert-fr-alertes
- 56 : eclipse-solaire / geminides / nuits-des-etoiles (triple)
- 59 : echeances-fiscales / journees-patrimoine

Proposition (facultative, sans urgence) : ré-échelonner ces cartes sur des plages hautes libres (l'existant monte à ~172) pour rendre l'ordre déterministe. Non bloquant.

## TODO calendaires ≤ 60 jours (fenêtre 2026-07-16 → 2026-09-14)

**Un seul point réellement actionnable dans la fenêtre :**

- **`ouverture-ventes-sncf`** (`server/sources/ouverture-ventes-sncf.js`, l.6-8) : config vide, TODO daté indiquant que la prochaine ouverture (fêtes/hiver 2026-2027) **n'est pas annoncée au 15/07/2026**. Action prévue : **recheck manuel début septembre 2026** (dans la fenêtre). → à mettre à l'agenda d'Hugo.

**Événements déjà configurés qui se déclenchent dans la fenêtre (aucune action requise, dates déjà en dur et vérifiées) :** bison-fute (journées rouges/noire 25/07→28/08), eclipse-solaire (12/08), perseides (12-13/08), nuits-des-etoiles (07-09/08), grandes-marees (13-16/08 et 11-14/09), taux-livret-a (bascule 1,8 % au 01/08), fetes-chretiennes (Assomption 15/08), journees-patrimoine (3e w-e sept = 12-14/09). Ces configs sont en place ; rien à renouveler avant leur échéance.

**Renouvellements de config (TODO année suivante) — tous AU-DELÀ de 60 j, listés pour mémoire :**

| Fichier | Échéance de renouvellement |
|---|---|
| `bison-fute.js` | Calendrier officiel 2027 — début 2027 |
| `taux-livret-a.js` | Prochaine révision — 1er février 2027 |
| `echeances-fiscales.js` | Entrées 2027 — début 2027 |
| `grandes-marees.js` | Périodes coeff ≥100 2027 (SHOM/maree.info) — début 2027 |
| `nuits-des-etoiles.js` | Édition 2027 (AFA) — début 2027 |
| `fetes-juives.js` | Roch Hachana/Yom Kippour/Hanoucca 2027 (5788) — automne 2027 |
| `fetes-chretiennes.js` / `fetes-laiques.js` | Dates mobiles 2028 — fin 2027 |
| `eclipse-solaire.js` | Complément liste éclipses — maintenance continue |

Aucun de ces renouvellements ne tombe dans les 60 jours ; pas d'alerte.

## Slugs orphelins

Croisement `category_slugs` (74 slugs réellement utilisés en base) × taxonomie du front (`server/categories.js`, 324 slugs définis, 28 groupes).

**Résultat : aucun slug orphelin.** Les 74 slugs utilisés sont tous définis dans la taxonomie. L'inverse (slugs définis mais non utilisés, ex. `outre-mer`, `pypi-packages`…) est normal et non signalé.

---

## Sources FRAGILES surveillées (rappel dédié)

- `meteo-suisse` : **absente de `failing_sources`** → OK au dernier passage.
- `pannes-hydro-quebec` : **absente de `failing_sources`** → OK au dernier passage.

Ces deux API non officielles restent à surveiller par principe, mais aucun échec répété au 16/07/2026.

---

*Rien à signaler ne justifie une intervention nocturne. Aucun geste correctif exécuté (agent en lecture seule). Aucun brouillon de correctif nécessaire ce jour — les seuls points ouverts (recheck SNCF début septembre, ré-échelonnement cosmétique des display_order) relèvent d'un arbitrage d'Hugo, pas d'un patch.*
