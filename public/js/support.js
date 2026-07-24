/* support.js — active les boutons de don (PayPal / Ko-fi) si les liens sont
   configurés côté serveur (variables PAYPAL_DONATE_URL / KOFI_URL exposées par
   GET /api/support-links). Sinon, laisse l'état « disabled + bientôt » du HTML
   intact. Même logique sur /soutenir et la face « Nous soutenir » de Mon compte.

   Un bouton actif est remplacé par un lien <a> (nouvel onglet, rel="noopener"),
   en conservant ses classes .sup-btn pour un rendu identique. */
(function () {
  'use strict';

  function activate(links) {
    if (!links) return;
    ['paypal', 'kofi'].forEach(function (key) {
      var url = links[key];
      if (!url) return; // non configuré → le bouton « bientôt » reste tel quel
      var buttons = document.querySelectorAll('button.sup-btn[data-support="' + key + '"]');
      Array.prototype.forEach.call(buttons, function (btn) {
        var a = document.createElement('a');
        a.className = btn.className;
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        // Conserve l'icône inline (ex. café Ko-fi) si le bouton en porte une.
        var icon = btn.querySelector('svg');
        if (icon) a.appendChild(icon.cloneNode(true));
        var label = document.createElement('span');
        label.className = 'sup-label';
        label.textContent = btn.getAttribute('data-label') || btn.textContent.trim();
        a.appendChild(label);
        btn.replaceWith(a);
      });
    });
  }

  fetch('/api/support-links', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(activate)
    .catch(function () { /* réseau indisponible : boutons « bientôt » conservés */ });
})();
