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

  // Flèche « retour » (identique au rendu PC de « ↩ ») : rendu cohérent sur tous
  // les OS/navigateurs (iOS/Firefox tombaient sur un glyphe système, Android/Chrome
  // l'écrasait). Taille pilotée par le CSS (.flip-back svg / .src-back svg).
  var BACK_SVG = '<svg class="ic-back" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v3"/></svg>';

  // Icône « i dans un cercle » (recto, bouton « En savoir plus ») : même style que
  // SHARE_SVG/BACK_SVG (trait 2px, linecap round, 18×18, currentColor). Remplace le
  // caractère « ⓘ » au rendu incohérent selon les OS. Taille pilotée par .flip-btn svg.
  var INFO_SVG = '<svg class="ic-info" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.6v.01"/></svg>';

  // A1) Cœur « j'aime » : contour (non aimé) ; le CSS le remplit quand .liked.
  var LIKE_SVG = '<svg class="ic-like" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.3l-1.45-1.32C5.4 14.36 2.5 11.7 2.5 8.5 2.5 6.08 4.42 4.2 6.8 4.2c1.36 0 2.66.63 3.5 1.64l.7.85.7-.85C12.54 4.83 13.84 4.2 15.2 4.2c2.38 0 4.3 1.88 4.3 4.3 0 3.2-2.9 5.86-8.05 10.48z"/></svg>';

  // Format compact du compteur de likes : 1240 → « 1,2 k », 12000 → « 12 k ».
  function formatCount(n) {
    n = Number(n) || 0;
    if (n < 1000) return String(n);
    var v = n / 1000;
    var s = (v >= 10 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, ''));
    return s.replace('.', ',') + ' k';
  }

  // Bouton like (recto). Non aimé au rendu ; site.js marque .liked depuis localStorage.
  function likeBtn(s) {
    var n = Number(s.likes_count) || 0;
    return '<button class="like-btn card-like" type="button" aria-pressed="false"' +
      ' aria-label="J\'aime cette alerte" data-likes="' + n + '">' +
      LIKE_SVG + '<span class="like-n">' + formatCount(n) + '</span></button>';
  }

  // Source paramétrée (OpenAlert v2) : schéma plat à au moins un paramètre.
  function isParam(s) { return Array.isArray(s.params_schema) && s.params_schema.length > 0; }

  // Bloc d'abonnement paramétré : instances suivies (mode connecté) + sélecteur
  // générique construit depuis le schéma enum. Aucun code spécifique vigilance.
  // Contrôle de saisie générique selon le type du paramètre : enum → select,
  // string/number → input (avec placeholder/pattern éventuels).
  function paramControl(schema, def) {
    if (schema.type === 'enum') {
      var opts = (schema.values || []).map(function (v) {
        var sel = (def != null && String(v.value) === String(def)) ? ' selected' : '';
        return '<option value="' + esc(v.value) + '"' + sel + '>' + esc(v.label) + '</option>';
      }).join('');
      return '<select class="param-select" data-key="' + esc(schema.key) + '" aria-label="' + esc(schema.label) + '">' + opts + '</select>';
    }
    var type = schema.type === 'number' ? 'number' : 'text';
    var ph = schema.placeholder ? ' placeholder="' + esc(schema.placeholder) + '"' : '';
    var pat = schema.pattern ? ' pattern="' + esc(schema.pattern) + '"' : '';
    var val = def != null ? ' value="' + esc(def) + '"' : '';
    return '<input class="param-input" type="' + type + '" data-key="' + esc(schema.key) + '"' +
      ph + pat + val + ' aria-label="' + esc(schema.label) + '">';
  }

  function paramFace(s, mode) {
    var schema = s.params_schema[0];
    var instances = Array.isArray(s.instances) ? s.instances : [];
    var def = (window.LBADefaults && window.LBADefaults[schema.key]) || schema.default || null;

    var chips = instances.length
      ? '<div class="param-chips">' + instances.map(function (inst) {
          return '<span class="param-chip" data-params="' + esc(JSON.stringify(inst.params)) + '">' +
            '<span class="pc-dot' + (inst.state === 'active' ? ' on' : '') + '"></span>' +
            esc(inst.label) +
            '<button type="button" class="param-remove" aria-label="Se désabonner de ' + esc(inst.label) + '">✕</button>' +
          '</span>';
        }).join('') + '</div>'
      : '';
    var addBtn = instances.length
      ? '<button type="button" class="param-add">+ ajouter</button>' : '';
    var picker =
      '<div class="param-form"' + (instances.length ? ' hidden' : '') + '>' +
        paramControl(schema, def) +
        '<button type="button" class="sub-btn param-follow">Suivre</button>' +
      '</div>';
    // Parcours anonyme : email (réutilise .sub-form), les params sont joints au submit.
    var anon = (mode !== 'connected')
      ? '<div class="sub-form param-subform"><input type="email" placeholder="votre@email.fr" aria-label="Adresse email"><button type="button">OK</button></div>'
      : '';
    // H) Indicateur d'abonnement TOUJOURS visible (comme les cartes broadcast) :
    // en mode connecté, « Abonné » si ≥1 instance suivie, sinon « Non abonné ».
    // (state.js met à jour ce libellé à l'ajout/retrait d'instance.)
    var on = instances.length > 0;
    var status = (mode === 'connected')
      ? '<div class="param-status"><span class="switch-label' + (on ? ' on' : '') + '">' +
        (on ? 'Abonné' : 'Non abonné') + '</span></div>'
      : '';
    return status + chips + addBtn + picker + anon;
  }

  function frontFace(s, mode, isLinked) {
    var state, action;
    if (isLinked) {
      state = '<div class="state partner"><span class="dot-idle"></span> Service partenaire</div>';
      action = '<a class="link-btn" href="' + esc(s.link_url) + '" target="_blank" rel="noopener">' +
        'Configurer sur ' + esc(domainOf(s.link_url)) + ' →</a>';
    } else if (isParam(s)) {
      state = stateFor(s.state); // état de la/les instance(s) de l'utilisateur (le pire), sinon neutre
      action = paramFace(s, mode);
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
        '<button class="flip-btn" type="button" aria-label="En savoir plus" title="En savoir plus">' + INFO_SVG + '</button>' +
        likeBtn(s) +
        topRow(s) +
        (s.subtitle ? '<div class="card-subtitle">' + esc(s.subtitle) + '</div>' : '') +
        '<p>' + esc(s.description || '') + '</p>' +
        state +
        count +
        action +
      '</div>';
  }

  function backFace(s, cats, isLinked, mode) {
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

    // Phase 2 : « Ajouter à un deck » — action discrète sur le verso, en mode
    // connecté uniquement (composer un deck = fonctionnalité de compte). Le picker
    // est géré par js/deck-add.js (chargé sur la home).
    var addDeck = (mode === 'connected' && !isLinked)
      ? '<button type="button" class="back-add-deck" data-source-id="' + esc(s.id) + '">＋ Ajouter à un deck</button>'
      : '';

    return '' +
      '<div class="card-face card-back">' +
        '<button class="flip-back" type="button" aria-label="Retour" title="Retour">' + BACK_SVG + '</button>' +
        topRow(s) +
        endpoint + tags + author + statut + addDeck +
        '<a class="back-propose" href="/proposer">Proposez la vôtre →</a>' +
      '</div>';
  }

  // 3e face : partage (grille remplie à la volée par site.js via LBAShare.optionsHTML).
  function shareFace() {
    return '' +
      '<div class="card-face card-share-face">' +
        '<button class="flip-back" type="button" aria-label="Retour" title="Retour">' + BACK_SVG + '</button>' +
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
    // Abonné = broadcast souscrit OU au moins une instance paramétrée.
    var hasInstances = Array.isArray(s.instances) && s.instances.length > 0;
    var sub = mode === 'connected' && (!!s.subscribed || hasInstances) ? '1' : '0';
    return '' +
      '<div class="card flip" data-cats="' + dataCats + '" data-source-id="' + esc(s.id) + '"' +
        ' data-subscribed="' + sub + '" data-search="' + esc(searchText(s, cats)) + '">' +
        '<div class="card-inner">' +
          frontFace(s, mode, isLinked) +
          backFace(s, cats, isLinked, mode) +
          shareFace() +
        '</div>' +
      '</div>';
  }

  window.LBACards = {
    esc: esc, badgeFor: badgeFor, stateFor: stateFor, domainOf: domainOf, cardHTML: cardHTML, catLabel: catLabel,
    BACK_SVG: BACK_SVG, formatCount: formatCount
  };
})();
