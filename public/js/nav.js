/* nav.js — menu mobile (hamburger). L'état de connexion du header
   est géré par session.js (renderHeader). */

(function () {
  'use strict';
  var toggle = document.querySelector('.nav-toggle');
  var menu = document.getElementById('nav-menu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', function () {
    var open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  menu.addEventListener('click', function (e) {
    if (e.target.closest('a')) {
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
})();
