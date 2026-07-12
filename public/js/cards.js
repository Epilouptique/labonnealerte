/* cards.js — rendu partagé des cartes du kiosque (recto/verso).
   RECTO : grand public (titre, sous-titre, description, état, switch/lien).
   VERSO : dev/curieux (même en-tête titre+badge, endpoint, tags, auteur, lien proposer).
   Le switch est présent dans les DEUX modes (anon / connected). Les 'linked' gardent leur lien.
   Expose window.LBACards. */

(function () {
  'use strict';

  var CATEGORY_LABELS = {
    'bons-plans': 'Bons plans',
    'meteo-risques': 'Météo & risques',
    'energie': 'Énergie',
    'tech': 'Tech',
    'transports': 'Transports',
    'autre': 'Autre'
  };
  var CATEGORY_ORDER = ['bons-plans', 'meteo-risques', 'energie', 'tech', 'transports', 'autre'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function badgeFor(badge) {
    var b = (badge || 'community').toLowerCase();
    if (b !== 'official' && b !== 'verified' && b !== 'community') b = 'community';
    return '<span class="badge ' + b + '">' + b + '</span>';
  }

  function stateFor(state) {
    if (state === 'active') {
      return '<div class="state active"><span class="dot-live"></span> Active en ce moment</div>';
    }
    return '<div class="state idle"><span class="dot-idle"></span> Rien à signaler</div>';
  }

  function domainOf(url) {
    var s = String(url || '').replace(/^https?:\/\//, '').replace(/^www\./, '');
    return s.split('/')[0];
  }

  // En-tête commun recto/verso : titre + badge (même structure, même taille).
  function topRow(s) {
    return '<div class="card-top"><h3>' + esc(s.name) + '</h3>' + badgeFor(s.badge) + '</div>';
  }

  // Switch d'abonnement. `on` = état coché initial.
  function switchRow(on) {
    return '' +
      '<label class="switch-row">' +
        '<span class="switch">' +
          '<input type="checkbox"' + (on ? ' checked' : '') + ' aria-label="Basculer l\'abonnement">' +
          '<span class="track"></span><span class="thumb"></span>' +
        '</span>' +
        '<span class="switch-label' + (on ? ' on' : '') + '">' + (on ? 'Abonné' : 'Non abonné') + '</span>' +
      '</label>';
  }

  // Formulaire email révélé en mode anonyme quand le switch passe « en attente ».
  function subForm() {
    return '<div class="sub-form"><input type="email" placeholder="votre@email.fr" aria-label="Adresse email">' +
      '<button type="button">OK</button></div>';
  }

  function frontFace(s, mode, isLinked) {
    var state, action;
    if (isLinked) {
      state = '<div class="state partner"><span class="dot-idle"></span> Service partenaire</div>';
      action = '<a class="link-btn" href="' + esc(s.link_url) + '" target="_blank" rel="noopener">' +
        'Configurer sur ' + esc(domainOf(s.link_url)) + ' →</a>';
    } else {
      state = stateFor(s.state);
      action = switchRow(mode === 'connected' && !!s.subscribed) + (mode === 'connected' ? '' : subForm());
    }
    return '' +
      '<div class="card-face card-front">' +
        '<button class="flip-btn" type="button" aria-label="En savoir plus" title="En savoir plus">ⓘ</button>' +
        topRow(s) +
        (s.subtitle ? '<div class="card-subtitle">' + esc(s.subtitle) + '</div>' : '') +
        '<p>' + esc(s.description || '') + '</p>' +
        state +
        action +
      '</div>';
  }

  function backFace(s, cats, isLinked) {
    var endpoint = isLinked
      ? '<div class="endpoint mono">Service partenaire — API sur ' + esc(domainOf(s.link_url)) + '</div>'
      : '<a class="endpoint mono" href="/api/sources/' + esc(s.id) + '/alert.json" target="_blank" rel="noopener">' +
        'GET /api/sources/' + esc(s.id) + '/alert.json</a>';

    var tags = (cats.length)
      ? '<div class="back-tags">' + cats.map(function (c) {
          return '<span class="tag">' + esc(CATEGORY_LABELS[c] || c) + '</span>';
        }).join('') + '</div>'
      : '';

    // Auteur affiché dès qu'un pseudo GitHub est présent (toutes sources).
    var author = s.submitted_by_github
      ? '<div class="back-author">par <a href="https://github.com/' + esc(s.submitted_by_github) + '" ' +
        'target="_blank" rel="noopener">@' + esc(s.submitted_by_github) + '</a></div>'
      : '';

    return '' +
      '<div class="card-face card-back">' +
        '<button class="flip-back" type="button" aria-label="Retour" title="Retour">↩</button>' +
        topRow(s) +
        endpoint + tags + author +
        '<a class="back-propose" href="/proposer">Proposez la vôtre →</a>' +
      '</div>';
  }

  // s : source complète ; mode : 'anon' | 'connected'
  function cardHTML(s, mode) {
    var cats = Array.isArray(s.categories) ? s.categories : [];
    var dataCats = cats.map(esc).join(' ');
    var isLinked = s.type === 'linked';
    return '' +
      '<div class="card flip" data-cats="' + dataCats + '" data-source-id="' + esc(s.id) + '">' +
        '<div class="card-inner">' +
          frontFace(s, mode, isLinked) +
          backFace(s, cats, isLinked) +
        '</div>' +
      '</div>';
  }

  window.LBACards = {
    esc: esc, badgeFor: badgeFor, stateFor: stateFor, domainOf: domainOf, cardHTML: cardHTML,
    CATEGORY_LABELS: CATEGORY_LABELS, CATEGORY_ORDER: CATEGORY_ORDER
  };
})();
