// app-appstore-flag.js — interrupteur d'affichage du badge App Store (bloc « Sur mon smartphone »).
// Jumeau d'app-play-flag.js : tant que la variable d'environnement APP_APPSTORE_URL_ENABLED ne
// vaut pas exactement "true" (défaut : ABSENTE = désactivé), le badge « Télécharger dans l'App
// Store » reste MASQUÉ. Les deux badges sont indépendants : le bloc .appmob s'affiche dès qu'au
// moins un des deux drapeaux est actif. Aucun JS ne lit ce drapeau : seule la feuille de style
// s'en sert (html[data-lba-app-appstore="true"]), l'attribut étant posé par server/pages.js.
'use strict';

function appAppStoreUrlEnabled() {
  return String(process.env.APP_APPSTORE_URL_ENABLED || '').trim() === 'true';
}

module.exports = { appAppStoreUrlEnabled };
