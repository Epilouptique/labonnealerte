/* view-compare.js — TEMPORAIRE, fil #9bis : COMPARATEUR DE VISUELS DU KIOSQUE.
   À RETIRER une fois le visuel définitif choisi (avec la barre .view-compare de
   index.html, le bloc CSS « TEMPORAIRE — fil #9bis » de site.css, et le <script> de
   index.html). Mécanisme de PRÉVISUALISATION non persistant (sessionStorage seulement) :
   il ne touche JAMAIS la préférence « Vue liste » persistée en compte (view-mode.js
   n'est pas appelé pour persister ; le mode liste est activé via l'attribut data-view et
   l'événement lba-view-change, exactement le pathway qu'utilise la vraie bascule, mais
   sans écriture serveur).

   5 visuels :
     1 large  — gabarit large existant (aucune règle spécifique).
     2 liste  — vue dense list-view.js (root[data-view="list"]).
     3 compact— 350×200, 3 colonnes.
     4 ultra  — 300×150, sans description.
     5 mixte  — colonne principale large + colonne secondaire ultra-compacte.

   Le FLIP est inchangé dans les 5 : on ne fait varier que dimensions/disposition. */

(function () {
  'use strict';

  var KEY = 'lba-view-compare';          // sessionStorage (jamais localStorage/compte)
  var CARD_MODES = { large: 1, compact: 1, ultra: 1, mixte: 1 };
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
  //      · colonne principale = alertes au statut « Active » (.state.active) + la carte
  //        statique « Proposer une alerte » ;
  //      · colonne secondaire = toutes les autres ;
  //      · repli déterministe : si AUCUNE alerte active n'est visible, les 5 premières
  //        cartes vont en colonne principale pour qu'elle ne soit jamais vide.
  function splitMixte() {
    var cards = visibleCards();
    var anyActive = cards.some(function (c) { return !!c.querySelector('.card-front .state.active'); });
    var mainCount = 0;
    cards.forEach(function (c, i) {
      var isAdd = c.classList.contains('add');
      var toMain;
      if (isAdd) toMain = true;
      else if (anyActive) toMain = !!c.querySelector('.card-front .state.active');
      else toMain = (mainCount < 5);
      if (toMain) mainCount++;
      c.classList.toggle('vc-side', !toMain);
    });
    measureMixte();
  }

  // Masonry par span de rangées : chaque carte occupe autant de rangées (8px) que sa
  // hauteur + une marge de 16px, pour que les deux colonnes se tassent indépendamment.
  function measureMixte() {
    var g = grid(); if (!g || g.getAttribute('data-view-mode') !== 'mixte') return;
    var ROW = 8, MARGIN = 16;
    visibleCards().forEach(function (c) {
      var h = c.getBoundingClientRect().height;
      if (!h) { c.style.gridRowEnd = ''; return; }
      c.style.gridRowEnd = 'span ' + Math.max(1, Math.ceil((h + MARGIN) / ROW));
    });
  }

  function clearMixte() {
    var g = grid(); if (!g) return;
    for (var i = 0; i < g.children.length; i++) {
      var c = g.children[i];
      if (!c.classList) continue;
      c.classList.remove('vc-side');
      if (c.style) c.style.gridRowEnd = '';
    }
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

    if (mode === 'liste') {
      clearMixte();
      if (g) g.setAttribute('data-view-mode', 'large'); // sans effet (masqué), pour cohérence
      listOn();
    } else {
      listOff();
      if (mode !== 'mixte') clearMixte();
      if (g) g.setAttribute('data-view-mode', mode);
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
