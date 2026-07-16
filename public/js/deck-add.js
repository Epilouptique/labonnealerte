/* deck-add.js — « Ajouter à un deck » depuis une carte du kiosque (mode connecté).
   Ouvre un petit menu listant les decks de l'utilisateur ; ajoute la carte (avec
   son instance de params si la carte est paramétrée) via POST /api/decks/:id/items.
   Composer un deck ≠ s'abonner : aucune souscription n'est créée ici. */

(function () {
  'use strict';

  var S = window.LBASession;
  if (!S) return;

  var decksCache = null; // { decks:[...], display_name } — chargé à la 1re ouverture
  var menuEl = null;

  function esc(s) { return window.LBACards ? LBACards.esc(s) : String(s == null ? '' : s); }

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
    if (menuEl && !e.target.closest('.deck-add-menu') && !e.target.closest('.back-add-deck')) closeMenu();
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

  async function openMenu(btn) {
    closeMenu();
    var card = btn.closest('.card'); if (!card) return;
    var sourceId = btn.getAttribute('data-source-id');
    var params = readParams(card);

    var data = await loadDecks();
    menuEl = document.createElement('div');
    menuEl.className = 'deck-add-menu';
    if (!data || !data.decks || !data.decks.length) {
      menuEl.innerHTML = '<div class="dam-empty">Aucun deck pour l\'instant.</div>' +
        '<a class="dam-create" href="/mes-decks">＋ Créer un deck</a>';
    } else {
      menuEl.innerHTML = data.decks.map(function (dk) {
        return '<button type="button" class="dam-item" data-deck-id="' + esc(dk.id) + '" data-deck-name="' + esc(dk.name) + '">' +
          '<span class="dam-emoji">' + esc(dk.emoji || '📦') + '</span>' +
          '<span class="dam-name">' + esc(dk.name) + '</span>' +
          '<span class="dam-count">' + (dk.card_count || 0) + '</span></button>';
      }).join('') + '<a class="dam-create" href="/mes-decks">＋ Gérer mes decks</a>';
    }
    menuEl.addEventListener('click', function (e) {
      var it = e.target.closest('.dam-item');
      if (!it) return;
      addToDeck(it.getAttribute('data-deck-id'), sourceId, params, it.getAttribute('data-deck-name'));
      closeMenu();
    });
    // Positionnement sous le bouton.
    btn.parentNode.appendChild(menuEl);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.back-add-deck');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    if (document.body.getAttribute('data-mode') !== 'connected') return;
    if (menuEl) { closeMenu(); return; }
    openMenu(btn);
  });
})();
