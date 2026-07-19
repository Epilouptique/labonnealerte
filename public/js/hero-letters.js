/* hero-letters.js — animation « lettres qui se retournent » des titres .page-title,
   COMMUNE à toutes les pages (auparavant réservée au dashboard connecté).
   Anime dès le PREMIER affichage du titre, y compris :
     · au chargement (titres déjà présents et visibles) ;
     · à la révélation d'un conteneur (retrait de l'attribut `hidden`, ou de
       body.loading qui masquait la page) ;
     · à l'insertion d'un titre rendu par JS (ex. « Mes decks »).
   Réutilise .hero-letter / @keyframes hero-letter-in (site.css) et .hl (bicolor).
   Idempotent : chaque titre n'est animé qu'une fois (data-hero-done). Respecte
   prefers-reduced-motion. L'accueil garde en plus l'animation au changement de
   catégorie gérée par site.js (setHeroTitle) — les deux cohabitent (garde). */
(function () {
  'use strict';
  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c; }

  function animate(el) {
    if (!el || REDUCE) return;
    if (el.dataset.heroDone === '1') return;
    if (el.getClientRects().length === 0) return; // encore masqué → on attend la révélation

    var parts = [];
    var i = 0;
    (function walk(node, hl) {
      Array.prototype.forEach.call(node.childNodes, function (n) {
        if (n.nodeType === 3) { // texte
          Array.from(n.textContent).forEach(function (ch) {
            if (ch === '\n' || ch === '\r') return;
            parts.push('<span class="hero-letter' + (hl ? ' hl' : '') +
              '" style="animation-delay:' + (i * 28) + 'ms">' +
              (ch === ' ' ? ' ' : esc(ch)) + '</span>');
            i++;
          });
        } else if (n.nodeType === 1) {
          if (n.tagName === 'BR') parts.push('<br>');
          else walk(n, hl || (n.classList && n.classList.contains('hl')));
        }
      });
    })(el, false);

    el.innerHTML = parts.join('');
    el.dataset.heroDone = '1';
    void el.offsetWidth; // force le (re)démarrage de l'animation CSS
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.classList && root.classList.contains('page-title')) animate(root);
    if (root.querySelectorAll) Array.prototype.forEach.call(root.querySelectorAll('.page-title'), animate);
  }

  function boot() {
    scan(document.body);

    // 1) Révélations (hidden retiré) + insertions de titres n'importe où dans la page.
    try {
      var moTree = new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          if (m.type === 'attributes') {
            if (m.attributeName === 'hidden' && !m.target.hasAttribute('hidden')) scan(m.target);
          } else if (m.addedNodes) {
            Array.prototype.forEach.call(m.addedNodes, scan);
          }
        });
      });
      moTree.observe(document.body, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'],
      });
    } catch (e) { /* MutationObserver absent : titres du chargement déjà animés */ }

    // 2) Fin de l'écran de chargement (retrait de body.loading = changement de classe
    //    sur <body>) : les titres redeviennent visibles → on (re)scanne.
    try {
      var moBody = new MutationObserver(function () { scan(document.body); });
      moBody.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (e) { /* idem */ }

    window.LBAHero = { animate: animate };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
