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
  var navRight = nav.querySelector('.nav-right');
  var kpi = document.querySelector('.hero .kpi');
  var grid = document.getElementById('grid');
  var mq = window.matchMedia('(max-width: 720px)');

  document.body.classList.add('m-kiosk');

  // Refonte façon leboncoin : SEULE la barre de recherche migre dans le header
  // (espace flexible central, avant .nav-right). Les puces de catégories, elles,
  // RESTENT dans .toolbar au-dessus de la grille. Relocalisation DOM : les écouteurs
  // déjà attachés (filtrage instantané) suivent le nœud.
  if (search && navRight) nav.insertBefore(search, navRight);
  // KPI : dernière position de .nav-right → tout à droite du header.
  if (kpi && navRight) navRight.appendChild(kpi);

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
