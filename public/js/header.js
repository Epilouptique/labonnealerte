/* header.js — SOURCE UNIQUE du header partagé (Lot 5).
   - Expose window.LBAHeader.buildMenu(nav, opts) : le menu mobile plein écran,
     réutilisé par la home (mobile-header.js le délègue) ET par les autres pages.
   - Sur les pages HORS home : injecte la MÊME 1re rangée de header que la home
     (logo / Déposer / recherche / OpenAlert / Se connecter|Mon compte / thème),
     pose body.m-kiosk (mêmes styles), câble la recherche → /?q=<terme>, construit
     le menu. PAS de 2e rangée (catégories) : réservée à la home.
   - Le thème « Veille de nuit » (body.dev) est préservé : on n'écrit aucune couleur
     en dur, tout passe par les variables CSS (var(--amber) = #bd8ef0 en dark). */

(function () {
  'use strict';

  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ===================== Menu mobile plein écran (partagé) ===================== */
  // opts : { isHome:boolean, logged:boolean }
  function buildMenu(nav, opts) {
    opts = opts || {};
    var isHome = !!opts.isHome;
    var logged = !!opts.logged;
    var brand = nav.querySelector('.brand');
    var logoHTML = brand ? brand.innerHTML : 'labonnealerte';

    // Spacer de la rangée 1 (équilibre le hamburger → titre centré optiquement).
    if (!nav.querySelector('.m-nav-spacer')) {
      var spacer = document.createElement('span');
      spacer.className = 'm-nav-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      nav.appendChild(spacer);
    }

    if (document.getElementById('m-menu')) return; // déjà construit

    var menu = document.createElement('div');
    menu.className = 'm-menu';
    menu.id = 'm-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-modal', 'true');
    menu.setAttribute('aria-label', 'Menu');
    // A3) Icônes SVG (même famille que SHARE_SVG/INFO_SVG : trait 2px, linecap round,
    // currentColor) pour « Les nouvelles » (éclat/étoile filante) et « La sélection »
    // (marque-page). Flèche retour = même vocabulaire que BACK_SVG des cartes.
    var IC_NOUV = '<svg class="m-ic" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2l1.7 4L18 8.9l-4.3 1.7L12 14.9l-1.7-4.3L6 8.9l4.3-1.7z"/><path d="M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg>';
    var IC_SEL = '<svg class="m-ic" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5h11a1 1 0 0 1 1 1V20l-6.5-4.2L5.5 20V4.5a1 1 0 0 1 1-1z"/></svg>';
    var IC_CAT = '<svg class="m-ic" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>';
    var IC_BACK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v3"/></svg>';

    // Face AVANT du menu (A2 : ordre revu — Catégories/Nouvelles/Sélection montent à
    // la place de Espace dev/OpenAlert, qui descendent juste avant Mentions légales).
    var frontHTML =
      '<div class="m-menu-inner">' +
        '<div class="m-menu-head">' +
          '<span class="brand brandmark m-menu-logo" aria-hidden="true">' + logoHTML + '</span>' +
          '<button type="button" class="m-menu-close" aria-label="Fermer le menu">✕</button>' +
        '</div>' +
        '<nav class="m-menu-list" aria-label="Navigation principale">' +
          (logged
            ? '<button type="button" class="m-link m-primary" data-act="mine">Ma collection</button>' +
              '<a href="/mes-decks" class="m-link">Mes decks</a>'
            : '<a href="/connexion" class="m-primary" data-act="auth">Se connecter</a>') +
          '<a href="/proposer">Déposer une alerte</a>' +
          '<button type="button" class="m-link" data-act="search">Rechercher</button>' +
          '<hr class="m-menu-sep">' +
          (logged ? '<button type="button" class="m-link" data-act="account">Mon compte</button>' : '') +
          '<button type="button" class="m-link m-has-ic" data-act="categories">' + IC_CAT + ' Catégories</button>' +
          '<button type="button" class="m-link m-has-ic" data-act="nouveautes">' + IC_NOUV + ' Les nouvelles</button>' +
          '<button type="button" class="m-link m-has-ic" data-act="selection">' + IC_SEL + ' La sélection</button>' +
          '<hr class="m-menu-sep">' +
          '<a href="/soutenir">Nous soutenir</a>' +
          '<hr class="m-menu-sep">' +
          '<a href="/proposer">Espace développeurs</a>' +
          '<a href="' + (isHome ? '#openalert' : '/#openalert') + '" data-act="anchor">OpenAlert</a>' +
          '<a href="/mentions-legales">Mentions légales</a>' +
          (logged ? '<button type="button" class="m-link m-logout" data-act="logout">Se déconnecter</button>' : '') +
        '</nav>' +
        '<div class="m-menu-foot">' +
          '<button type="button" class="theme-btn m-theme" aria-label="Changer de thème">◐</button>' +
          '<span class="m-theme-label">Thème clair / sombre</span>' +
        '</div>' +
      '</div>';

    // A1) Face ARRIÈRE : liste des catégories (révélée par retournement du menu).
    // Le logo reste ; le ✕ est remplacé par une flèche retour (← reflip, ne ferme pas).
    var backHTML =
      '<div class="m-menu-inner">' +
        '<div class="m-menu-head">' +
          '<span class="brand brandmark m-menu-logo" aria-hidden="true">' + logoHTML + '</span>' +
          '<button type="button" class="m-menu-close m-cat-back" aria-label="Retour au menu">' + IC_BACK + '</button>' +
        '</div>' +
        '<div class="m-menu-cat-title">Catégories</div>' +
        '<nav class="m-menu-list m-menu-cats" id="m-menu-cats" aria-label="Catégories"></nav>' +
      '</div>';

    menu.innerHTML =
      '<div class="m-menu-flip" id="m-menu-flip">' +
        '<div class="m-menu-face m-face-front">' + frontHTML + '</div>' +
        '<div class="m-menu-face m-face-back">' + backHTML + '</div>' +
      '</div>';
    document.body.appendChild(menu);

    var toggle = nav.querySelector('.nav-toggle');
    // Retire l'écouteur générique de nav.js (dropdown .nav-right) puis câble le plein écran.
    if (toggle) { var fresh = toggle.cloneNode(true); toggle.parentNode.replaceChild(fresh, toggle); toggle = fresh; }

    var lastFocus = null;
    function openMenu() {
      lastFocus = document.activeElement;
      var flipEl = menu.querySelector('.m-menu-flip');
      if (flipEl) flipEl.classList.remove('flipped'); // toujours ouvrir sur la face avant
      menu.hidden = false;
      document.body.classList.add('m-menu-open');
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
      if (!REDUCE) { menu.classList.add('m-anim'); void menu.offsetWidth; menu.classList.add('open'); }
      var first = menu.querySelector('.m-menu-list a, .m-menu-list button');
      if (first) first.focus();
    }
    function closeMenu() {
      if (menu.hidden) return;
      document.body.classList.remove('m-menu-open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      var done = function () { menu.hidden = true; menu.classList.remove('m-anim', 'open'); };
      if (!REDUCE && menu.classList.contains('open')) { menu.classList.remove('open'); setTimeout(done, 520); }
      else { done(); }
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    if (toggle) toggle.addEventListener('click', function () { if (menu.hidden) openMenu(); else closeMenu(); });
    menu.querySelector('.m-menu-close').addEventListener('click', closeMenu);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); closeMenu(); } });

    // Applique un mode/filtre de grille : sur la home via la puce, ailleurs via /?mode=.
    function gridAction(mode) {
      var c = isHome ? document.querySelector('.chip-f[data-cat="' + mode + '"]') : null;
      if (c) c.click();
      else window.location.href = '/?mode=' + encodeURIComponent(mode);
    }

    var escH = function (s) { return window.LBACards ? window.LBACards.esc(s) : String(s == null ? '' : s); };
    // A1) Remplit la face arrière avec la liste des catégories du kiosque. Source :
    // window.LBAKioskCats (posé par site.js/renderChips, mêmes catégories que le rail
    // de la home), sinon repli sur la taxonomie LBACat.
    function fillCats() {
      var host = document.getElementById('m-menu-cats');
      if (!host) return;
      var cats = window.LBAKioskCats;
      if ((!cats || !cats.length) && window.LBACat && window.LBACat.all) {
        cats = window.LBACat.all().map(function (c) { return { slug: c.slug, label: c.label, count: null }; });
      }
      cats = cats || [];
      host.innerHTML = cats.map(function (c) {
        return '<button type="button" class="m-link m-cat-item" data-cat="' + escH(c.slug) + '">' +
          escH(c.label) + (c.count != null ? ' <span class="m-cat-n">' + c.count + '</span>' : '') + '</button>';
      }).join('') || '<div class="m-cat-empty">Aucune catégorie.</div>';
    }
    function flipTo(back) {
      var flip = document.getElementById('m-menu-flip');
      if (flip) flip.classList.toggle('flipped', !!back);
    }

    menu.addEventListener('click', function (e) {
      if (e.target.closest('.m-theme')) { if (window.toggleTheme) window.toggleTheme(); return; }
      // A1) Flèche retour de la face catégories → reflip vers l'avant (ne ferme pas).
      if (e.target.closest('.m-cat-back')) { e.preventDefault(); flipTo(false); return; }
      // A1) Clic sur une catégorie → applique le filtre puis ferme tout.
      var catItem = e.target.closest('.m-cat-item');
      if (catItem) {
        e.preventDefault();
        var slug = catItem.getAttribute('data-cat');
        closeMenu(); flipTo(false);
        var chip = isHome ? document.querySelector('.chip-f[data-cat="' + slug + '"]') : null;
        if (chip) chip.click();
        else window.location.href = '/?cat=' + encodeURIComponent(slug);
        return;
      }
      var el = e.target.closest('[data-act], a');
      if (!el) return;
      var act = el.getAttribute('data-act');
      // A1) « Catégories » → retourne le menu (au lieu de fermer).
      if (act === 'categories') { e.preventDefault(); fillCats(); flipTo(true); return; }
      if (act === 'auth') {
        e.preventDefault(); closeMenu();
        if (logged && isHome && window.LBAAccount && window.LBAAccount.toggle) window.LBAAccount.toggle();
        else window.location.href = logged ? '/' : '/connexion';
        return;
      }
      if (act === 'search') {
        e.preventDefault(); closeMenu();
        var q = document.getElementById('q'); if (q) setTimeout(function () { q.focus(); }, REDUCE ? 0 : 210);
        return;
      }
      if (act === 'mine' || act === 'nouveautes' || act === 'selection') {
        e.preventDefault(); closeMenu(); gridAction(act); return;
      }
      if (act === 'account') {
        e.preventDefault(); closeMenu();
        if (isHome && window.LBAAccount && window.LBAAccount.toggle) window.LBAAccount.toggle();
        else window.location.href = '/';
        return;
      }
      if (act === 'logout') {
        e.preventDefault(); closeMenu();
        if (window.LBASession && window.LBASession.logout) window.LBASession.logout();
        return;
      }
      if (act === 'anchor') { closeMenu(); return; } // laisse l'ancre agir
      if (el.tagName === 'A' && el.getAttribute('href') && el.getAttribute('href').charAt(0) !== '#') closeMenu();
    });
  }

  window.LBAHeader = { buildMenu: buildMenu };

  /* ===================== Bouton « Déposer une alerte » : rotation de libellé ===================== */
  // Le libellé alterne « Déposer une alerte » (→ /proposer) et « Ajouter un deck »
  // (→ /mes-decks). Réservé aux connectés (les decks sont une fonctionnalité de
  // compte ; l'anonyme garde le libellé statique). Présent sur toutes les pages.
  // TODO(ergonomie-decks) : réglage plus fin prévu plus tard (cadence, transition,
  // davantage de libellés) — on ne touche pas ici au reste de la mécanique du bouton.
  function setupDepositRotation() {
    var btn = document.querySelector('.btn-deposit');
    if (!btn) return;
    var logged = !!(window.LBASession && window.LBASession.get && window.LBASession.get());
    if (!logged) return;
    // Isole le libellé dans un span (on conserve l'icône « + »).
    var label = btn.querySelector('.bd-label');
    if (!label) {
      var plus = btn.querySelector('.plus');
      var txt = (btn.textContent || '').trim() || 'Déposer une alerte';
      btn.innerHTML = (plus ? plus.outerHTML : '<span class="plus" aria-hidden="true">+</span>') +
        ' <span class="bd-label">' + txt + '</span>';
      label = btn.querySelector('.bd-label');
    }
    var WORDS = [
      { t: 'Déposer une alerte', href: '/proposer' },
      { t: 'Ajouter un deck', href: '/mes-decks' }
    ];
    var i = 0;
    setInterval(function () {
      i = (i + 1) % WORDS.length;
      var w = WORDS[i];
      if (REDUCE) { label.textContent = w.t; btn.setAttribute('href', w.href); return; }
      label.classList.add('bd-slide-out');
      setTimeout(function () {
        label.textContent = w.t;
        btn.setAttribute('href', w.href);
        label.classList.remove('bd-slide-out');
        label.classList.add('bd-slide-in');
        setTimeout(function () { label.classList.remove('bd-slide-in'); }, 280);
      }, 220);
    }, 4200);
  }
  if (document.readyState !== 'loading') setupDepositRotation();
  else document.addEventListener('DOMContentLoaded', setupDepositRotation);

  /* ===================== Injection du header sur les pages HORS home ===================== */
  // La home a déjà son header (index.html + mobile-header.js) → on ne touche à rien.
  var isHome = !!document.querySelector('main .toolbar') || !!document.getElementById('alertes');
  if (isHome) return;

  var nav = document.querySelector('header .nav');
  if (!nav) return;
  var brand = nav.querySelector('.brand');
  if (!brand) return;

  function elFrom(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

  // 1) Bouton « Déposer une alerte » juste après le logo.
  if (!nav.querySelector('.btn-deposit')) {
    brand.insertAdjacentHTML('afterend',
      '<a class="btn-deposit" href="/proposer"><span class="plus" aria-hidden="true">+</span> Déposer une alerte</a>');
  }
  // 2) Hamburger (masqué en desktop par le CSS, visible en mobile via m-kiosk).
  if (!nav.querySelector('.nav-toggle')) {
    brand.insertAdjacentHTML('afterend',
      '<button class="nav-toggle" type="button" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="m-menu"><span></span><span></span><span></span></button>');
  }
  // 3) Barre de recherche (redirige vers la home). id "q" pour le menu « Rechercher ».
  var navRight = nav.querySelector('.nav-right');
  if (!nav.querySelector('.search')) {
    var search = elFrom(
      '<label class="search">' +
        '<svg class="search-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
        '<input id="q" type="search" placeholder="Rechercher une alerte" aria-label="Rechercher une alerte">' +
        '<button class="search-clear" type="button" aria-label="Effacer la recherche" hidden><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '<button class="search-go" type="button" aria-label="Rechercher"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></button>' +
      '</label>');
    if (navRight) nav.insertBefore(search, navRight); else nav.appendChild(search);
  }
  // 4) nav-right standard (remplace les liens propres à la page, ex. « ← Retour »).
  if (navRight) {
    navRight.innerHTML =
      '<a class="mine-link" href="/connexion">Ma collection</a>' +
      '<a id="nav-openalert" href="/#openalert">OpenAlert</a>' +
      '<span class="auth-email" id="auth-email" hidden></span>' +
      '<a class="btn-login" id="auth-link" href="/connexion">Se connecter</a>' +
      '<button class="theme-btn" type="button" aria-label="Changer de thème">◐</button>';
  }

  document.body.classList.add('m-kiosk');

  // Recherche → redirige vers la home avec ?q=<terme> (Entrée, bouton loupe).
  function goSearch() {
    var q = document.getElementById('q');
    var v = q ? (q.value || '').trim() : '';
    window.location.href = '/' + (v ? ('?q=' + encodeURIComponent(v)) : '');
  }
  var qInput = document.getElementById('q');
  if (qInput) {
    qInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); goSearch(); } });
    var clr = nav.querySelector('.search-clear');
    qInput.addEventListener('input', function () { if (clr) clr.hidden = !(qInput.value && qInput.value.length); });
    if (clr) clr.addEventListener('click', function () { qInput.value = ''; clr.hidden = true; qInput.focus(); });
  }
  var go = nav.querySelector('.search-go');
  if (go) go.addEventListener('click', goSearch);

  // Thème : lie le bouton injecté (window.toggleTheme fourni par theme.js).
  var tb = nav.querySelector('.theme-btn');
  if (tb && window.toggleTheme) tb.addEventListener('click', window.toggleTheme);

  // Auth : reflète l'état de session si session.js est présent (« Se connecter » →
  // « Mon compte » si connecté). Sinon, défaut « Se connecter ».
  var logged = !!(window.LBASession && window.LBASession.get && window.LBASession.get());
  if (window.LBASession && window.LBASession.renderHeader) window.LBASession.renderHeader(null);

  // Menu plein écran (mobile) partagé.
  buildMenu(nav, { isHome: false, logged: logged });
})();
