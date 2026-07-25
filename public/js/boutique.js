/* boutique.js — page /boutique (phase 3, squelette skins cosmetiques).
   Liste les skins actifs, gere l'achat (points) et l'equipement du skin dashboard.
   Les skins de type 'deck' s'equipent PAR deck depuis la gestion des decks (hors
   de cette grille) : ici on permet l'achat, l'etat « Possede » suffit. Aucun visuel
   definitif : l'apercu est un placeholder CSS (classe asset_ref). */

(function () {
  'use strict';

  var S = window.LBASession;
  var token = (S && S.get && S.get()) || null;

  var loadingEl = document.getElementById('shop-loading');
  var anonEl = document.getElementById('shop-anon');
  var viewEl = document.getElementById('shop-view');
  var gridEl = document.getElementById('shop-grid');
  var balanceEl = document.getElementById('shop-balance');
  var msgEl = document.getElementById('shop-msg');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var msgTimer = null;
  function flash(text, ok) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = 'coll-adopt-msg' + (ok ? ' ok' : ' err');
    msgEl.hidden = false;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { msgEl.hidden = true; }, 2200);
  }

  function done() {
    document.body.classList.remove('loading');
    if (loadingEl) loadingEl.hidden = true;
  }

  var STATE = { balance: 0, equippedDashboard: null, skins: [] };

  function typeLabel(t) { return t === 'deck' ? 'Deck' : 'Tableau de bord'; }

  function skinCard(sk) {
    var owned = !!sk.owned;
    var isDash = sk.type === 'dashboard';
    var equipped = isDash && STATE.equippedDashboard === sk.id;

    // Apercu placeholder : la classe asset_ref portera le vrai visuel plus tard.
    var preview = '<div class="shop-preview ' + esc(sk.asset_ref) + '" aria-hidden="true"></div>';

    var action;
    if (!owned) {
      action = '<button type="button" class="sup-btn primary shop-buy" data-id="' + esc(sk.id) + '">'
        + 'Acheter · ' + esc(String(sk.cost)) + ' pts</button>';
    } else if (isDash && equipped) {
      action = '<button type="button" class="sup-btn shop-unequip" data-id="' + esc(sk.id) + '">Équipé ✓ · Retirer</button>';
    } else if (isDash) {
      action = '<button type="button" class="sup-btn primary shop-equip" data-id="' + esc(sk.id) + '">Équiper</button>';
    } else {
      // Skin de deck possede : l'equipement se fait par deck ailleurs.
      action = '<span class="shop-owned">Possédé · à équiper sur un deck</span>';
    }

    return '<div class="shop-card' + (equipped ? ' is-equipped' : '') + '">'
      + preview
      + '<div class="shop-card-body">'
      + '  <div class="shop-card-type">' + esc(typeLabel(sk.type)) + '</div>'
      + '  <div class="shop-card-name">' + esc(sk.name) + '</div>'
      + '  <div class="shop-card-action">' + action + '</div>'
      + '</div>'
      + '</div>';
  }

  function render() {
    if (balanceEl) balanceEl.textContent = String(STATE.balance);
    gridEl.innerHTML = STATE.skins.map(skinCard).join('');
    bind();
  }

  async function post(path, payload) {
    var res = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ token: token }, payload)),
    });
    var d = null;
    try { d = await res.json(); } catch (e) { /* pas de corps */ }
    return { ok: res.ok, status: res.status, data: d };
  }

  function setOwned(id) {
    for (var i = 0; i < STATE.skins.length; i++) {
      if (STATE.skins[i].id === id) { STATE.skins[i].owned = true; break; }
    }
  }

  async function buy(id) {
    var r = await post('/api/skins/buy', { skin_id: id });
    if (r.ok && r.data) {
      STATE.balance = r.data.balance;
      setOwned(id);
      flash('Skin débloqué ✓', true);
      render();
    } else {
      flash((r.data && r.data.error) || 'Achat impossible', false);
    }
  }

  async function equip(id) {
    var r = await post('/api/skins/equip', { skin_id: id });
    if (r.ok && r.data) {
      STATE.equippedDashboard = r.data.equipped_dashboard_skin_id || null;
      flash('Skin équipé ✓', true);
      render();
    } else {
      flash((r.data && r.data.error) || 'Équipement impossible', false);
    }
  }

  async function unequip() {
    var r = await post('/api/skins/equip', { skin_id: null });
    if (r.ok && r.data) {
      STATE.equippedDashboard = r.data.equipped_dashboard_skin_id || null;
      flash('Skin retiré', true);
      render();
    } else {
      flash((r.data && r.data.error) || 'Action impossible', false);
    }
  }

  function bind() {
    gridEl.querySelectorAll('.shop-buy').forEach(function (b) {
      b.addEventListener('click', function () { buy(b.getAttribute('data-id')); });
    });
    gridEl.querySelectorAll('.shop-equip').forEach(function (b) {
      b.addEventListener('click', function () { equip(b.getAttribute('data-id')); });
    });
    gridEl.querySelectorAll('.shop-unequip').forEach(function (b) {
      b.addEventListener('click', function () { unequip(); });
    });
  }

  (async function init() {
    if (!token) { done(); if (anonEl) anonEl.hidden = false; return; }
    try {
      var res = await fetch('/api/skins?token=' + encodeURIComponent(token), { headers: { Accept: 'application/json' } });
      if (res.status === 401) { S.clear && S.clear(); done(); if (anonEl) anonEl.hidden = false; return; }
      var d = await res.json();
      STATE.balance = d.balance || 0;
      STATE.equippedDashboard = d.equipped_dashboard_skin_id || null;
      STATE.skins = Array.isArray(d.skins) ? d.skins : [];
      done();
      if (viewEl) viewEl.hidden = false;
      render();
    } catch (e) {
      done();
      if (viewEl) { viewEl.hidden = false; }
      flash('Chargement impossible', false);
    }
  })();
})();
