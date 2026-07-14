/* pwa.js — enregistrement du service worker + capture de l'invite d'installation.
   Chargé sur toutes les pages. Aucune UI custom pour l'instant (volet D) :
   le navigateur gère l'invite ; on mémorise juste l'événement pour un usage futur. */

(function () {
  'use strict';

  // Enregistre le service worker après le load (n'impacte pas le rendu initial).
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (err) {
        console.warn('[pwa] échec enregistrement du service worker :', err && err.message);
      });
    });
  }

  // Capture l'invite d'installation pour un déclenchement ultérieur (sans UI).
  window.deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); // empêche l'invite auto ; on la déclenchera nous-mêmes plus tard
    window.deferredInstallPrompt = e;
  });
})();
