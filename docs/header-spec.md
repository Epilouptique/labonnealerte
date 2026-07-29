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
`Ma collection` · `♥ Favoris` · `Se connecter | Mon compte` · bouton thème `◐`.
- **Pas d'OpenAlert** dans `.nav-right` (présent au footer + menu mobile seulement).
- **Pas de « Le Point »** dans le header desktop (retiré via media query > 720px ;
  présent dans le menu mobile).
- Avant `.nav-right` : logo, bouton **« Déposer une alerte »** (alterne avec « Ajouter un
  deck » si connecté), hamburger (masqué en desktop), barre de recherche.
- Seule variation autorisée : `Se connecter` → `Mon compte` si connecté
  (`LBASession.renderHeader`). Généralisé à toutes les pages via header.js.
- **Exception home uniquement** : 2e ligne (catégories) + 3e ligne (catégories dépliées) —
  **en plus** de la 1re ligne, jamais à la place.

## Header mobile (≤ 720px)

- **Home** : header à 3 lignes (logo centré + hamburger / recherche / rail catégories),
  avec **condensation au scroll** (`body.m-scrolled` posé par `mobile-header.js`) — le
  header se réduit progressivement en descendant. Inchangé.
- **Toute autre page** : `body.m-secondary` (posé par header.js) → header réduit à
  **hamburger (gauche) + barre de recherche**, identique d'une page secondaire à l'autre.
  La barre de recherche redirige vers la home (`/?q=…`).

## Menu mobile (panneau plein écran, hamburger)

Construit par `buildMenu(nav, {isHome, logged})`, **partagé** home + hors-home.
- En-tête du panneau : le **logo `LOGO_HTML`** (même rendu que le header), à gauche ;
  bouton ✕ à droite.
- `Se connecter` → `Mon compte` si connecté (`data-act="account"`, sinon `data-act="auth"`).
- Contenu : (connecté) Ma collection · Mes decks · Mes favoris ; (anonyme) Se connecter ·
  Mes favoris — puis **Le Point** · Déposer une alerte · Rechercher — Catégories · Les
  nouvelles · Les plus populaires — Mon compte (si connecté) · Nous soutenir — **Forum** ·
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
`body.m-kiosk` les arrange ensuite (mobile = empilé / desktop ≥721px = rangée 1
`[… thème] [view-toggle] [KPI]`, rangée 2 = catégories). Le **`view-toggle`** (bascule
cartes/liste) suit ce même schéma : en **desktop il est inséré dans `.nav-right` entre le
bouton thème et le KPI** ; en **mobile il reste dans `.toolbar`** (rangée catégories). Ce
déplacement est en JS (et non en CSS `order`) car `view-toggle` est un petit-enfant de
`.toolbar` — `order` ne franchit pas les conteneurs. Rejoué au franchissement de 721px.

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
