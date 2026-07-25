/* deck-add.js — « Ajouter à un deck » depuis une carte du kiosque (recto, mode
   connecté). L'icône « + » (à gauche du « i ») RETOURNE la carte et affiche, AU DOS
   (F3), la liste des decks de l'utilisateur ; un clic ajoute la carte (avec son
   instance de params si la carte est paramétrée) via POST /api/decks/:id/items.
   Composer un deck ≠ s'abonner. Si l'utilisateur n'a AUCUN deck : création rapide
   inline (« premier deck ») au dos de la carte, puis ajout dans la foulée. */

(function () {
  'use strict';

  var S = window.LBASession;
  if (!S) return;

  var decksCache = null; // { decks:[...] } — chargé à la 1re ouverture, invalidé après création

  function esc(s) { return window.LBACards ? LBACards.esc(s) : String(s == null ? '' : s); }
  // Vignette motif+teinte (l'emoji ne s'affiche jamais sur le deck).
  function deckThumbSm(emoji, tint) {
    var motif = (window.LBADeckMotifs && (LBADeckMotifs[emoji] || LBADeckMotifs['📦'])) || '';
    return '<span class="deck-thumb dam-thumb tint-' + ((tint >= 1 && tint <= 11) ? tint : 1) + '">' +
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

  // Retourne la carte vers le recto (même vocabulaire que le handler .flip-back).
  function flipBack(card) {
    card.classList.remove('flipped');
    setTimeout(function () { card.classList.remove('face-deck'); }, 520);
  }

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

  // F3) Remplit la face « deck » au dos de la carte puis retourne la carte.
  async function openDeckFace(btn) {
    var card = btn.closest('.card'); if (!card) return;
    var face = card.querySelector('.card-deck-face'); if (!face) return;
    var body = face.querySelector('.cdf-body'); if (!body) return;
    var sourceId = btn.getAttribute('data-source-id');
    var params = readParams(card);

    body.innerHTML = '<div class="cdf-loading">Chargement…</div>';
    card.classList.add('flipped', 'face-deck'); // retourne tout de suite (chargement au dos)

    var data = await loadDecks();
    // La carte a pu être re-rendue entre-temps.
    if (!card.querySelector('.card-deck-face .cdf-body')) return;
    body = card.querySelector('.card-deck-face .cdf-body');

    if (!data || !data.decks || !data.decks.length) {
      // Aucun deck encore : au lieu d'un micro-formulaire inline, on redirige vers la page
      // de création complète (/mes-decks?creer=1) en transmettant la carte source
      // (source_id + params) via localStorage — même patron que l'intention « lba-adopt ».
      // La carte sera pré-présente dans le nouveau deck.
      try {
        localStorage.setItem('lba-deck-seed', JSON.stringify({ source_id: sourceId, params: params }));
      } catch (e) {}
      window.location.href = '/mes-decks?creer=1';
      return;
    }

    body.innerHTML = '<div class="dam-list">' + data.decks.map(function (dk) {
      return '<button type="button" class="dam-item" data-deck-id="' + esc(dk.id) + '" data-deck-name="' + esc(dk.name) + '">' +
        deckThumbSm(dk.emoji || '📦', dk.tint) +
        '<span class="dam-name">' + esc(dk.name) + '</span>' +
        '<span class="dam-count">' + (dk.card_count || 0) + '</span></button>';
    }).join('') + '</div>' + '<a class="dam-create" href="/mes-decks">＋ Gérer mes decks</a>';

    body.querySelectorAll('.dam-item').forEach(function (it) {
      it.addEventListener('click', function () {
        addToDeck(it.getAttribute('data-deck-id'), sourceId, params, it.getAttribute('data-deck-name'));
        flipBack(card);
      });
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.card-add-deck');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    if (document.body.getAttribute('data-mode') !== 'connected') return;
    openDeckFace(btn);
  });
})();
