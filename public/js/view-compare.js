/* view-compare.js — TEMPORAIRE, fil #9bis — VISUEL RETENU : MIXTE (« Large + colonne ultra »).

   Ce fichier était le COMPARATEUR DE VISUELS du kiosque (6 visuels + barre de boutons).
   Hugo a choisi le visuel 5 (mixte) : la barre « VISUEL (TEST) » a été RETIRÉE du DOM
   (index.html) et le mode mixte est désormais PERMANENT et UNIQUE pour #grid — il ne dépend
   plus ni d'un clic ni de sessionStorage. Pagination initiale 18 en permanence (site.js
   initialLimit() lit data-view-mode="mixte").

   Les autres visuels (large seul, liste, compact, ultra, compact-large) sont CONSERVÉS dans
   les fichiers (CSS « TEMPORAIRE — fil #9bis » de site.css + fonctions ci-dessous) mais plus
   rien ne les active : pas de barre, pas de sessionStorage, pas de handler branché. La vue
   LISTE est neutralisée en amont (view-mode.js verrouillé sur 'cards', réglage « Vue liste »
   retiré de Mon compte dans appearance.js).

   Ce que fait ce module aujourd'hui :
     · pose data-view-mode="mixte" sur #grid, le plus tôt possible ;
     · répartit les cartes visibles entre colonne 1 (large) et colonne 2 (ultra, .vc-side) ;
     · mesure le « masonry » (span de rangées de 8px, via offsetHeight) ;
     · bascule une carte d'une colonne à l'autre au clic, animée en FLIP (voir plus bas).

   Le FLIP recto/verso des cartes n'est PAS touché ici (CSS .card-inner, règle globale). */

