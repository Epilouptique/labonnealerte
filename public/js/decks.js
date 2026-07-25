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
    max_decks: 15,
    deckSkins: null // skins 'deck' POSSEDES (chargement paresseux via ensureSkins)
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

  // Intention « créer un deck depuis une carte » : posée par deck-add.js dans localStorage
  // (source_id + params) quand l'utilisateur n'a encore aucun deck. Consommée une seule fois.
  function readSeed() {
    var raw; try { raw = localStorage.getItem('lba-deck-seed'); } catch (e) { return null; }
    if (!raw) return null;
    try { var o = JSON.parse(raw); return (o && o.source_id) ? o : null; } catch (e) { return null; }
  }
  function clearSeed() { try { localStorage.removeItem('lba-deck-seed'); } catch (e) {} }

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

  // Tuile de deck PLEINE TAILLE (iteration 2) : même composant/même taille que les cartes
  // du kiosque (LBADeckStack : pile de 3 vraies cartes + ruban). Aperçu = 3 dernières
  // cartes, ids du champ preview résolus depuis le catalogue (CATALOG).
  function deckTileHTML(d) {
    var badge = d.visibility && d.visibility !== 'private'
      ? '<span class="deck-badge deck-badge-shared">Public</span>'
      : '<span class="deck-badge">Privé</span>';
    var cards = window.LBADeckStack
      ? LBADeckStack.resolveCards(d.preview || [], LBADeckStack.indexSources(CATALOG || [])) : [];
    var stack = window.LBADeckStack ? LBADeckStack.html({
      name: d.name, tint: d.tint, emoji: d.emoji || DEFAULT_EMOJI,
      count: d.card_count || 0, cards: cards, meta: badge,
      cats: Array.isArray(d.categories) ? d.categories : [], mode: 'anon'
    }) : '';
    return '<div class="deck-card" role="button" tabindex="0" data-deck="' + esc(d.id) + '">' + stack + '</div>';
  }

  function renderList() {
    // Les tuiles affichent un aperçu (3 vraies cartes) → besoin du catalogue. S'il n'est
    // pas encore chargé, on le charge puis on re-rend une fois (rendu immédiat sinon).
    if (!CATALOG) { ensureCatalog().then(function () { renderList(); }); }
    var total = STATE.decks.length;
    var canCreate = total < STATE.max_decks;
    var rows = total
      ? '<div class="grid deck-grid">' + STATE.decks.map(deckTileHTML).join('') + '</div>'
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

    viewEl.querySelectorAll('.deck-card[data-deck]').forEach(function (btn) {
      btn.addEventListener('click', function () { openDeck(btn.getAttribute('data-deck')); });
      // Tuile = div role=button → clavier explicite (Entree / Espace).
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault(); openDeck(btn.getAttribute('data-deck'));
        }
      });
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
  // seedCards : cartes pré-ajoutées à un NOUVEAU deck (création depuis une carte du
  // kiosque) — tableau de { source, params }. Ignoré en édition.
  function openForm(deck, seedCards) {
    var editing = !!deck;
    var name = editing ? (deck.name || '') : '';
    var desc = editing ? (deck.description || '') : '';
    var emoji = editing ? (deck.emoji || DEFAULT_EMOJI) : DEFAULT_EMOJI;
    var tint = editing ? (deck.tint || 1) : 1;
    // État local mutable des cartes-graines (retirables avant création).
    var seed = (!editing && Array.isArray(seedCards)) ? seedCards.slice() : [];
    // Visibilité : PUBLIC par défaut (découvrable dans le kiosque) ; « Privé » = opt-out.
    var vis = editing ? (deck.visibility === 'private' ? 'private' : 'public') : 'public';

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
          '<div class="deck-preview-wrap"><div id="deck-preview" class="deck-card">' + previewStack() + '</div></div>' +
        '</div>' +
        '<label>Motif (icône)</label>' +
        emojiPickerHTML(emoji) +
        '<label>Teinte</label>' +
        tintPickerHTML(tint) +
        '<label>Visibilité</label>' +
        '<div class="deck-vis-picker" role="radiogroup" aria-label="Visibilité du deck">' +
          '<button type="button" class="deck-vis-opt' + (vis === 'public' ? ' on' : '') + '" data-vis="public"' +
            ' role="radio" aria-checked="' + (vis === 'public' ? 'true' : 'false') + '">' +
            '<span class="deck-vis-title">Public</span><span class="deck-vis-sub">Visible dans le kiosque, adoptable par tous</span></button>' +
          '<button type="button" class="deck-vis-opt' + (vis === 'private' ? ' on' : '') + '" data-vis="private"' +
            ' role="radio" aria-checked="' + (vis === 'private' ? 'true' : 'false') + '">' +
            '<span class="deck-vis-title">Privé</span><span class="deck-vis-sub">Vous seul le voyez</span></button>' +
        '</div>' +
        (seed.length ? (
          '<label>Cartes de ce deck (<span id="deck-seed-count">' + seed.length + '</span>)</label>' +
          '<div class="grid deck-seed-grid" id="deck-seed-grid"></div>' +
          '<p class="deck-hint">Vous pourrez en ajouter d\'autres après la création.</p>'
        ) : '') +
        '<div class="deck-form-actions">' +
          '<button type="submit" class="coll-adopt">' + (editing ? 'Enregistrer' : 'Créer le deck') + '</button>' +
        '</div>' +
        '<div id="deck-form-msg" class="deck-form-msg" hidden></div>' +
      '</form>';

    // Grille des cartes-graines : vraie carte (LBACards, mode 'anon') + bouton « Retirer »,
    // même gabarit que la vue détail (deck-card-wrap / .deck-remove).
    function renderSeedGrid() {
      var g = document.getElementById('deck-seed-grid');
      if (!g) return;
      g.innerHTML = seed.map(function (item) {
        return '<div class="deck-card-wrap">' +
          LBACards.cardHTML(item.source, 'anon') +
          '<button type="button" class="deck-remove" data-source="' + esc(item.source.id) + '">Retirer</button>' +
        '</div>';
      }).join('');
      g.querySelectorAll('.deck-remove').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-source');
          seed = seed.filter(function (it) { return it.source.id !== id; });
          renderSeedGrid();
          if (typeof updatePreview === 'function') updatePreview();
          var c = document.getElementById('deck-seed-count');
          if (c) c.textContent = seed.length;
        });
      });
    }
    if (seed.length) renderSeedGrid();

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
    // Aperçu live « pile + ruban » (LBADeckStack) : nom, teinte, motif, cartes-graines.
    // previewStack() lit les contrôles s'ils existent, sinon les valeurs initiales
    // (il est aussi appelé au 1er rendu, avant que nameEl/picker soient assignés).
    function previewStack() {
      var nm = (typeof nameEl !== 'undefined' && nameEl) ? (nameEl.value || '').trim() : name;
      var tn = (typeof tintPicker !== 'undefined' && tintPicker) ? currentTint() : tint;
      var em = (typeof picker !== 'undefined' && picker) ? currentEmoji() : emoji;
      // Pleine taille : 3 dernières cartes-graines (objets source complets), récent d'abord.
      var cards = seed.map(function (it) { return it.source; }).filter(Boolean).slice(-3).reverse();
      return window.LBADeckStack ? LBADeckStack.html({
        name: nm || 'Votre deck', tint: tn, emoji: em, count: seed.length, cards: cards, mode: 'anon'
      }) : '';
    }
    function updatePreview() {
      var prev = document.getElementById('deck-preview');
      if (prev) prev.innerHTML = previewStack();
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
    var visPicker = viewEl.querySelector('.deck-vis-picker');
    if (visPicker) visPicker.addEventListener('click', function (e) {
      var opt = e.target.closest('.deck-vis-opt');
      if (!opt) return;
      visPicker.querySelectorAll('.deck-vis-opt').forEach(function (b) {
        b.classList.remove('on'); b.setAttribute('aria-checked', 'false');
      });
      opt.classList.add('on'); opt.setAttribute('aria-checked', 'true');
    });

    document.getElementById('deck-form-back').addEventListener('click', function () {
      editing ? openDeck(deck.id) : renderList();
    });

    document.getElementById('deck-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submitForm(deck, nameEl, descEl, picker, tintPicker, function () { return seed; });
    });
  }

  function formMsg(text, kind) {
    var el = document.getElementById('deck-form-msg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.className = 'deck-form-msg' + (kind ? ' ' + kind : '');
  }

  async function submitForm(deck, nameEl, descEl, picker, tintPicker, seedGetter) {
    var name = (nameEl.value || '').trim();
    if (!name) { formMsg('Donnez un nom à votre deck.', 'err'); return; }
    var chosen = picker.querySelector('.deck-emoji-opt.on');
    var chosenT = tintPicker ? tintPicker.querySelector('.deck-tint-opt.on') : null;
    var chosenV = document.querySelector('.deck-vis-opt.on');
    var body = {
      name: name,
      description: (descEl.value || '').trim(),
      emoji: chosen ? chosen.getAttribute('data-emoji') : DEFAULT_EMOJI,
      tint: chosenT ? parseInt(chosenT.getAttribute('data-tint'), 10) : 1,
      visibility: chosenV ? chosenV.getAttribute('data-vis') : 'public'
    };
    var btn = document.querySelector('#deck-form button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      var res = deck
        ? await apiSend('PATCH', '/api/decks/' + encodeURIComponent(deck.id), body)
        : await apiSend('POST', '/api/decks', body);
      var d = await readJson(res);
      if (res.ok && d && d.deck) {
        // Création depuis une carte : ajoute les cartes-graines au deck fraîchement créé,
        // puis consomme l'intention (une seule fois). Un ajout qui échoue n'annule pas
        // la création — l'utilisateur retrouvera la carte via le kiosque.
        var seed = (!deck && seedGetter) ? seedGetter() : [];
        if (seed && seed.length) {
          for (var i = 0; i < seed.length; i++) {
            try {
              await apiSend('POST', '/api/decks/' + encodeURIComponent(d.deck.id) + '/items',
                { source_id: seed[i].source.id, params: seed[i].params || undefined });
            } catch (e) { /* best-effort : on continue */ }
          }
        }
        clearSeed();
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

  // Controle « Skin » d'un deck (phase 3). N'apparait que si l'utilisateur possede au
  // moins un skin 'deck' : un select [Aucun + skins possedes], preselectionne sur le
  // skin actuellement equipe (deck.equipped_skin_id). Sinon, lien discret vers la boutique.
  function skinControlHTML(deck) {
    var owned = STATE.deckSkins || [];
    if (!owned.length) {
      return '<a class="deck-skin-link" href="/boutique">Obtenir un skin de deck</a>';
    }
    var cur = deck.equipped_skin_id || '';
    var opts = '<option value=""' + (cur ? '' : ' selected') + '>Aucun</option>';
    owned.forEach(function (s) {
      opts += '<option value="' + esc(s.id) + '"' + (s.id === cur ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    });
    return '<label class="deck-skin-ctrl"><span>Skin</span>' +
      '<select id="deck-skin-select" aria-label="Skin du deck">' + opts + '</select></label>';
  }

  function renderDetail(deck, sources) {
    curDeck = deck;
    deckSources = (sources || []).slice();
    var shared = deck.visibility && deck.visibility !== 'private';
    // Visuel de synthèse « pile + ruban » (remplace l'ancienne vignette .deck-thumb-lg) :
    // 3 dernières cartes ajoutées (récent d'abord) parmi les cartes du deck.
    var headCards = deckSources.slice(-3).reverse();
    var headStack = window.LBADeckStack ? ('<div class="deck-card">' + LBADeckStack.html({
      name: '', tint: deck.tint, emoji: deck.emoji || DEFAULT_EMOJI,
      count: deckSources.length, cards: headCards, mode: 'anon'
    }) + '</div>') : '';
    var forked = deck.forked_from_name
      ? '<p class="deck-forked">Inspiré de « ' + esc(deck.forked_from_name) + ' »</p>' : '';

    // Mise en page : titre (.page-title, comme toutes les pages) EN PLEINE LARGEUR,
    // puis une rangée [pile deck-card] | [corps empilé] où le corps (description,
    // catégories, actions, boîte de partage) vit À DROITE de la pile et SOUS le titre.
    // Responsive : le corps repasse SOUS la pile en une colonne sur mobile (cf. site.css).
    viewEl.innerHTML = '' +
      '<button type="button" class="deck-back" id="deck-detail-back">← Tous mes decks</button>' +
      '<h1 class="page-title" data-hero-done="1">' + esc(deck.name) + '</h1>' +
      '<div class="deck-detail-layout">' +
        headStack +
        '<div class="deck-detail-body">' +
          (deck.description ? '<p class="src-desc">' + esc(deck.description) + '</p>' : '') +
          // Catégories auto (top-3, LECTURE SEULE) : dérivées des cartes, jamais choisies.
          (Array.isArray(deck.categories) && deck.categories.length
            ? '<div class="deck-detail-cats">' + deck.categories.slice(0, 3).map(function (c) {
                return '<span class="tag ds-cat-tag">' + esc(window.LBACat && LBACat.label ? LBACat.label(c) : c) + '</span>';
              }).join('') + '</div>'
            : '') +
          forked +
          '<div class="coll-actions deck-detail-actions">' +
            '<button type="button" id="deck-adopt" class="coll-adopt">S\'abonner à ce deck</button>' +
            '<button type="button" id="deck-share" class="notif-btn">' + (shared ? 'Gérer le partage' : 'Partager') + '</button>' +
            '<button type="button" id="deck-edit" class="notif-btn">Modifier</button>' +
            '<button type="button" id="deck-delete" class="deck-delete-btn">Supprimer</button>' +
          '</div>' +
          // Phase 3 : skin de deck (cosmetique public). Visible seulement si l'utilisateur
          // possede un skin 'deck' ; sinon lien discret vers la boutique.
          '<div class="deck-skin-row">' + skinControlHTML(deck) + '</div>' +
          '<div id="deck-skin-msg" class="coll-adopt-msg" hidden></div>' +
          '<div id="deck-adopt-msg" class="coll-adopt-msg" hidden></div>' +
          '<div id="deck-share-box" class="deck-share-box" hidden></div>' +
        '</div>' +
      '</div>' +
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
    var skinSel = document.getElementById('deck-skin-select');
    if (skinSel) skinSel.addEventListener('change', function () { onEquipSkin(deck, skinSel.value || null); });
    renderShareMgmt(deck); // affiche « Arrêter le partage » si déjà partagé (le lien vit dans la modale)
  }

  // Equipe (ou retire si skinId null) un skin 'deck' sur CE deck. Cosmetique public,
  // effet non destructif. Met a jour l'etat local pour rester coherent sans rechargement.
  async function onEquipSkin(deck, skinId) {
    var msg = document.getElementById('deck-skin-msg');
    try {
      var res = await apiSend('POST', '/api/skins/equip', { skin_id: skinId, collection_id: deck.id });
      var d = await readJson(res);
      if (!res.ok) throw new Error((d && d.error) || 'echec');
      deck.equipped_skin_id = d.equipped_skin_id || null;
      if (curDeck && curDeck.id === deck.id) curDeck.equipped_skin_id = deck.equipped_skin_id;
      if (msg) { msg.textContent = skinId ? 'Skin équipé ✓' : 'Skin retiré'; msg.className = 'coll-adopt-msg ok'; msg.hidden = false; }
    } catch (e) {
      // Rollback visuel : on resynchronise le select sur l'etat serveur connu.
      var sel = document.getElementById('deck-skin-select');
      if (sel) sel.value = deck.equipped_skin_id || '';
      if (msg) { msg.textContent = 'Équipement impossible'; msg.className = 'coll-adopt-msg err'; msg.hidden = false; }
    }
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

  // Charge une fois les skins 'deck' POSSEDES par l'utilisateur (pour le selecteur
  // « Skin » de chaque deck). GET /api/skins expose owned ; on filtre type==='deck'.
  async function ensureSkins() {
    if (STATE.deckSkins) return;
    try {
      var res = await apiGet('/api/skins');
      var d = await readJson(res);
      var all = (d && Array.isArray(d.skins)) ? d.skins : [];
      STATE.deckSkins = all.filter(function (s) { return s.type === 'deck' && s.owned; });
    } catch (e) { STATE.deckSkins = STATE.deckSkins || []; }
  }

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
      await ensureSkins(); // selecteur « Skin » : necessite la liste des skins deck possedes
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

  // Ouvre le formulaire de création avec la carte-graine transmise depuis le kiosque
  // (résolue via le catalogue déjà utilisé pour « La sélection »).
  async function openCreateFromSeed() {
    var raw = readSeed();
    clearSeed(); // consommé : évite une graine périmée au prochain passage
    viewEl.innerHTML = '<div class="src-loading">Chargement…</div>';
    var seedCards = [];
    if (raw) {
      await ensureCatalog();
      var src = null;
      for (var i = 0; i < (CATALOG || []).length; i++) {
        if (CATALOG[i].id === raw.source_id) { src = CATALOG[i]; break; }
      }
      if (src) seedCards.push({ source: src, params: raw.params || null });
    }
    openForm(null, seedCards);
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
    // Arrivée depuis une carte du kiosque (aucun deck) : ouvrir directement la création
    // avec la carte pré-présente. Sinon, liste normale.
    if (/[?&]creer(=|&|$)/.test(location.search)) openCreateFromSeed();
    else renderList();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
