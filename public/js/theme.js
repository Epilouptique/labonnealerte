/* theme.js — init du thème + toggle + liaison du bouton .theme-btn.
   Externalisé pour respecter la CSP script-src 'self' (pas de script inline). */

(function () {
  'use strict';
  /* Préférence de thème : 'light', 'dark', ou rien = AUTO (suit le système).
     Miroir de la logique de site.js (la home charge site.js à la place de ce
     fichier) : toute retouche ici doit l'être des deux côtés. */
  var K = 'lba-theme';
  var r = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function systemTheme() { return mq && mq.matches ? 'dark' : 'light'; }
  function pref() {
    var s = null;
    try { s = localStorage.getItem(K); } catch (e) {}
    return (s === 'light' || s === 'dark') ? s : 'auto';
  }
  function apply() { r.setAttribute('data-theme', pref() === 'auto' ? systemTheme() : pref()); }
  apply();

  window.getThemePref = pref;
  window.setThemePref = function (p) {
    if (p !== 'light' && p !== 'dark') p = 'auto';
    try {
      if (p === 'auto') localStorage.removeItem(K);
      else localStorage.setItem(K, p);
    } catch (e) {}
    apply();
    return p;
  };
  // En AUTO, le thème suit les changements système en direct (bascule nuit de l'OS).
  if (mq) {
    var onSys = function () { if (pref() === 'auto') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onSys);
    else if (mq.addListener) mq.addListener(onSys);
  }

  window.toggleTheme = function () {
    window.setThemePref(r.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
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
