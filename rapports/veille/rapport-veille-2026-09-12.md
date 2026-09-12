# Rapport de veille — 2026-09-12 (Robot 1, lecture seule)

*Généré à partir de `node scripts/veille-readonly.js` (généré le 2026-09-12T02:00Z).
267 sources enabled, 36 combinaisons paramétrées souscrites. Aucune écriture hors ce rapport.*

## Résumé (points saillants, par importance)

1. **Schéma cohérent** — `schema_check.ok = true` (58 colonnes attendues, 0 manquante, 0 type inattendu). Aucune migration en attente.
2. **Sources en échec = toutes attendues/connues** : `sncf-perturbations` (clé API absente, connu), `lancement-spatial` (timeout API tierce, transitoire), `ecowatt` (HTTP 429, throttle saisonnier). Aucune régression réelle.
3. **3 cartes PanneauPocket curées jamais activées** : `dechets-la-saucelle`, `dechets-campagne-caux`, `securite-gendarmerie-bayeux` — candidates à décision humaine (le proxy sous-estime, cf. §Vitalité). Les 16 autres sont vivantes (activées ≤ 25 j).
4. **2 échéances calendaires atteignent leur TODO dans le window 60 j** : `courses-mythiques` (config vide, TODO sept. 2026 échu) et `tour-de-france-passage` (config vide, TODO oct. 2026).
5. **1 slug orphelin** : `communaute` (présent en base, absent de `server/categories.js`).

