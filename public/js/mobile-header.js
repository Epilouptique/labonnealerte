/* mobile-header.js — refonte de l'en-tête de la PAGE KIOSQUE (home uniquement).
   - Relocalise la barre de recherche + les catégories DANS le header (sous le titre
     sur mobile, en ligne centrée sur desktop) — relocalisation DOM : les écouteurs
     déjà attachés suivent les nœuds.
   - Relocalise le KPI « alertes actives » dans le header (à droite du bouton thème).
   - Pose body.m-kiosk (active les blocs CSS dédiés à la home).
   - Condense le header au scroll (body.m-scrolled) avec hystérésis.
   - Tap sur une carte (mobile) → révèle sa description (.card p) et son état (.state).

   GARDE : si la page n'a pas de <main .toolbar> (donc pas la home), on sort tout de
   suite → les autres pages (/a-propos, /source/…) n'héritent JAMAIS de cette refonte. */

(function () {
  'use strict';

  var nav = document.querySelector('header .nav');
  var toolbar = document.querySelector('main .toolbar');
  if (!nav || !toolbar) return; // pas la page kiosque : rien à faire.

  var search = toolbar.querySelector('.search');
  var secondary = document.getElementById('chips-secondary-wrap');
  var navRight = nav.querySelector('.nav-right');
  var kpi = document.querySelector('.hero .kpi');
  var grid = document.getElementById('grid');
  var mq = window.matchMedia('(max-width: 720px)');

  document.body.classList.add('m-kiosk');

  // Refonte façon leboncoin : le header devient un bloc à deux rangées.
  //  · Rangée 1 : la barre de recherche migre en zone centrale flexible (avant .nav-right).
  //  · Rangée 2 : les puces de catégories (.toolbar, désormais sans la recherche) puis
  //    la 2e ligne de catégories (#chips-secondary-wrap). Relocalisation DOM : les
  //    écouteurs déjà attachés (filtrage instantané) suivent les nœuds.
  if (search && navRight) nav.insertBefore(search, navRight);
  nav.appendChild(toolbar);
  if (secondary) nav.appendChild(secondary);
  // KPI : dernière position de .nav-right → tout à droite de la rangée 1 (desktop).
  if (kpi && navRight) navRight.appendChild(kpi);

  /* ===================== Menu mobile plein écran (rangée 1) =====================
     Sur mobile, le header ne garde que : hamburger + titre (rangée 1), recherche
     (rangée 2), rail de catégories (rangée 3). Connexion/compte, « Déposer », etc.
     migrent dans ce menu plein écran. Desktop : #m-menu masqué (CSS), .nav-right
     reste la rangée de liens habituelle → aucune régression desktop. */
  var brand = nav.querySelector('.brand');
  var REDUCE_M = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Spacer de la rangée 1 (équilibre le hamburger pour centrer optiquement le titre).
  var spacer = document.createElement('span');
  spacer.className = 'm-nav-spacer';
  spacer.setAttribute('aria-hidden', 'true');
  nav.appendChild(spacer);

  var logged = !!(window.LBASession && window.LBASession.get && window.LBASession.get());
  var logoHTML = brand ? brand.innerHTML : 'labonnealerte';

  var menu = document.createElement('div');
  menu.className = 'm-menu';
  menu.id = 'm-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-modal', 'true');
  menu.setAttribute('aria-label', 'Menu');
  menu.innerHTML =
    '<div class="m-menu-inner">' +
      '<div class="m-menu-head">' +
        '<span class="brand brandmark m-menu-logo" aria-hidden="true">' + logoHTML + '</span>' +
        '<button type="button" class="m-menu-close" aria-label="Fermer le menu">✕</button>' +
      '</div>' +
      '<nav class="m-menu-list" aria-label="Navigation principale">' +
        '<a href="#" class="m-primary" data-act="auth">' + (logged ? 'Mon compte' : 'Se connecter') + '</a>' +
        '<a href="/proposer">Déposer une alerte</a>' +
        '<button type="button" class="m-link" data-act="search">Rechercher</button>' +
        '<hr class="m-menu-sep">' +
        '<a href="/proposer">Espace développeurs</a>' +
        '<a href="#openalert" data-act="anchor">OpenAlert</a>' +
        '<hr class="m-menu-sep">' +
        (logged ? '<button type="button" class="m-link" data-act="mine">Mes alertes</button>' : '') +
        // « Les nouvelles » et « La sélection » : fonctionnalités à venir → entrées
        // désactivées (non cliquables, grisées, badge « Bientôt »). Pas de page cible.
        '<span class="m-link m-soon" aria-disabled="true">Les nouvelles<span class="soon">Bientôt</span></span>' +
        '<span class="m-link m-soon" aria-disabled="true">La sélection<span class="soon">Bientôt</span></span>' +
        '<hr class="m-menu-sep">' +
        '<a href="/soutenir">Nous soutenir</a>' +
        '<a href="/mentions-legales">Mentions légales</a>' +
      '</nav>' +
      '<div class="m-menu-foot">' +
        '<button type="button" class="theme-btn m-theme" aria-label="Changer de thème">◐</button>' +
        '<span class="m-theme-label">Thème clair / sombre</span>' +
      '</div>' +
    '</div>';
  document.body.appendChild(menu);

  var toggle = nav.querySelector('.nav-toggle');
  // Retire l'écouteur générique de nav.js (dropdown .nav-right) sur la home : on
  // remplace le bouton par son clone (drop des listeners) puis on câble le menu plein écran.
  if (toggle) { var fresh = toggle.cloneNode(true); toggle.parentNode.replaceChild(fresh, toggle); toggle = fresh; }

  var lastFocus = null;
  function openMenu() {
    lastFocus = document.activeElement;
    menu.hidden = false;
    document.body.classList.add('m-menu-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    if (!REDUCE_M) {
      menu.classList.add('m-anim');
      // force reflow puis .open pour animer le fondu
      void menu.offsetWidth;
      menu.classList.add('open');
    }
    var first = menu.querySelector('.m-menu-list a, .m-menu-list button');
    if (first) first.focus();
  }
  function closeMenu() {
    if (menu.hidden) return;
    document.body.classList.remove('m-menu-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    var done = function () { menu.hidden = true; menu.classList.remove('m-anim', 'open'); };
    if (!REDUCE_M && menu.classList.contains('open')) {
      menu.classList.remove('open');
      setTimeout(done, 200);
    } else { done(); }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  if (toggle) toggle.addEventListener('click', function () {
    if (menu.hidden) openMenu(); else closeMenu();
  });
  menu.querySelector('.m-menu-close').addEventListener('click', closeMenu);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); closeMenu(); }
  });

  // Actions des entrées du menu.
  menu.addEventListener('click', function (e) {
    var themeBtn = e.target.closest('.m-theme');
    if (themeBtn) { if (window.toggleTheme) window.toggleTheme(); return; }
    var el = e.target.closest('[data-act], a');
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'auth') {
      e.preventDefault(); closeMenu();
      if (logged) { if (window.LBAAccount && window.LBAAccount.toggle) window.LBAAccount.toggle(); }
      else window.location.href = '/connexion';
      return;
    }
    if (act === 'search') {
      e.preventDefault(); closeMenu();
      var q = document.getElementById('q'); if (q) setTimeout(function () { q.focus(); }, REDUCE_M ? 0 : 210);
      return;
    }
    if (act === 'mine') {
      e.preventDefault(); closeMenu();
      var c = document.querySelector('.chip-f[data-cat="mine"]');
      if (c) c.click();
      return;
    }
    if (act === 'anchor') {
      // Laisse l'ancre agir (#openalert) mais ferme d'abord le menu.
      closeMenu(); return;
    }
    // Liens de navigation classiques : on ferme le menu (la navigation suit).
    if (el.tagName === 'A' && el.getAttribute('href') && el.getAttribute('href').charAt(0) !== '#') closeMenu();
  });

  /* -------- Condensation du header au scroll (hystérésis) -------- */
  var scrolled = false;
  function onScroll() {
    if (!mq.matches) { // condensation active uniquement sur mobile
      if (scrolled) { document.body.classList.remove('m-scrolled'); scrolled = false; }
      return;
    }
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (!scrolled && y > 60) { scrolled = true; document.body.classList.add('m-scrolled'); }
    else if (scrolled && y < 30) { scrolled = false; document.body.classList.remove('m-scrolled'); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  if (mq.addEventListener) mq.addEventListener('change', onScroll);
  else if (mq.addListener) mq.addListener(onScroll);
  onScroll();

  // Tap sur le corps d'une carte → bascule .revealed (description + état).
  // On ignore les éléments interactifs (switch, boutons ⓘ/partage, liens, form)
  // et les cartes retournées (verso affiché).
  if (grid) {
    grid.addEventListener('click', function (e) {
      if (!mq.matches) return;
      var card = e.target.closest('.card');
      if (!card || card.classList.contains('add') || card.classList.contains('flipped')) return;
      if (e.target.closest('a, button, input, label, .switch, .sub-form')) return;
      card.classList.toggle('revealed');
    });
  }
})();
