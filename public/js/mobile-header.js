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
  // KPI : devient la PASTILLE DE NOTIFICATION du lien « Mes alertes » — il est
  // déplacé DANS la cloche (et non plus en fin de .nav-right). Le CSS
  // (`header .nav-right .mine-link .kpi`) le transforme en rond vert chiffré
  // superposé, halo « ping » conservé, libellé/overlay de survol supprimés.
  // Repli sur .nav-right si le lien n'existe pas (header non standard).
  var mineLink = navRight ? navRight.querySelector('.mine-link') : null;
  if (kpi && mineLink) mineLink.appendChild(kpi);
  else if (kpi && navRight) navRight.appendChild(kpi);

  // (Le bouton de bascule cartes/liste a été SUPPRIMÉ de l'interface du kiosque : plus
  // rien à relocaliser ici. Le réglage vit dans « Mon compte › Apparence ».)

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
