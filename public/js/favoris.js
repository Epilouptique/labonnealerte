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
  // Favoris de DECK : ARCHIVÉS (fil #9, 12/09/2026) — plus de tuiles-deck dans les favoris.

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
      var hasAny = gridEl.querySelector('.card');
      if (!hasAny && emptyEl) emptyEl.hidden = false;
    }, 1500);
  }

  // Cœur d'une carte-source = retire le favori de « Ma collection » (connecté uniquement,
  // la table favorites vit côté compte). On court-circuite le handler like de site.js
  // (qui, lui, décrémente likes_count via DELETE /like).
  if (gridEl) gridEl.addEventListener('click', function (e) {
    var favBtn = e.target.closest('.card .card-like');
    if (favBtn && MODE === 'connected') {
      e.preventDefault(); e.stopPropagation();
      toggleFavRemoval(favBtn.closest('.card'), favBtn);
    }
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
    } catch (e) {
      if (loadingEl) loadingEl.hidden = true;
      if (errorEl) errorEl.hidden = false;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
