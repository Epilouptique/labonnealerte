/* support.js — active les boutons de don (PayPal / Ko-fi…) selon les liens
   configurés côté serveur (variables PAYPAL_DONATE_URL / KOFI_URL exposées par
   GET /api/support-links). Les boutons sont MASQUÉS par défaut dans le HTML
   (attribut hidden) : on ne révèle que ceux dont le lien est configuré, sans
   faux « bientôt » ni scintillement. Logique générique, pilotée par data-support :
     · URL fournie (https)  → le bouton est remplacé par un lien <a> VISIBLE
       (nouvel onglet, rel="noopener"), classes .sup-btn conservées, sans
       l'attribut hidden (le <a> est créé neuf) ;
     · URL absente          → le bouton est retiré du DOM.
   Même logique sur /soutenir et la face « Nous soutenir » de Mon compte.
   Réseau KO ou réponse non-OK (links null) : aucun lien n'est révélé ET le bloc
   de don marqué data-support-collapse est replié (cas principal visé). */
(function () {
  'use strict';

  function activate(links) {
    // links peut être null (réseau KO ou réponse non-OK) : on ne sort PAS pour
    // autant — aucun lien n'est alors révélé, et le repli des blocs ci-dessous
    // DOIT quand même s'exécuter (c'est le cas principal). La lecture de l'URL
    // est rendue null-safe en conséquence.
    var buttons = document.querySelectorAll('button.sup-btn[data-support]');
    Array.prototype.forEach.call(buttons, function (btn) {
      var key = btn.getAttribute('data-support');
      var url = (links && key) ? links[key] : null;
      if (!url) { btn.remove(); return; } // non configuré → masqué
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
    // Repli générique : un bloc de don marqué data-support-collapse qui ne contient
    // plus aucun lien révélé (<a class="sup-btn">) est masqué en entier — on ne
    // laisse pas un titre et un paragraphe orphelins au-dessus d'un cadre vide.
    // Chaque page déclare elle-même le bon niveau à replier (ligne, bloc ou tuile)
    // via l'attribut, donc ce code reste générique, sans cas par page.
    var blocks = document.querySelectorAll('[data-support-collapse]');
    Array.prototype.forEach.call(blocks, function (block) {
      if (!block.querySelector('a.sup-btn')) block.hidden = true;
    });
  }

  fetch('/api/support-links', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(activate)
    .catch(function () { activate(null); /* réseau KO : rien révélé → blocs repliés */ });
})();
