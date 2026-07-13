/* theme.js — init du thème + toggle + liaison du bouton .theme-btn.
   Externalisé pour respecter la CSP script-src 'self' (pas de script inline). */

(function () {
  'use strict';
  var K = 'lba-theme';
  var r = document.documentElement;
  var s = null;
  try { s = localStorage.getItem(K); } catch (e) {}
  r.setAttribute('data-theme',
    (s === 'light' || s === 'dark') ? s
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  window.toggleTheme = function () {
    var n = r.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    r.setAttribute('data-theme', n);
    try { localStorage.setItem(K, n); } catch (e) {}
  };

  document.addEventListener('DOMContentLoaded', function () {
    var b = document.querySelector('.theme-btn');
    if (b) b.addEventListener('click', window.toggleTheme);
  });
})();
