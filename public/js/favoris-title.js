/* favoris-title.js — rotation du H1 de la page /favoris entre 4 valeurs :
 *   « Ma collection » → « Mes favoris » → « Ma collection » → « Mes favorites » → boucle.
 * (« Mes favorites » au féminin = clin d'œil volontaire, pas une coquille.)
 *
 * Réutilise EXACTEMENT le vocabulaire de transition du bouton « Déposer une alerte »
 * (classes bd-slide-out/in, keyframe bd-slide-in de site.css), adapté à une séquence de 4
 * valeurs. Bicoloration conservée (1er mot en --ink, le reste en .hl violet), comme tous les
 * titres du site. Garde prefers-reduced-motion (bascule instantanée, sans animation).
 */
(function () {
  'use strict';

  var REDUCE = false;
  try { REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // Séquence figée (aucune donnée utilisateur) : { a: 1er mot (--ink), b: reste (.hl) }.
  var WORDS = [
    { a: 'Ma', b: 'collection' },
    { a: 'Mes', b: 'favoris' },
    { a: 'Ma', b: 'collection' },
    { a: 'Mes', b: 'favorites' }
  ];

  function html(w) { return w.a + ' <span class="hl">' + w.b + '</span>'; }

  function init() {
    var h1 = document.getElementById('fav-title');
    if (!h1) return;
    var label = h1.querySelector('.fav-title-label');
    if (!label) return;
    var i = 0;
    setInterval(function () {
      i = (i + 1) % WORDS.length;
      var w = WORDS[i];
      if (REDUCE) { label.innerHTML = html(w); return; }
      label.classList.add('bd-slide-out');
      setTimeout(function () {
        label.innerHTML = html(w);
        label.classList.remove('bd-slide-out');
        label.classList.add('bd-slide-in');
        setTimeout(function () { label.classList.remove('bd-slide-in'); }, 280);
      }, 220);
    }, 4200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
