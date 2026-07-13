/* cards.js — rendu partagé des cartes du kiosque (recto/verso).
   RECTO : grand public (titre, sous-titre, description, état, switch/lien).
   VERSO : dev/curieux (même en-tête, endpoint, tags cliquables, auteur, lien proposer).
   Le switch est présent dans les DEUX modes. Les 'linked' gardent leur lien.
   Labels de catégories via window.LBACat. Expose window.LBACards. */

(function () {
  'use strict';

  // Libellés affichés des badges (les valeurs DB et les classes CSS ne changent pas).
  var BADGE_LABEL = { official: 'vérifié', verified: 'vérifié', community: 'communauté' };

  function catLabel(slug) {
    return (window.LBACat && window.LBACat.label) ? window.LBACat.label(slug) : slug;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var BADGE_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M8.4 12.4l2.3 2.3 4.9-4.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Badge = icône compacte (coche cerclée). official/verified → accent ; community → muted.
  function badgeFor(badge) {
    var b = (badge || 'community').toLowerCase();
    if (b !== 'official' && b !== 'verified' && b !== 'community') b = 'community';
    var title = (b === 'community') ? 'Source communautaire' : 'Source vérifiée';
    return '<span class="badge-ic ' + b + '" title="' + title + '" role="img" aria-label="' + title + '">' + BADGE_ICON + '</span>';
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

  // En-tête commun recto/verso : titre + badge.
  function topRow(s) {
    return '<div class="card-top"><h3>' + esc(s.name) + '</h3>' + badgeFor(s.badge) + '</div>';
  }

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

  function subForm() {
    return '<div class="sub-form"><input type="email" placeholder="votre@email.fr" aria-label="Adresse email">' +
      '<button type="button">OK</button></div>';
  }

  var SHARE_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';

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
    // Compteur d'abonnés discret (seulement à partir de 10).
    var count = (s.subscriber_count >= 10)
      ? '<div class="sub-count">' + s.subscriber_count + ' abonnés</div>' : '';
    return '' +
      '<div class="card-face card-front">' +
        '<button class="share-btn card-share" type="button" aria-label="Partager" title="Partager">' + SHARE_SVG + '</button>' +
        '<button class="flip-btn" type="button" aria-label="En savoir plus" title="En savoir plus">ⓘ</button>' +
        topRow(s) +
        (s.subtitle ? '<div class="card-subtitle">' + esc(s.subtitle) + '</div>' : '') +
        '<p>' + esc(s.description || '') + '</p>' +
        state +
        count +
        action +
      '</div>';
  }

  function backFace(s, cats, isLinked) {
    var endpoint = isLinked
      ? '<div class="endpoint mono">Service partenaire — API sur ' + esc(domainOf(s.link_url)) + '</div>'
      : '<a class="endpoint mono" href="/api/sources/' + esc(s.id) + '/alert.json" target="_blank" rel="noopener">' +
        'GET /api/sources/' + esc(s.id) + '/alert.json</a>';

    // Tags cliquables → filtre la catégorie sur la home.
    var tags = (cats.length)
      ? '<div class="back-tags">' + cats.map(function (c) {
          return '<button type="button" class="tag back-tag" data-cat="' + esc(c) + '">' + esc(catLabel(c)) + '</button>';
        }).join('') + '</div>'
      : '';

    var author = s.submitted_by_github
      ? '<div class="back-author">par <a href="https://github.com/' + esc(s.submitted_by_github) + '" ' +
        'target="_blank" rel="noopener">@' + esc(s.submitted_by_github) + '</a></div>'
      : '';

    // Lien vers la page de statut (pas pour les sources liées : doomname n'en a pas).
    var statut = isLinked ? ''
      : '<a class="back-statut" href="/source/' + esc(s.id) + '/statut">Statut &amp; historique →</a>';

    return '' +
      '<div class="card-face card-back">' +
        '<button class="flip-back" type="button" aria-label="Retour" title="Retour">↩</button>' +
        topRow(s) +
        endpoint + tags + author + statut +
        '<a class="back-propose" href="/proposer">Proposez la vôtre →</a>' +
      '</div>';
  }

  // 3e face : partage (grille remplie à la volée par site.js via LBAShare.optionsHTML).
  function shareFace() {
    return '' +
      '<div class="card-face card-share-face">' +
        '<button class="flip-back" type="button" aria-label="Retour" title="Retour">↩</button>' +
        '<div class="share-face-title">Partager</div>' +
        '<div class="share-grid share-face-grid"></div>' +
      '</div>';
  }

  // Texte de recherche : nom + sous-titre + description + slugs & labels des catégories.
  function searchText(s, cats) {
    var parts = [s.name || '', s.subtitle || '', s.description || ''];
    cats.forEach(function (c) { parts.push(c); parts.push(catLabel(c)); });
    return parts.join(' ').toLowerCase();
  }

  // s : source complète ; mode : 'anon' | 'connected'
  function cardHTML(s, mode) {
    var cats = Array.isArray(s.categories) ? s.categories : [];
    var dataCats = cats.map(esc).join(' ');
    var isLinked = s.type === 'linked';
    var sub = mode === 'connected' && !!s.subscribed ? '1' : '0';
    return '' +
      '<div class="card flip" data-cats="' + dataCats + '" data-source-id="' + esc(s.id) + '"' +
        ' data-subscribed="' + sub + '" data-search="' + esc(searchText(s, cats)) + '">' +
        '<div class="card-inner">' +
          frontFace(s, mode, isLinked) +
          backFace(s, cats, isLinked) +
          shareFace() +
        '</div>' +
      '</div>';
  }

  window.LBACards = {
    esc: esc, badgeFor: badgeFor, stateFor: stateFor, domainOf: domainOf, cardHTML: cardHTML, catLabel: catLabel
  };
})();
