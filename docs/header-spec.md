# Header & menu — spécification figée (source unique)

> À lire **avant de créer une nouvelle page**. Le header a longtemps été un point de
> friction récurrent (divergences page à page) : cette spec et `js/header.js` en sont
> désormais la **seule** référence. Ne recrée jamais un header en dur dans une page.

Source de vérité côté code : [`public/js/header.js`](../public/js/header.js). Ce document
décrit son comportement réel (vérifié sur le code, pas une reformulation).

---

## Règle d'or

- **`js/header.js` = seule source du HTML de header** sur toutes les pages **hors home**.
- Une page hors home ne contient **aucun** header statique, **aucun** logo en dur — juste
  une ancre minimale :
  ```html
  <header>
    <!-- Header injecte par js/header.js (source unique). Ancre minimale. -->
    <div class="wrap nav"></div>
  </header>
  ```
- Le logo/wordmark est la constante **`LOGO_HTML`** dans header.js (ligature SVG animée +
  `l/a/bonne/alerte/bang/fr`). header.js crée l'ancre `.brand` si absente, sinon
  **normalise** son contenu. Ce même markup alimente aussi le logo du menu mobile
  (`buildMenu` lit `brand.innerHTML`) → un seul logo, jamais recopié à la main.

## Détection home vs hors-home

header.js s'exécute partout mais **retourne tôt sur la home** :
```js
var isHome = !!document.querySelector('main .toolbar') || !!document.getElementById('alertes');
if (isHome) return;
```
→ La home garde son header propre (voir « Dette assumée »). Toutes les autres pages
reçoivent le header injecté.

## Header PC (desktop, > 720px)

