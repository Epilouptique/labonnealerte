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

  /* Accessibilité : contrastes renforcés (préférence locale, pas de compte requis).
     La classe body.high-contrast est posée site-wide ; le détail des contrastes
     renforcés se fera dans un CSS dédié (chantier séparé). */
  var KC = 'lba-contrast';
  var hc = false;
  try { hc = localStorage.getItem(KC) === '1'; } catch (e) {}
  function applyContrast() {
    if (document.body) document.body.classList.toggle('high-contrast', hc);
  }
  if (document.body) applyContrast();
  else document.addEventListener('DOMContentLoaded', applyContrast);

  window.isContrastOn = function () { return hc; };
  window.toggleContrast = function () {
    hc = !hc;
    try { localStorage.setItem(KC, hc ? '1' : '0'); } catch (e) {}
    applyContrast();
    return hc;
  };

  document.addEventListener('DOMContentLoaded', function () {
    var b = document.querySelector('.theme-btn');
    if (b) b.addEventListener('click', window.toggleTheme);
  });
})();
