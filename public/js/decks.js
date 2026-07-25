/* decks.js — page /mes-decks : gestionnaire de decks (UGC phase 2).
   L'utilisateur connecté compose ses propres decks d'alertes, les édite, les
   partage (lien public /deck/<token>) et peut s'y abonner en un clic.
   Rendu des cartes via LBACards (lecture seule, mode 'anon'), partage via LBAShare.
   Auth : token de session (window.LBASession). Sans token / 401 → bloc « connexion ». */

(function () {
  'use strict';

  var loadingEl = document.getElementById('decks-loading');
  var anonEl = document.getElementById('decks-anon');
  var viewEl = document.getElementById('decks-view');

  var TOKEN = null;
  var STATE = {
    decks: [],
    display_name: null,
    emojis: [],
    max_decks: 15
  };
  var DEFAULT_EMOJI = '📦';
  var SUGGEST_STEP = 6;

  // État de la vue détail (mise à jour locale sans rechargement).
  var CATALOG = null;                                 // toutes les sources (/api/sources)
  var PROFILE = { interests: [], departement: null }; // pour scorer « La sélection »
  var curDeck = null, deckSources = [], pool = [], shownCount = 0;

  function esc(s) { return window.LBACards ? LBACards.esc(s) : String(s == null ? '' : s); }

  // E5) Motif (SVG de la bibliothèque) + teinte. L'emoji ne s'affiche jamais sur le
  // deck : il identifie le motif. Vignette = mini-carte teintée avec le motif en fond.
  function motifSvg(emoji) { return (window.LBADeckMotifs && (LBADeckMotifs[emoji] || LBADeckMotifs['📦'])) || ''; }
  function tintCls(t) { return 'tint-' + ((t >= 1 && t <= 11) ? t : 1); }
  function deckThumb(emoji, tint, lg) {
    return '<span class="deck-thumb' + (lg ? ' deck-thumb-lg' : '') + ' ' + tintCls(tint) + '">' +
      '<span class="deck-motif-bg" aria-hidden="true">' + motifSvg(emoji) + '</span></span>';
  }

  function showAnon() {
    if (loadingEl) loadingEl.hidden = true;
    if (viewEl) viewEl.hidden = true;
    if (anonEl) anonEl.hidden = false;
  }

  // --- Appels API -----------------------------------------------------------

  function apiGet(path) {
    var sep = path.indexOf('?') === -1 ? '?' : '&';
    return fetch(path + sep + 'token=' + encodeURIComponent(TOKEN), {
      headers: { Accept: 'application/json' }
    });
  }
  function apiSend(method, path, body) {
    var payload = body || {};
    payload.token = TOKEN;
    return fetch(path, {
      method: method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });
  }
  async function readJson(res) { try { return await res.json(); } catch (e) { return null; } }

  // --- Rendu de la liste des decks -----------------------------------------

  function pseudoBlockHTML() {
    var name = STATE.display_name;
    if (name) {
      return '<div class="acct-subhead">Mon pseudo</div>' +
        '<p class="deck-pseudo-line">Vos decks partagés seront signés <strong>' + esc(name) + '</strong>.</p>';
    }
    return '' +
      '<div class="section-label">Mon pseudo</div>' +
      '<form id="deck-pseudo-form" class="deck-pseudo-form" novalidate>' +
        '<label for="deck-pseudo-input">Choisissez votre pseudo pour signer vos decks</label>' +
        '<div class="deck-pseudo-row">' +
          '<input id="deck-pseudo-input" type="text" maxlength="30" autocomplete="off" placeholder="ex. Camille du Kiosque">' +
          '<button type="submit" class="notif-btn">Enregistrer</button>' +
        '</div>' +
        '<div id="deck-pseudo-msg" class="deck-form-msg" hidden></div>' +
      '</form>';
  }

  // G) Tuile de deck façon étagère de la home (motif + teinte + « paquet »), plus de
  // ligne austère. Reprend le gabarit .pack du kiosque.
  function deckTileHTML(d) {
    var badge = d.visibility && d.visibility !== 'private'
      ? '<span class="deck-badge deck-badge-shared">Partagé</span>'
      : '<span class="deck-badge">Privé</span>';
    var n = d.card_count || 0;
    return '' +
      '<button type="button" class="pack deck-tile ' + tintCls(d.tint) + '" data-deck="' + esc(d.id) + '">' +
        '<span class="pack-stack" aria-hidden="true"></span>' +
        '<span class="deck-motif-bg" aria-hidden="true">' + motifSvg(d.emoji || DEFAULT_EMOJI) + '</span>' +
        '<span class="pack-body">' +
          '<span class="pack-name">' + esc(d.name) + '</span>' +
          '<span class="pack-meta">' + n + (n > 1 ? ' cartes' : ' carte') + badge + '</span>' +
        '</span>' +
      '</button>';
  }

  function renderList() {
    var total = STATE.decks.length;
    var canCreate = total < STATE.max_decks;
    var rows = total
      ? '<div class="deck-tiles">' + STATE.decks.map(deckTileHTML).join('') + '</div>'
      : '<p class="src-desc">Vous n\'avez pas encore de deck. Créez-en un pour commencer.</p>';
    // Compteur visible « X / max decks », teinté « plein » quand le quota est atteint.
    var counter = '<span class="deck-count' + (canCreate ? '' : ' full') + '">' +
      total + ' / ' + STATE.max_decks + ' decks</span>';
    // Bouton grisé + message explicite quand le quota est atteint (sinon actif).
    var createBtn = canCreate
      ? '<button type="button" id="deck-create-open" class="coll-adopt deck-create-btn">＋ Créer un deck</button>'
      : '<button type="button" class="coll-adopt deck-create-btn" disabled aria-disabled="true">＋ Créer un deck</button>' +
        '<p class="deck-form-msg">Vous avez atteint le maximum de ' + STATE.max_decks + ' decks. Supprimez-en un pour en créer un nouveau.</p>';

    viewEl.innerHTML = '' +
      '<h1 class="page-title">Mes <span class="hl">decks</span></h1>' +
      '<div class="deck-list-head"><div class="section-label">Vos decks</div>' + counter + '</div>' +
      rows +
      '<div class="deck-list-actions">' + createBtn + '</div>';

    bindList();
  }

  function bindList() {
    var pf = document.getElementById('deck-pseudo-form');
    if (pf) pf.addEventListener('submit', onPseudoSubmit);

    viewEl.querySelectorAll('.deck-tile').forEach(function (btn) {
      btn.addEventListener('click', function () { openDeck(btn.getAttribute('data-deck')); });
    });
    var open = document.getElementById('deck-create-open');
    if (open) open.addEventListener('click', function () { openForm(null); });
  }

  // --- Nom public (pseudo) --------------------------------------------------

  function pseudoMsg(text, kind) {
    var el = document.getElementById('deck-pseudo-msg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.className = 'deck-form-msg' + (kind ? ' ' + kind : '');
  }

  async function onPseudoSubmit(e) {
    e.preventDefault();
    var input = document.getElementById('deck-pseudo-input');
    var name = (input && input.value || '').trim();
    if (!name) { pseudoMsg('Entrez un pseudo.', 'err'); return; }
    var btn = e.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      var res = await apiSend('POST', '/api/my-alerts/display-name', { display_name: name });
      var d = await readJson(res);
      if (res.ok && d && d.display_name) {
        STATE.display_name = d.display_name;
        renderList();
        return;
      }
      pseudoMsg((d && d.error) || 'Impossible d\'enregistrer ce nom.', 'err');
    } catch (err) {
      pseudoMsg('Réessayez dans un instant.', 'err');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // Amène l'utilisateur vers le formulaire de pseudo (requis avant partage).
  function focusPseudo() {
    if (STATE.display_name) return;
    renderList();
    var form = document.getElementById('deck-pseudo-form');
    var input = document.getElementById('deck-pseudo-input');
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (input) input.focus();
    pseudoMsg('Choisissez d\'abord un pseudo.', 'err');
  }

  // --- Formulaire créer / éditer -------------------------------------------

  function emojiPickerHTML(selected) {
    var chosen = selected || DEFAULT_EMOJI;
    var list = STATE.emojis && STATE.emojis.length ? STATE.emojis : [DEFAULT_EMOJI];
    if (list.indexOf(chosen) === -1) list = [chosen].concat(list);
    return '<div class="deck-emoji-picker" role="radiogroup" aria-label="Emoji du deck">' +
      list.map(function (em) {
        var on = em === chosen;
        return '<button type="button" class="deck-emoji-opt' + (on ? ' on' : '') + '"' +
          ' data-emoji="' + esc(em) + '" role="radio" aria-checked="' + (on ? 'true' : 'false') + '">' +
          esc(em) + '</button>';
      }).join('') +
    '</div>';
  }

  // Sélecteur de teinte (11 pastilles, radiogroup).
  function tintPickerHTML(sel) {
    var html = '<div class="deck-tint-picker" role="radiogroup" aria-label="Teinte du deck">';
    for (var t = 1; t <= 11; t++) {
      var on = t === sel;
      html += '<button type="button" class="deck-tint-opt tint-' + t + (on ? ' on' : '') +
        '" data-tint="' + t + '" role="radio" aria-checked="' + (on ? 'true' : 'false') +
        '" aria-label="Teinte ' + t + '"></button>';
    }
    return html + '</div>';
  }

  // deck : objet existant (édition) ou null (création).
  function openForm(deck) {
    var editing = !!deck;
    var name = editing ? (deck.name || '') : '';
    var desc = editing ? (deck.description || '') : '';
    var emoji = editing ? (deck.emoji || DEFAULT_EMOJI) : DEFAULT_EMOJI;
    var tint = editing ? (deck.tint || 1) : 1;

    viewEl.innerHTML = '' +
      '<button type="button" class="deck-back" id="deck-form-back">← Retour</button>' +
      '<h1 class="page-title">' + (editing ? 'Modifier le deck' : 'Nouveau deck') + '</h1>' +
      '<form id="deck-form" class="deck-form" novalidate>' +
        // Champs (nom + description) à GAUCHE, aperçu live à DROITE ; empilé en mobile.
        '<div class="deck-form-top">' +
          '<div class="deck-form-fields">' +
            '<label for="deck-name">Nom du deck</label>' +
            '<input id="deck-name" type="text" maxlength="40" autocomplete="off" value="' + esc(name) + '">' +
            '<div class="deck-hint" id="deck-name-hint"></div>' +
            '<label for="deck-desc">Description</label>' +
            '<textarea id="deck-desc" maxlength="200" rows="3">' + esc(desc) + '</textarea>' +
            '<div class="deck-hint" id="deck-desc-hint"></div>' +
          '</div>' +
          '<div class="deck-preview-wrap"><div class="deck-preview ' + tintCls(tint) + '" id="deck-preview">' +
            '<span class="deck-motif-bg" aria-hidden="true" id="deck-preview-motif">' + motifSvg(emoji) + '</span>' +
            '<span class="deck-preview-body">' +
              '<span class="deck-preview-name" id="deck-preview-name">' + (esc(name) || 'Votre deck') + '</span>' +
            '</span>' +
          '</div></div>' +
        '</div>' +
        '<label>Motif (icône)</label>' +
        emojiPickerHTML(emoji) +
        '<label>Teinte</label>' +
        tintPickerHTML(tint) +
        '<div class="deck-form-actions">' +
          '<button type="submit" class="coll-adopt">' + (editing ? 'Enregistrer' : 'Créer le deck') + '</button>' +
        '</div>' +
        '<div id="deck-form-msg" class="deck-form-msg" hidden></div>' +
      '</form>';

    var nameEl = document.getElementById('deck-name');
    var descEl = document.getElementById('deck-desc');
    var picker = viewEl.querySelector('.deck-emoji-picker');
    var tintPicker = viewEl.querySelector('.deck-tint-picker');

    function currentEmoji() {
      var o = picker.querySelector('.deck-emoji-opt.on');
      return o ? o.getAttribute('data-emoji') : emoji;
    }
    function currentTint() {
      var o = tintPicker.querySelector('.deck-tint-opt.on');
      return o ? parseInt(o.getAttribute('data-tint'), 10) : 1;
    }
    // Aperçu live : motif, teinte, nom — mis à jour à chaque changement.
    function updatePreview() {
      var prev = document.getElementById('deck-preview');
      var motifEl = document.getElementById('deck-preview-motif');
      var nameOut = document.getElementById('deck-preview-name');
      if (nameOut) nameOut.textContent = (nameEl.value || '').trim() || 'Votre deck';
      if (motifEl) motifEl.innerHTML = motifSvg(currentEmoji());
      if (prev) prev.className = 'deck-preview ' + tintCls(currentTint());
    }

    function hint() {
      document.getElementById('deck-name-hint').textContent = nameEl.value.length + ' / 40';
      document.getElementById('deck-desc-hint').textContent = descEl.value.length + ' / 200';
    }
    hint();
    nameEl.addEventListener('input', function () { hint(); updatePreview(); });
    descEl.addEventListener('input', hint);

    picker.addEventListener('click', function (e) {
      var opt = e.target.closest('.deck-emoji-opt');
      if (!opt) return;
      picker.querySelectorAll('.deck-emoji-opt').forEach(function (b) {
        b.classList.remove('on'); b.setAttribute('aria-checked', 'false');
      });
      opt.classList.add('on'); opt.setAttribute('aria-checked', 'true');
      updatePreview();
    });
    tintPicker.addEventListener('click', function (e) {
      var opt = e.target.closest('.deck-tint-opt');
      if (!opt) return;
      tintPicker.querySelectorAll('.deck-tint-opt').forEach(function (b) {
        b.classList.remove('on'); b.setAttribute('aria-checked', 'false');
      });
      opt.classList.add('on'); opt.setAttribute('aria-checked', 'true');
      updatePreview();
    });

    document.getElementById('deck-form-back').addEventListener('click', function () {
      editing ? openDeck(deck.id) : renderList();
    });

    document.getElementById('deck-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submitForm(deck, nameEl, descEl, picker, tintPicker);
    });
  }

  function formMsg(text, kind) {
    var el = document.getElementById('deck-form-msg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.className = 'deck-form-msg' + (kind ? ' ' + kind : '');
  }

  async function submitForm(deck, nameEl, descEl, picker, tintPicker) {
    var name = (nameEl.value || '').trim();
    if (!name) { formMsg('Donnez un nom à votre deck.', 'err'); return; }
    var chosen = picker.querySelector('.deck-emoji-opt.on');
    var chosenT = tintPicker ? tintPicker.querySelector('.deck-tint-opt.on') : null;
    var body = {
      name: name,
      description: (descEl.value || '').trim(),
      emoji: chosen ? chosen.getAttribute('data-emoji') : DEFAULT_EMOJI,
      tint: chosenT ? parseInt(chosenT.getAttribute('data-tint'), 10) : 1
    };
    var btn = document.querySelector('#deck-form button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      var res = deck
        ? await apiSend('PATCH', '/api/decks/' + encodeURIComponent(deck.id), body)
        : await apiSend('POST', '/api/decks', body);
      var d = await readJson(res);
      if (res.ok && d && d.deck) {
        await refreshDecks();
        openDeck(d.deck.id);
        return;
      }
      if (res.status === 409) { formMsg((d && d.error) || 'Vous avez atteint le maximum de decks.', 'err'); }
      else if (res.status === 429) { formMsg('Trop de tentatives, réessayez plus tard.', 'err'); }
      else { formMsg((d && d.error) || 'Enregistrement impossible.', 'err'); }
    } catch (err) {
      formMsg('Réessayez dans un instant.', 'err');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // --- Vue détail d'un deck -------------------------------------------------

  function renderDetail(deck, sources) {
    curDeck = deck;
    deckSources = (sources || []).slice();
    var shared = deck.visibility && deck.visibility !== 'private';
    var forked = deck.forked_from_name
      ? '<p class="deck-forked">Inspiré de « ' + esc(deck.forked_from_name) + ' »</p>' : '';

    viewEl.innerHTML = '' +
      '<button type="button" class="deck-back" id="deck-detail-back">← Tous mes decks</button>' +
      '<div class="coll-head-top">' +
        deckThumb(deck.emoji || DEFAULT_EMOJI, deck.tint, true) +
        '<h1>' + esc(deck.name) + '</h1>' +
      '</div>' +
      (deck.description ? '<p class="src-desc">' + esc(deck.description) + '</p>' : '') +
      forked +
      '<div class="coll-actions deck-detail-actions">' +
        '<button type="button" id="deck-adopt" class="coll-adopt">S\'abonner à ce deck</button>' +
        '<button type="button" id="deck-share" class="notif-btn">' + (shared ? 'Gérer le partage' : 'Partager') + '</button>' +
        '<button type="button" id="deck-edit" class="notif-btn">Modifier</button>' +
        '<button type="button" id="deck-delete" class="deck-delete-btn">Supprimer</button>' +
      '</div>' +
      '<div id="deck-adopt-msg" class="coll-adopt-msg" hidden></div>' +
      '<div id="deck-share-box" class="deck-share-box" hidden></div>' +
      '<p class="src-desc" id="deck-empty-msg" hidden>Ce deck ne contient encore aucune carte. Ajoutez-en depuis le kiosque ou à partir d\'ici.</p>' +
      '<div class="grid" id="deck-grid"></div>' +
      '<div id="deck-suggest-block" class="deck-suggest-block"></div>';

    renderDeckGrid();
    bindDetail(deck);
    buildSuggestions(); // async : nécessite le catalogue + le profil
  }

  function bindDetail(deck) {
    document.getElementById('deck-detail-back').addEventListener('click', renderList);
    document.getElementById('deck-edit').addEventListener('click', function () { openForm(deck); });
    document.getElementById('deck-delete').addEventListener('click', function () { onDelete(deck); });
    document.getElementById('deck-adopt').addEventListener('click', function () { onAdopt(deck); });
    document.getElementById('deck-share').addEventListener('click', function () { onShareToggle(deck); });
    renderShareMgmt(deck); // affiche « Arrêter le partage » si déjà partagé (le lien vit dans la modale)
  }

  // Rend la grille des cartes DU deck (depuis l'état local deckSources).
  function renderDeckGrid() {
    var g = document.getElementById('deck-grid');
    if (!g) return;
    g.innerHTML = deckSources.map(function (sc) {
      return '<div class="deck-card-wrap">' +
        LBACards.cardHTML(sc, 'anon') +
        '<button type="button" class="deck-remove" data-source="' + esc(sc.id) + '">Retirer</button>' +
      '</div>';
    }).join('');
    g.querySelectorAll('.deck-remove').forEach(function (btn) {
      btn.addEventListener('click', function () { onRemoveItem(btn.getAttribute('data-source')); });
    });
    var msg = document.getElementById('deck-empty-msg');
    if (msg) msg.hidden = deckSources.length > 0;
  }

  function detailMsg(text, kind) {
    var el = document.getElementById('deck-adopt-msg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.className = 'coll-adopt-msg' + (kind ? ' ' + kind : '');
  }

  // --- Propositions de cartes (« La sélection », en excluant celles du deck) ----

  async function ensureCatalog() {
    if (CATALOG) return;
    try {
      var results = await Promise.all([
        fetch('/api/sources', { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : []; }),
        apiGet('/api/my-alerts').then(function (r) { return r.status === 401 ? null : r.json(); })
      ]);
      CATALOG = Array.isArray(results[0]) ? results[0] : [];
      var me = results[1];
      if (me) { PROFILE.interests = me.interests || []; PROFILE.departement = me.departement || null; }
    } catch (e) { CATALOG = CATALOG || []; }
  }

  function matchesInterest(s) {
    var c = s.categories || [];
    for (var i = 0; i < c.length; i++) if (PROFILE.interests.indexOf(c[i]) !== -1) return true;
    return false;
  }
  function isGeoParam(s) {
    return Array.isArray(s.params_schema) && s.params_schema[0] && s.params_schema[0].key === 'departement';
  }
  // Score « La sélection » : intérêt (×2) + pertinence département (×1), départage ❤.
  function scoreOf(s) {
    return (matchesInterest(s) ? 2 : 0) + (PROFILE.departement && isGeoParam(s) ? 1 : 0);
  }
  function computePool(excludeIds) {
    return (CATALOG || [])
      .filter(function (s) { return s.type !== 'linked' && excludeIds.indexOf(s.id) === -1; })
      .map(function (s, i) { return { s: s, i: i, score: scoreOf(s), likes: s.likes_count || 0 }; })
      .sort(function (a, b) { return b.score - a.score || b.likes - a.likes || a.i - b.i; })
      .map(function (x) { return x.s; });
  }

  async function buildSuggestions() {
    var block = document.getElementById('deck-suggest-block');
    if (!block) return;
    await ensureCatalog();
    // La vue a pu changer entre-temps (l'utilisateur est revenu à la liste).
    if (!document.getElementById('deck-suggest-block')) return;
    pool = computePool(deckSources.map(function (s) { return s.id; }));
    shownCount = SUGGEST_STEP;
    var isEmpty = deckSources.length === 0;

    block.innerHTML = '' +
      '<button type="button" class="deck-suggest-toggle" id="deck-suggest-toggle" aria-expanded="' + (isEmpty ? 'true' : 'false') + '">' +
        (isEmpty ? 'Cartes suggérées' : 'Ajouter des cartes') +
        ' <span class="dst-caret" aria-hidden="true">' + (isEmpty ? '▾' : '▸') + '</span>' +
      '</button>' +
      '<div class="deck-suggest-body" id="deck-suggest-body"' + (isEmpty ? '' : ' hidden') + '>' +
        '<div class="grid" id="deck-suggest-grid"></div>' +
        '<div class="deck-suggest-more-wrap">' +
          '<button type="button" id="deck-suggest-more" class="notif-btn">Afficher plus d\'alertes</button>' +
        '</div>' +
      '</div>';

    document.getElementById('deck-suggest-toggle').addEventListener('click', function () {
      var body = document.getElementById('deck-suggest-body');
      var open = body.hidden; body.hidden = !open;
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
      var caret = this.querySelector('.dst-caret'); if (caret) caret.textContent = open ? '▾' : '▸';
    });
    document.getElementById('deck-suggest-more').addEventListener('click', function () {
      shownCount += SUGGEST_STEP; renderSuggest();
    });
    renderSuggest();
  }

  function renderSuggest() {
    var g = document.getElementById('deck-suggest-grid');
    if (!g) return;
    if (!pool.length) {
      g.innerHTML = '<p class="src-desc">Toutes les cartes disponibles sont déjà dans ce deck.</p>';
      var more0 = document.getElementById('deck-suggest-more'); if (more0) more0.style.display = 'none';
      return;
    }
    var shown = pool.slice(0, shownCount);
    g.innerHTML = shown.map(function (sc) {
      return '<div class="deck-card-wrap deck-suggest-wrap">' +
        LBACards.cardHTML(sc, 'anon') +
        '<button type="button" class="deck-suggest-add coll-adopt" data-source="' + esc(sc.id) + '">Ajouter au deck</button>' +
      '</div>';
    }).join('');
    g.querySelectorAll('.deck-suggest-add').forEach(function (btn) {
      btn.addEventListener('click', function () { onAddSuggestion(btn.getAttribute('data-source')); });
    });
    var more = document.getElementById('deck-suggest-more');
    if (more) more.style.display = (pool.length > shownCount) ? '' : 'none';
  }

  // Ajoute une carte suggérée au deck (sans rechargement : la carte quitte les
  // propositions — le créneau libéré est comblé par le candidat suivant — et
  // rejoint la grille du deck).
  async function onAddSuggestion(sourceId) {
    try {
      var res = await apiSend('POST', '/api/decks/' + encodeURIComponent(curDeck.id) + '/items', { source_id: sourceId });
      if (!res.ok) { detailMsg('Ajout impossible.', 'err'); return; }
      var idx = -1;
      for (var i = 0; i < pool.length; i++) { if (pool[i].id === sourceId) { idx = i; break; } }
      if (idx !== -1) { deckSources.push(pool[idx]); pool.splice(idx, 1); }
      curDeck.card_count = (curDeck.card_count || 0) + 1;
      renderDeckGrid();
      renderSuggest();
      refreshDecks(); // met à jour le compteur de la liste (silencieux)
    } catch (e) { detailMsg('Réessayez dans un instant.', 'err'); }
  }

  async function onRemoveItem(sourceId) {
    try {
      var res = await apiSend('DELETE',
        '/api/decks/' + encodeURIComponent(curDeck.id) + '/items/' + encodeURIComponent(sourceId));
      if (!res.ok) { detailMsg('Retrait impossible.', 'err'); return; }
      var idx = -1;
      for (var i = 0; i < deckSources.length; i++) { if (deckSources[i].id === sourceId) { idx = i; break; } }
      if (idx !== -1) { pool.unshift(deckSources[idx]); deckSources.splice(idx, 1); }
      curDeck.card_count = Math.max(0, (curDeck.card_count || 1) - 1);
      renderDeckGrid();
      renderSuggest();
      refreshDecks();
    } catch (e) { detailMsg('Réessayez dans un instant.', 'err'); }
  }

  async function onDelete(deck) {
    if (!window.confirm('Supprimer définitivement le deck « ' + deck.name + ' » ?')) return;
    try {
      var res = await apiSend('DELETE', '/api/decks/' + encodeURIComponent(deck.id));
      if (res.ok) { await refreshDecks(); renderList(); }
      else detailMsg('Suppression impossible.', 'err');
    } catch (e) { detailMsg('Réessayez dans un instant.', 'err'); }
  }

  async function onAdopt(deck) {
    var btn = document.getElementById('deck-adopt');
    if (btn) { btn.disabled = true; btn.textContent = 'Abonnement…'; }
    try {
      var res = await apiSend('POST', '/api/decks/' + encodeURIComponent(deck.id) + '/adopt');
      var d = await readJson(res);
      if (!res.ok) throw new Error('http ' + res.status);
      var parts = [];
      parts.push((d.added || 0) + ' ajoutée' + ((d.added || 0) > 1 ? 's' : ''));
      parts.push((d.already || 0) + ' déjà suivie' + ((d.already || 0) > 1 ? 's' : ''));
      var msg = parts.join(' · ');
      if (d.needs_params && d.needs_params.length) msg += ' (+ ' + d.needs_params.length + ' à compléter)';
      detailMsg(msg, 'ok');
      // E6) Deck entièrement adopté → célébration autour du bouton.
      if (d.added > 0 && (!d.needs_params || !d.needs_params.length) && window.LBACards) {
        LBACards.celebrateBurst(btn);
      }
    } catch (e) {
      detailMsg('Réessayez dans un instant.', 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'S\'abonner à ce deck'; }
    }
  }

  // --- Partage --------------------------------------------------------------

  function shareFullUrl(token) {
    return 'https://labonnealerte.fr/deck/' + token;
  }

  // Partage UNIFIÉ : même grande carte modale que /collection/:slug et /deck/:token
  // (window.LBAShare.openModal — réseaux + copier le lien + croix, fermeture Échap/
  // clic extérieur, responsive). Un seul point de vérité pour l'apparence du partage.
  function shareModal(deck) {
    var url = shareFullUrl(deck.share_token);
    if (window.LBAShare && LBAShare.openModal) LBAShare.openModal(deck.name, url);
    else window.prompt('Lien de partage', url); // repli si le composant n'est pas chargé
  }

  // Gestion du partage propre à /mes-decks (le propriétaire peut arrêter le partage) :
  // le lien lui-même est dans la modale, la boîte ne garde que « Arrêter le partage ».
  function renderShareMgmt(deck) {
    var box = document.getElementById('deck-share-box');
    if (!box) return;
    var shared = deck.visibility && deck.visibility !== 'private' && deck.share_token;
    if (!shared) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = '<button type="button" class="acct-delete-link" id="deck-unshare">Arrêter le partage</button>';
    box.querySelector('#deck-unshare').addEventListener('click', function () { onUnshare(deck); });
  }

  async function onShareToggle(deck) {
    // Déjà partagé : ouvre directement la modale avec l'URL existante.
    if (deck.visibility && deck.visibility !== 'private' && deck.share_token) { shareModal(deck); return; }
    // Sinon : bascule en 'unlisted' + génère le token, PUIS ouvre la même modale.
    var btn = document.getElementById('deck-share');
    if (btn) btn.disabled = true;
    try {
      var res = await apiSend('POST', '/api/decks/' + encodeURIComponent(deck.id) + '/share');
      var d = await readJson(res);
      if (res.status === 409 && d && d.error === 'display_name_required') {
        focusPseudo();
        return;
      }
      if (res.ok && d && d.share_token) {
        deck.visibility = 'unlisted';
        deck.share_token = d.share_token;
        if (btn) btn.textContent = 'Gérer le partage';
        renderShareMgmt(deck);
        shareModal(deck);
        return;
      }
      detailMsg((d && d.error) || 'Partage impossible.', 'err');
    } catch (e) {
      detailMsg('Réessayez dans un instant.', 'err');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function onUnshare(deck) {
    if (!window.confirm('Arrêter le partage ? Le lien actuel ne fonctionnera plus.')) return;
    try {
      var res = await apiSend('POST', '/api/decks/' + encodeURIComponent(deck.id) + '/unshare');
      if (res.ok) {
        deck.visibility = 'private';
        deck.share_token = null;
        var btn = document.getElementById('deck-share');
        if (btn) btn.textContent = 'Partager';
        renderShareMgmt(deck);
        await refreshDecks();
      } else detailMsg('Impossible d\'arrêter le partage.', 'err');
    } catch (e) { detailMsg('Réessayez dans un instant.', 'err'); }
  }

  // --- Chargement -----------------------------------------------------------

  async function openDeck(id) {
    viewEl.innerHTML = '<div class="src-loading">Chargement…</div>';
    try {
      var res = await apiGet('/api/decks/' + encodeURIComponent(id));
      var d = await readJson(res);
      if (!res.ok || !d || !d.deck) { renderList(); return; }
      renderDetail(d.deck, d.sources || []);
    } catch (e) { renderList(); }
  }

  // Recharge la liste des decks (après création / édition / suppression / partage).
  async function refreshDecks() {
    try {
      var res = await apiGet('/api/decks');
      if (res.status === 401) { LBASession.clear(); showAnon(); return; }
      var d = await readJson(res);
      if (res.ok && d) {
        STATE.decks = d.decks || [];
        STATE.display_name = d.display_name || null;
        STATE.emojis = d.emojis || [];
        STATE.max_decks = d.max_decks || 15;
      }
    } catch (e) { /* réseau : on garde l'état courant */ }
  }

  async function init() {
    TOKEN = window.LBASession && LBASession.get();
    if (!TOKEN) { showAnon(); return; }

    var res;
    try {
      res = await apiGet('/api/decks');
    } catch (e) { showAnon(); return; }

    if (res.status === 401) { LBASession.clear(); showAnon(); return; }
    var d = await readJson(res);
    if (!res.ok || !d) { showAnon(); return; }

    STATE.decks = d.decks || [];
    STATE.display_name = d.display_name || null;
    STATE.emojis = d.emojis || [];
    STATE.max_decks = d.max_decks || 15;

    // En-tête connecté (masque « Se connecter », affiche « Mon compte »).
    LBASession.renderHeader(d.email || 'compte');

    if (loadingEl) loadingEl.hidden = true;
    if (anonEl) anonEl.hidden = true;
    if (viewEl) viewEl.hidden = false;
    renderList();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
