# Identité visuelle — Document de référence

_Établi le 2026-07-23 à partir de `public/css/tokens.css`, `fonts.css`, `site.css`, `dev.css` et des pages HTML._
_But : servir de source unique pour concevoir les prochaines pages et corriger les écarts existants._

---

## 1. Fondations

### 1.1 Couleurs (tokens — `tokens.css`)

Toute couleur doit passer par une variable CSS. Ne jamais coder un hex en dur dans une page.

| Token | Clair (`light`) | Sombre (`dark`) | Rôle |
|---|---|---|---|
| `--bg` | `#fdfaff` | `#141218` | Fond de page |
| `--surface` | `#f4edfb` | `#2e3440` | Cartes, header, champs, footer |
| `--ink` | `#0f1419` | `#f2efe9` | Texte principal |
| `--muted` | `#6b6459` | `#9aa3ad` | Texte secondaire |
| `--amber` | `#a567e3` | `#bd8ef0` | **Accent violet** (malgré son nom « amber ») |
| `--amber-soft` | `#eaddf8` | `#332a44` | Fond accent doux (badges, tags, chips actives) |
| `--green` | `#16a34a` | `#22c55e` | Succès, état actif, « ping » |
| `--green-soft` | `#e9f7ee` | `#12281a` | Fond succès |
| `--line` | `transparent` | `transparent` | Bordures (transparent par défaut → design sans bordures) |
| `--shadow` | `0 1px 3px rgba(30,20,50,.10), 0 4px 12px rgba(30,20,50,.06)` | idem | Ombre standard |
| `--dot` | `rgba(120,95,175,.13)` | `rgba(255,255,255,.10)` | Points du fond pointillé |
| `--bg-decor` | `fond-constellations-jour.svg` | `fond-constellations-nuit.svg` | Fond décoratif |
| `--danger` | `#dc2626` | `#ef4444` | Erreur / danger (suppression, échec uptime, toast) |
| `--danger-soft` | `#fdecec` | `#3a1c1c` | Fond associé au danger |

**Couleurs récurrentes NON tokenisées (à connaître) :**
- `#fff` — blanc du texte sur boutons accent (convention assumée).
- Thème **dev** (`dev.css`, `body.dev`) : palette bleu nuit dédiée (`--bg:#101826`, `--surface:#1a2436`, `--ink:#e9eef6`, `--muted:#7688a3`, `--line:#263248`), accent violet conservé.
- **8 teintes de decks** (`site.css` ~2046) : `#a567e3` (violet maison), `#5b7db8`, `#6fa287`, `#d9a54a`, `#c97b5f`, `#c58ab0`, `#8a86a3`, `#5fa8a4` (+ noir ardoise, arc-en-ciel). Chaque `.tint-N` pose `--hue`.
- `theme-color` (meta) : `#fdfaff` (clair) / `#0f1419` (sombre) — homogène sur toutes les pages.

### 1.2 Typographie (`fonts.css`, auto-hébergée, RGPD)

| Police | Poids | Usage |
|---|---|---|
| **Inter** | 400–800 | Corps de texte par défaut (`body`) |
| **Baloo 2** | 700–800 | Titres de page (`.page-title`), logo (`.brandmark`), avatar, eyebrow stats |
| **JetBrains Mono** | 400–700 | Code, endpoints, badges, KPI, **titres des pages dev** |

**Échelle titres :**
- `.page-title` (titre canonique) : `clamp(32px, 5.4vw, 52px)`, `800`, `letter-spacing:-0.03em`, **Baloo 2**, centré.
- H1 de statut/source : `clamp(22px, 4vw, 28px)`, `800`.
- Convention bicolore : `h1 .hl { color: var(--amber) }` → 1er mot en `--ink`, reste en violet.

### 1.3 Rayons (radius)

