# RAPPORT SITE-APPMOB : deux badges de store sur l'accueil

Rien n'est commité, poussé ni déployé.

## Phase 1 : état des lieux

- **APP_PLAY_URL_ENABLED**
  - Lu dans `server/app-play-flag.js:11` : vaut vrai seulement si la valeur est exactement `"true"`, espaces retirés.
  - `server/pages.js:33-37` (`flagsAttr`) le pose en attribut `data-lba-app-play="true|false"` sur `<html>` de chaque page rendue. Pas de script inline : la politique de sécurité (CSP) les interdit.
  - Aucun JS ne le lit. C'est la CSS `site.css:5567` (`html:not([data-lba-app-play="true"]) .appmob { display:none !important }`) qui masque **tout le bloc .appmob**.
- **Badge Play**
  - Balise : `<img src="/img/google-play-fr.png" width="323" height="125">` dans un lien `.appmob-badge`.
  - Le fichier source fait 646×250 et inclut la zone de dégagement.
  - CSS : `width: 220px; height: auto`, soit environ 85 px de haut affichés. Pas d'effet au survol.
- **Le bloc n'est repris nulle part ailleurs** : il n'existe que dans `public/index.html`. Il est aussi cité par les scripts `test-accueil-anon.js`, `test-app-play-flag.js`, `capture-accueil.js` et `encart-cta-check.js`.

## Variable à poser sur Railway

**`APP_APPSTORE_URL_ENABLED=true`**

Elle suit la même règle que la variable Play : exactement `true`, sinon le badge est masqué. Les deux variables sont indépendantes, et le bloc apparaît dès qu'une des deux est active.

## Image à fournir

- **Chemin** : `public/img/app-store-fr.png`. C'est le badge officiel Apple en français, « Télécharger dans l'App Store ».
- **Affichage** : 85 px de haut, largeur automatique selon le ratio de l'image.
- **Taille conseillée** : 250 px de haut (2×, comme le badge Play), avec la zone de dégagement incluse dans l'image comme sur `google-play-fr.png`. Sans cette marge, le badge Apple paraîtra plus grand que celui de Google à hauteur égale.
- Je n'ai pas mis d'attributs `width`/`height` sur cette image, faute de connaître ses dimensions. La hauteur fixée en CSS évite tout saut de mise en page.
- **Si le fichier est absent**, le texte alternatif « Télécharger dans l'App Store » s'affiche à la place, cliquable, et la page ne casse pas.

## Mes modifications, distinctes du chantier encarts

**`public/index.html`**, bloc `.appmob` seulement. Le hunk `@@ -77` vient du chantier encarts, pas de moi.
- Commentaire au-dessus du bloc réécrit (l. 371-377).
- `<h2>` : « L'appli, … » devient « Les applis, pour être prévenu à la seconde. ».
- Fin du `<p>` : « Gratuite, sans pub, open source — comme le site. » devient « Gratuites, sans pub, et le service est open source. ». Cette formulation suit celle d'`app.html`.
- Le lien Play est enveloppé dans `<div class="appmob-badges">`, avec la classe `appmob-badge--play` en plus.
- Nouveau lien `appmob-badge--appstore` vers `https://apps.apple.com/fr/app/la-bonne-alerte/id6833982399`, placé avant le badge Play.

**`public/css/site.css`**, bloc `.appmob` seulement (l. 5562-5583) :
- Commentaire réécrit.
- La règle qui masque le bloc demande maintenant qu'aucun des deux drapeaux ne soit actif.
- Une règle de masquage par badge.
- Nouvelle classe `.appmob-badges` (flex, retour à la ligne, `gap: 12px`).
- Image : `height: 85px; width: auto; object-fit: contain`, pour une même hauteur et un ratio conservé.

**Autres fichiers**
- Nouveau `server/app-appstore-flag.js`.
- `server/pages.js` : `require` de ce fichier et attribut `data-lba-app-appstore`.
- `scripts/test-accueil-anon.js` : assertions .appmob mises à jour, plus la vérification du lien, du texte alternatif et du texte corrigé.
- `scripts/test-app-play-flag.js` : 5 vérifications pour la variable iOS et l'indépendance des deux drapeaux.

**Mode sombre et mobile** : le fond reste `var(--bg)` et les badges sont des images à fond noir. Sous 760 px, le bloc passe sur une colonne, et les badges vont à la ligne (`flex-wrap`) si la largeur manque.

## Vérifications

Je n'ai pas trouvé de trace écrite des « trois scripts habituels ». J'ai lancé les quatre scripts liés au bloc et aux encarts, tous sans échec :

| Script | Résultat |
|---|---|
| `test-app-play-flag.js` | 14 OK |
| `test-accueil-anon.js` | 34 OK |
| `test-encarts.js` | 55 OK |
| `encart-cta-check.js` | 10 OK |

**À CONFIRMER PAR HUGO** : quels sont les trois scripts habituels.

## Message de commit proposé

```
Accueil : badges App Store et Google Play independants dans le bloc Sur mon smartphone

- APP_APPSTORE_URL_ENABLED (server/app-appstore-flag.js) pose data-lba-app-appstore sur <html>
- bloc .appmob visible des qu'un des deux drapeaux est actif, chaque badge suit le sien
- badge App Store (/img/app-store-fr.png) a cote du badge Play, meme hauteur
- texte : les applis, gratuites, le service est open source
- tests test-accueil-anon et test-app-play-flag mis a jour
```
