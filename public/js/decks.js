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
  var suggestQuery = ''; // filtre texte du sélecteur « Cartes suggérées »
  // /mes-decks = « dashboard » de decks : un seul deck déplié en place à la fois. expandedId
  // = id du deck actuellement déplié (null = liste). Anime comme le dashboard, en local
  // (site.js n'est pas chargé ici : flip/partage/animations réimplémentés sobrement).
  var expandedId = null;
  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function esc(s) { return window.LBACards ? LBACards.esc(s) : String(s == null ? '' : s); }
  function catLabel(slug) { return (window.LBACat && LBACat.label) ? LBACat.label(slug) : slug; }
  function cssEsc(v) { return (window.CSS && CSS.escape) ? CSS.escape(v) : String(v); }
  // 3 cartes « lambda » (exemple) pour l'aperçu d'un deck sans carte : le formulaire montre
  // ainsi un vrai deck (pile de 3 cartes + ruban), taille/ratio normaux, jamais un bloc vide.
  function sampleCards() {
    return (CATALOG || []).filter(function (s) { return s.type !== 'linked'; }).slice(0, 3);
  }

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
    // Tuile = deck NORMAL : recto interactif (switch = s'abonner au deck, ❤ = favori,
    // partage) + verso proprietaire injecte (« i » le retourne : description, catégories,
    // auteur + Modifier/Apparence/Supprimer). data-deck-id = id pour l'adoption/favori.
    var stack = window.LBADeckStack ? LBADeckStack.html({
      name: d.name, tint: d.tint, emoji: d.emoji || DEFAULT_EMOJI,
      count: d.card_count || 0, cards: cards, meta: badge,
      cats: Array.isArray(d.categories) ? d.categories : [], mode: 'anon',
      backHTML: ownerVersoHTML(d)
    }) : '';
    return '<div class="deck-card" role="button" tabindex="0" data-deck="' + esc(d.id) +
      '" data-deck-id="' + esc(d.id) + '">' + stack + '</div>';
  }

  function renderList() {
    // Les tuiles affichent un aperçu (3 vraies cartes) → besoin du catalogue. Tant qu'il
    // n'est pas chargé, on montre le spinner et on N'AFFICHE PAS les tuiles : sinon les
    // aperçus non résolus s'affichent en visuel générique monocolore (flash de l'ancien
    // rendu) le temps de la résolution. On re-rend une fois le catalogue prêt.
    if (!CATALOG) {
      viewEl.innerHTML = '<div class="src-loading"><div class="lba-bars" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>Chargement…</div>';
      ensureCatalog().then(function () { renderList(); });
      return;
    }
    expandedId = null; // rendu de la liste pristine = plus aucun deck déplié
    var total = STATE.decks.length;
    var canCreate = total < STATE.max_decks;
    // Compteur « X / max » (devient « ← Retour » en mode déplié, cf. setHeadMode).
    var counter = '<span class="deck-count' + (canCreate ? '' : ' full') + '">' +
      total + ' / ' + STATE.max_decks + ' decks</span>';
    // « Ajouter un deck » = tuile taille carte (même .card.add que « Ajouter une carte » /
    // « Proposer une alerte » du kiosque), en fin de grille. Lien vers la PAGE de creation
    // (/mes-decks/nouveau). Grisée + non cliquable si quota atteint.
    var createTile = canCreate
      ? '<a class="card add deck-create-tile" id="deck-create-open" href="/mes-decks/nouveau">' +
          '<span class="plus">+</span><strong>Ajouter un deck</strong></a>'
      : '<div class="card add deck-create-tile is-full" aria-disabled="true">' +
          '<span class="plus">+</span><strong>Ajouter un deck</strong></div>';
    var quotaMsg = canCreate ? ''
      : '<p class="deck-form-msg">Vous avez atteint le maximum de ' + STATE.max_decks + ' decks. Supprimez-en un pour en créer un nouveau.</p>';
    var emptyHint = total ? ''
      : '<p class="src-desc deck-empty-hint">Vous n\'avez pas encore de deck. Créez-en un pour commencer.</p>';

    viewEl.innerHTML = '' +
      '<h1 class="page-title">Mes <span class="hl">decks</span></h1>' +
      '<div class="deck-list-head">' +
        '<button type="button" id="deck-back-all" class="deck-back-inline" hidden>← Retour</button>' +
        counter +
      '</div>' +
      emptyHint +
      '<div class="grid deck-grid">' + STATE.decks.map(deckTileHTML).join('') + createTile + '</div>' +
      quotaMsg;

    bindList();
  }

  function bindList() {
    var pf = document.getElementById('deck-pseudo-form');
    if (pf) pf.addEventListener('submit', onPseudoSubmit);

    // Recto interactif (switches actifs, cœurs favoris). Les CLICS des tuiles (switch/❤/
    // partage/i/verso/corps) passent par la délégation onViewClick (enregistrée une fois).
    bindTiles();
    // Clavier : Entrée/Espace SUR la tuile elle-même → dépliage (accessibilité role=button).
    viewEl.querySelectorAll('.deck-card[data-deck]').forEach(function (tile) {
      tile.addEventListener('keydown', function (e) {
        if (e.target === tile && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && !expandedId) {
          e.preventDefault(); expandDeck(tile);
        }
      });
    });
    // « Ajouter un deck » est un lien (<a href="/mes-decks/nouveau">) : navigation native.
    var back = document.getElementById('deck-back-all');
    if (back) back.addEventListener('click', collapseDeck);
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
    expandedId = null; // vue formulaire = plein écran : désactive le repli au clic extérieur
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
      // Aperçu = un VRAI deck (3 cartes) : cartes-graines si création depuis une carte, sinon
      // les cartes du deck en édition, sinon 3 cartes « lambda » d'exemple. Taille/ratio normaux.
      var cards;
      if (seed.length) cards = seed.map(function (it) { return it.source; }).filter(Boolean).slice(-3).reverse();
      else if (editing && deckSources.length) cards = deckSources.slice(-3).reverse();
      else cards = sampleCards();
      var countN = seed.length ? seed.length : (editing && deckSources.length ? deckSources.length : cards.length);
      return window.LBADeckStack ? LBADeckStack.html({
        name: nm || 'Votre deck', tint: tn, emoji: em, count: countN, cards: cards, mode: 'anon'
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
      // Édition = formulaire inline (retour liste). Création = vraie page /mes-decks/nouveau
      // → retour par navigation vers /mes-decks.
      if (editing) { expandedId = null; renderList(); }
      else { location.href = '/mes-decks'; }
      return;
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
        // Édition = retour liste inline ; création (page /mes-decks/nouveau) = navigation
        // vers /mes-decks (le deck créé y apparaît).
        if (deck) { await refreshDecks(); expandedId = null; renderList(); }
        else { location.href = '/mes-decks'; }
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

  // --- Deck déplié EN PLACE (« dashboard » de decks) ------------------------

  // « Apparence » d'un deck (skins possedes) rendue INLINE dans le verso, facon parametres
  // (.param-row + pastilles .param-chip). Un seul skin actif (+ « Aucun »). Aucun skin
  // possede → lien discret vers la boutique (comme avant).
  function skinInlineHTML(deck) {
    var owned = STATE.deckSkins || [];
    if (!owned.length) {
      return '<a class="deck-skin-link" href="/boutique">Obtenir un skin de deck</a>';
    }
    var cur = deck.equipped_skin_id || '';
    function opt(id, label) {
      var on = (id || '') === (cur || '');
      return '<button type="button" class="param-chip deck-skin-opt' + (on ? ' on' : '') +
        '" data-skin="' + esc(id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + '</button>';
    }
    var chips = opt('', 'Aucun');
    owned.forEach(function (s) { chips += opt(s.id, s.name); });
    return '<div class="param-row deck-skin-list">' + chips + '</div>';
  }

  // Verso de la tuile-deck (/mes-decks) : MEME verso qu'un deck NORMAL (description +
  // categories + auteur), auquel on AJOUTE seulement les actions proprietaire (Modifier /
  // Apparence / Supprimer). Pas de « S'abonner » (le switch du recto s'en charge) ni de
  // « Partager » (le bouton partage du recto s'en charge). « Signaler » n'apparait que pour
  // un deck qui n'est PAS le notre — sur /mes-decks ils le sont tous, donc jamais ici.
  function ownerVersoHTML(deck) {
    var back = (window.LBACards && LBACards.BACK_SVG) || '';
    var desc = deck.description ? '<p class="card-long-desc">' + esc(deck.description) + '</p>' : '';
    var cats = (Array.isArray(deck.categories) && deck.categories.length)
      ? '<div class="back-tags">' + deck.categories.slice(0, 3).map(function (c) {
          return '<span class="ds-cat-tag">' + esc(catLabel(c)) + '</span>';
        }).join('') + '</div>' : '';
    var author = STATE.display_name
      ? '<div class="back-author">par <span class="back-author-name">@' + esc(STATE.display_name) + '</span></div>' : '';
    var actions = '<div class="coll-actions deck-detail-actions">' +
        '<button type="button" class="notif-btn deck-edit">Modifier</button>' +
        '<button type="button" class="notif-btn deck-appearance">Apparence</button>' +
        '<button type="button" class="deck-delete-btn deck-delete">Supprimer</button>' +
      '</div>';
    var skin = '<div class="deck-skin-inline" hidden>' + skinInlineHTML(deck) + '</div>';
    return '<div class="card-face card-back">' +
      '<button class="flip-back" type="button" aria-label="Retour" title="Retour">' + back + '</button>' +
      desc + cats + author + actions + skin +
      '<div class="coll-adopt-msg deck-verso-msg" hidden></div>' +
    '</div>';
  }

  // Deplie un deck EN PLACE : les autres tuiles s'effacent, la tuile cliquee s'ancre en tete
  // (elle RESTE un deck normal au recto : switch/❤/partage fonctionnels, « i » = verso), et
  // ses cartes s'affichent en dessous dans la MEME grille. La tuile n'est PAS reconstruite ni
  // retournee : son recto interactif est preserve. Aucun changement de page.
  async function expandDeck(tileEl) {
    var id = tileEl && tileEl.getAttribute('data-deck');
    if (expandedId || !tileEl || !id) return;
    var res, d;
    try { res = await apiGet('/api/decks/' + encodeURIComponent(id)); d = await readJson(res); }
    catch (e) { return; }
    if (!res.ok || !d || !d.deck) return;
    var deck = d.deck;
    curDeck = deck; deckSources = (d.sources || []).slice();
    expandedId = id;

    var grid = viewEl.querySelector('.deck-grid');
    if (!grid) { expandedId = null; return; }
    var sibs = Array.prototype.filter.call(grid.children, function (c) { return c !== tileEl; });

    // FLIP d'ancrage : la tuile cliquee « ne bouge pas » visuellement en passant en tete.
    var firstRect = tileEl.getBoundingClientRect();
    if (!REDUCE) sibs.forEach(function (c) { c.classList.add('deck-leaving'); });
    grid.insertBefore(tileEl, grid.firstChild);
    if (!REDUCE) {
      var lastRect = tileEl.getBoundingClientRect();
      var dx = firstRect.left - lastRect.left, dy = firstRect.top - lastRect.top;
      tileEl.style.transition = 'none';
      tileEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      void tileEl.offsetWidth;
      tileEl.style.transition = 'transform .25s ease';
      tileEl.style.transform = '';
      setTimeout(function () { tileEl.style.transition = ''; tileEl.style.transform = ''; }, 300);
    }
    // Retrait des voisines apres le fondu (classe .deck-gone : [hidden] est battu par les
    // display de .deck-card/.card.add), PUIS insertion des cartes du deck (evite un reflow).
    setTimeout(function () {
      sibs.forEach(function (c) { c.classList.add('deck-gone'); c.classList.remove('deck-leaving'); });
      renderDeckCards();
      ensureSuggestBlock();
      buildSuggestions();
    }, REDUCE ? 0 : 210);

    setHeadMode(true);
    setPageTitle(esc(deck.name), true);
  }

  // Replie : retire cartes + suggestions, retourne la tuile au recto, restaure la liste
  // pristine (titre re-anime « Mes decks », decks voisins reaffiches, compteur revenu).
  function collapseDeck() {
    if (!expandedId) return;
    if (window.LBAShare && LBAShare.close) LBAShare.close();
    var grid = viewEl.querySelector('.deck-grid');
    var tileEl = grid ? grid.querySelector('.deck-card[data-deck="' + cssEsc(expandedId) + '"]') : null;
    if (grid) grid.querySelectorAll('.deck-card-wrap, #deck-add-card').forEach(function (n) { n.remove(); });
    var sb = document.getElementById('deck-suggest-block'); if (sb) sb.remove();
    var card = tileEl ? tileEl.querySelector('.ds-i0 .card') : null;
    if (card) card.classList.remove('flipped', 'face-share');
    if (tileEl) tileEl.classList.remove('ds-sharing');
    setTimeout(function () { renderList(); }, REDUCE ? 0 : 260);
  }

  // Bascule l'en-tete entre compteur (liste) et « ← Retour » (deplie).
  function setHeadMode(expanded) {
    var back = document.getElementById('deck-back-all');
    var count = viewEl.querySelector('.deck-list-head .deck-count');
    if (back) back.hidden = !expanded;
    if (count) count.style.display = expanded ? 'none' : '';
  }

  // Morph du titre .page-title (reutilise l'animation lettres partagee LBAHero).
  function setPageTitle(html, animate) {
    var h1 = viewEl.querySelector('.page-title');
    if (!h1) return;
    h1.innerHTML = html;
    h1.dataset.heroDone = '';
    if (animate && window.LBAHero) LBAHero.animate(h1);
  }

  // Bloc suggestions (rempli par buildSuggestions) : garanti present apres la grille.
  function ensureSuggestBlock() {
    if (document.getElementById('deck-suggest-block')) return;
    var grid = viewEl.querySelector('.deck-grid');
    var block = document.createElement('div');
    block.id = 'deck-suggest-block';
    block.className = 'deck-suggest-block';
    if (grid && grid.parentNode) grid.parentNode.insertBefore(block, grid.nextSibling);
    else viewEl.appendChild(block);
  }

  // --- Tuile-deck NORMALE (recto interactif) + actions verso, en délégation sur viewEl ------
  // /mes-decks ne charge pas site.js : on réimplémente le comportement d'une tuile-deck du
  // kiosque — switch = s'abonner au deck, ❤ = favori (localStorage), partage = face partage,
  // « i » = verso. Plus : clic sur le CORPS = déplier ; boutons Modifier/Apparence/Supprimer.

  function deckById(id) {
    if (curDeck && curDeck.id === id) return curDeck;
    var a = (STATE.decks || []).filter(function (dd) { return dd.id === id; });
    return a[0] || null;
  }
  function tileId(tile) { return tile.getAttribute('data-deck-id') || tile.getAttribute('data-deck'); }
  function tileCard(tile) { return tile.querySelector('.ds-i0 .card'); }

  // Favoris de deck (localStorage, MÊME clé que le kiosque : 'lba-deck-favorites').
  function deckFavSet() { try { var a = JSON.parse(localStorage.getItem('lba-deck-favorites') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function deckFavSave(a) { try { localStorage.setItem('lba-deck-favorites', JSON.stringify(a)); } catch (e) {} }
  function isDeckFav(id) { return deckFavSet().indexOf(id) !== -1; }

  // Recto : active les switches (désactivés par défaut) + cœur rempli si déjà favori.
  function bindTiles() {
    viewEl.querySelectorAll('.deck-card[data-deck]').forEach(function (tile) {
      tile.querySelectorAll('.ds-i0 .switch-row input[type="checkbox"]').forEach(function (cb) { cb.removeAttribute('disabled'); });
      var like = tile.querySelector('.ds-i0 .like-btn');
      if (like && isDeckFav(tileId(tile))) { like.classList.add('liked'); like.setAttribute('aria-pressed', 'true'); }
    });
  }

  function flipToVerso(tile) { var c = tileCard(tile); if (!c) return; c.classList.remove('face-share'); c.classList.add('flipped'); tile.classList.add('ds-sharing'); }
  function flipToRecto(tile) { var c = tileCard(tile); if (!c) return; c.classList.remove('flipped', 'face-share'); setTimeout(function () { tile.classList.remove('ds-sharing'); }, REDUCE ? 0 : 520); }

  function toggleFav(tile) {
    var id = tileId(tile); var like = tile.querySelector('.ds-i0 .like-btn'); if (!id || !like) return;
    var s = deckFavSet(); var i = s.indexOf(id); var now;
    if (i === -1) { s.push(id); now = true; } else { s.splice(i, 1); now = false; }
    deckFavSave(s);
    like.classList.toggle('liked', now); like.setAttribute('aria-pressed', now ? 'true' : 'false');
  }

  // Switch « s'abonner » du recto : POST /api/decks/:id/adopt (propriétaire, toute visibilité)
  // pour s'abonner ; DELETE /api/collections/:id/adopt (deck PUBLIC seulement) pour se
  // désabonner — un deck privé n'a pas d'endpoint de désabonnement, la case est alors remise.
  function toggleAdopt(tile, cb) {
    var id = tileId(tile);
    var token = TOKEN || (window.LBASession && LBASession.get());
    if (!token || !id) { cb.checked = false; return; }
    var want = cb.checked;
    var row = cb.closest('.switch-row'); var label = row ? row.querySelector('.switch-label') : null;
    function paint(on) { if (label) { label.textContent = on ? 'Abonné' : 'Non abonné'; label.classList.toggle('on', on); } }
    cb.disabled = true; paint(want);
    if (want && window.LBACards && LBACards.celebrateBurst) LBACards.celebrateBurst(cb.closest('.switch'));
    var url = want ? '/api/decks/' + encodeURIComponent(id) + '/adopt' : '/api/collections/' + encodeURIComponent(id) + '/adopt';
    apiSend(want ? 'POST' : 'DELETE', url)
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); })
      .catch(function () { cb.checked = !want; paint(cb.checked); })
      .finally(function () { cb.disabled = false; });
  }

  function openShare(tile) { var deck = deckById(tile.getAttribute('data-deck')); if (deck) onDeckShare(deck, tile, null); }

  // Délégation clic (enregistrée une fois, cf. bas du module) : route les clics d'une tuile.
  function onViewClick(e) {
    var tile = e.target.closest('.deck-card[data-deck]');
    if (!tile) return;
    var t = e.target;
    if (t.closest('.ds-i0 .card-share')) { e.stopPropagation(); openShare(tile); return; }
    if (t.closest('.ds-i0 .flip-btn')) { e.stopPropagation(); flipToVerso(tile); return; }
    if (t.closest('.flip-back')) { e.stopPropagation(); flipToRecto(tile); return; }
    if (t.closest('.ds-i0 .like-btn')) { e.stopPropagation(); toggleFav(tile); return; }
    if (t.closest('.ds-i0 .switch-row')) return; // switch : géré au « change », pas de dépliage
    if (t.closest('.deck-edit')) { e.stopPropagation(); var d1 = deckById(tile.getAttribute('data-deck')); if (d1) openForm(d1); return; }
    if (t.closest('.deck-delete')) { e.stopPropagation(); var d2 = deckById(tile.getAttribute('data-deck')); if (d2) onDelete(d2); return; }
    if (t.closest('.deck-appearance')) { e.stopPropagation(); var box = tile.querySelector('.deck-skin-inline'); if (box) box.hidden = !box.hidden; return; }
    if (t.closest('.deck-skin-opt')) { e.stopPropagation(); var opt = t.closest('.deck-skin-opt'); var d3 = deckById(tile.getAttribute('data-deck')); if (d3) equipSkin(d3, tile, opt.getAttribute('data-skin') || null); return; }
    if (t.closest('.card-back') || t.closest('.card-share-face')) return; // autre clic verso : rien
    if (!expandedId) expandDeck(tile); // corps de la tuile → déplier
  }
  function onViewChange(e) {
    var cb = e.target;
    if (!cb || !cb.matches || !cb.matches('.deck-card[data-deck] .ds-i0 .switch-row input[type="checkbox"]')) return;
    var tile = cb.closest('.deck-card[data-deck]'); if (tile) toggleAdopt(tile, cb);
  }

  // Partager : garantit un lien (token) puis retourne la tuile sur sa FACE PARTAGE (meme
  // grille de partage que le dashboard, via LBAShare.optionsHTML). Le verso reste « flipped ».
  async function onDeckShare(deck, tileEl, btn) {
    if (deck.visibility && deck.visibility !== 'private' && deck.share_token) {
      showShareFace(tileEl, deck); return;
    }
    if (btn) btn.disabled = true;
    try {
      var res = await apiSend('POST', '/api/decks/' + encodeURIComponent(deck.id) + '/share');
      var d = await readJson(res);
      if (res.status === 409 && d && d.error === 'display_name_required') {
        detailMsg('Choisissez d\'abord un pseudo (Mon compte).', 'err'); return;
      }
      if (res.ok && d && d.share_token) {
        deck.visibility = 'unlisted'; deck.share_token = d.share_token;
        showShareFace(tileEl, deck);
        return;
      }
      detailMsg((d && d.error) || 'Partage impossible.', 'err');
    } catch (e) { detailMsg('Réessayez dans un instant.', 'err'); }
    finally { if (btn) btn.disabled = false; }
  }

  // Retourne la tuile (depuis le RECTO) sur sa face partage : flipped + face-share + ruban/
  // eventail masques (ds-sharing), comme une carte du dashboard. flip-back → retour au recto.
  function showShareFace(tileEl, deck) {
    var card = tileEl.querySelector('.ds-i0 .card'); if (!card) return;
    var grid = card.querySelector('.card-share-face .share-grid');
    var url = shareFullUrl(deck.share_token);
    if (grid && window.LBAShare && !grid.dataset.filled) {
      grid.innerHTML = LBAShare.optionsHTML(deck.name, url);
      LBAShare.bindCopy(grid, url);
      grid.dataset.filled = '1';
    }
    tileEl.classList.add('ds-sharing');
    card.classList.add('flipped', 'face-share');
  }

  // Equipe (ou retire si skinId null) un skin sur le deck deplie ; MAJ visuelle des pastilles.
  async function equipSkin(deck, tileEl, skinId) {
    try {
      var res = await apiSend('POST', '/api/skins/equip', { skin_id: skinId, collection_id: deck.id });
      var d = await readJson(res);
      if (!res.ok) throw new Error((d && d.error) || 'echec');
      deck.equipped_skin_id = d.equipped_skin_id || null;
      if (curDeck && curDeck.id === deck.id) curDeck.equipped_skin_id = deck.equipped_skin_id;
      tileEl.querySelectorAll('.deck-skin-opt').forEach(function (b) {
        var on = (b.getAttribute('data-skin') || '') === (deck.equipped_skin_id || '');
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      detailMsg(skinId ? 'Skin équipé ✓' : 'Skin retiré', 'ok');
    } catch (e) { detailMsg('Équipement impossible', 'err'); }
  }

  // Repli au clic HORS deck/cartes/suggestions (le deck reste ouvert sinon). Enregistre une
  // seule fois (voir bas du module). En mode liste (expandedId null) : sans effet.
  function onDocOutside(e) {
    if (!expandedId) return;
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('.deck-grid') || t.closest('.deck-suggest-block') || t.closest('.deck-list-head') ||
        t.closest('.deck-form') || t.closest('.share-pop') || t.closest('.share-modal-backdrop') ||
        t.closest('.share-backdrop')) return;
    collapseDeck();
  }

  // Rend les cartes DU deck (lecture seule + « Retirer ») + la tuile « Ajouter une carte »
  // (.card.add, même visuel que « Proposer une alerte » du kiosque) DANS la meme grille que
  // la tuile-deck depliee, APRES elle (les tuiles voisines sont masquees). N'efface jamais la
  // tuile-deck : ne remplace que les .deck-card-wrap / #deck-add-card existants.
  function renderDeckCards() {
    var grid = viewEl.querySelector('.deck-grid');
    if (!grid) return;
    grid.querySelectorAll('.deck-card-wrap, #deck-add-card').forEach(function (n) { n.remove(); });
    var html = deckSources.map(function (sc) {
      return '<div class="deck-card-wrap">' +
        LBACards.cardHTML(sc, 'anon') +
        '<button type="button" class="deck-remove" data-source="' + esc(sc.id) + '">Retirer</button>' +
      '</div>';
    }).join('') +
      '<button type="button" class="card add deck-add-card" id="deck-add-card" aria-expanded="false">' +
        '<span class="plus">+</span><strong>Ajouter une carte</strong>' +
      '</button>';
    grid.insertAdjacentHTML('beforeend', html);
    grid.querySelectorAll('.deck-remove').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); onRemoveItem(btn.getAttribute('data-source')); });
    });
    var addTile = document.getElementById('deck-add-card');
    if (addTile) {
      var body = document.getElementById('deck-suggest-body');
      addTile.setAttribute('aria-expanded', (body && !body.hidden) ? 'true' : 'false');
      addTile.addEventListener('click', function (e) { e.stopPropagation(); toggleSuggest(); });
    }
  }

  // Déplie / replie le sélecteur de cartes suggérées (piloté par la tuile « Ajouter une
  // carte » de la grille). Le corps des suggestions vit dans #deck-suggest-block, plus bas.
  function toggleSuggest() {
    var body = document.getElementById('deck-suggest-body');
    var tile = document.getElementById('deck-add-card');
    if (!body) return;
    var open = body.hidden; body.hidden = !open;
    if (tile) tile.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) body.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Messages du deck déplié : zone .deck-verso-msg (dans le verso propriétaire de la tuile).
  function detailMsg(text, kind) {
    var el = viewEl.querySelector('.deck-verso-msg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.className = 'coll-adopt-msg deck-verso-msg' + (kind ? ' ' + kind : '');
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
    suggestQuery = '';
    var isEmpty = deckSources.length === 0;

    // Le déclencheur d'ouverture est la tuile « Ajouter une carte » de la grille (renderDeckCards
    // → toggleSuggest). Ici on rend le CORPS des suggestions : en-tête (label + champ de
    // RECHERCHE dans toutes les cartes) + grille + « afficher plus ». Ouvert d'emblée si vide.
    block.innerHTML = '' +
      '<div class="deck-suggest-body" id="deck-suggest-body"' + (isEmpty ? '' : ' hidden') + '>' +
        '<div class="deck-suggest-head">' +
          '<div class="section-label">Cartes suggérées</div>' +
          '<input type="search" id="deck-suggest-search" class="deck-suggest-search" ' +
            'placeholder="Rechercher une carte…" aria-label="Rechercher une carte" autocomplete="off">' +
        '</div>' +
        '<div class="grid" id="deck-suggest-grid"></div>' +
        '<div class="deck-suggest-more-wrap">' +
          '<button type="button" id="deck-suggest-more" class="notif-btn">Afficher plus d\'alertes</button>' +
        '</div>' +
      '</div>';

    // Synchronise l'état d'ouverture de la tuile « Ajouter une carte » avec le corps rendu.
    var addTile0 = document.getElementById('deck-add-card');
    if (addTile0) addTile0.setAttribute('aria-expanded', isEmpty ? 'true' : 'false');

    var search = document.getElementById('deck-suggest-search');
    if (search) search.addEventListener('input', function () {
      suggestQuery = search.value || ''; shownCount = SUGGEST_STEP; renderSuggest();
    });
    document.getElementById('deck-suggest-more').addEventListener('click', function () {
      shownCount += SUGGEST_STEP; renderSuggest();
    });
    renderSuggest();
  }

  // Filtre une source contre la requête de recherche (nom + sous-titre + description +
  // libellés de catégories), normalisé comme l'index du kiosque (accents/minuscules).
  function suggestMatch(s, q) {
    if (!q) return true;
    var norm = (window.LBACards && LBACards.normalizeSearch) ? LBACards.normalizeSearch : function (x) { return String(x || '').toLowerCase(); };
    var cats = (s.categories || []).map(function (c) { return catLabel(c); }).join(' ');
    return norm([s.name, s.subtitle, s.description, cats].join(' ')).indexOf(norm(q)) !== -1;
  }

  function renderSuggest() {
    var g = document.getElementById('deck-suggest-grid');
    if (!g) return;
    var q = (suggestQuery || '').trim();
    var filtered = q ? pool.filter(function (s) { return suggestMatch(s, q); }) : pool;
    if (!filtered.length) {
      g.innerHTML = '<p class="src-desc">' +
        (q ? 'Aucune carte ne correspond à votre recherche.' : 'Toutes les cartes disponibles sont déjà dans ce deck.') +
        '</p>';
      var more0 = document.getElementById('deck-suggest-more'); if (more0) more0.style.display = 'none';
      return;
    }
    var shown = filtered.slice(0, shownCount);
    g.innerHTML = shown.map(function (sc) {
      return '<div class="deck-card-wrap deck-suggest-wrap" data-source="' + esc(sc.id) + '">' +
        LBACards.cardHTML(sc, 'anon') +
      '</div>';
    }).join('');
    // Bouton « Ajouter au deck » INCLUS DANS la carte, juste après la description (.card-desc).
    g.querySelectorAll('.deck-suggest-wrap').forEach(function (wrap) {
      var sid = wrap.getAttribute('data-source');
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'deck-suggest-add coll-adopt'; btn.setAttribute('data-source', sid);
      btn.textContent = 'Ajouter au deck';
      btn.addEventListener('click', function (e) { e.stopPropagation(); onAddSuggestion(sid); });
      var desc = wrap.querySelector('.card-desc');
      var p = desc ? desc.closest('p') : null;
      if (p) p.insertAdjacentElement('afterend', btn);
      else wrap.appendChild(btn);
    });
    var more = document.getElementById('deck-suggest-more');
    if (more) more.style.display = (filtered.length > shownCount) ? '' : 'none';
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
      renderDeckCards();
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
      renderDeckCards();
      renderSuggest();
      refreshDecks();
    } catch (e) { detailMsg('Réessayez dans un instant.', 'err'); }
  }

  async function onDelete(deck) {
    if (!window.confirm('Supprimer définitivement le deck « ' + deck.name + ' » ?')) return;
    try {
      var res = await apiSend('DELETE', '/api/decks/' + encodeURIComponent(deck.id));
      if (res.ok) { await refreshDecks(); expandedId = null; renderList(); }
      else detailMsg('Suppression impossible.', 'err');
    } catch (e) { detailMsg('Réessayez dans un instant.', 'err'); }
  }

  // --- Partage --------------------------------------------------------------

  function shareFullUrl(token) {
    return 'https://labonnealerte.fr/deck/' + token;
  }

  // --- Chargement -----------------------------------------------------------

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
    viewEl.innerHTML = '<div class="src-loading"><div class="lba-bars" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>Chargement…</div>';
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
    // Skins possédés chargés AVANT le rendu : le verso de chaque tuile inclut la liste
    // « Apparence » (baked dans deckTileHTML). Non bloquant si l'appel échoue.
    await ensureSkins();
    // Page « Nouveau deck » (/mes-decks/nouveau) OU arrivée depuis une carte du kiosque
    // (?creer, graine dans localStorage) : ouvrir directement le formulaire de création.
    // Sinon, liste normale.
    if (/\/mes-decks\/nouveau\/?$/.test(location.pathname) || /[?&]creer(=|&|$)/.test(location.search)) openCreateFromSeed();
    else renderList();
  }

  // Enregistrés une seule fois : repli au clic extérieur + délégation des clics/switches des
  // tuiles-deck (viewEl persiste ; son innerHTML change à chaque rendu).
  document.addEventListener('click', onDocOutside);
  if (viewEl) {
    viewEl.addEventListener('click', onViewClick);
    viewEl.addEventListener('change', onViewChange);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
