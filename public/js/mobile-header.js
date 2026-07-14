/* mobile-header.js — refonte de l'en-tête sur smartphone (≤ 720px), page kiosque.
   - Déplace la barre de recherche + les catégories DANS le header, sous le titre
     (relocalisation DOM : les écouteurs déjà attachés suivent les nœuds).
   - Pose body.m-kiosk (active le bloc CSS mobile dédié).
   - Tap sur une carte → révèle sa description (.card p) et son état (.state).
   Sur desktop (> 720px), tout revient à sa place d'origine. */

(function () {
  'use strict';

  var nav = document.querySelector('header .nav');
  var toolbar = document.querySelector('main .toolbar');
  if (!nav || !toolbar) return; // pas la page kiosque : rien à faire.

  var secondary = document.getElementById('chips-secondary-wrap');
  var grid = document.getElementById('grid');
  var mq = window.matchMedia('(max-width: 720px)');

  document.body.classList.add('m-kiosk');

  // Mémorise l'emplacement d'origine (dans <main>) pour restaurer en desktop.
  var moved = [];
  function remember(el) { if (el) moved.push({ el: el, parent: el.parentNode, next: el.nextSibling }); }
  remember(toolbar);
  remember(secondary);

  function toHeader() {
    nav.appendChild(toolbar);
    if (secondary) nav.appendChild(secondary);
  }
  function toMain() {
    moved.forEach(function (m) { m.parent.insertBefore(m.el, m.next); });
  }
  function apply() { if (mq.matches) toHeader(); else toMain(); }
  apply();

  // matchMedia : addEventListener moderne, addListener pour Safari ancien.
  if (mq.addEventListener) mq.addEventListener('change', apply);
  else if (mq.addListener) mq.addListener(apply);

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
