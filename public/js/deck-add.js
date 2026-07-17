/* deck-add.js — « Ajouter à un deck » depuis une carte du kiosque (recto, mode
   connecté). L'icône « + » (à gauche du « i ») ouvre un menu flottant listant les
   decks de l'utilisateur ; ajoute la carte (avec son instance de params si la carte
   est paramétrée) via POST /api/decks/:id/items. Composer un deck ≠ s'abonner.
   Si l'utilisateur n'a AUCUN deck : création rapide inline (« premier deck ») sans
   quitter le kiosque, puis ajout de la carte dans la foulée. */

(function () {
  'use strict';

  var S = window.LBASession;
  if (!S) return;

  var decksCache = null; // { decks:[...] } — chargé à la 1re ouverture, invalidé après création
  var menuEl = null;

  function esc(s) { return window.LBACards ? LBACards.esc(s) : String(s == null ? '' : s); }
  // E5) Vignette motif+teinte (l'emoji ne s'affiche jamais sur le deck).
  function deckThumbSm(emoji, tint) {
    var motif = (window.LBADeckMotifs && (LBADeckMotifs[emoji] || LBADeckMotifs['📦'])) || '';
    return '<span class="deck-thumb dam-thumb tint-' + ((tint >= 1 && tint <= 8) ? tint : 1) + '">' +
      '<span class="deck-motif-bg" aria-hidden="true">' + motif + '</span></span>';
  }

  function toast(msg, ok) {
    var el = document.createElement('div');
    el.className = 'deck-toast' + (ok === false ? ' err' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 10);
    setTimeout(function () { el.classList.remove('show'); }, 2600);
    setTimeout(function () { el.remove(); }, 3000);
  }

  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  document.addEventListener('click', function (e) {
    if (menuEl && !e.target.closest('.deck-add-menu') && !e.target.closest('.card-add-deck')) closeMenu();
  });

  // Lit l'instance de params courante de la carte (si source paramétrée).
  function readParams(card) {
    var ctrl = card.querySelector('.param-select, .param-input');
    if (!ctrl) return null;
    var val = String(ctrl.value || '').trim();
    if (!val) return null;
    var p = {}; p[ctrl.getAttribute('data-key')] = val;
    return p;
  }

  async function loadDecks() {
    if (decksCache) return decksCache;
    var token = S.get(); if (!token) return null;
    var r = await fetch('/api/decks?token=' + encodeURIComponent(token), { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    decksCache = await r.json();
    return decksCache;
  }

  async function addToDeck(deckId, sourceId, params, deckName) {
    var token = S.get(); if (!token) return;
    try {
      var r = await fetch('/api/decks/' + encodeURIComponent(deckId) + '/items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, source_id: sourceId, params: params })
      });
      if (!r.ok) { var d = await r.json().catch(function () { return {}; }); throw new Error(d.error || 'http ' + r.status); }
      toast('Ajouté à « ' + deckName + ' » ✓', true);
    } catch (e) {
      toast(e.message || 'Échec de l\'ajout', false);
    }
  }

  // Crée un premier deck puis y ajoute la carte (parcours sans quitter le kiosque).
  async function createFirstDeckAndAdd(name, sourceId, params, msgEl, btn) {
    var token = S.get(); if (!token) return;
    if (!name) { if (msgEl) msgEl.textContent = 'Choisissez un nom.'; return; }
    if (btn) btn.disabled = true;
    try {
      var r = await fetch('/api/decks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, name: name })
      });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok || !d.deck) throw new Error(d.error || 'Création impossible');
      decksCache = null; // la liste a changé
      closeMenu();
      await addToDeck(d.deck.id, sourceId, params, d.deck.name);
    } catch (e) {
      if (msgEl) msgEl.textContent = e.message || 'Échec';
      if (btn) btn.disabled = false;
    }
  }

  function firstDeckHTML() {
    return '<div class="dam-first">' +
      '<div class="dam-first-label">Créer mon premier deck</div>' +
      '<input type="text" class="dam-first-input" maxlength="40" placeholder="Nom du deck (ex. Ski 2026)" aria-label="Nom du deck">' +
      '<button type="button" class="dam-first-btn">Créer et ajouter</button>' +
      '<div class="dam-first-msg" role="status"></div>' +
    '</div>';
  }

  async function openMenu(btn) {
    closeMenu();
    var card = btn.closest('.card'); if (!card) return;
    var sourceId = btn.getAttribute('data-source-id');
    var params = readParams(card);

    var data = await loadDecks();
    menuEl = document.createElement('div');
    menuEl.className = 'deck-add-menu';

    if (!data || !data.decks || !data.decks.length) {
      // Aucun deck : création rapide inline.
      menuEl.innerHTML = firstDeckHTML();
      var input = menuEl.querySelector('.dam-first-input');
      var mkBtn = menuEl.querySelector('.dam-first-btn');
      var msg = menuEl.querySelector('.dam-first-msg');
      var go = function () { createFirstDeckAndAdd((input.value || '').trim(), sourceId, params, msg, mkBtn); };
      mkBtn.addEventListener('click', go);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      btn.parentNode.appendChild(menuEl);
      setTimeout(function () { input.focus(); }, 30);
      return;
    }

    menuEl.innerHTML = data.decks.map(function (dk) {
      return '<button type="button" class="dam-item" data-deck-id="' + esc(dk.id) + '" data-deck-name="' + esc(dk.name) + '">' +
        deckThumbSm(dk.emoji || '📦', dk.tint) +
        '<span class="dam-name">' + esc(dk.name) + '</span>' +
        '<span class="dam-count">' + (dk.card_count || 0) + '</span></button>';
    }).join('') + '<a class="dam-create" href="/mes-decks">＋ Gérer mes decks</a>';

    menuEl.addEventListener('click', function (e) {
      var it = e.target.closest('.dam-item');
      if (!it) return;
      addToDeck(it.getAttribute('data-deck-id'), sourceId, params, it.getAttribute('data-deck-name'));
      closeMenu();
    });
    btn.parentNode.appendChild(menuEl);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.card-add-deck');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    if (document.body.getAttribute('data-mode') !== 'connected') return;
    if (menuEl) { closeMenu(); return; }
    openMenu(btn);
  });
})();
