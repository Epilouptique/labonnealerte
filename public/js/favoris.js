/* favoris.js — page /favoris (D).
   Rend les cartes AIMÉES comme au kiosque (like actif, boutons fonctionnels via les
   handlers délégués de site.js, déjà attachés). Connecté : depuis la table favorites
   (GET /api/favorites). Anonyme : depuis le localStorage lba-likes (filtre /api/sources).
   Le visiteur peut être connecté ou non. */

(function () {
  'use strict';

  var loadingEl = document.getElementById('fav-loading');
  var viewEl = document.getElementById('fav-view');
  var errorEl = document.getElementById('fav-error');
  var gridEl = document.getElementById('fav-grid');
  var emptyEl = document.getElementById('fav-empty');

  var MODE = 'anon';
  var subMap = {};   // id -> subscribed
  var mineMap = {};  // id -> { instances, state }

  function likedIds() {
    try { var a = JSON.parse(localStorage.getItem('lba-likes') || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  // Favoris de DECK (poses via le cœur d'une tuile-deck du kiosque, cf. site.js).
  function deckFavIds() {
    try { var a = JSON.parse(localStorage.getItem('lba-deck-favorites') || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function deckFavSave(a) { try { localStorage.setItem('lba-deck-favorites', JSON.stringify(a)); } catch (e) {} }

  // Affiche les decks favoris en tuiles (LBADeckStack), en tete de la grille des favoris.
  // Sur cette page le cœur SERT a RETIRER le deck des favoris ; le clic ailleurs navigue
  // vers la page du deck. (Le switch/partage restent des actions du kiosque.)
  async function renderDeckFavorites() {
    var ids = deckFavIds();
    if (!ids.length || !window.LBADeckStack || !window.LBACards) return;
    try {
      var res = await Promise.all([
        fetch('/api/collections', { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : { collections: [] }; }),
        fetch('/api/sources', { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : []; })
      ]);
      var list = ((res[0] && res[0].collections) || []).filter(function (c) { return ids.indexOf(c.id) !== -1; });
      if (!list.length) return;
      var index = LBADeckStack.indexSources(res[1] || []);
      var html = list.map(function (c) {
        var cards = LBADeckStack.resolveCards(c.preview || [], index);
        var stack = LBADeckStack.html({ name: c.name, tint: c.tint, emoji: c.emoji, count: c.card_count || 0, cards: cards, mode: 'anon' });
        return '<div class="deck-card" data-deck-tile role="link" tabindex="0" data-href="/collection/' + encodeURIComponent(c.id) + '">' + stack + '</div>';
      }).join('');
      gridEl.insertAdjacentHTML('afterbegin', html);
      if (emptyEl) emptyEl.hidden = true;
      // Cœurs des tuiles-deck : marques comme favoris (remplis).
      gridEl.querySelectorAll('.deck-card[data-deck-tile] .ds-i0 .like-btn').forEach(function (b) {
        b.classList.add('liked'); b.setAttribute('aria-pressed', 'true');
      });
    } catch (e) { /* non bloquant */ }
  }

  // Retrait d'un favori-SOURCE (connecté) avec sursis ~1,5 s, RÉUTILISANT le vocabulaire
  // .mine-leaving du kiosque : au 1er clic sur le cœur, la carte se grise et reste visible ;
  // re-cliquer le cœur pendant le délai ANNULE (rien n'a encore été supprimé en base). À
  // l'expiration seulement : DELETE /api/favorites (ne touche PAS likes_count) + retrait DOM.
  function toggleFavRemoval(card, btn) {
    if (!card || !btn) return;
    if (card._favTimer) {
      // Re-clic pendant le sursis → annulation (aucune écriture DB n'a eu lieu).
      clearTimeout(card._favTimer); card._favTimer = null;
      card.classList.remove('mine-leaving');
      btn.classList.add('liked'); btn.setAttribute('aria-pressed', 'true');
      return;
    }
    var id = card.getAttribute('data-source-id'); if (!id) return;
    var token = window.LBASession && LBASession.get(); if (!token) return;
    card.classList.add('mine-leaving');
    btn.classList.remove('liked'); btn.setAttribute('aria-pressed', 'false');
    card._favTimer = setTimeout(function () {
      card._favTimer = null;
      fetch('/api/favorites', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, source_id: id })
      }).catch(function () { /* best-effort */ });
      card.classList.remove('mine-leaving');
      card.remove();
      var hasAny = gridEl.querySelector('.card, .deck-card');
      if (!hasAny && emptyEl) emptyEl.hidden = false;
    }, 1500);
  }

  // Handler local : cœur d'une tuile-deck = retire des favoris ; clic ailleurs = navigation.
  if (gridEl) gridEl.addEventListener('click', function (e) {
    var tile = e.target.closest('.deck-card[data-deck-tile]');
    if (!tile) {
      // Carte-source (hors tuile-deck) : le cœur RETIRE le favori de « Ma collection ».
      // Connecté uniquement (la table favorites vit côté compte). On court-circuite le
      // handler like de site.js (qui, lui, décrémente likes_count via DELETE /like).
      var favBtn = e.target.closest('.card .card-like');
      if (favBtn && MODE === 'connected') {
        e.preventDefault(); e.stopPropagation();
        toggleFavRemoval(favBtn.closest('.card'), favBtn);
      }
      return;
    }
    if (e.target.closest('.ds-i0 .card-like')) {
      e.preventDefault(); e.stopPropagation();
      var slug = decodeURIComponent((tile.getAttribute('data-href') || '').replace('/collection/', ''));
      deckFavSave(deckFavIds().filter(function (x) { return x !== slug; }));
      tile.remove();
      var hasAny = gridEl.querySelector('.card, .deck-card');
      if (!hasAny && emptyEl) emptyEl.hidden = false;
      return;
    }
    // Les autres controles (switch, partage) sont des actions du kiosque : inertes ici.
    if (e.target.closest('.ds-i0 .switch-row, .ds-i0 .card-share, .ds-i0 .flip-back, .ds-i0 .card-share-face')) return;
    window.location.href = tile.getAttribute('data-href');
  });

  function markLikes() {
    gridEl.querySelectorAll('.card .like-btn').forEach(function (btn) {
      btn.classList.add('liked'); btn.setAttribute('aria-pressed', 'true');
    });
  }

  function renderCards(sources) {
    if (!sources.length) {
      gridEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    gridEl.innerHTML = sources.map(function (sc) {
      if (MODE === 'connected') {
        sc.subscribed = !!subMap[sc.id];
        var mine = mineMap[sc.id];
        if (mine && Array.isArray(sc.params_schema) && sc.params_schema.length) {
          sc.instances = mine.instances || [];
          if (sc.instances.length) { sc.state = mine.state; sc.muted = mine.muted; }
        }
      }
      return LBACards.cardHTML(sc, MODE);
    }).join('');
    markLikes();
  }

  async function load() {
    var token = window.LBASession && LBASession.get();
    MODE = 'anon'; subMap = {}; mineMap = {};
    var profileDept = null;

    if (token) {
      try {
        var s = await LBASession.fetchAlerts(token);
        if (s.status === 401) LBASession.clear();
        else if (s.ok && s.data) {
          MODE = 'connected';
          (s.data.sources || []).forEach(function (x) { subMap[x.id] = x.subscribed; mineMap[x.id] = x; });
          profileDept = s.data.departement || null;
          LBASession.renderHeader(s.data.email);
        }
      } catch (e) { /* réseau : anonyme */ }
    }
    window.LBADefaults = { departement: profileDept };
    document.body.setAttribute('data-mode', MODE);

    try {
      var sources;
      if (MODE === 'connected') {
        // 6) Rattrape les favoris locaux (lba-likes) côté serveur AVANT l'affichage,
        // pour que /favoris reflète aussi les cœurs posés avant la table favorites,
        // même sans passer par la home. Idempotent.
        try {
          var lids = likedIds();
          if (lids.length) {
            await fetch('/api/favorites/sync', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: token, ids: lids })
            });
          }
        } catch (e) { /* non bloquant */ }
        var r = await LBASession.authFetch('/api/favorites', token, { headers: { Accept: 'application/json' } });
        if (r.status === 401) { LBASession.clear(); MODE = 'anon'; document.body.setAttribute('data-mode', 'anon'); return loadAnon(); }
        if (!r.ok) throw new Error('http ' + r.status);
        sources = await r.json();
      } else {
        return loadAnon();
      }
      if (loadingEl) loadingEl.hidden = true;
      if (viewEl) viewEl.hidden = false;
      renderCards(Array.isArray(sources) ? sources : []);
      await renderDeckFavorites();
    } catch (e) {
      if (loadingEl) loadingEl.hidden = true;
      if (errorEl) errorEl.hidden = false;
    }
  }

  // Anonyme (ou repli) : la liste des favoris = les ids du localStorage, résolus
  // contre le catalogue public /api/sources.
  async function loadAnon() {
    try {
      var ids = likedIds();
      var r = await fetch('/api/sources', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('http ' + r.status);
      var all = await r.json();
      var set = {};
      ids.forEach(function (id) { set[id] = true; });
      var sources = (Array.isArray(all) ? all : []).filter(function (s) { return set[s.id]; });
      if (loadingEl) loadingEl.hidden = true;
      if (viewEl) viewEl.hidden = false;
      renderCards(sources);
      await renderDeckFavorites();
    } catch (e) {
      if (loadingEl) loadingEl.hidden = true;
      if (errorEl) errorEl.hidden = false;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