Reste = bruit attendu (états figés sur combinaisons inactives/orphelines, collisions d'ordre cosmétiques).

---

## Cohérence schéma
`schema_check` : **RAS** — schéma cohérent (58 colonnes attendues, 0 `missing`, 0 `type_mismatch`).

## Sources en échec (`failing_sources`)
Les 3 entrées sont des causes **connues/attendues**, pas des pannes :

| Source | Échecs/7j | Dernier message | Lecture |
|---|---|---|---|
| `sncf-perturbations` | 131 | `SNCF_API_KEY absente de l'environnement` | **Attendu** — la source attend la clé RTE/SNCF (documenté état-projet). Pas de régression. |
| `lancement-spatial` | 48 | `Timeout API Launch Library (>10000 ms)` | API tierce lente/instable. À surveiller si ça persiste, mais typiquement transitoire. Niveau bas. |
| `ecowatt` | 11 | `HTTP 429, prochain cycle` | Throttle EcoWatt (appel trop fréquent), auto-résorbé au cycle suivant ; source par ailleurs saisonnière (hiver). Niveau bas. |

## États figés (`stale_states`) — signal SECONDAIRE
⚠️ Rappel du `caveat` : `checked_at` n'est rafraîchi que sur écriture ; un `checked_at` ancien sur une entrée **inactive** est NORMAL tant que l'étape B n'est pas déployée.

Les seules entrées figées en état **`active`** (donc a priori dignes d'attention) sont toutes des **combinaisons orphelines** (aucun abonnement, cf. §Combos orphelins) : `vigilance-meteo` (dépts 13/24/31/33/35/38/44/67/74/75/83), `risque-secheresse` (06/14/16/53), `rappel-conso` (alimentation, bébés-enfants), `iss-passages` (gap). N'étant plus recalculées, leur `checked_at` reste figé à mi-juillet — **comportement attendu**, non corroboré par `failing_sources`. Aucune alerte.

## Jamais actives 90 j (`never_active_90d`)
Liste longue (~230 entrées) massivement **normale** : sources saisonnières hors saison (Beaujolais, Black Friday, Géminides, Perséides, carnavals, soldes…), événements datés futurs, statuts d'infra rarement en panne (`statut-*`), et veilles d'état imprévisible qui n'ont simplement rien détecté. Rien d'anormal détecté (aucune source « censée s'activer souvent » et muette). Les cartes PanneauPocket curées jamais activées sont traitées à part (§Vitalité).

## Collisions d'ordre d'affichage (`display_order_collisions`) — cosmétique
11 collisions, sans urgence. La cause récurrente : des `statut-*` partagent un `display_order` avec des cartes événementielles :

- 40 : `doomname` / `statut-github`
- 42 : `statut-npm` / `statut-openai`
- 43 : `statut-discord` / `statut-vercel`
- 50 : `changement-heure` / `statut-twitch`
- 51 : `black-friday` / `soldes` / `statut-zoom`
- 52 : `perseides` / `statut-canva`
- 53 : `beaujolais-nouveau` / `statut-dropbox`
- 54 : `soldes-steam` / `statut-slack`
- 55 : `aurores-france` / `cert-fr-alertes`
- 56 : `eclipse-solaire` / `geminides` / `nuits-des-etoiles`
- 59 : `echeances-fiscales` / `journees-patrimoine`

Ré-échelonnement possible un jour (pas de valeur métier). Sans urgence.

## TODO calendaires ≤ 60 jours (window : 2026-09-12 → 2026-11-11)
Échéances de **renouvellement** atteintes dans le window :

- **`courses-mythiques`** — CONFIG VIDE, commentaire « ⚠️ TODO septembre 2026 : transcrire les dates officielles ». Échéance **échue**. Dates 2027 pressenties non urgentes (Semi de Paris ~7 mars, Marathon de Paris ~11 avr.), mais le jalon de saisie est atteint → à traiter par Hugo quand les dates seront confirmées.
- **`tour-de-france-passage`** — CONFIG VIDE, « ⚠️ TODO octobre 2026 : à l'annonce du parcours 2027, transcrire ». Échéance dans le window (octobre).

Configs datées **déjà présentes** qui se déclencheront dans le window (aucune action requise, listées pour information) : `echeances-fiscales` (taxe foncière 15/20 oct.), `bourses-scolaires` (15 oct.), `entrepreneuriat-seniors` (GO Lyon 24 sept., BIG 8 oct.), `fetes-juives` (Roch Hachana 12 sept., Yom Kippour 21 sept.), `fetes-laiques` (équinoxe 23 sept., Halloween 31 oct.), `fetes-chretiennes` (Toussaint 1er nov.).

### Annexe (juste au-delà de 60 j, pas d'alerte)
- SEEPH / Semaine de l'industrie 16-22 nov. 2026 (`civisme-solidarite`, `entrepreneuriat-seniors`).
- Taxe d'habitation résidences secondaires 15 déc. (`echeances-fiscales`) ; CFE 15 déc. (`cfe-entreprises`).
- `bison-fute` : TODO calendrier 2027 → **début 2027**, hors window.

## Slugs orphelins
Croisement `category_slugs` (145 slugs utilisés en base) × taxonomie `server/categories.js` (337 slugs définis) :

- **`communaute`** → **orphelin** : présent en base (porté par les sources `type=community`, ex. `chat-perdu`, `chien-perdu`) mais absent des `GROUPS` de la taxonomie. La carte affichera le slug brut au lieu d'un libellé/filtre. Correctif suggéré (non exécuté) : ajouter `'communaute'` à un groupe (`vie-locale` ou `autre`) dans `server/categories.js`.

Aucun autre orphelin.

## Vitalité PanneauPocket curée (Vague L)
Jeu curé identifié dynamiquement (fichiers `server/sources/*.js` appelant `makeCurated` + `arrosage-canal-gap` via `createBroadcastSource` ; exclus : `panneaupocket`/`ma-collectivite` paramétrés) = **19 cartes**.

⚠️ **Limite de méthode (à énoncer telle quelle)** : la base ne stocke aucune date de publication de panneau (`ref` = couples `[panneauId, hash]`). Le seul proxy est `last_activated_at` (dernier panneau *alertable*), qui **sous-estime** la vitalité : les cartes déchets/gendarmerie ont un filtre thématique étroit, une entité peut publier sans jamais déclencher.

**Candidates à désactivation (décision humaine — jamais automatique)** — cartes sans `last_activated_at` :

| Carte | `last_activated_at` | `ref_panneau_count` | Lecture |
|---|---|---|---|
| `dechets-la-saucelle` | jamais | 7 | 7 panneaux référencés → l'entité **publie** ; aucun n'a franchi le filtre déchets. Probablement quiet, pas mort. À confirmer humainement via l'appli PanneauPocket. |
| `dechets-campagne-caux` | jamais | 1 | idem, 1 panneau en référence. |
| `securite-gendarmerie-bayeux` | jamais | 3 | 3 panneaux en référence ; famille gendarmerie massivement dormante (~85 %, cf. état-projet). À re-vérifier en priorité. |

Aucune carte curée ne dépasse le seuil des 90 j *avec* activation antérieure. Les 16 autres sont vivantes (`last_activated_at` ≤ 25 j ; ex. `securite-gendarmerie-albi` 25 j, `dechets-saulieu` 17 j, le reste ≤ 9 j).

**Proposition (non implémentée)** : le proxy `last_activated_at` reste insuffisant pour distinguer « entité muette » de « entité active hors filtre thématique ». Mesure plus fiable = persister dans `ref` la date du panneau le plus récent (toutes catégories), pour disposer d'un vrai signal de vitalité sans requêter PanneauPocket. À décider par Hugo.

## Combos orphelins & ids `?panneau=`
- **Combos orphelins** (`orphan_param_states`) : **26** lignes `source_param_states` sans abonnement correspondant (reliquats de désabonnements) — dont `ma-collectivite` (5 URLs 05 : Oze, Valserres, AMR-05, Veynes, La Bâtie-Vieille), `vigilance-meteo` (~14 dépts), `risque-secheresse` (06/14/16/53), `rappel-conso` (2 catégories), `iss-passages` (gap). Purge = **décision humaine**, aucun `DELETE` effectué.
- **Stabilité des ids `?panneau=`** (point de vigilance ouvert, consigné en tête de `ma-collectivite.js`) : si PanneauPocket régénère les ids de panneau à l'édition, une simple modification apparaîtrait comme « nouveau ». Non mesurable sans fetch réseau (interdit la nuit) → signalé comme vigilance, sans alarme.

---

*Fin du rapport. Aucune modification de code, config, base ou git n'a été effectuée.*