(function () {
  'use strict';

  var CARD_MODES = { large: 1, compact: 1, ultra: 1, mixte: 1, clarge: 1 };
  var MODE = 'mixte';     // visuel retenu : PERMANENT, aucune autre valeur n'est appliquée
  var current = MODE;
  var resizeT = null;
  var ROW = 8, MARGIN = 16;   // trame du masonry (grid-auto-rows: 8px) + marge de sécurité

  function grid() { return document.getElementById('grid'); }
  function root() { return document.documentElement; }

  // Cartes réellement visibles de #grid (hors filtrage/pagination), enfants directs.
  function visibleCards() {
    var g = grid(); if (!g) return [];
    var out = [];
    for (var i = 0; i < g.children.length; i++) {
      var c = g.children[i];
      if (!c.classList || !c.classList.contains('card')) continue;
      if (c.classList.contains('filtered') || c.classList.contains('hidden-more')) continue;
      out.push(c);
    }
    return out;
  }

  // ── Mode LISTE : CONSERVÉ (code mort) — plus aucun appel. La vue liste n'est plus une
  //    sortie du kiosque (view-mode.js verrouillé sur 'cards').
  function listOn() {
    root().setAttribute('data-view', 'list');
    try { document.dispatchEvent(new CustomEvent('lba-view-change', { detail: { mode: 'list' } })); } catch (e) {}
  }
  function listOff() {
    if (root().getAttribute('data-view') === 'list') {
      root().setAttribute('data-view', 'cards');
      try { document.dispatchEvent(new CustomEvent('lba-view-change', { detail: { mode: 'cards' } })); } catch (e) {}
    }
  }

  // ── Mode MIXTE : répartition des cartes entre colonne principale (large) et colonne
  //    secondaire (ultra-compacte). RÈGLE : découpage POSITIONNEL déterministe — 1 carte sur
  //    MAIN_EVERY va en colonne large, les autres en colonne ultra. INDÉPENDANT du statut
  //    Active. Ratio 1:2 → les deux colonnes restent peuplées sur toute la hauteur.
  //    Une carte dont l'utilisateur a changé la colonne au clic (.vc-user) garde SON choix :
  //    on ne la reclasse pas. En revanche tout placement vertical explicite (grid-row-start,
  //    posé par la bascule) est effacé à chaque changement de grille : il n'a de sens qu'au
  //    moment du clic, et une valeur périmée après filtrage donnerait une rangée fantôme.
  var MAIN_EVERY = 3;
  function splitMixte() {
    var cards = visibleCards();
    cards.forEach(function (c, i) {
      if (c.style) c.style.gridRowStart = '';
      if (c.classList.contains('vc-user') || c.classList.contains('vc-moving')) return;
      var toMain = (i % MAIN_EVERY === 0);
      c.classList.toggle('vc-side', !toMain);
    });
    scheduleMeasure();
  }

  // Planifie la (re)mesure : une passe immédiate au prochain rAF (après le reflow des
  // changements de colonne/format), PUIS une 2e passe après ~300 ms — le temps que les
  // animations d'entrée/sortie des cartes de site.js (.card-enter/.card-leave, ~210-250 ms)
  // se terminent. Sans cette 2e passe, un span peut être calculé pendant qu'une carte est
  // encore en cours d'apparition → span légèrement sous-évalué → léger chevauchement.
  // B) Mobile : le visuel mixte retombe en FLUX SIMPLE 1 colonne (CSS), donc tout placement
  //    en rangées de 8px doit DISPARAÎTRE — un span résiduel réserverait de la hauteur et
  //    recréerait les vides de ~200px constatés à 390px.
  function isMobile() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
  }

  var measureT = null;
  function scheduleMeasure() {
    requestAnimationFrame(measureMixte);
    clearTimeout(measureT);
    measureT = setTimeout(measureMixte, 300);
  }

  // Masonry par span de rangées : chaque carte occupe autant de rangées (8px) que sa
  // hauteur RÉELLE + une marge de 16px, pour que les deux colonnes se tassent
  // indépendamment (grid-auto-flow: row dense). On lit la hauteur du RECTO (.card-front,
  // dans le flux) et non de .card (dont les faces absolues ne comptent pas) pour un span
  // fidèle même quand la carte est retournée. On utilise offsetHeight (hauteur de LAYOUT)
  // et non getBoundingClientRect().height : offsetHeight ignore les transform (scale) des
  // animations d'apparition ET du FLIP de bascule → jamais de span sous-évalué mesuré
  // pendant une transition (correctif v40, conservé).
  function measureMixte() {
    var g = grid(); if (!g || g.getAttribute('data-view-mode') !== 'mixte') return;
    // B) En mobile, on PURGE les spans (et on ne mesure pas) : le CSS gère un flux flex.
    if (isMobile()) {
      visibleCards().forEach(function (c) { if (c.style) c.style.gridRowEnd = ''; });
      return;
    }
    visibleCards().forEach(function (c) {
      var front = c.querySelector('.card-front');
      var h = front ? front.offsetHeight : c.offsetHeight;
      if (!h) { c.style.gridRowEnd = ''; return; }
      c.style.gridRowEnd = 'span ' + Math.max(1, Math.ceil((h + MARGIN) / ROW));
    });
  }

  function clearMixte() {
    var g = grid(); if (!g) return;
    for (var i = 0; i < g.children.length; i++) {
      var c = g.children[i];
      if (!c.classList) continue;
      c.classList.remove('vc-side', 'vc-user', 'vc-moving', 'vc-promoted', 'vc-collapsing');
      if (c.style) { c.style.gridRowEnd = ''; c.style.gridRowStart = ''; c.style.width = ''; c.style.transform = ''; }
    }
  }

  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ── Mode CLARGE (visuel 6) : CONSERVÉ (code mort) — le handler n'est plus branché.
  function stripClarge() {
    var g = grid(); if (!g) return;
    g.querySelectorAll('.card.cl-expanded, .card.cl-collapsing').forEach(function (c) {
      c.classList.remove('cl-expanded', 'cl-collapsing');
    });
  }
  function collapseCard(card) {
    if (!card.classList.contains('cl-expanded')) { card.classList.remove('cl-collapsing'); return; }
    card.classList.remove('cl-expanded');
    if (REDUCE) return;
    card.classList.add('cl-collapsing');
    var to;
    var done = function (e) {
      if (e && e.propertyName && e.propertyName !== 'width') return;
      card.classList.remove('cl-collapsing');
      card.removeEventListener('transitionend', done);
      clearTimeout(to);
    };
    card.addEventListener('transitionend', done);
    to = setTimeout(done, 420);
  }
  function collapseClarge() {
    var g = grid(); if (!g) return;
    g.querySelectorAll('.card.cl-expanded').forEach(collapseCard);
  }
  function onDocClickClarge(e) {
    if (current !== 'clarge') return;
    var g = grid(); if (!g) return;
    var card = e.target.closest('.card');
    var inGrid = card && card.parentNode === g;
    if (!inGrid) { collapseClarge(); return; }
    if (isInteractive(e.target)) return;
    if (card.classList.contains('cl-expanded')) collapseCard(card);
    else { collapseClarge(); card.classList.remove('cl-collapsing'); card.classList.add('cl-expanded'); }
  }

  // Cible interactive → on ne touche pas à la colonne (le handler propre agit) : boutons
  // d'action (like, partager, flip ⓘ / retour ↩), toggle d'abonnement, picker, chips, liens.
  function isInteractive(target) {
    return !!(target.closest &&
      target.closest('button, a, input, select, textarea, label, .switch, .switch-row, .card-icons, .card-action'));
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  MIXTE — BASCULE DE COLONNE AU CLIC, animée en FLIP (fil #9bis, visuel retenu)
  //
  //  État de colonne d'une carte = présence de .vc-side (colonne 2, ultra) ou non
  //  (colonne 1, large). Chaque carte garde son propre état (.vc-user mémorise qu'il
  //  vient d'un clic, pour que la répartition automatique ne le reclasse pas).
  //
  //  PLACEMENT (a) : la carte arrive dans sa nouvelle colonne AU MÊME NIVEAU VERTICAL
  //  qu'avant, pas en fin de liste. On traduit son top mesuré en numéro de rangée de la
  //  trame masonry (grid-auto-rows: 8px, row-gap 0) et on le pose en grid-row-start ;
  //  `grid-auto-flow: row dense` tasse les voisines autour. Règle symétrique dans les
  //  deux sens (ultra → large comme large → ultra). Une seule carte porte un
  //  grid-row-start à la fois : deux placements explicites dans la même colonne
  //  pourraient se chevaucher (ils échappent au tassement), donc on efface celui de la
  //  carte précédemment basculée — son retour dans le flux dense est lui aussi animé.
  //
  //  ANIMATION (b) : FLIP (First-Last-Invert-Play) via la Web Animations API.
  //  1) on mesure le rectangle de TOUTES les cartes visibles ; 2) on applique le
  //  changement de colonne + le nouveau span ; 3) on re-mesure ; 4) on anime chaque
  //  carte depuis son ancien rectangle (translate + scale pour celle qui change de
  //  format, translate seul pour les voisines → pas de texte déformé) vers l'identité,
  //  sur 660 ms en cubic-bezier(.22,.8,.2,1) : l'œil suit la carte qui glisse de droite
  //  à gauche en grandissant, et les voisines se déplacent en douceur au lieu de sauter.
  //  (c) prefers-reduced-motion : aucune animation, placement immédiat.
  //  (d) le masonry est re-mesuré à la fin de l'animation (offsetHeight, insensible aux
  //      transform → l'empilement corrigé en v40 ne peut pas revenir).
  //  (e) aucun pointer-events:none, et la carte en mouvement passe au-dessus (.vc-moving,
  //      z-index CSS) : les boutons restent cliquables pendant l'animation.
  // ══════════════════════════════════════════════════════════════════════════════
  var DUR = 660, EASE = 'cubic-bezier(.22, .8, .2, 1)';
  var CAN_ANIMATE = !!(window.Element && Element.prototype.animate);

  // Numéro de rangée (trame 8px) correspondant à une position verticale absolue (viewport).
  function rowAt(g, top) {
    var cs = window.getComputedStyle(g);
    var gTop = g.getBoundingClientRect().top + (parseFloat(cs.paddingTop) || 0);
    return Math.max(1, Math.round((top - gTop) / ROW) + 1);
  }

  function rects(cards) {
    return cards.map(function (c) { return c.getBoundingClientRect(); });
  }

  function switchColumn(card, toSide) {
    var g = grid(); if (!g) return;
    var cards = visibleCards();
    var idx = cards.indexOf(card);
    var before = rects(cards);
    var r0 = idx >= 0 ? before[idx] : card.getBoundingClientRect();
    var row = rowAt(g, r0.top);

    // (a) placement : même niveau vertical, et un seul placement explicite à la fois.
    cards.forEach(function (c) { if (c !== card && c.style) c.style.gridRowStart = ''; });
    card.classList.toggle('vc-side', !!toSide);
    card.classList.add('vc-user');
    card.style.gridRowStart = String(row);
    measureMixte();                    // nouveau span (lecture offsetHeight → layout à jour)

    if (REDUCE || !CAN_ANIMATE) { scheduleMeasure(); return; }   // (c)

    var after = rects(cards);
    card.classList.add('vc-moving');
    var running = 0;
    var endOne = function () {
      running--;
      if (running <= 0) { card.classList.remove('vc-moving'); scheduleMeasure(); } // (d)
    };
    cards.forEach(function (c, i) {
      var a = before[i], b = after[i];
      if (!a || !b || !b.width || !b.height) return;
      var dx = a.left - b.left, dy = a.top - b.top;
      var moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
      var sx = a.width / b.width, sy = a.height / b.height;
      var scaled = (c === card) && (Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01);
      if (!moved && !scaled) return;
      var from = 'translate(' + dx.toFixed(2) + 'px, ' + dy.toFixed(2) + 'px)' +
                 (scaled ? ' scale(' + sx.toFixed(4) + ', ' + sy.toFixed(4) + ')' : '');
      running++;
      var anim = c.animate(
        [{ transform: from, transformOrigin: 'top left' },
         { transform: 'none', transformOrigin: 'top left' }],
        { duration: DUR, easing: EASE, fill: 'none' }
      );
      var fin = function () { endOne(); };
      anim.onfinish = fin; anim.oncancel = fin;
    });
    if (running === 0) { card.classList.remove('vc-moving'); scheduleMeasure(); }
  }

  function onDocClickMixte(e) {
    if (current !== 'mixte') return;
    var g = grid(); if (!g) return;
    var card = e.target.closest('.card');
    if (!card || card.parentNode !== g) return;  // hors carte → rien (états individuels conservés)
    if (isInteractive(e.target)) return;         // (e) bouton d'action → laisser agir
    if (isMobile()) return;                      // B) mobile : 1 colonne, pas de bascule
    if (card.classList.contains('add')) return;  // carte statique « Proposer » : pas de bascule
    switchColumn(card, !card.classList.contains('vc-side'));
  }

  // setMode : CONSERVÉ pour le debug/un éventuel rétablissement, mais le seul mode appliqué
  // est 'mixte' (visuel retenu). Toute autre valeur est ignorée : plus rien n'active les
  // autres visuels ni la vue liste.
  function setMode(mode) {
    if (mode && mode !== MODE) return;            // verrouillé sur le visuel retenu
    current = MODE;
    var g = grid(); if (!g) return;
    g.setAttribute('data-view-mode', MODE);
    // Pagination initiale propre au mixte (18) : recalculée APRÈS avoir posé data-view-mode
    // (initialLimit() le lit), puis répartition des colonnes sur l'ensemble réellement visible.
    if (window.LBAKiosk && LBAKiosk.repaginate) LBAKiosk.repaginate();
    splitMixte();
  }

  // Applique le visuel le plus tôt possible (le script est en bas de <body>, #grid existe
  // déjà) pour que site.js lise data-view-mode="mixte" dès sa pagination initiale.
  function markGrid() {
    var g = grid(); if (g) g.setAttribute('data-view-mode', MODE);
  }
  markGrid();

  function bind() {
    markGrid();
    // Bascule de colonne au clic. Handler délégué sur le document, placé APRÈS ceux de
    // site.js (chargé avant) : like/partage/flip agissent d'abord, ce handler ignore les
    // cibles interactives.
    document.addEventListener('click', onDocClickMixte);

    // Re-mesure du masonry au redimensionnement.
    window.addEventListener('resize', function () {
      clearTimeout(resizeT);
      resizeT = setTimeout(measureMixte, 150);
    });

    // La grille est (re)peuplée / (re)filtrée par site.js → on re-répartit après coup.
    var g = grid();
    if (g && window.MutationObserver) {
      var mo = new MutationObserver(function () {
        clearTimeout(resizeT); resizeT = setTimeout(splitMixte, 120);
      });
      mo.observe(g, { childList: true, subtree: false });
    }

    // Application initiale, après le premier rendu de site.js.
    setTimeout(function () { setMode(MODE); }, 60);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  // Exposé pour site.js et le debug.
  //  · onGridChange : appelé par site.js (apply → commit) après TOUT changement de
  //    visibilité des cartes (recherche, clic catégorie, « afficher plus ») → on re-répartit
  //    les colonnes ET on re-mesure les spans sur l'ensemble RÉELLEMENT visible courant,
  //    sinon une carte redevenue visible garderait le span par défaut (~8px) → empilement.
  window.LBAViewCompare = {
    set: setMode,
    get: function () { return current; },
    remeasure: measureMixte,
    onGridChange: function () { splitMixte(); },
    // Conservés (code mort) : visuels non retenus, gardés sur demande d'Hugo.
    _legacy: { listOn: listOn, listOff: listOff, clearMixte: clearMixte, stripClarge: stripClarge,
               onDocClickClarge: onDocClickClarge, modes: CARD_MODES }
  };
})();
