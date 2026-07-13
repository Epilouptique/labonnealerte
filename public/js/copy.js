/* copy.js — bouton de copie discret sur chaque bloc <pre class="code">.
   Clic → copie le texte brut dans le presse-papier → icône « ✓ » 1,5 s. */

(function () {
  'use strict';

  var COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9" y="9" width="13" height="13" rx="2"></rect>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {}
  }

  function attach(block) {
    if (block.parentElement && block.parentElement.classList.contains('code-wrap')) return;
    var wrap = document.createElement('div');
    wrap.className = 'code-wrap';
    block.parentNode.insertBefore(wrap, block);
    wrap.appendChild(block);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.setAttribute('aria-label', 'Copier le code');
    btn.innerHTML = COPY_SVG;
    wrap.appendChild(btn);

    btn.addEventListener('click', function () {
      var text = block.innerText;
      var done = function () {
        btn.classList.add('copied');
        btn.innerHTML = CHECK_SVG;
        setTimeout(function () {
          btn.classList.remove('copied');
          btn.innerHTML = COPY_SVG;
        }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      } else {
        fallbackCopy(text);
        done();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('pre.code').forEach(attach);
  });

  // Exposé pour les blocs de code ajoutés dynamiquement (page statut).
  window.LBACopy = { attach: attach };
})();
