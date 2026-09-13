/* view-compare.js — TEMPORAIRE, fil #9bis : COMPARATEUR DE VISUELS DU KIOSQUE.
   À RETIRER une fois le visuel définitif choisi (avec la barre .view-compare de
   index.html, le bloc CSS « TEMPORAIRE — fil #9bis » de site.css, et le <script> de
   index.html). Mécanisme de PRÉVISUALISATION non persistant (sessionStorage seulement) :
   il ne touche JAMAIS la préférence « Vue liste » persistée en compte (view-mode.js
   n'est pas appelé pour persister ; le mode liste est activé via l'attribut data-view et
   l'événement lba-view-change, exactement le pathway qu'utilise la vraie bascule, mais
   sans écriture serveur).

   6 visuels :
     1 large  — gabarit large existant (aucune règle spécifique).
     2 liste  — vue dense list-view.js (root[data-view="list"]).
     3 compact— 350×200, 3 colonnes.
     4 ultra  — 300×150, sans description.
     5 mixte  — colonne principale large + colonne secondaire ultra-compacte.
     6 clarge — compact épuré (350×200 SANS description) qui S'AGRANDIT au clic vers le
                format large (visuel 1), en pleine largeur, animé ; se rétracte au clic
                ailleurs. Une seule carte agrandie à la fois.

   Le FLIP est inchangé dans les 6 : on ne fait varier que dimensions/disposition. */

