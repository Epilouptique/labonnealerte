/* Écran de chargement COMMUN (voir site.css, body.loading).
   Retire le flag body.loading dès que le contenu de la page est prêt.
   L'accueil (index) gère lui-même son retrait dans site.js ; ce script couvre les
   pages « à données » (source, collection, deck, favoris, mes-decks, le-point,
   connexion), qui révèlent toutes leur contenu en passant leur loader `hidden`.
   Aucune modification du JS de chaque page : on observe simplement ce loader. */
(function () {
  'use strict';
  var body = document.body;
  if (!body || !body.classList.contains('loading')) return;

  // Loader propre à la page (halo interne existant). Absent sur l'accueil → on
  // laisse site.js faire le retrait.
  var loader = document.querySelector('.src-loading, .cx-loading');
  if (!loader) return;

  function done() { body.classList.remove('loading'); }

  var obs = new MutationObserver(function () {
    if (loader.hidden || !loader.isConnected) { obs.disconnect(); done(); }
  });
  // Révélation par attribut `hidden` (cas majoritaire) ou par retrait du DOM.
  obs.observe(loader, { attributes: true, attributeFilter: ['hidden'] });
  if (loader.parentNode) obs.observe(loader.parentNode, { childList: true });

  // Filet anti-blocage : ne jamais rester coincé sur le halo (réseau mort, bug).
  setTimeout(done, 20000);
})();
