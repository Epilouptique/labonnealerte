/* source.js — page de statut d'une source : /source/<id>/statut
   Lit l'id depuis l'URL, appelle /api/sources + /api/sources/:id/history. */

(function () {
  'use strict';

  /* ---- Thème ---- */
  var STORAGE_KEY = 'lba-theme';
  var root = document.documentElement;
  (function () {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    var t = (saved === 'light' || saved === 'dark') ? saved
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    root.setAttribute('data-theme', t);
  })();
  window.toggleTheme = function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // /source/<id>/statut
  var m = window.location.pathname.match(/^\/source\/([^/]+)\/statut/);
  var ID = m ? decodeURIComponent(m[1]) : null;
  var SHARE_URL = 'https://www.labonnealerte.fr/source/' + (ID || '') + '/statut';

  var loading = document.getElementById('src-loading');
  var view = document.getElementById('src-view');
  var errorEl = document.getElementById('src-error');

  function showError(msg) {
    loading.hidden = true;
    view.hidden = true;
    errorEl.textContent = msg || 'Source introuvable.';
    errorEl.hidden = false;
  }

  function badgeFor(badge) {
    var label = { official: 'vérifié', verified: 'vérifié', community: 'communauté' };
    var b = (badge || 'community').toLowerCase();
    if (b !== 'official' && b !== 'verified' && b !== 'community') b = 'community';
    return '<span class="badge ' + b + '">' + label[b] + '</span>';
  }

  var UPTIME_LABEL = { calm: 'Calme', active: 'Alerte active', failed: 'Incident de surveillance', nodata: 'Pas de données' };

  function renderUptime(days) {
    var el = document.getElementById('uptime');
    el.innerHTML = days.map(function (d) {
      return '<span class="uptime-bar u-' + d.status + '" title="' + esc(d.date) + ' · ' + esc(UPTIME_LABEL[d.status] || d.status) + '"></span>';
    }).join('');
  }

  /* ---- Abonnement (switch) ---- */
  var source = null, subscribed = false, connected = false, token = null;

  function renderAction() {
    var el = document.getElementById('src-action');
    if (source.type === 'linked') {
      el.innerHTML = '<a class="link-btn" href="' + esc(source.link_url) + '" target="_blank" rel="noopener">Configurer sur le service partenaire →</a>';
      return;
    }
    var on = connected && subscribed;
    el.innerHTML =
      '<label class="switch-row">' +
        '<span class="switch"><input type="checkbox"' + (on ? ' checked' : '') + ' aria-label="Basculer l\'abonnement"><span class="track"></span><span class="thumb"></span></span>' +
        '<span class="switch-label' + (on ? ' on' : '') + '">' + (on ? 'Abonné' : 'Non abonné') + '</span>' +
      '</label>' +
      '<div class="sub-form"><input type="email" placeholder="votre@email.fr" aria-label="Adresse email"><button type="button">OK</button></div>';
  }

  function setLabel(on, text) {
    var lbl = document.querySelector('#src-action .switch-label');
    if (lbl) { lbl.textContent = text || (on ? 'Abonné' : 'Non abonné'); lbl.classList.toggle('on', !!on); }
  }
  function celebrate() {
    var row = document.querySelector('#src-action .switch-row');
    if (row) { row.classList.add('celebrate'); setTimeout(function () { row.classList.remove('celebrate'); }, 700); }
  }

  document.addEventListener('change', function (e) {
    var input = e.target.closest('#src-action .switch input');
    if (!input) return;
    if (connected) {
      var desired = input.checked;
      setLabel(desired);
      input.disabled = true;
      fetch('/api/my-alerts/toggle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, source_id: ID, subscribed: desired })
      }).then(function (r) {
        if (!r.ok) throw new Error('http');
        subscribed = desired;
        if (desired) celebrate();
      }).catch(function () { input.checked = !desired; setLabel(!desired); })
        .finally(function () { input.disabled = false; });
    } else {
      // anonyme : révèle le formulaire email
      var row = document.querySelector('#src-action .switch-row');
      var form = document.querySelector('#src-action .sub-form');
      if (input.checked) {
        if (row) row.classList.add('pending'); setLabel(false, 'En attente…');
        if (form) { form.style.display = 'flex'; var i = form.querySelector('input'); if (i) i.focus(); }
      } else {
        if (row) row.classList.remove('pending'); setLabel(false, 'Non abonné');
        if (form) form.style.display = 'none';
      }
    }
  });

  document.addEventListener('click', function (e) {
    var ok = e.target.closest('#src-action .sub-form button');
    if (!ok) return;
    var form = ok.closest('.sub-form');
    var input = form.querySelector('input');
    var email = input ? input.value.trim() : '';
    if (!EMAIL_RE.test(email)) { if (input) { input.focus(); input.style.borderColor = 'var(--amber)'; } return; }
    ok.disabled = true;
    fetch('/api/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, source_id: ID })
    }).then(function (r) {
      var row = document.querySelector('#src-action .switch-row');
      if (r.status === 200 || r.status === 409) {
        if (row) row.classList.remove('pending');
        var chk = document.querySelector('#src-action .switch input'); if (chk) chk.checked = true;
        setLabel(true, r.status === 409 ? 'Déjà inscrit' : 'Abonné'); celebrate();
        form.style.display = 'none';
      } else {
        if (row) row.classList.remove('pending');
        var c2 = document.querySelector('#src-action .switch input'); if (c2) c2.checked = false;
        setLabel(false, 'Réessaie plus tard');
      }
    }).catch(function () { setLabel(false, 'Réessaie plus tard'); })
      .finally(function () { ok.disabled = false; });
  });

  /* ---- Partage ---- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('#src-share');
    if (!btn) return;
    var data = { title: source ? source.name : 'La Bonne Alerte', text: source ? (source.subtitle || source.description || '') : '', url: SHARE_URL };
    if (navigator.share) {
      navigator.share(data).catch(function () {});
    } else {
      var done = function () {
        var lbl = btn.querySelector('.share-label');
        if (lbl) { var old = lbl.textContent; lbl.textContent = 'Lien copié ✓'; setTimeout(function () { lbl.textContent = old; }, 1500); }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(SHARE_URL).then(done, done);
      else done();
    }
  });

  /* ---- Chargement ---- */
  async function load() {
    if (!ID) return showError('Source introuvable.');
    try {
      var sres = await fetch('/api/sources', { headers: { Accept: 'application/json' } });
      var list = sres.ok ? await sres.json() : [];
      source = (list || []).filter(function (s) { return s.id === ID; })[0];
      if (!source) return showError('Cette source n\'existe pas ou n\'est plus disponible.');

      // Session : mode connecté ?
      try { token = localStorage.getItem('lba-token'); } catch (e) {}
      if (token) {
        var mr = await LBASession.fetchAlerts(token);
        if (mr.ok && mr.data) {
          connected = true;
          var mine = (mr.data.sources || []).filter(function (s) { return s.id === ID; })[0];
          subscribed = !!(mine && mine.subscribed);
        } else if (mr.status === 401) { LBASession.clear(); }
      }

      document.getElementById('src-name').textContent = source.name;
      document.getElementById('src-badge').innerHTML = badgeFor(source.badge);
      var subEl = document.getElementById('src-subtitle');
      if (source.subtitle) subEl.textContent = source.subtitle; else subEl.hidden = true;
      document.getElementById('src-desc').textContent = source.description || '';

      var stEl = document.getElementById('src-state');
      if (source.type === 'linked') { stEl.className = 'state partner'; stEl.innerHTML = '<span class="dot-idle"></span> Service partenaire'; }
      else if (source.state === 'active') { stEl.className = 'state active'; stEl.innerHTML = '<span class="dot-live"></span> Active en ce moment'; }
      else { stEl.className = 'state idle'; stEl.innerHTML = '<span class="dot-idle"></span> Rien à signaler'; }

      if (source.subscriber_count >= 10) {
        var cEl = document.getElementById('src-count');
        cEl.textContent = source.subscriber_count + ' abonnés';
        cEl.hidden = false;
      }

      renderAction();

      loading.hidden = true;
      view.hidden = false;

      // Historique
      var hres = await fetch('/api/sources/' + encodeURIComponent(ID) + '/history', { headers: { Accept: 'application/json' } });
      if (hres.ok) {
        var hist = await hres.json();
        renderUptime(hist.days || []);
        LBATimeline.render(document.getElementById('timeline'), hist.events || []);
      }
    } catch (e) {
      showError('Impossible de charger le statut de cette source.');
    }
  }

  load();
})();
