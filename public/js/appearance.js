/* appearance.js — section « Apparence » du panneau Mon compte (home, connecté).
   Deux réglages, même style que les switches de notifications (.notif-toggle) :
     · Thème clair / sombre  → window.toggleTheme (theme.js, persistance lba-theme)
     · Contrastes renforcés  → window.toggleContrast (theme.js, persistance lba-contrast)
   Aucune colonne DB : préférences 100 % locales (localStorage). */

(function () {
  'use strict';

  var mount = document.getElementById('appearance-mount');
  if (!mount) return;

  var r = document.documentElement;
  function isDark() { return r.getAttribute('data-theme') === 'dark'; }
  function isHC() { return !!(window.isContrastOn && window.isContrastOn()); }

  mount.innerHTML =
    '<div class="notif-card">' +
    '  <div class="notif-row">' +
    '    <div class="notif-txt"><strong>Thème sombre</strong>' +
    '      <span class="notif-sub">Bascule entre l\'apparence claire et sombre.</span></div>' +
    '    <button type="button" class="notif-toggle" id="appear-theme" role="switch" aria-label="Thème sombre"></button>' +
    '  </div>' +
    '  <div class="notif-row">' +
    '    <div class="notif-txt"><strong>Renforcer les contrastes</strong>' +
    '      <span class="notif-sub">Améliore la lisibilité (accessibilité).</span></div>' +
    '    <button type="button" class="notif-toggle" id="appear-contrast" role="switch" aria-label="Renforcer les contrastes"></button>' +
    '  </div>' +
    '</div>';

  var themeTgl = document.getElementById('appear-theme');
  var contrastTgl = document.getElementById('appear-contrast');

  function paint(el, on) {
    if (!el) return;
    el.classList.toggle('on', !!on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  }
  function refresh() { paint(themeTgl, isDark()); paint(contrastTgl, isHC()); }
  refresh();

  themeTgl.addEventListener('click', function () {
    if (window.toggleTheme) window.toggleTheme();
    refresh();
  });
  contrastTgl.addEventListener('click', function () {
    if (window.toggleContrast) window.toggleContrast();
    refresh();
  });

  // Le thème peut aussi changer depuis le bouton ◐ du header (desktop) : on
  // resynchronise l'interrupteur si l'attribut data-theme est modifié ailleurs.
  try {
    var obs = new MutationObserver(function () { paint(themeTgl, isDark()); });
    obs.observe(r, { attributes: true, attributeFilter: ['data-theme'] });
  } catch (e) { /* MutationObserver absent : sync au clic uniquement */ }
})();