1re ligne **strictement identique partout** (hors home), injectée dans `.nav-right` :
`🛍` · `🔔` · `♥` · `Se connecter | avatar`. **Plus de bouton de thème** (`.theme-btn` retiré du
header ; `window.toggleTheme` reste exposé par `theme.js`/`site.js` mais n'a plus aucun
déclencheur dans l'interface — à recâbler dans « Mon compte › Apparence »).
- `Boutique` (`.shop-link`, `/boutique`) = **sac seul**, à **gauche de la cloche**
  (`aria-label`/`title` « Boutique »). Boutique de skins cosmétiques.
- `Mes alertes` (`.mine-link`) = filtre des abonnements actifs du kiosque (ex-« Ma collection »).
  Rendu = **cloche seule** (icône, `aria-label`/`title` « Mes alertes »), sans libellé texte.
- Le lien favoris (`.fav-link`, `/favoris`) = **cœur ♥ seul** (icône, `aria-label`/`title` « Mes favoris »),
  sans libellé texte. La page /favoris s'intitule « Ma collection » (H1, cf. rotation de titre).
- `Mon compte` (`#auth-link`, connecté) = **avatar rond à initiale** (1re lettre du pseudo,
  sinon de l'email), monté par `session.js`. Anonyme : la pilule texte « Se connecter » reste.

### Famille d'icônes `.hd-link` / `.hd-ic` (cloche, cœur, avatar)

Grammaire commune, définie dans `site.css` (bloc « Icônes de .nav-right ») :
- **aucune couleur de base** pour les trois, en toute circonstance (trait `--muted` ; il n'y a
  plus d'état « cœur rempli » permanent quand des favoris existent) ; padding horizontal
  de 5px de chaque côté. Au survol le **violet `--amber` monte
  progressivement du bas vers le haut**. Technique : deux calques SVG superposés —
  `.hd-ic-base` (trait) + `.hd-ic-fill` (plein), ce dernier révélé par un `clip-path: inset()`
  qui remonte. Même effet sur l'avatar via un `::before` dont la hauteur passe à 100 %.
- Animations propres à chaque icône, au survol :
  - **cloche** : penche de droite à gauche, assez vite (`hd-bell-ring`) ;
  - **cœur** : son **contour** déborde des côtés en s'estompant (`hd-heart-echo`, masque SVG
    *stroke only*) — même vocabulaire que le halo `ping` du KPI, en forme de cœur ;
  - **avatar** : se **retourne** (rotateY) et révèle une **roue de paramètres**.
- `prefers-reduced-motion` neutralise transitions et animations.
- Markup : **source unique** = constantes `BELL_HTML` / `HEART_HTML` / `MINE_LINK_HTML` /
  `FAV_LINK_HTML` de `header.js` (exposées via `window.LBAHeader.ICONS`). La home
  (`index.html`) en garde une **copie statique** — toute retouche doit être répercutée
  dans les deux (commentaire miroir présent des deux côtés).

### KPI du header = pastille de notification sur la cloche

Dans le header (home uniquement — seule page qui possède un `.kpi`), `mobile-header.js`
déplace le `.kpi` **dans le lien `.mine-link`**. Le CSS
(`header .nav-right .mine-link .kpi`) le transforme en **pastille ronde verte chiffrée**
superposée à la cloche : 2 alertes actives → « 2 » dans un rond vert.
- Le **halo vert qui s'agrandit** (`ping`, mutualisé avec `.dot-live`) est conservé.
- Tout le reste disparaît : pastille `●` (`#kpi-dot`), libellé (`#kpi-text`) et son overlay
  qui s'étirait au survol.
- **0 alerte active** (`data-active` ≠ `"true"`) → **aucune pastille**.
- Le `.kpi` du hero (hors header) garde sa forme de pilule d'origine.
- **Pas d'OpenAlert** dans `.nav-right` (présent au footer + menu mobile seulement).
- **Pas de « Le Point »** dans le header desktop (retiré via media query > 720px ;
  présent dans le menu mobile).
- Avant `.nav-right` : logo, bouton **« Déposer une alerte »** (libellé fixe → `/proposer` ;
  la rotation avec « Ajouter un deck » a été retirée), hamburger (masqué en desktop),
  barre de recherche. Entre 722 et 1299px le bouton se réduit au **« + » seul**.
- Seule variation autorisée : `Se connecter` → `Mon compte` si connecté
  (`LBASession.renderHeader`). Généralisé à toutes les pages via header.js.
- **2e ligne (catégories) + 3e ligne (catégories dépliées)** : présentes **partout** en
  desktop, **en plus** de la 1re ligne. Un seul menu pour toute la navigation — la règle
  « pages secondaires = 1re ligne seule » est abandonnée.
  - Sur la home, ces rangées viennent de `site.js`/`mobile-header.js` (filtrage sur place).
  - Ailleurs, `header.js` les **injecte** (`buildCatRail`) : mêmes puces, mêmes comptes,
    même tri (fréquence puis libellé), obtenus en lisant `/api/sources` + la taxonomie
    (`LBACat` si déjà chargé, sinon `/api/categories` — aucune page n'a besoin d'inclure
    `categories.js` pour cela). Deux différences inévitables faute de grille : le clic
    **navigue** vers la home filtrée (`/?cat=…`, `/?mode=nouveautes|selection`, `/` pour
    « Toutes ») au lieu de filtrer sur place, et **aucune puce n'est marquée active**.
- **Exception : l'espace développeurs** (`proposer.html`, `body.dev`) garde ses règles
  actuelles — **1re ligne seule** (aucun rail injecté) et thème sombre.

## Header mobile (≤ 720px)

- **Home** : header à 3 lignes (logo centré + hamburger / recherche / rail catégories),
  avec **condensation au scroll** (`body.m-scrolled` posé par `mobile-header.js`) — le
  header se réduit progressivement en descendant. Inchangé.
- **Toute autre page** : `body.m-secondary` (posé par header.js) → header réduit à
  **hamburger (gauche) + barre de recherche**, identique d'une page secondaire à l'autre.
  La barre de recherche redirige vers la home (`/?q=…`). **Inchangé** : le rail de
  catégories injecté en desktop est masqué ici (`body.m-secondary.m-kiosk … .toolbar`),
  les catégories restent accessibles par le menu plein écran.

## Menu mobile (panneau plein écran, hamburger)

Construit par `buildMenu(nav, {isHome, logged})`, **partagé** home + hors-home.
- En-tête du panneau : le **logo `LOGO_HTML`** (même rendu que le header), à gauche ;
  bouton ✕ à droite.
- `Se connecter` → `Mon compte` si connecté (`data-act="account"`, sinon `data-act="auth"`).
- Contenu : (connecté) Mes alertes · Mes decks · Mes favoris ; (anonyme) Se connecter ·
  Mes favoris — puis **Le Point** · Déposer une alerte · Rechercher — Catégories · Nouveautées · Populaires — Mon compte (si connecté) · Nous soutenir — **Forum** ·
  Espace développeurs · OpenAlert · Mentions légales — Se déconnecter (si connecté).
- Face arrière = liste des catégories (retournement, source `window.LBAKioskCats` sinon
  `LBACat`).
- Le thème n'est **plus** dans le menu mobile (retiré ; réglable depuis Mon compte ›
  Apparence). Un handler `.m-theme` résiduel existe mais est inerte.

## Dette assumée — la home n'utilise pas header.js

La home (`index.html` + `mobile-header.js` + `site.js`) garde son **propre** header : 2e/3e
ligne catégories, KPI « alertes actives », condensation scroll `m-scrolled`, 1re ligne
alignée à la main. header.js retourne tôt sur la home pour ne pas la doubler. Unifier la
home dans header.js est possible mais **risqué** (logique imbriquée avec site.js/
mobile-header.js) → laissé en dette, à ne pas forcer sans lot dédié.

**Relocalisations DOM de `mobile-header.js` (home, toutes largeurs)** : la recherche, la
`.toolbar` (puces) et le KPI sont **déplacés depuis `main`/`.hero` vers le header** ; le CSS
`body.m-kiosk` les arrange ensuite (mobile = empilé / desktop = rangée 1, rangée 2 =
catégories). Le KPI n'est plus déposé en fin de `.nav-right` mais **dans le lien
`.mine-link`**, dont il devient la pastille de notification (voir plus bas).
Le **`view-toggle`** (bascule cartes/liste) **n'existe plus** : bouton supprimé du kiosque,
styles et liaison retirés. Le mode d'affichage se règle uniquement depuis
**« Mon compte › Apparence »** (`appearance.js` → `LBAViewMode.set`) ; `view-mode.js`
conserve l'état, la persistance et l'événement `lba-view-change`.

## Pages qui doivent charger header.js

Toute page publique **sauf la home** charge `theme.js` + `session.js` + `header.js` et ne
met qu'une ancre `<header><div class="wrap nav"></div></header>`.

Pages actuelles chargeant header.js : `a-propos`, `collection`, `confidentialite`,
`connexion`, `deck`, `favoris`, `index` (home — return early), `le-point`,
`mentions-legales`, `mes-decks`, `proposer`, `source`, `soutenir`.

**Checklist nouvelle page** :
1. `<header><div class="wrap nav"></div></header>` (rien d'autre).
2. Charger `theme.js`, `session.js`, `header.js` (+ `categories.js` si le menu catégories
   doit être rempli), `pwa.js`.
3. Ne PAS écrire de logo ni de `.nav-right` en dur.
4. Vérifier : PC = 1re ligne commune ; mobile = hamburger + recherche (`m-secondary`) ;
   menu mobile avec logo en tête.
