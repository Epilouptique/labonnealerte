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

  // view-toggle : en DESKTOP (≥721px) il rejoint la rangée 1 du header, entre le
  // bouton thème et le KPI ; en mobile il RESTE dans la toolbar (rangée catégories),
  // comportement inchangé. flexbox `order` ne peut pas déplacer un petit-enfant entre
  // conteneurs → relocalisation DOM, rejouée au franchissement du breakpoint.
  var viewToggle = toolbar.querySelector('.view-toggle');
  var deskMq = window.matchMedia('(min-width: 721px)');
  function placeViewToggle() {
    if (!viewToggle) return;
    if (deskMq.matches) {
      if (navRight && viewToggle.parentNode !== navRight) {
        if (kpi && kpi.parentNode === navRight) navRight.insertBefore(viewToggle, kpi);
        else navRight.appendChild(viewToggle);
      }
    } else if (viewToggle.parentNode !== toolbar) {
      toolbar.appendChild(viewToggle); // retour à sa place mobile d'origine (fin de toolbar)
    }
  }
  placeViewToggle();
  if (deskMq.addEventListener) deskMq.addEventListener('change', placeViewToggle);
  else if (deskMq.addListener) deskMq.addListener(placeViewToggle);

  // Menu mobile plein écran : SOURCE UNIQUE partagée avec les autres pages (header.js).
  // La home passe isHome:true (les modes agissent via les puces, pas via /?mode=).
  var logged = !!(window.LBASession && window.LBASession.get && window.LBASession.get());
  if (window.LBAHeader && window.LBAHeader.buildMenu) {
    window.LBAHeader.buildMenu(nav, { isHome: true, logged: logged });
  }

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
