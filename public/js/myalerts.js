/* myalerts.js — page « Mes alertes »
   - toggle de thème (même logique que la home)
   - lien magique : lecture du token dans l'URL
   - vue demande de lien / vue gestion avec toggles optimistes */

(function () {
  'use strict';

  /* ---------------- Thème (identique à la home) ---------------- */
  var STORAGE_KEY = 'lba-theme';
  var root = document.documentElement;
  function preferredTheme() {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', preferredTheme());
  window.toggleTheme = function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
  };

  /* ---------------- Utilitaires ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function badgeFor(badge) {
    var b = (badge || 'community').toLowerCase();
    if (b !== 'official' && b !== 'verified' && b !== 'community') b = 'community';
    return '<span class="badge ' + b + '">' + b + '</span>';
  }
  function stateFor(state) {
    if (state === 'active') return '<div class="state active"><span class="dot-live"></span> Active en ce moment</div>';
    return '<div class="state idle"><span class="dot-idle"></span> Rien à signaler</div>';
  }

  var TOKEN = new URLSearchParams(window.location.search).get('token');

  var requestView = document.getElementById('request-view');
  var manageView = document.getElementById('manage-view');
  var loading = document.getElementById('ma-loading');

  function showRequestView(expired) {
    loading.hidden = true;
    manageView.hidden = true;
    requestView.hidden = false;
    document.getElementById('expired-banner').hidden = !expired;
  }

  /* ---------------- Vue demande de lien ---------------- */
  var form = document.getElementById('request-form');
  var reqBtn = document.getElementById('request-btn');
  var reqMsg = document.getElementById('request-msg');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = form.email.value.trim();
    if (!email) return;
    reqBtn.disabled = true;
    var label = reqBtn.textContent;
    reqBtn.textContent = 'Envoi…';
    try {
      var res = await fetch('/api/my-alerts/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
      });
      var data = await res.json().catch(function () { return {}; });
      reqMsg.textContent = res.status === 429
        ? 'Trop de demandes, réessayez dans une minute.'
        : (data.message || "Si cet email est inscrit, un lien d'accès vient de lui être envoyé.");
      reqMsg.hidden = false;
      if (res.status === 200) form.reset();
    } catch (e2) {
      reqMsg.textContent = 'Erreur réseau, réessayez plus tard.';
      reqMsg.hidden = false;
    } finally {
      reqBtn.disabled = false;
      reqBtn.textContent = label;
    }
  });

  /* ---------------- Vue gestion ---------------- */
  function cardHTML(s) {
    var checked = s.subscribed ? ' checked' : '';
    var labelOn = s.subscribed ? ' on' : '';
    var labelText = s.subscribed ? 'Abonné' : 'Non abonné';
    return '' +
      '<div class="card" data-source-id="' + esc(s.id) + '">' +
        '<div class="card-top"><h3>' + esc(s.name) + '</h3>' + badgeFor(s.badge) + '</div>' +
        '<p>' + esc(s.description || '') + '</p>' +
        stateFor(s.state) +
        '<label class="switch-row">' +
          '<span class="switch">' +
            '<input type="checkbox"' + checked + ' aria-label="Basculer l\'abonnement à ' + esc(s.name) + '">' +
            '<span class="track"></span><span class="thumb"></span>' +
          '</span>' +
          '<span class="switch-label' + labelOn + '">' + labelText + '</span>' +
        '</label>' +
      '</div>';
  }

  async function toggleSource(card, input) {
    var sourceId = card.getAttribute('data-source-id');
    var desired = input.checked; // état optimiste déjà appliqué par le navigateur
    var lbl = card.querySelector('.switch-label');

    function paint(on) {
      lbl.textContent = on ? 'Abonné' : 'Non abonné';
      lbl.classList.toggle('on', on);
    }
    paint(desired);
    input.disabled = true;

    try {
      var res = await fetch('/api/my-alerts/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TOKEN, source_id: sourceId, subscribed: desired })
      });
      if (!res.ok) throw new Error('http ' + res.status);
    } catch (e) {
      // rollback : on remet l'état précédent
      input.checked = !desired;
      paint(!desired);
    } finally {
      input.disabled = false;
    }
  }

  async function loadManage() {
    try {
      var res = await fetch('/api/my-alerts?token=' + encodeURIComponent(TOKEN), {
        headers: { Accept: 'application/json' }
      });
      if (res.status === 401) { showRequestView(true); return; }
      if (!res.ok) { showRequestView(false); return; }

      var data = await res.json();
      document.getElementById('ma-email').textContent = data.email || '';
      var grid = document.getElementById('ma-grid');
      grid.innerHTML = (data.sources || []).map(cardHTML).join('');

      grid.addEventListener('change', function (e) {
        var input = e.target.closest('.switch input');
        if (!input) return;
        toggleSource(input.closest('.card'), input);
      });

      loading.hidden = true;
      requestView.hidden = true;
      manageView.hidden = false;
    } catch (e) {
      showRequestView(false);
    }
  }

  /* ---------------- Aiguillage ---------------- */
  if (TOKEN) {
    loadManage();
  } else {
    showRequestView(false);
  }
})();
