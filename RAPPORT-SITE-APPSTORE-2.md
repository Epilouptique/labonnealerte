# RAPPORT SITE-APPSTORE-2 : périmètre de l'« open source » et section iOS

Rien n'a été commité, poussé, déployé ni zippé. `LabonnealerteApp` et `LabonnealerteMobile` n'ont pas été touchés.

## Lot A : mentions trouvées dans `public/` (avant correction)

| Fichier:ligne | Texte | Décision |
|---|---|---|
| `app.html:58` | « Gratuit, open source, sans publicité ni traceur » (à propos de l'app) | **Corrigé** : « Gratuit, sans publicité ni traceur. Le service est open source. » |
| `conditions.html:115` | « Le code source de La Bonne Alerte est publié sous licence MIT… dépôt public » | **Corrigé** : « du site et du serveur de La Bonne Alerte » |
| `a-propos.html:75` | « Le code est public et vérifiable… » (section « Open source ») | **Corrigé** : « Le code du site et du serveur est public et vérifiable » |
| `index.html:384` | « Gratuite, sans pub, open source — comme le site » (bloc `.appmob`) | **Inexact, non touché** : hors périmètre, bloc masqué et fichier du chantier encarts |
| `index.html:7, 20, 28, 72` | « Gratuit, sans spam, sans pub, open source. » | Inchangé, vise le site |
| `index.html:325` | lien vers `github.com/Epilouptique/labonnealerte` | Inchangé, dépôt du site |
| `institutions.html:7, 13, 21` | « canal gratuit, sans publicité et open source » | Inchangé, vise le service |
| `manifest.webmanifest:4` | « Gratuit, sans spam, open source. » | Inchangé, vise le site (PWA) |
| `mentions-legales.html:81` | « Le code source du site est publié sous licence MIT » | Inchangé, déjà exact |
| `proposer.html:75, 104` | liens vers `OPENALERT.md` | Inchangés, dépôt du site |
| `soutenir.html:78` | « Mettre une étoile sur GitHub » | Inchangé, dépôt du site |
| `server/partials/footer.html:31` | lien « Code source » vers le dépôt du site | Inchangé |

Aucune mention de « MIT » n'attribue la licence à l'application. Le fichier `LICENSE` n'a pas été touché.

## Lot B : section iOS

`public/confidentialite.html` : nouvelle `<section id="application-ios">` (titre « Application iOS »), juste après `#application-android` et avant `#suppression`. Elle reprend le texte fourni, avec accents, et le même gabarit que la section Android (`<section id>`, `<h2>`, `<p>`). J'ai seulement ajouté des espaces insécables avant les deux-points, comme dans le reste de la page. La page n'a ni sommaire ni liste d'ancres, donc rien d'autre à mettre à jour.

## Fichiers que j'ai modifiés

Ce lot :
- `public/app.html` (déjà modifié au lot précédent)
- `public/conditions.html`
- `public/a-propos.html`
- `public/confidentialite.html` (déjà modifié au lot précédent)
- `RAPPORT-SITE-APPSTORE-2.md` (nouveau)

Lot précédent, toujours non commité :
- `server/routes/sitemap.js`
- `server/index.js` (un commentaire)
- `RAPPORT-SITE-APPSTORE.md`

## Vérifications

| Script | Résultat |
|---|---|
| `scripts/test-sitemap-enabled.js` | 3 OK, 0 échec |
| `scripts/test-conditions-page.js` | 33 OK, 0 échec |
| `scripts/test-institutions-page.js` | 47 OK, 0 échec |

Contrôle par rendu avec `renderPage` : la section iOS est bien entre `#application-android` et `#suppression`, et la phrase de `app.html` est présente.

## À vérifier à l'écran

1. `/confidentialite` : la section « Application iOS » (accents, mise en page identique à Android) et le lien direct `/confidentialite#application-ios`.
2. `/app` : la phrase « Le service est open source. » dans l'intro.
3. `/conditions#…` (section propriété intellectuelle) et `/a-propos` (section « Open source ») : les formulations « du site et du serveur ».
4. Le texte de la section iOS doit rester identique à la déclaration publiée sur la fiche App Store.

## Suite possible, non faite

Sur `/app`, la phrase « Ce que l'application Android envoie… » ne renvoie qu'à `#application-android`. Elle peut maintenant pointer aussi vers `#application-ios`.

## Message de commit proposé (couvre aussi le lot précédent)

```
Page /app indexable, App Store (iOS), section iOS de la confidentialite

- app.html : noindex retire, canonical et og/twitter, lien App Store,
  textes Android et iOS, open source rapporte au service
- sitemap.js : /app ajoute aux pages fixes
- index.js : commentaire de la route /app mis a jour
- confidentialite.html : section Application iOS, suppression de compte
  pour Android et iOS
- conditions.html, a-propos.html : le code public est celui du site et du
  serveur
```