| Valeur | Usage |
|---|---|
| **24px** | Cartes, faces de carte, blocs `.code`, popovers, modales |
| **999px** | Pilules : boutons header, chips, KPI, champ de recherche, tags |
| **10–12px** | Boutons de formulaire (`.sub-btn` 10px, `.acct-return-btn` 12px) |
| 16–20px | Tuiles de decks (16px), notif-card (20px) |
| 8px | Petits contrôles (theme-btn, icônes) |

### 1.4 Espacements & layout

- `.wrap` : `max-width:1240px`, padding `0 24px` (desktop) / `0 16px` (≤767px).
- Grille kiosque : `repeat(3, minmax(0,1fr))` → 2 col ≤900px → 1 col ≤620px, `gap:18px`.
- Fond : double couche → `background.png` (opacité 0.4, fixe) + constellations SVG + trame de points `radial-gradient(var(--dot)…)` en `30px 30px`.
- Footer collé en bas (flex column + `margin-top:auto`), effet verre (`backdrop-filter: blur(14px)`).
- Breakpoints récurrents : 400, 520, 560, 600, 620, 720/721, 760, 900, 1024, 1280px.

---

## 2. Marque / logo

- **Logo texte** (`.brandmark`, header) : `labonnealerte` + `fr`, Baloo 2 800. « alerte » en violet (`.a`), « fr » en muted, ligature « la » dessinée en SVG (courbe Bézier + coupe du bas du « l »).
- **Le « point d'alerte »** (`.bang`) : une barre violette verticale (`.bar`) + un point vert (`.dot`) formant un « ! » stylisé. Le point vert émet un anneau animé (`@keyframes ping`, scale 1→3.2, 2s). C'est **le motif signature** de la marque, réutilisé pour `.dot-live`.
- **favicon.svg** : fond blanc `#ffffff` (rx 20/80), barre `#a567e3`, point `#16a34a`. = version iconique du bang.

---

## 3. Composants clés (`site.css`)

- **Boutons accent** : fond `var(--amber)`, texte `#fff`, hover `color-mix(in srgb, var(--amber) 88%, #000)`. Déclinaisons : `.btn-deposit` / `.btn-login` (pilule), `.sub-btn` (10px), `.empty-btn`, `.sup-btn.primary`.
- **Boutons « ghost »** : contour `1.5px var(--amber)`, texte violet, hover fond `--amber-soft` (`.link-btn`, `.notif-btn`, `.sup-btn.ghost`, `.share-btn-lg`).
- **Cartes** (`.card`) : `--surface`, radius 24px, sans bordure, `box-shadow:none` → `var(--shadow)` au hover. Système de retournement 3D (recto/verso/partage/deck), `backface-visibility:hidden`.
- **Badges** (`.badge`) : JetBrains Mono 10px uppercase — `.official` (violet), `.community` (muted), `.verified` (vert).
- **Chips filtres** (`.chip-f`) : pilule `--surface`/muted, `.on` → fond violet/blanc.
- **Switch** : piste 46×26px, `.on` verte, curseur avec rebond (`cubic-bezier(.34,1.56,.64,1)`) + ping vert à l'activation.
- **Halo de chargement** : disque radial violet pulsé (`lba-halo-pulse`), commun à toutes les pages à données.
- **Pages éditoriales** (`.page`) : conteneur `max-width:720px` — défini _inline_ dans a-propos/confidentialite/mentions-legales/soutenir (voir §5).

---

## 4. Motion (respecte `prefers-reduced-motion` partout)

`ping` (anneau vert) · `hero-halo` (nébuleuse violette 15s) · `hero-letter-in` (lettres du titre) · flip 3D des cartes (.5s) · `sk-pulse` (squelettes) · `cb-pop`/`cb-glow` (célébration adoption) · `param-swap-in` · slide 2D du menu mobile.

---

## 5. Assets graphiques

