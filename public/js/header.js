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

  // Logo/marque : SOURCE UNIQUE (ligature SVG animée). Déclaré EN TÊTE de l'IIFE — avant
  // le retour anticipé « home » — pour que buildMenu() dispose TOUJOURS de la constante,
  // même sur la home (où l'injection de header n'a pas lieu). Le logo du menu mobile en
  // dépend directement, il reste donc indépendant de l'état condensé du header.
  var LOGO_HTML = '<span class="lig"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M 0 20 C -6 93, 66 52, 60 10"/></svg><span class="l">l</span>a</span>bonne<span class="a">alerte</span><span class="bang"><span class="bar"></span><span class="dot"></span></span><span class="fr">fr</span>';

  /* ---- Icônes de .nav-right : SOURCE UNIQUE (cloche / cœur / roue) ----
     Deux calques par icône : `.hd-ic-base` (trait, sans couleur propre) et
     `.hd-ic-fill` (plein, révélé de bas en haut au survol par le CSS .hd-ic-fill).
     Même vocabulaire graphique que les autres SVG du site : viewBox 24, trait 2px,
     linecap/linejoin round, currentColor. La home (index.html) recopie ce markup —
     toute retouche ici doit y être répercutée.
     Exposé via window.LBAHeader.ICONS pour éviter une 3e copie ailleurs. */
  var BELL_PATHS = '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>';
  var HEART_PATH = '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>';
  // Boutique (sac) : corps du sac + ligne d'ouverture + anse.
  var BAG_PATHS = '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>';
  // `strokeOnly` : le calque révélé au survol reste un TRACÉ (fill="none") au lieu d'un
  // aplat — c'est alors le dessin lui-même qui se colore de bas en haut, sans que
  // l'intérieur se remplisse. Utilisé par le sac de la boutique.
  function icon2(cls, paths, strokeOnly) {
    var open = '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    return '<span class="hd-ic ' + cls + '" aria-hidden="true">' +
      open + ' fill="none" class="hd-ic-base">' + paths + '</svg>' +
      open + ' fill="' + (strokeOnly ? 'none' : 'currentColor') + '" class="hd-ic-fill">' + paths + '</svg>' +
    '</span>';
  }
  var BELL_HTML = icon2('hd-ic-bell', BELL_PATHS);
  var HEART_HTML = icon2('hd-ic-heart', HEART_PATH);
  var BAG_HTML = icon2('hd-ic-bag', BAG_PATHS, true);
  // « Mes alertes » : cloche seule (plus de libellé texte). Le KPI du header vient s'y
  // superposer en pastille de notification (voir mobile-header.js + site.css).
  var MINE_LINK_HTML = '<a class="mine-link hd-link" href="/connexion" aria-label="Mes alertes" title="Mes alertes">' + BELL_HTML + '</a>';
  // Boutique de skins : ARCHIVÉE (fil #9, 12/09/2026) — plus de lien sac/boutique.
  // ❤ : la page /favoris est remplacée par un FILTRE du kiosque (?mode=favoris, intercepté
  // sur place par site.js/bindFavLinks). Seule la destination change, l'apparence est intacte.
  var FAV_LINK_HTML = '<a class="fav-link hd-link" href="/?mode=favoris" aria-label="Mes favoris" title="Mes favoris">' + HEART_HTML + '</a>';

  // NB : l'ancien markFavHeart() (cœur rempli en permanence quand des favoris existent,
  // classe .has-fav) a été retiré — les trois icônes du header sont désormais sans
  // couleur au repos, le violet n'apparaissant qu'au survol.

  /* ===================== Menu mobile plein écran (partagé) ===================== */
  // opts : { isHome:boolean, logged:boolean }
  function buildMenu(nav, opts) {
    opts = opts || {};
    var isHome = !!opts.isHome;
    var logged = !!opts.logged;
    var brand = nav.querySelector('.brand');
    // Le logo du menu est INDÉPENDANT de l'état visuel du header : on privilégie la
    // constante LOGO_HTML (source unique) et on ne retombe sur le DOM que si elle manque.
    // Ainsi le titre reste présent même si le header est condensé (m-scrolled/m-secondary)
    // au moment de l'ouverture du menu.
    var logoHTML = (typeof LOGO_HTML === 'string' && LOGO_HTML)
      ? LOGO_HTML
      : (brand && brand.innerHTML.trim() ? brand.innerHTML : 'labonnealerte');

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
    // (étoile). Flèche retour = même vocabulaire que BACK_SVG des cartes.
    var IC_NOUV = '<svg class="m-ic" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2l1.7 4L18 8.9l-4.3 1.7L12 14.9l-1.7-4.3L6 8.9l4.3-1.7z"/><path d="M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg>';
    var IC_SEL = '<svg class="m-ic" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 17l-5.25 2.75 1-5.85L3.5 9.8l5.9-.9z"/></svg>';
    var IC_CAT = '<svg class="m-ic" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>';
    var IC_BACK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v3"/></svg>';

    // Face AVANT du menu (A2 : ordre revu — Catégories/Nouvelles/Sélection montent à
    // la place de Espace dev/OpenAlert, qui descendent juste avant Mentions légales).
    var frontHTML =
      '<div class="m-menu-inner">' +
        '<div class="m-menu-head">' +
          '<a href="/" class="brand brandmark m-menu-logo" aria-label="Accueil labonnealerte.fr">' + logoHTML + '</a>' +
          '<button type="button" class="m-menu-close" aria-label="Fermer le menu">✕</button>' +
        '</div>' +
        '<nav class="m-menu-list" aria-label="Navigation principale">' +
          (logged
            ? '<button type="button" class="m-link m-primary" data-act="mine">Mes alertes</button>' +
              '<a href="/?mode=favoris" class="m-link" data-act="favoris">Mes favoris</a>'
            : '<a href="/connexion" class="m-primary" data-act="auth">Se connecter</a>' +
              '<a href="/?mode=favoris" class="m-link" data-act="favoris">Mes favoris</a>') +
          '<a href="/le-point" class="m-link">Le Point</a>' +
          '<a href="/proposer">Déposer une alerte</a>' +
          '<button type="button" class="m-link" data-act="search">Rechercher</button>' +
          '<hr class="m-menu-sep">' +
          '<button type="button" class="m-link m-has-ic" data-act="categories">' + IC_CAT + ' Catégories</button>' +
          '<button type="button" class="m-link m-has-ic" data-act="nouveautes">' + IC_NOUV + ' Nouveautées</button>' +
          '<button type="button" class="m-link m-has-ic" data-act="selection">' + IC_SEL + ' Populaires</button>' +
          '<hr class="m-menu-sep">' +
          // E) « Mon compte » regroupé juste au-dessus de « Nous soutenir ».
          (logged ? '<button type="button" class="m-link" data-act="account">Mon compte</button>' : '') +
          '<a href="/soutenir">Nous soutenir</a>' +
          '<hr class="m-menu-sep">' +
          '<a href="/forum">Forum</a>' +
          '<a href="/proposer">Espace développeurs</a>' +
          '<a href="' + (isHome ? '#openalert' : '/#openalert') + '" data-act="anchor">OpenAlert</a>' +
          '<a href="/mentions-legales">Mentions légales</a>' +
          (logged ? '<button type="button" class="m-link m-logout" data-act="logout">Se déconnecter</button>' : '') +
        '</nav>' +
      '</div>';

    // A1) Face ARRIÈRE : liste des catégories (révélée par retournement du menu).
    // Le logo reste ; le ✕ est remplacé par une flèche retour (← reflip, ne ferme pas).
    var backHTML =
      '<div class="m-menu-inner">' +
        '<div class="m-menu-head">' +
          '<a href="/" class="brand brandmark m-menu-logo" aria-label="Accueil labonnealerte.fr">' + logoHTML + '</a>' +
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
      // E) Focus sur le dialogue lui-même (tabindex -1) : Échap/piégeage OK, mais AUCUN
      // anneau focus-visible parasite sur « Ma collection » à l'ouverture.
      menu.setAttribute('tabindex', '-1');
      menu.focus();
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
    function scrollTopSmooth() {
      try { window.scrollTo({ top: 0, behavior: REDUCE ? 'auto' : 'smooth' }); }
      catch (e) { window.scrollTo(0, 0); }
    }
    function gridAction(mode) {
      var c = isHome ? document.querySelector('.chip-f[data-cat="' + mode + '"]') : null;
      // E) Après application d'un filtre sur la home : remonter en haut de page.
      if (c) { c.click(); scrollTopSmooth(); }
      // Filtres SANS puce dans le rail (« mine », « favoris ») : on passe par le point
      // d'entrée public du kiosque plutôt que de recharger la page.
      else if (isHome && window.LBAKiosk && LBAKiosk.filter) { LBAKiosk.filter(mode); scrollTopSmooth(); }
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
        // E) BUG « aucune catégorie » hors home : la taxonomie n'était jamais chargée
        // ailleurs que sur le kiosque. On la charge à la demande puis on re-remplit.
        if ((!cats || !cats.length) && window.LBACat.load) {
          host.innerHTML = '<div class="m-cat-empty">Chargement…</div>';
          window.LBACat.load().then(function () { fillCats(); });
          return;
        }
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
        if (chip) { chip.click(); scrollTopSmooth(); }
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
        // Connecté sur la home : bascule le panneau. Connecté hors home : redirige vers le
        // dashboard AVEC l'indicateur #mon-compte (la home l'ouvre au chargement). Anonyme :
        // page de connexion.
        if (logged && isHome && window.LBAAccount && window.LBAAccount.toggle) window.LBAAccount.toggle();
        else window.location.href = logged ? '/#mon-compte' : '/connexion';
        return;
      }
      if (act === 'search') {
        e.preventDefault(); closeMenu();
        var q = document.getElementById('q'); if (q) setTimeout(function () { q.focus(); }, REDUCE ? 0 : 210);
        return;
      }
      if (act === 'mine' || act === 'nouveautes' || act === 'selection' || act === 'favoris') {
        e.preventDefault(); closeMenu(); gridAction(act); return;
      }
      if (act === 'account') {
        e.preventDefault(); closeMenu();
        // Hors home : redirige vers le dashboard AVEC #mon-compte pour que la carte
        // « Mon compte » s'ouvre au chargement (le panneau n'existe que sur la home).
        if (isHome && window.LBAAccount && window.LBAAccount.toggle) window.LBAAccount.toggle();
        else window.location.href = '/#mon-compte';
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

  window.LBAHeader = {
    buildMenu: buildMenu,
    ICONS: {
      bell: BELL_HTML, heart: HEART_HTML, bag: BAG_HTML,
      mineLink: MINE_LINK_HTML, favLink: FAV_LINK_HTML
    }
  };

  /* ===================== Bouton « Déposer une alerte » =====================
     Libellé FIXE « Déposer une alerte » (→ /proposer). La rotation qui alternait avec
     « Ajouter un deck » (→ /mes-decks) a été RETIRÉE : le bouton ne change plus ni de
     texte ni de cible, connecté ou non. Le libellé reste isolé dans un `.bd-label` —
     le CSS le masque entre 722 et 1299px pour ne garder que le « + ». */

  /* ===================== Injection du header sur les pages HORS home ===================== */
  // La home a déjà son header (index.html + mobile-header.js) → on ne touche à rien.
  var isHome = !!document.querySelector('main .toolbar') || !!document.getElementById('alertes');
  if (isHome) return;

  var nav = document.querySelector('header .nav');
  if (!nav) return;

  function elFrom(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

  // Logo/marque : SOURCE UNIQUE (les pages hors home ne le dupliquent plus en dur —
  // elles ne fournissent qu'un <div class="wrap nav"> vide). On crée l'ancre .brand si
  // absente, sinon on NORMALISE son contenu (certaines pages avaient un logo divergent,
  // sans la ligature SVG animée). LOGO_HTML est déclaré en tête de l'IIFE (voir plus haut).
  var brand = nav.querySelector('.brand');
  if (!brand) {
    brand = elFrom('<a class="brand brandmark" href="/">' + LOGO_HTML + '</a>');
    nav.insertBefore(brand, nav.firstChild);
  } else {
    brand.innerHTML = LOGO_HTML;
  }

  // 1) Bouton « Déposer une alerte » juste après le logo.
  if (!nav.querySelector('.btn-deposit')) {
    brand.insertAdjacentHTML('afterend',
      '<a class="btn-deposit" href="/proposer" title="Déposer une alerte">' +
      '<span class="plus" aria-hidden="true">+</span> <span class="bd-label">Déposer une alerte</span></a>');
  }
  // 2) Hamburger (masqué en desktop par le CSS, visible en mobile via m-kiosk).
  if (!nav.querySelector('.nav-toggle')) {
    brand.insertAdjacentHTML('afterend',
      '<button class="nav-toggle" type="button" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="m-menu"><span></span><span></span><span></span></button>');
  }
  // 3) Barre de recherche (redirige vers la home). id "q" pour le menu « Rechercher ».
  var navRight = nav.querySelector('.nav-right');
  if (!navRight) { navRight = elFrom('<nav class="nav-right"></nav>'); nav.appendChild(navRight); }
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
  // 4) nav-right standard : STRICTEMENT la même 1re ligne que la home (Mes alertes,
  //    favoris, connexion|Mon compte). Pas d'« OpenAlert » ici (absent de la home) —
  //    il reste accessible par le footer et le menu mobile. Plus de bouton de thème :
  //    retiré du header (window.toggleTheme reste exposé par theme.js).
  navRight.innerHTML =
    MINE_LINK_HTML +
    FAV_LINK_HTML +
    '<span class="auth-email" id="auth-email" hidden></span>' +
    '<a class="btn-login" id="auth-link" href="/connexion">Se connecter</a>';

  document.body.classList.add('m-kiosk');
  // Point 5) Marqueur des pages secondaires (header injecté) : sert au CSS MOBILE, qui
  // condense le header sur UNE seule ligne (hamburger + recherche) — comportement
  // mobile inchangé. En desktop, ces pages reçoivent désormais le rail de catégories
  // (voir buildCatRail ci-dessous), donc m-secondary n'y signifie plus « une rangée ».
  document.body.classList.add('m-secondary');

  /* ============ Rangées 2 & 3 : rail de catégories (desktop, toutes pages) ============
     Politique de navigation : UN SEUL menu, celui du dashboard, sur toute la navigation.
     Les pages hors home reçoivent donc le même rail de catégories que le kiosque, en
     plus de la 1re rangée. Les `order` CSS existants (body.m-kiosk header .nav .toolbar
     = order 6, .chips-secondary-wrap = order 7) placent tout seuls ces rangées.

     Deux différences INÉVITABLES avec le kiosque, faute de grille sur ces pages :
       · un clic sur une puce NAVIGUE vers la home filtrée (/?cat=…, /?mode=…) au lieu
         de filtrer sur place — c'est déjà ce que fait le menu mobile ;
       · aucune puce n'est marquée active (on n'est pas dans une vue filtrée).

     EXCEPTION : l'espace développeurs (proposer.html, body.dev) conserve ses règles —
     1re rangée seule et thème sombre. On n'y injecte aucun rail. */
  var CHIP_IC_NOUV = '<svg class="chip-ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2l1.7 4L18 8.9l-4.3 1.7L12 14.9l-1.7-4.3L6 8.9l4.3-1.7z"/><path d="M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg>';
  var CHIP_IC_SEL = '<svg class="chip-ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 17l-5.25 2.75 1-5.85L3.5 9.8l5.9-.9z"/></svg>';

  function escC(s) { return window.LBACards ? window.LBACards.esc(s) : String(s == null ? '' : s); }

  // Libellés de catégories. On privilégie LBACat (déjà chargé sur certaines pages, donc
  // pas de requête en double) ; sinon header.js va chercher la taxonomie lui-même — les
  // pages n'ont ainsi PAS besoin d'inclure categories.js pour afficher le rail.
  function loadCatLabels() {
    if (window.LBACat && window.LBACat.load) {
      return window.LBACat.load().then(function () { return window.LBACat.label; });
    }
    return fetch('/api/categories', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (arr) {
        var by = {};
        (Array.isArray(arr) ? arr : []).forEach(function (e) { by[e.slug] = e.label; });
        return function (slug) { return by[slug] || slug; };
      })
      .catch(function () { return function (slug) { return slug; }; });
  }

  function buildCatRail() {
    if (document.body.classList.contains('dev')) return; // espace développeurs : inchangé
    if (nav.querySelector('.toolbar')) return;

    var toolbar = elFrom('<div class="toolbar"><div class="chips" id="chips" role="group" aria-label="Filtrer par catégorie"></div></div>');
    var secWrap = elFrom('<div class="chips-secondary-wrap" id="chips-secondary-wrap"></div>');
    nav.appendChild(toolbar);
    nav.appendChild(secWrap);
    var chipsEl = toolbar.querySelector('.chips');

    var sourcesP = fetch('/api/sources', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });

    Promise.all([sourcesP, loadCatLabels()]).then(function (res) {
      var sources = Array.isArray(res[0]) ? res[0] : [];
      var label = res[1];
      if (!sources.length) { toolbar.remove(); secWrap.remove(); return; }

      // Mêmes comptes et même tri que renderChips() du kiosque (fréquence décroissante,
      // puis libellé) → le rail affiche les mêmes puces, dans le même ordre.
      var counts = {};
      sources.forEach(function (s) {
        (Array.isArray(s.categories) ? s.categories : []).forEach(function (c) {
          counts[c] = (counts[c] || 0) + 1;
        });
      });
      var slugs = Object.keys(counts).sort(function (a, b) {
        return counts[b] - counts[a] || String(label(a)).localeCompare(String(label(b)));
      });
      var wide = !!(window.matchMedia && window.matchMedia('(min-width: 1024px)').matches);
      var primaryN = wide ? 6 : 4;
      var primary = slugs.slice(0, primaryN);
      var secondary = slugs.slice(primaryN, primaryN + 8);

      function chip(slug) {
        return '<button class="chip-f" type="button" data-cat="' + escC(slug) + '">' +
          escC(label(slug)) + ' <span class="n">' + counts[slug] + '</span></button>';
      }
      var prim = '<button class="chip-f" type="button" data-cat="all">Toutes <span class="n">' + sources.length + '</span></button>' +
        '<button class="chip-f chip-special" type="button" data-cat="nouveautes">' + CHIP_IC_NOUV + ' Nouveautés</button>' +
        '<button class="chip-f chip-special" type="button" data-cat="selection">' + CHIP_IC_SEL + ' Populaires</button>';
      primary.forEach(function (s) { prim += chip(s); });
      if (secondary.length) prim += '<button class="chip-f chip-more-toggle" type="button" aria-label="Plus de catégories">+</button>';
      chipsEl.innerHTML = '<div class="chips-row" id="chips-primary">' + prim + '</div>';
      secWrap.innerHTML = secondary.length
        ? '<div class="chips-row chips-more" id="chips-secondary">' + secondary.map(chip).join('') + '</div>'
        : '';

      // Repli/dépli de la 2e ligne : même animation que le kiosque (max-height depuis la
      // hauteur réelle, sinon la fin du repli se fait d'un coup).
      var secOpen = false;
      function setSecOpen(sec, open) {
        if (open) { sec.classList.add('open'); sec.style.maxHeight = sec.scrollHeight + 'px'; }
        else {
          sec.style.maxHeight = sec.scrollHeight + 'px';
          void sec.offsetHeight;
          sec.classList.remove('open');
          sec.style.maxHeight = '0px';
        }
      }

      function onChipClick(e) {
        var tgl = e.target.closest('.chip-more-toggle');
        if (tgl) {
          var sec = document.getElementById('chips-secondary');
          if (sec) {
            secOpen = !secOpen;
            setSecOpen(sec, secOpen);
            tgl.textContent = secOpen ? '−' : '+';
            tgl.classList.toggle('on', secOpen);
          }
          return;
        }
        var b = e.target.closest('.chip-f');
        if (!b) return;
        var slug = b.getAttribute('data-cat');
        if (slug === 'all') window.location.href = '/';
        else if (slug === 'nouveautes' || slug === 'selection') window.location.href = '/?mode=' + encodeURIComponent(slug);
        else window.location.href = '/?cat=' + encodeURIComponent(slug);
      }
      chipsEl.addEventListener('click', onChipClick);
      secWrap.addEventListener('click', onChipClick);
    });
  }
  buildCatRail();

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

  // (Plus de liaison de bouton de thème : il n'est plus injecté dans le header.)

  // Auth : reflète l'état de session si session.js est présent (« Se connecter » →
  // « Mon compte » si connecté). Sinon, défaut « Se connecter ».
  var logged = !!(window.LBASession && window.LBASession.get && window.LBASession.get());
  if (window.LBASession && window.LBASession.renderHeader) window.LBASession.renderHeader(null);

  // Menu plein écran (mobile) partagé.
  buildMenu(nav, { isHome: false, logged: logged });
})();
