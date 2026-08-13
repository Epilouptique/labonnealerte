/* appearance.js — section « Apparence » du panneau Mon compte (home, connecté).
   Trois réglages, au style des switches de notifications (.notif-toggle) :
     · Thème clair / auto / sombre → window.setThemePref (site.js, clé lba-theme).
       « Auto » (défaut) = aucune valeur stockée : le thème suit prefers-color-scheme
       et réagit en direct ; un choix explicite le fige.
     · Contrastes renforcés  → window.toggleContrast (theme.js, persistance lba-contrast)
   Aucune colonne DB : préférences 100 % locales (localStorage). */

(function () {
  'use strict';

  var mount = document.getElementById('appearance-mount');
  if (!mount) return;

  var r = document.documentElement;
  function isHC() { return !!(window.isContrastOn && window.isContrastOn()); }

  mount.innerHTML =
    '<div class="notif-card">' +
    '  <div class="notif-row">' +
    '    <div class="notif-txt"><strong>Thème</strong>' +
    '      <span class="notif-sub"></span></div>' +
    '    <div class="pref-seg" id="appear-theme" role="radiogroup" aria-label="Thème">' +
    '      <button type="button" role="radio" data-theme-pref="light">Clair</button>' +
    '      <button type="button" role="radio" data-theme-pref="auto">Auto</button>' +
    '      <button type="button" role="radio" data-theme-pref="dark">Sombre</button>' +
    '    </div>' +
    '  </div>' +
    '  <div class="notif-row">' +
    '    <div class="notif-txt"><strong>Renforcer les contrastes</strong>' +
    '      <span class="notif-sub">Améliore la lisibilité (accessibilité).</span></div>' +
    '    <button type="button" class="notif-toggle" id="appear-contrast" role="switch" aria-label="Renforcer les contrastes"></button>' +
    '  </div>' +
    '  <div class="notif-row">' +
    '    <div class="notif-txt"><strong>Vue liste</strong>' +
    '      <span class="notif-sub">Affiche le kiosque en liste dense plutôt qu\'en cartes.</span></div>' +
    '    <button type="button" class="notif-toggle" id="appear-view" role="switch" aria-label="Vue liste"></button>' +
    '  </div>' +
    '</div>';

  var themeSeg = document.getElementById('appear-theme');
  var contrastTgl = document.getElementById('appear-contrast');
  var viewTgl = document.getElementById('appear-view');
  function isList() { return !!(window.LBAViewMode && LBAViewMode.get() === 'list'); }
  function themePref() { return (window.getThemePref && window.getThemePref()) || 'auto'; }

  function paint(el, on) {
    if (!el) return;
    el.classList.toggle('on', !!on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  }
  // Segment de thème : le bouton correspondant à la préférence est marqué actif —
  // c'est la PRÉFÉRENCE ('auto' inclus) qui est peinte, pas le thème résolu, sinon
  // « Auto » ne serait jamais visible comme sélectionné.
  function paintTheme() {
    if (!themeSeg) return;
    var p = themePref();
    themeSeg.querySelectorAll('[data-theme-pref]').forEach(function (b) {
      var on = b.getAttribute('data-theme-pref') === p;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  function refresh() { paintTheme(); paint(contrastTgl, isHC()); paint(viewTgl, isList()); }
  refresh();

  // Vue cartes/liste : même source de vérité que le toggle de la toolbar (LBAViewMode).
  if (viewTgl) viewTgl.addEventListener('click', function () {
    if (window.LBAViewMode) LBAViewMode.set(isList() ? 'cards' : 'list');
    paint(viewTgl, isList());
  });
  // Resync si la vue change ailleurs (toolbar) — garde les deux contrôles alignés.
  document.addEventListener('lba-view-change', function () { paint(viewTgl, isList()); });

  if (themeSeg) themeSeg.addEventListener('click', function (e) {
    var b = e.target.closest('[data-theme-pref]');
    if (!b) return;
    if (window.setThemePref) window.setThemePref(b.getAttribute('data-theme-pref'));
    paintTheme();
  });
  contrastTgl.addEventListener('click', function () {
    if (window.toggleContrast) window.toggleContrast();
    refresh();
  });

  // Le thème peut aussi changer depuis le bouton ◐ du header (mobile) ou suivre le
  // système en « Auto » : on resynchronise le segment si data-theme bouge ailleurs.
  try {
    var obs = new MutationObserver(paintTheme);
    obs.observe(r, { attributes: true, attributeFilter: ['data-theme'] });
  } catch (e) { /* MutationObserver absent : sync au clic uniquement */ }
})();
