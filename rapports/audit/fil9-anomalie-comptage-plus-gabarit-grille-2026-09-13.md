# Fil #9 — Anomalie « 17 alertes » + gabarit grille — réponse rapide

**Date : 2026-09-13**

---

## PARTIE 1 — « 17 alertes » : PAS un bug de code (état de filtre client)

### Preuves (exploration lecture seule)
1. **Données intactes** : `GET https://labonnealerte.fr/api/sources` (prod) renvoie **267 sources** (`internal 263, community 2, user-task 1, external 1`). Le problème est **front**, pas données.
2. **Code déployé inchangé** : le déployé est `b896fc1` — **exactement celui de ta campagne de test réussie (267 OK)**. Le commit « 3 résidus » **n'est pas déployé** (toujours non commité chez moi). Un même code montrant 267 puis 17 ⇒ ce n'est pas une régression de code.
3. **Aucun filtre persisté** : le seul `localStorage` du kiosque est `lba-theme` (thème). Le mode/filtre ne vient QUE de l'URL (`?mode=…`, `?q=…`, `?cat=…`) ou d'un clic de puce/recherche **non mémorisé** entre rechargements.
4. **Signature du symptôme** : 17 au total répartis par catégorie (Vie locale 6, météo 3, crypto 2…) = exactement une **vue personnelle filtrée** (les alertes que tu as suivies pendant les tests), pas un catalogue tronqué.

### Conclusion : hypothèse 2 confirmée. Comment revenir aux 267
- **Regarde la barre d'URL** : si elle contient `?mode=favoris` (Ma collection), `?mode=mine` (Mes alertes), `?q=…` (recherche) ou `?cat=…` → c'est le filtre. Va sur **`https://labonnealerte.fr/`** nu (ou clique le **logo**).
- **Vide le champ de recherche** s'il contient du texte, et clique la puce **« Toutes »**.
- Rappel : l'icône **❤ du header** mène à `/?mode=favoris` (Ma collection) — si tu l'as cliquée, tu es sur tes favoris, pas le catalogue.

**Aucune correction de code nécessaire pour ce point.**

---

## PARTIE 2 — Gabarit grille : cartes larges, 1–2 colonnes (PROPOSITION, diff à valider)

### Constat
En vue cartes, `.grid > .card` était **plafonné à 300px** (largeur héritée des ex-cartes 5/7) → beaucoup de colonnes fines. (Les « lignes fines pleine largeur » que tu décris sont la **vue liste** ; ici on ajuste la **vue cartes**.)

### Proposition (site.css, scopée `#grid` → kiosque uniquement ; favoris.html = `#fav-grid` inchangée)
```css
:root { --alert-col-min: 480px; --alert-grid-max: 1000px; }
#grid { grid-template-columns: repeat(auto-fill, minmax(min(var(--alert-col-min), 100%), 1fr));
  max-width: var(--alert-grid-max); margin-inline: auto; }
#grid > .card { max-width: none; margin-inline: 0; }
```
Deux variables pilotent la cible, sans toucher **ni** l'expand/collapse (`.ab-toggle`/`.ab-detail`) **ni** le flip (absent, comme décidé) :
- `--alert-col-min` : largeur mini d'une colonne (plancher avant retour à 1 colonne).
- `--alert-grid-max` : largeur max de la grille → **borne le nombre de colonnes à 2**.

### Mesuré (Playwright, CSS réel)
| Viewport | Résultat |
|---|---|
| 1440 / 1100 px | **2 colonnes de ~491px**, grille centrée à 1000px |
| ~820 px | 2 colonnes (~480px) |
| ≤ ~620 px (mobile) | **1 colonne pleine largeur** (le `min(480px,100%)` force 1 colonne) |

### Pour viser tes dimensions exactes (tunable en 1 ligne)
- **1 colonne large ~800px** (feed centré) : `--alert-grid-max: 800px;` (et/ou `--alert-col-min: 800px;`).
- **2 colonnes plus larges** : monter `--alert-grid-max` (ex. 1200 → 2×~590px).
Les valeurs par défaut ci-dessus (2×~491px) sont un point de départ — dis-moi la cible et j'ajuste les 2 variables.

---

## État / commit
- **Partie 1** : rien à commiter (diagnostic).
- **Partie 2** : `public/css/site.css` modifié (working tree, **non commité**) — c'est cette proposition. Séparé des « 3 résidus » (index.html/header.js/profile.js) toujours en attente de ta validation.
- **Le retrait du flip/recto-verso n'est PAS touché** (aucune régression de ce côté).

Dis-moi : (a) confirmes-tu que les 267 reviennent en URL nue, et (b) quelle cible de largeur/colonnes tu veux → je fige les variables et on commit.

*Fin.*
