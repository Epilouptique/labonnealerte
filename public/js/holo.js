// Effet holographique « Dresseur » — pilote CSS (variables --mx/--my/--holo) sur la
// fenetre d'art de la carte SURVOLEE, dans la grille dashboard uniquement.
//
// TECHNIQUE (inspiree de reference/pokemon-cards-css, re-ecrite en vanilla) : la position
// relative du curseur dans la fenetre d'art alimente un degrade radial (glare) + le
// decalage du reflet nacre (cf. site.css, #grid.skin-dresseur .card-art::before/::after).
//
// PERFORMANCE (grille ~178 cartes) : UN SEUL listener delegue sur #grid (pas un par carte),
// calcul limite a la carte reellement survolee (closest('.card')), throttle en
// requestAnimationFrame (au plus une ecriture de style par frame). Aucune boucle permanente.
//
// DEGRADATION : desactive hors pointeur fin (mobile/tactile) et sous prefers-reduced-motion
// -> seul le leger sheen STATIQUE du CSS subsiste. Effet strictement scope au dashboard :
// jamais dans les decks (.deck-card) ni la boutique (previews non interactives).
(function () {
  'use strict';
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Mobile/tactile ou animations reduites : on laisse le sheen statique CSS, pas de suivi curseur.
  if (!finePointer.matches || reduceMotion.matches) return;

  var grid = document.getElementById('grid');
  if (!grid) return;

  var activeArt = null;   // fenetre d'art actuellement « allumee »
  var raf = null;         // id du frame en attente (throttle)
  var pending = null;     // derniere position a appliquer

  function apply() {
    raf = null;
    if (!pending) return;
    var art = pending.art;
    // Eteint la carte precedente si le curseur a change de carte.
    if (activeArt && activeArt !== art) activeArt.style.setProperty('--holo', '0');
    art.style.setProperty('--mx', pending.x + '%');
    art.style.setProperty('--my', pending.y + '%');
    art.style.setProperty('--holo', '1');
    activeArt = art;
    pending = null;
  }

  grid.addEventListener('pointermove', function (e) {
    // Seul le skin Dresseur equipe sur la grille est concerne.
    if (!grid.classList.contains('skin-dresseur')) return;
    var card = e.target && e.target.closest ? e.target.closest('.card') : null;
    if (!card) return;
    var art = card.querySelector('.card-front .card-art');
    if (!art) return;
    var r = art.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var x = ((e.clientX - r.left) / r.width) * 100;
    var y = ((e.clientY - r.top) / r.height) * 100;
    x = x < 0 ? 0 : x > 100 ? 100 : x;
    y = y < 0 ? 0 : y > 100 ? 100 : y;
    pending = { art: art, x: x.toFixed(1), y: y.toFixed(1) };
    if (raf === null) raf = requestAnimationFrame(apply);
  }, { passive: true });

  function reset() {
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    pending = null;
    if (activeArt) { activeArt.style.setProperty('--holo', '0'); activeArt = null; }
  }
  // Sortie de la grille (et changement d'onglet) : on eteint proprement.
  grid.addEventListener('pointerleave', reset);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') reset();
  });
})();
