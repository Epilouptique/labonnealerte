# RAPPORT SITE-APPSTORE : page /app et politique de confidentialité

Rien n'a été commité, poussé, déployé ni zippé. `LabonnealerteApp` et `LabonnealerteMobile` n'ont été que lus.

## Phase A1 : état des lieux

- **noindex** : un seul endroit, la balise `<meta name="robots" content="noindex">` de `public/app.html`. Aucun en-tête HTTP (`sendPage` n'en pose pas), rien dans `public/robots.txt` (seulement `Disallow: /api/`), et pas de `/app` dans le sitemap : `STATIC_PATHS` de `server/routes/sitemap.js` ne le listait pas. Le commentaire de `server/index.js` (route `/app`) parlait encore de noindex.
- **Badge Google Play sur /app** : lien texte, sans image, dans la liste « Télécharger » (`public/app.html`).
- **Badge Google Play sur l'accueil** : image locale `public/img/google-play-fr.png` (646 × 250, affichée à 220 px), dans le bloc `.appmob` de `public/index.html`. Ce bloc est masqué par la CSS (`site.css`) tant que `APP_PLAY_URL_ENABLED` n'est pas `true` (`server/app-play-flag.js`, attribut posé par `server/pages.js`).
- **Page dans le sitemap** : non, avant ma modification.

## Fichiers que j'ai modifiés

- `public/app.html`
- `public/confidentialite.html`
- `server/routes/sitemap.js`
- `server/index.js` (un commentaire seulement)
- `RAPPORT-SITE-APPSTORE.md` (nouveau)

## Ce qui a changé

- **/app** : noindex retiré, `canonical` et bloc `og:*` / `twitter:*` ajoutés (même bloc que `conditions.html`), `/app` ajouté au sitemap.
- **Badge App Store** : lien texte « App Store (iOS) » à côté de « Google Play (Android) », donc même mécanique que l'existant. Aucune image n'est nécessaire pour cette page.
- **Textes de /app** (titre, description, h1) : « application mobile (Android et iOS) ». Les lignes propres à Android sont étiquetées « sur Android » : connexion avec Google, plafond de notifications, silence 1 h / 24 h, forum, animaux perdus, échéances, widgets, ntfy. Les lignes communes (kiosque, connexion par code, canal de réception, heures calmes, Mes alertes, favoris, mode sombre) ne sont pas étiquetées. Je me suis appuyé sur `LabonnealerteMobile/PARITE-ANDROID-IOS.md` (daté du 12/11).
- **Confidentialité, `#suppression`** : « dans l'application mobile (Android et iOS) : Mon compte › Réglages › Supprimer mon compte ». Le chemin est identique sur iOS : `reglages.tsx` (iOS) a « Supprimer mon compte » en bas de Réglages. L'écran Compte iOS a en plus une ligne directe, ce qui n'invalide pas la phrase.

## Image de badge

Aucune pour `/app`. Il en faudra une seulement si tu veux le badge App Store dans le bloc de l'accueil : le badge officiel Apple en français, même toile que `google-play-fr.png`, soit **646 × 250 px** en PNG transparent avec zone de dégagement. Je ne l'ai ni fabriqué ni téléchargé.

## À signaler, sans modification

- **`public/index.html`, bloc `.appmob`** (fichier du chantier encarts, non touché) : Android seulement (lien et badge Play, titre « L'appli… »). Il reste masqué par le drapeau nommé `APP_PLAY_URL_ENABLED` : il faut le poser sur Railway pour l'afficher.
- **`confidentialite.html`, section `#application-android`** : entièrement Android (paquet `fr.labonnealerte.app`, « Continuer avec Google (version Google Play seulement) », notifications UnifiedPush / ntfy, données gardées sur le téléphone). Aucune section ne décrit l'app iOS : jeton de notification Expo, absence de Google, etc. Il faut une section iOS vraie, rédigée à partir de ce que l'app collecte.
- **`/app`, phrase d'intro** : « Gratuit, open source, sans publicité ni traceur » est conservée telle quelle. Je ne peux pas confirmer que l'app iOS est open source.
- **Conditions d'utilisation** : aucune mention d'application ni d'Android, rien à adapter.
- **Pied de page, en-tête, scripts du site** : aucun renvoi vers l'app.

## Tests

`package.json` n'a pas de script de test. J'ai lancé les scripts qui touchent ces fichiers :

| Script | Résultat |
|---|---|
| `scripts/test-sitemap-enabled.js` | 3 OK, 0 échec |
| `scripts/test-conditions-page.js` | 33 OK, 0 échec |
| `scripts/test-institutions-page.js` | 47 OK, 0 échec |

Aucun test ne couvre `/app` ou la confidentialité. Contrôle par rendu avec `renderPage` : pas de noindex, `canonical` présent, footer injecté, 2 liens de store, phrase de suppression mise à jour.

## À vérifier à l'écran

1. `/app` : les deux liens, leurs libellés, les phrases « sur Android », la lisibilité sur mobile et en mode sombre.
2. Le lien App Store ne s'ouvrira correctement que quand la fiche sera en ligne.
3. Après déploiement : `/sitemap.xml` contient `https://labonnealerte.fr/app`, et le code source de `/app` n'a plus de `noindex`.
4. `/confidentialite#suppression`.
5. Les lignes de `/app` sans étiquette valent aussi pour la version publiée de l'app iOS, à comparer avec elle.

## Message de commit proposé

```
Page /app : indexable, App Store (iOS) ajoute, textes Android et iOS

- app.html : noindex retire, canonical et og/twitter, lien App Store,
  textes mobile (Android et iOS), lignes propres a Android etiquetees
- sitemap.js : /app ajoute aux pages fixes
- index.js : commentaire de la route /app mis a jour
- confidentialite.html : suppression de compte, application mobile
  (Android et iOS)
```