| Fichier | Note |
|---|---|
| `favicon.svg` | OK, palette conforme |
| `icons/` (192, 512, maskable, apple-touch, badge-72) | PWA |
| `img/fond-constellations-jour.svg` / `-nuit.svg` | Générés Inkscape (métadonnées superflues à nettoyer) |
| `img/background.png` | Superposition fixe opacité 0.4 |
| `fonts/` (inter, baloo2, jetbrains-mono `.woff2`) | Auto-hébergées |

---

## 6. Erreurs & incohérences identifiées

### 🔴 Priorité haute

1. **`img/fond-constellations-jour - Copie.svg`** — fichier doublon/résidu, à **supprimer**.
2. **`soutenir.html` — duplication de composant** : les règles `.sup-actions / .sup-btn / .primary / .ghost / [disabled] / .soon` sont **déjà dans `site.css:1209-1221`** (commentaire « partagé avec /soutenir »). Le `<style>` inline les redéfinit intégralement → supprimer le doublon. De plus `.sup-block` a `border-radius:20px` (non conforme, ≠24px).
3. **`offline.html` — tout en dur hors DS** : police `system-ui`, `background:#0f1419`, `color:#f4f0fa` (n'existe dans aucun thème), `p{color:#b9b2c9}` (≠ `--muted`), bouton `#a567e3` (= `--amber` codé en dur). Justifiable (page offline isolée) mais devrait au minimum documenter/aligner les valeurs sur les tokens.

### 🟠 Priorité moyenne

4. **Titre des pages secondaires non aligné** : a-propos / confidentialite / mentions-legales / soutenir utilisent un `.page h1` maison (`clamp(28px,5vw,40px)`, **en Inter**) au lieu du token canonique `.page-title` (`clamp(32px,5.4vw,52px)`, **Baloo 2**, centré). → Incohérence typographique entre home et pages éditoriales.
5. **Bloc `.page` copié-collé** dans 3 fichiers (a-propos, confidentialite, mentions-legales) à l'identique → à **factoriser dans `site.css`**.
6. **`connexion.html` — ombres ad hoc** : `.cx-card` et `.cx-form button` codent des `box-shadow` en dur (`rgba(30,20,50,…)`) au lieu de `var(--shadow)`. Et `.cx-logo` **réimplémente** le logo `.brand` avec des valeurs de positionnement divergentes (bar `top:-23px`, taille 24px vs 21px) → risque de dérive du logo.

### 🟡 Priorité basse / cosmétique

7. ~~**`#dc2626`** répété ~10× en dur dans `site.css`~~ → **résolu** : token `--danger` (+ `--danger-soft`) créé dans `tokens.css`, toutes les occurrences remplacées.
8. **`session.js:79-80`** : seuls littéraux hex du JS (`var(--surface,#fff)`, `var(--ink,#222)`, ombre `rgba(30,20,50,.16)` en dur). Le reste du JS est **exemplaire** (100% `var()`/`currentColor`).
9. **`index.html`** concentre les `style=` inline (dimensions ponctuelles + `var(--amber)`, tous conformes palette) → pourraient devenir des classes utilitaires.
10. **`site.css`** : blocs commentés morts (`.hero::after` de test, l.647-676) et règle `.stats-section{background:#edf}` (hex court en dur).

### ✅ Points sains (à préserver)

- Ordre de chargement CSS **identique** sur toutes les pages : `fonts.css` → `tokens.css` → `site.css`.
- Aucune page n'oublie `fonts.css`. Structure `.wrap nav` + `.wrap …-main` homogène.
- JS quasi 100 % tokenisé, aucune couleur hors palette.
- Accessibilité soignée : `prefers-reduced-motion` géré partout, `body.high-contrast`, focus visibles.
- `proposer.html` (charge `dev.css`, titres en `<h2>`) et les 3 pages 100 % dynamiques (deck/source/collection, titre injecté par JS) : divergences **assumées**, pas des bugs — à confirmer que le JS applique bien `.page-title`.
