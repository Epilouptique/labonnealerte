// app-play-flag.js — interrupteur d'affichage du bloc « Sur mon smartphone » (accueil).
// Tant que la variable d'environnement APP_PLAY_URL_ENABLED ne vaut pas exactement "true"
// (défaut : ABSENTE = désactivé), le bloc d'invitation vers l'application Android (badge
// « Disponible sur Google Play ») reste MASQUÉ : la fiche Play n'est pas encore publiée.
// On l'activera côté Railway en posant APP_PLAY_URL_ENABLED=true, exactement comme
// PUBLISH_ENABLED. Aucun JS ne lit ce drapeau : seule la feuille de style s'en sert
// (html[data-lba-app-play="true"]), l'attribut étant posé par server/pages.js.
'use strict';

function appPlayUrlEnabled() {
  return String(process.env.APP_PLAY_URL_ENABLED || '').trim() === 'true';
}

module.exports = { appPlayUrlEnabled };
