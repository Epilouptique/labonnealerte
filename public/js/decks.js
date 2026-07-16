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
    max_decks: 10
  };
  var DEFAULT_EMOJI = '📦';

  function esc(s) { return window.LBACards ? LBACards.esc(s) : String(s == null ? '' : s); }

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
      return '<div class="acct-subhead">Nom public</div>' +
        '<p class="deck-pseudo-line">Vos decks partagés seront signés <strong>' + esc(name) + '</strong>.</p>';
    }
    return '' +
      '<div class="acct-subhead">Nom public</div>' +
      '<form id="deck-pseudo-form" class="deck-pseudo-form" novalidate>' +
        '<label for="deck-pseudo-input">Choisissez votre nom public pour signer vos decks</label>' +
        '<div class="deck-pseudo-row">' +
          '<input id="deck-pseudo-input" type="text" maxlength="30" autocomplete="off" placeholder="ex. Camille du Kiosque">' +
          '<button type="submit" class="notif-btn">Enregistrer</button>' +
        '</div>' +
        '<div id="deck-pseudo-msg" class="deck-form-msg" hidden></div>' +
      '</form>';
  }

  function deckRowHTML(d) {
    var badge = d.visibility && d.visibility !== 'private'
      ? '<span class="deck-badge deck-badge-shared">Partagé</span>'
      : '<span class="deck-badge">Privé</span>';
    var n = d.card_count || 0;
    return '' +
      '<button type="button" class="notif-row deck-row" data-deck="' + esc(d.id) + '">' +
        '<span class="deck-row-emoji" aria-hidden="true">' + esc(d.emoji || DEFAULT_EMOJI) + '</span>' +
        '<span class="notif-txt"><strong>' + esc(d.name) + '</strong>' +
          '<span class="notif-sub">' + n + (n > 1 ? ' cartes' : ' carte') + '</span></span>' +
        badge +
      '</button>';
  }

  function renderList() {
    var canCreate = STATE.decks.length < STATE.max_decks;
    var rows = STATE.decks.length
      ? '<div class="notif-card deck-list">' + STATE.decks.map(deckRowHTML).join('') + '</div>'
      : '<p class="src-desc">Vous n\'avez pas encore de deck. Créez-en un pour commencer.</p>';
    var createBtn = canCreate
      ? '<button type="button" id="deck-create-open" class="coll-adopt deck-create-btn">＋ Créer un deck</button>'
      : '<p class="deck-form-msg">Vous avez atteint le maximum de ' + STATE.max_decks + ' decks.</p>';

    viewEl.innerHTML = '' +
      '<h1>Mes decks</h1>' +
      '<div class="deck-pseudo">' + pseudoBlockHTML() + '</div>' +
      '<div class="acct-subhead">Vos decks</div>' +
      rows +
      '<div class="deck-list-actions">' + createBtn + '</div>';

    bindList();
  }

  function bindList() {
    var pf = document.getElementById('deck-pseudo-form');
    if (pf) pf.addEventListener('submit', onPseudoSubmit);

    viewEl.querySelectorAll('.deck-row').forEach(function (btn) {
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
    if (!name) { pseudoMsg('Entrez un nom public.', 'err'); return; }
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
    pseudoMsg('Choisissez d\'abord un nom public.', 'err');
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

  // deck : objet existant (édition) ou null (création).
  function openForm(deck) {
    var editing = !!deck;
    var name = editing ? (deck.name || '') : '';
    var desc = editing ? (deck.description || '') : '';
    var emoji = editing ? (deck.emoji || DEFAULT_EMOJI) : DEFAULT_EMOJI;

    viewEl.innerHTML = '' +
      '<button type="button" class="deck-back" id="deck-form-back">← Retour</button>' +
      '<h1>' + (editing ? 'Modifier le deck' : 'Nouveau deck') + '</h1>' +
      '<form id="deck-form" class="deck-form" novalidate>' +
        '<label for="deck-name">Nom du deck</label>' +
        '<input id="deck-name" type="text" maxlength="40" autocomplete="off" value="' + esc(name) + '">' +
        '<div class="deck-hint" id="deck-name-hint"></div>' +
        '<label for="deck-desc">Description</label>' +
        '<textarea id="deck-desc" maxlength="200" rows="3">' + esc(desc) + '</textarea>' +
        '<div class="deck-hint" id="deck-desc-hint"></div>' +
        '<label>Emoji</label>' +
        emojiPickerHTML(emoji) +
        '<div class="deck-form-actions">' +
          '<button type="submit" class="coll-adopt">' + (editing ? 'Enregistrer' : 'Créer le deck') + '</button>' +
        '</div>' +
        '<div id="deck-form-msg" class="deck-form-msg" hidden></div>' +
      '</form>';

    var nameEl = document.getElementById('deck-name');
    var descEl = document.getElementById('deck-desc');
    var picker = viewEl.querySelector('.deck-emoji-picker');

    function hint() {
      document.getElementById('deck-name-hint').textContent = nameEl.value.length + ' / 40';
      document.getElementById('deck-desc-hint').textContent = descEl.value.length + ' / 200';
    }
    hint();
    nameEl.addEventListener('input', hint);
    descEl.addEventListener('input', hint);

    picker.addEventListener('click', function (e) {
      var opt = e.target.closest('.deck-emoji-opt');
      if (!opt) return;
      picker.querySelectorAll('.deck-emoji-opt').forEach(function (b) {
        b.classList.remove('on'); b.setAttribute('aria-checked', 'false');
      });
      opt.classList.add('on'); opt.setAttribute('aria-checked', 'true');
    });

    document.getElementById('deck-form-back').addEventListener('click', function () {
      editing ? openDeck(deck.id) : renderList();
    });

    document.getElementById('deck-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submitForm(deck, nameEl, descEl, picker);
    });
  }

  function formMsg(text, kind) {
    var el = document.getElementById('deck-form-msg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.className = 'deck-form-msg' + (kind ? ' ' + kind : '');
  }

  async function submitForm(deck, nameEl, descEl, picker) {
    var name = (nameEl.value || '').trim();
    if (!name) { formMsg('Donnez un nom à votre deck.', 'err'); return; }
    var chosen = picker.querySelector('.deck-emoji-opt.on');
    var body = {
      name: name,
      description: (descEl.value || '').trim(),
      emoji: chosen ? chosen.getAttribute('data-emoji') : DEFAULT_EMOJI
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
    var shared = deck.visibility && deck.visibility !== 'private';
    var forked = deck.forked_from_name
      ? '<p class="deck-forked">Inspiré de « ' + esc(deck.forked_from_name) + ' »</p>' : '';

    var cards = (sources && sources.length)
      ? '<div class="grid" id="deck-grid">' + sources.map(function (sc) {
          return '<div class="deck-card-wrap">' +
            LBACards.cardHTML(sc, 'anon') +
            '<button type="button" class="deck-remove" data-source="' + esc(sc.id) + '">Retirer</button>' +
          '</div>';
        }).join('') + '</div>'
      : '<p class="src-desc">Ce deck ne contient encore aucune carte. Ajoutez-en depuis le kiosque.</p>';

    viewEl.innerHTML = '' +
      '<button type="button" class="deck-back" id="deck-detail-back">← Tous mes decks</button>' +
      '<div class="coll-head-top">' +
        '<span class="coll-emoji" aria-hidden="true">' + esc(deck.emoji || DEFAULT_EMOJI) + '</span>' +
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
      cards;

    bindDetail(deck, sources);
  }

  function bindDetail(deck, sources) {
    document.getElementById('deck-detail-back').addEventListener('click', renderList);
    document.getElementById('deck-edit').addEventListener('click', function () { openForm(deck); });
    document.getElementById('deck-delete').addEventListener('click', function () { onDelete(deck); });
    document.getElementById('deck-adopt').addEventListener('click', function () { onAdopt(deck); });
    document.getElementById('deck-share').addEventListener('click', function () { onShareToggle(deck); });

    viewEl.querySelectorAll('.deck-remove').forEach(function (btn) {
      btn.addEventListener('click', function () { onRemoveItem(deck, btn.getAttribute('data-source')); });
    });

    // Le deck est déjà partagé : montrer d'emblée son lien.
    if (deck.visibility && deck.visibility !== 'private' && deck.share_token) {
      showShareUrl(deck, deck.share_token);
    }
  }

  function detailMsg(text, kind) {
    var el = document.getElementById('deck-adopt-msg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.className = 'coll-adopt-msg' + (kind ? ' ' + kind : '');
  }

  async function onRemoveItem(deck, sourceId) {
    try {
      var res = await apiSend('DELETE',
        '/api/decks/' + encodeURIComponent(deck.id) + '/items/' + encodeURIComponent(sourceId));
      if (res.ok) { await refreshDecks(); openDeck(deck.id); }
      else detailMsg('Retrait impossible.', 'err');
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
    } catch (e) {
      detailMsg('Réessayez dans un instant.', 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'S\'abonner à ce deck'; }
    }
  }

  // --- Partage --------------------------------------------------------------

  function shareFullUrl(token) {
    return 'https://www.labonnealerte.fr/deck/' + token;
  }

  function showShareUrl(deck, shareToken) {
    var url = shareFullUrl(shareToken);
    var box = document.getElementById('deck-share-box');
    if (!box) return;
    box.hidden = false;
    box.innerHTML = '' +
      '<div class="acct-subhead">Lien de partage</div>' +
      '<div class="deck-share-row">' +
        '<input type="text" class="deck-share-url" readonly value="' + esc(url) + '" aria-label="Lien de partage">' +
        '<button type="button" class="notif-btn deck-share-copy">Copier</button>' +
      '</div>' +
      '<button type="button" class="acct-delete-link" id="deck-unshare">Arrêter le partage</button>';

    var copyBtn = box.querySelector('.deck-share-copy');
    copyBtn.addEventListener('click', function () {
      var done = function () {
        var o = copyBtn.textContent; copyBtn.textContent = 'Copié ✓';
        setTimeout(function () { copyBtn.textContent = o; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
      else {
        var i = box.querySelector('.deck-share-url'); i.select();
        try { document.execCommand('copy'); } catch (e) {}
        done();
      }
    });
    box.querySelector('#deck-unshare').addEventListener('click', function () { onUnshare(deck); });
  }

  async function onShareToggle(deck) {
    var box = document.getElementById('deck-share-box');
    // Déjà affiché : simple bascule de visibilité.
    if (box && !box.hidden && box.innerHTML) { box.hidden = true; return; }
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
        showShareUrl(deck, d.share_token);
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
        var box = document.getElementById('deck-share-box');
        if (box) { box.hidden = true; box.innerHTML = ''; }
        var btn = document.getElementById('deck-share');
        if (btn) btn.textContent = 'Partager';
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
        STATE.max_decks = d.max_decks || 10;
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
    STATE.max_decks = d.max_decks || 10;

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
