# Fil #9 — 3 résidus texte/lien (campagne de test) — diff à relire

**Date : 2026-09-13** · Code écrit, **non commité**. 3 corrections de **texte/lien statique**, indépendantes du format bloc. **Diff : 3 fichiers, +6 / −9** (`public/index.html`, `public/js/header.js`, `public/js/profile.js`). Aucun impact sur le format bloc, le système de points, ou le serveur.

---

## Résidu 1 — Lien panier boutique dans le header

### Constat (exploration)
Le lien visible n'était **pas** dans `header.js` (dont le commentaire prétendait pourtant « plus de lien sac/boutique »), mais en **HTML statique** dans `public/index.html:51` :
`<a class="shop-link hd-link" href="/boutique" …><span class="hd-ic hd-ic-bag">…</span></a>`.
C'est le seul emplacement (grep : aucune autre page HTML, aucun header mobile ne le porte ; les vues « liste » et « grille » partagent ce header). La route serveur `/boutique` est bien morte (archivée ÉTAPE 2) — seul le lien restait, contrairement à l'ARBITRAGE ÉTAPE 2 (Bloc E, point 1).

### Correction
- **`index.html`** : le `<a class="shop-link">` retiré (1 ligne).
- **`header.js`** : les constantes du sac devenues **mortes** retirées — `BAG_PATHS`, `BAG_HTML`, et `bag: BAG_HTML` dans l'export `LBAHeader.ICONS`. Vérifié : **aucun consommateur** de `ICONS.bag`/`BAG_HTML` dans le JS actif (le header ne construisait plus aucun lien sac). `icon2(cls, paths, strokeOnly)` conservée générique (son `strokeOnly` n'a plus de consommateur → commentaire ajusté).
- Pas de CSS orphelin : `.shop-link` n'a aucune règle propre (le style venait de `.hd-link`, toujours utilisé par les liens cloche/cœur).

---

## Résidu 2 — « Mon identifiant public » mentionne les decks (profile.js)

### Constat
`profile.js:285` : `« Signe vos messages du forum et vos decks partagés. »` (+ commentaire interne l. 268 « signe les decks partagés »).

### Correction (ARBITRAGE 1 — zéro mention deck côté utilisateur)
- Texte visible → **« Signe vos messages du forum. »**
- Commentaire interne aligné → « signe les messages du forum, jamais l'email ».

---

## Résidu 3 — « Mes points / Solde » mentionne les decks (profile.js)

### Constat
`profile.js:297` : `« Points gagnés en créant et adoptant des decks »`.

### Vérification barème avant reformulation (ARBITRAGE 2 — points/classement INTACTS)
Exploration de `server/points.js` : le barème définit encore `DECK_ADOPTED/CREATED/ADOPTED_BY_OTHERS`, **mais leurs appelants `award('DECK_*')` vivent dans les routes decks archivées** → jamais déclenchés. Le **seul** événement qui crédite des points aujourd'hui est **`ALERT_SUBSCRIBED`** (5 pts, `award(...)` dans `myalerts.js`/`subscribe.js`, actifs). La reformulation est donc **exacte**, pas inventée.

### Correction
Texte visible → **« Points gagnés en vous abonnant à des alertes »**.
**Le système de points lui-même est INCHANGÉ** (aucune ligne de `points.js`, du ledger, du calcul de rang ou du classement touchée) — seul le libellé descriptif change.

---

## Validation
- `node -c` OK sur `header.js` et `profile.js`.
- Grep : **plus aucune** occurrence visible de `decks partagés` / `adoptant des decks` / `shop-link` / `href="/boutique"` / `hd-ic-bag` / `BAG_*` / `ICONS.bag` dans le kiosque actif (hors `_archive`).
- `mobile-header.js` : aucun lien boutique/sac (confirmé).

## Hors périmètre (inchangé, pour mémoire)
Aucun changement au format bloc, au système de points, ni au serveur. La **dette decks** (Partie 2b : sous-système JS deck inerte dans site.js + `forum.js:708` + CSS `.deck-card`/`.ds-*`) reste actée pour un fil dédié ultérieur.

## Aucun commit
Rien n'est commité. Sur ta validation, on commit ces 3 corrections. Le fil #9 sera alors clos pour de bon (hors dette decks séparée).

*Fin du récap 3 résidus.*