(function () {
  'use strict';

  var KEY = 'lba-view-compare';          // sessionStorage (jamais localStorage/compte)
  var CARD_MODES = { large: 1, compact: 1, ultra: 1, mixte: 1, clarge: 1 };
  var current = 'large';
  var resizeT = null;

  function grid() { return document.getElementById('grid'); }
  function root() { return document.documentElement; }

  function saved() {
    try { var v = sessionStorage.getItem(KEY); return v; } catch (e) { return null; }
  }
  function store(mode) { try { sessionStorage.setItem(KEY, mode); } catch (e) {} }

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

  // ── Mode LISTE : réutilise le pathway existant (data-view + lba-view-change), SANS
  //    persister. list-view.js écoute lba-view-change et resynchronise ; le CSS
  //    root[data-view="list"] masque #grid et montre #list. La vraie bascule
  //    (LBAViewMode.set) ferait EN PLUS un POST /api/my-alerts/view-mode : on l'évite ici. */
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
  //    secondaire (ultra-compacte). RÈGLE (décision technique libre, cf. rapport) :
  //    découpage POSITIONNEL déterministe — 1 carte sur MAIN_EVERY va en colonne large,
  //    les autres en colonne ultra. INDÉPENDANT du statut Active : robuste quel que soit
  //    le nombre d'alertes actives réel (l'ancienne règle « actives → large » vidait la
  //    colonne large quand peu d'alertes étaient actives, ex. 14/268). Ratio 1:2 (une
  //    large toutes les 3 cartes) → les deux colonnes restent peuplées et régulières sur
  //    toute la hauteur, quel que soit le compte.
  var MAIN_EVERY = 3;
  function splitMixte() {
    var cards = visibleCards();
    cards.forEach(function (c, i) {
      // Ne PAS reclasser une carte promue (visuel 5, clic → large) ni en cours de
      // rétraction : elle est gérée par le mécanisme promote/demote ci-dessous.
      if (c.classList.contains('vc-promoted') || c.classList.contains('vc-collapsing')) return;
      var toMain = (i % MAIN_EVERY === 0);
      c.classList.toggle('vc-side', !toMain);
    });
    // Mesure APRÈS reflow (les changements de colonne/format viennent de muter les
    // hauteurs) : sans ce rAF, le span serait calculé sur l'ancienne hauteur → cartes
    // mal placées dans la grille masonry (symptôme « carte figée / mal positionnée »).
    requestAnimationFrame(measureMixte);
  }

  // Masonry par span de rangées : chaque carte occupe autant de rangées (8px) que sa
  // hauteur RÉELLE + une marge de 16px, pour que les deux colonnes se tassent
  // indépendamment (grid-auto-flow: row dense). On lit la hauteur du RECTO (.card-front,
  // dans le flux) et non de .card (dont les faces absolues ne comptent pas) pour un span
  // fidèle même quand la carte est retournée.
  function measureMixte() {
    var g = grid(); if (!g || g.getAttribute('data-view-mode') !== 'mixte') return;
    var ROW = 8, MARGIN = 16;
    visibleCards().forEach(function (c) {
      var front = c.querySelector('.card-front');
      var h = front ? front.getBoundingClientRect().height : c.getBoundingClientRect().height;
      if (!h) { c.style.gridRowEnd = ''; return; }
      c.style.gridRowEnd = 'span ' + Math.max(1, Math.ceil((h + MARGIN) / ROW));
    });
  }

  function clearMixte() {
    var g = grid(); if (!g) return;
    for (var i = 0; i < g.children.length; i++) {
      var c = g.children[i];
      if (!c.classList) continue;
      c.classList.remove('vc-side', 'vc-promoted', 'vc-collapsing');
      if (c.style) { c.style.gridRowEnd = ''; c.style.width = ''; }
    }
  }

  // ── Mode CLARGE (visuel 6) : expansion/rétraction au clic. Une seule carte agrandie à
  //    la fois (choix confirmé au rapport : agrandir une nouvelle carte rétracte l'autre).
  //    Le clic n'agrandit QUE sur une zone non interactive de la carte : les boutons
  //    d'action (like/partage/flip + toggle d'abonnement) gardent leur comportement propre
  //    et ne déclenchent jamais l'expansion (mêmes familles de classes que le CSS/site.js).
  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Retrait INSTANTANÉ (changement de mode) : aucune animation attendue.
  function stripClarge() {
    var g = grid(); if (!g) return;
    g.querySelectorAll('.card.cl-expanded, .card.cl-collapsing').forEach(function (c) {
      c.classList.remove('cl-expanded', 'cl-collapsing');
    });
  }
  // Rétraction ANIMÉE d'une carte : phase transitoire .cl-collapsing (rangée pleine largeur
  // conservée le temps que la largeur redescende à 350px), retirée à la fin de la transition
  // → pas de saut. prefers-reduced-motion : retrait direct, sans phase transitoire.
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
    to = setTimeout(done, 420); // filet si transitionend ne se déclenche pas
  }
  // Rétracte (animé) toutes les cartes agrandies.
  function collapseClarge() {
    var g = grid(); if (!g) return;
    g.querySelectorAll('.card.cl-expanded').forEach(collapseCard);
  }
  // Cible interactive → on ne touche pas à l'expansion (le handler propre agit).
  function isInteractive(target) {
    return !!(target.closest &&
      target.closest('button, a, input, select, textarea, label, .switch, .switch-row, .card-icons, .card-action'));
  }
  function onDocClickClarge(e) {
    if (current !== 'clarge') return;
    var g = grid(); if (!g) return;
    var card = e.target.closest('.card');
    var inGrid = card && card.parentNode === g;
    if (!inGrid) { collapseClarge(); return; }           // clic hors carte → rétracte
    if (isInteractive(e.target)) return;                 // bouton d'action → laisser agir
    if (card.classList.contains('cl-expanded')) {
      collapseCard(card);                                // re-clic sur la carte agrandie → rétracte (animé)
    } else {
      collapseClarge();                                  // une seule agrandie à la fois (rétraction animée des autres)
      card.classList.remove('cl-collapsing');            // si elle était en cours de rétraction, on annule
      card.classList.add('cl-expanded');
    }
  }

  // ── Mode MIXTE (visuel 5) — BASCULE BIDIRECTIONNELLE au clic, PAR CARTE.
  //    L'état de colonne d'une carte = présence de .vc-side :
  //      .vc-side                → colonne 2, format ultra-compact.
  //      (sans .vc-side)         → colonne 1, format large.
  //      .vc-side.vc-collapsing  → phase transitoire du rétrécissement (la carte reste en
  //                                colonne 1 le temps que max-width redescende, puis rejoint
  //                                la colonne 2 déjà à 320px, sans saut).
  //    RÈGLE (décision libre, cf. rapport) : chaque carte garde son PROPRE état,
  //    indépendamment des autres — plus de limite « une seule à la fois » (naturel une fois
  //    le mécanisme bidirectionnel). Cliquer une carte LARGE la rétrécit vers l'ultra ;
  //    cliquer une carte ULTRA l'agrandit vers le large ; le clic est donc réversible sur
  //    chaque carte. Le nombre total affiché ne change pas, seule la colonne de chaque carte.
  //    Animation : max-width (px→px, fiable dans les deux sens ; animer width en %→px sans
  //    changement de piste n'était pas honoré par Chromium — cf. correctif précédent).
  function stripMixtePromo() {
    var g = grid(); if (!g) return;
    g.querySelectorAll('.card.vc-collapsing').forEach(function (c) { c.classList.remove('vc-collapsing'); });
  }
  // Agrandir : la carte quitte la colonne ultra (retire .vc-side) → colonne 1, large.
  // max-width 320px → var(--card-w) + piste 2→1 : animé.
  function toLargeMixte(card) {
    card.classList.remove('vc-collapsing');
    card.classList.remove('vc-side');
    requestAnimationFrame(measureMixte); // le nombre de cartes par colonne a changé
  }
  // Rétrécir : la carte rejoint la colonne ultra (ajoute .vc-side), retour animé en deux
  // phases (reste en colonne 1 via .vc-collapsing pendant que max-width redescend à 320px).
  function toUltraMixte(card) {
    if (REDUCE) { card.classList.add('vc-side'); requestAnimationFrame(measureMixte); return; }
    card.classList.add('vc-side');       // le recto ultra revient tout de suite…
    card.classList.add('vc-collapsing'); // …mais on reste en colonne 1 pendant l'animation
    var to;
    var done = function (e) {
      if (e && e.propertyName && e.propertyName !== 'max-width') return;
      card.classList.remove('vc-collapsing');
      card.removeEventListener('transitionend', done);
      clearTimeout(to);
      requestAnimationFrame(measureMixte);
    };
    card.addEventListener('transitionend', done);
    to = setTimeout(done, 460);
  }
  function onDocClickMixte(e) {
    if (current !== 'mixte') return;
    var g = grid(); if (!g) return;
    var card = e.target.closest('.card');
    if (!card || card.parentNode !== g) return;  // hors carte → rien (états individuels conservés)
    if (isInteractive(e.target)) return;         // bouton d'action (like/partage/flip/toggle) → laisser agir
    // Bascule réversible : ultra ↔ large. Une carte en cours de rétrécissement (.vc-side
    // .vc-collapsing) porte .vc-side → un clic la ré-agrandit (annule la rétraction).
    if (card.classList.contains('vc-side')) toLargeMixte(card);
    else toUltraMixte(card);
  }

  function reflectButtons(mode) {
    var bar = document.querySelector('.view-compare');
    if (!bar) return;
    bar.querySelectorAll('.vc-btn').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === mode);
      b.setAttribute('aria-pressed', b.getAttribute('data-mode') === mode ? 'true' : 'false');
    });
  }

  function setMode(mode) {
    if (mode !== 'liste' && !CARD_MODES[mode]) mode = 'large';
    current = mode;
    var g = grid();
    stripClarge();      // repart toujours d'un état compact net (changement de mode = pas d'animation)
    stripMixtePromo();  // idem : aucune carte « promue » ne survit à un changement de mode

    if (mode === 'liste') {
      clearMixte();
      if (g) g.setAttribute('data-view-mode', 'large'); // sans effet (masqué), pour cohérence
      listOn();
    } else {
      listOff();
      if (mode !== 'mixte') clearMixte();
      if (g) g.setAttribute('data-view-mode', mode);
      // Pagination initiale spécifique au mode (fil #9bis : mixte = 18). On recalcule APRÈS
      // avoir posé data-view-mode (initialLimit() le lit), puis on (re)répartit les colonnes
      // sur l'ensemble réellement visible.
      if (window.LBAKiosk && LBAKiosk.repaginate) LBAKiosk.repaginate();
      if (mode === 'mixte') splitMixte();
    }
    reflectButtons(mode);
    store(mode);
  }

  function bind() {
    var bar = document.querySelector('.view-compare');
    if (bar && !bar.dataset.bound) {
      bar.dataset.bound = '1';
      bar.addEventListener('click', function (e) {
        var btn = e.target.closest('.vc-btn'); if (!btn) return;
        setMode(btn.getAttribute('data-mode'));
      });
    }

    // Visuel 6 : expansion/rétraction au clic (délégué sur le document, actif uniquement
    // quand current === 'clarge'). Placé APRÈS les handlers de site.js (chargé avant) :
    // like/partage/flip agissent d'abord, ce handler ignore les cibles interactives.
    document.addEventListener('click', onDocClickClarge);
    // Visuel 5 : clic pour promouvoir une carte de la colonne ultra vers la colonne large.
    document.addEventListener('click', onDocClickMixte);

    // Re-mesure du masonry mixte au redimensionnement (uniquement dans ce mode).
    window.addEventListener('resize', function () {
      if (current !== 'mixte') return;
      clearTimeout(resizeT);
      resizeT = setTimeout(measureMixte, 150);
    });

    // La grille est (re)peuplée / (re)filtrée par site.js. En mode mixte, on re-répartit
    // après coup pour refléter les cartes visibles courantes. MutationObserver léger.
    var g = grid();
    if (g && window.MutationObserver) {
      var mo = new MutationObserver(function () {
        if (current === 'mixte') { clearTimeout(resizeT); resizeT = setTimeout(splitMixte, 120); }
      });
      mo.observe(g, { childList: true, subtree: false });
    }

    // État initial : ne PERTURBE PAS la préférence de compte au chargement — on n'applique
    // un mode que si l'utilisateur en avait déjà choisi un dans CETTE session (sessionStorage).
    // Sinon on reflète simplement l'état courant dans les boutons (liste si le compte est en
    // liste, large sinon) sans rien changer.
    var s = saved();
    if (s && (s === 'liste' || CARD_MODES[s])) {
      // Laisse site.js finir son rendu initial avant d'appliquer (surtout pour mixte/liste).
      setTimeout(function () { setMode(s); }, 60);
    } else {
      current = (root().getAttribute('data-view') === 'list') ? 'liste' : 'large';
      reflectButtons(current);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  // Exposé pour un éventuel appel externe / debug (temporaire).
  window.LBAViewCompare = { set: setMode, get: function () { return current; }, remeasure: measureMixte };
})();
