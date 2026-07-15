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
  // Liaison du bouton (plus d'onclick inline — CSP script-src 'self').
  document.addEventListener('DOMContentLoaded', function () {
    var tb = document.querySelector('.theme-btn'); if (tb) tb.addEventListener('click', window.toggleTheme);
  });

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

  // Sources paramétrées : valeur courante de la combinaison (query string prioritaire).
  var paramSchema = null, currentDept = null;
  function queryParam(key) {
    var mm = window.location.search.match(new RegExp('[?&]' + key + '=([^&]+)'));
    return mm ? decodeURIComponent(mm[1]) : null;
  }
  function paramKey() { return (paramSchema && paramSchema.key) || 'departement'; }

  var loading = document.getElementById('src-loading');
  var view = document.getElementById('src-view');
  var errorEl = document.getElementById('src-error');

  function showError(msg) {
    loading.hidden = true;
    view.hidden = true;
    errorEl.textContent = msg || 'Source introuvable.';
    errorEl.hidden = false;
  }

  var BADGE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M8.4 12.4l2.3 2.3 4.9-4.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var GITHUB_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.9-1.29 2.74-1.02 2.74-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>';

  // Badge = icône compacte (coche cerclée).
  function badgeFor(badge) {
    var b = (badge || 'community').toLowerCase();
    if (b !== 'official' && b !== 'verified' && b !== 'community') b = 'community';
    var title = (b === 'community') ? 'Source communautaire' : 'Source vérifiée';
    return '<span class="badge-ic ' + b + '" title="' + title + '" role="img" aria-label="' + title + '">' + BADGE_ICON + '</span>';
  }

  var UPTIME_LABEL = { calm: 'Calme', active: 'Alerte active', failed: 'Incident de surveillance', nodata: 'Pas de données' };

  function renderUptime(days) {
    var el = document.getElementById('uptime');
    el.innerHTML = days.map(function (d) {
      return '<span class="uptime-bar u-' + d.status + '" title="' + esc(d.date) + ' · ' + esc(UPTIME_LABEL[d.status] || d.status) + '"></span>';
    }).join('');
  }

  var myInstances = []; // instances paramétrées de l'utilisateur connecté (volet 1)

  function setActiveTab(dep) {
    document.querySelectorAll('#src-action .dept-tab').forEach(function (t) {
      if (!t.classList.contains('dept-other')) t.classList.toggle('on', t.getAttribute('data-dept') === String(dep));
    });
  }
  // Sélectionne une combinaison : met à jour l'URL (SEO/partage), recharge l'historique.
  function selectDept(dep) {
    currentDept = String(dep);
    try { history.replaceState(null, '', '?' + paramKey() + '=' + encodeURIComponent(currentDept)); } catch (e) {}
    setActiveTab(currentDept);
    loadHistory();
  }

  // Historique (broadcast, ou par combinaison si source paramétrée).
  async function loadHistory() {
    var qs = (paramSchema && currentDept) ? ('?' + paramKey() + '=' + encodeURIComponent(currentDept)) : '';
    try {
      var hres = await fetch('/api/sources/' + encodeURIComponent(ID) + '/history' + qs, { headers: { Accept: 'application/json' } });
      if (hres.ok) {
        var hist = await hres.json();
        renderUptime(hist.days || []);
        LBATimeline.render(document.getElementById('timeline'), hist.events || []);
      }
    } catch (e) { /* silencieux */ }
  }

  /* ---- Abonnement (switch) ---- */
  var source = null, subscribed = false, connected = false, token = null;

  function renderAction() {
    var el = document.getElementById('src-action');
    if (source.type === 'linked') {
      el.innerHTML = '<a class="link-btn" href="' + esc(source.link_url) + '" target="_blank" rel="noopener">Configurer sur le service partenaire →</a>';
      return;
    }
    if (paramSchema) {
      var k = paramSchema.key;
      var isEnum = paramSchema.type === 'enum';
      // Sélecteur complet : uniquement pour un enum (on ne peut pas énumérer un string).
      var fullSelect = '';
      if (isEnum) {
        var opts = (paramSchema.values || []).map(function (v) {
          return '<option value="' + esc(v.value) + '"' + (String(v.value) === String(currentDept) ? ' selected' : '') + '>' + esc(v.label) + '</option>';
        }).join('');
        fullSelect = '<div class="dept-other-form"' + (myInstances.length ? ' hidden' : '') + '>' +
          '<label class="param-statut-label">' + esc(paramSchema.label) + ' : ' +
            '<select id="dept-select" class="param-select">' + opts + '</select></label></div>';
      }

      if (myInstances.length) {
        // Connecté & abonné : onglets rapides de SES instances (générique, tout type).
        var labelByVal = {};
        (paramSchema.values || []).forEach(function (v) { labelByVal[String(v.value)] = v.label; });
        var tabs = myInstances.map(function (inst) {
          var val = String(inst.params[k]);
          return '<button type="button" class="dept-tab' + (val === String(currentDept) ? ' on' : '') + '" data-dept="' + esc(val) + '">' +
            esc(inst.label || labelByVal[val] || val) + '</button>';
        }).join('');
        // « autre… » seulement pour un enum (sélection dans une liste fermée).
        var otherChip = isEnum ? '<button type="button" class="dept-tab dept-other">autre ' + esc(paramSchema.label.toLowerCase()) + '…</button>' : '';
        el.innerHTML = '<div class="dept-tabs">' + tabs + otherChip + '</div>' + fullSelect;
      } else if (isEnum) {
        el.innerHTML = fullSelect +
          '<p class="param-statut-hint">Pour être alerté, choisissez votre ' + esc(paramSchema.label.toLowerCase()) + ' sur la <a href="/#alertes">page d\'accueil</a>.</p>';
      } else {
        // String, visiteur non abonné : vue broadcast + renvoi kiosque.
        el.innerHTML = '<p class="param-statut-hint">Suivez votre propre ' + esc(paramSchema.label.toLowerCase()) + ' depuis le <a href="/#alertes">kiosque</a>.</p>';
      }
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

  /* ---- Partage (popover) ---- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('#src-share');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    if (window.LBAShare) LBAShare.open(btn, source ? source.name : 'La Bonne Alerte', SHARE_URL);
  });

  /* ---- Chargement ---- */
  async function load() {
    if (!ID) return showError('Source introuvable.');
    try {
      var sres = await fetch('/api/sources', { headers: { Accept: 'application/json' } });
      var list = sres.ok ? await sres.json() : [];
      source = (list || []).filter(function (s) { return s.id === ID; })[0];
      if (!source) return showError('Cette source n\'existe pas ou n\'est plus disponible.');

      // Source paramétrée ? (schéma exposé par /api/sources)
      paramSchema = (Array.isArray(source.params_schema) && source.params_schema.length) ? source.params_schema[0] : null;
      var visitorDept = null;

      // Session : mode connecté ?
      try { token = localStorage.getItem('lba-token'); } catch (e) {}
      if (token) {
        var mr = await LBASession.fetchAlerts(token);
        if (mr.ok && mr.data) {
          connected = true;
          visitorDept = mr.data.departement || null;
          var mine = (mr.data.sources || []).filter(function (s) { return s.id === ID; })[0];
          subscribed = !!(mine && mine.subscribed);
          myInstances = (mine && Array.isArray(mine.instances)) ? mine.instances : [];
        } else if (mr.status === 401) { LBASession.clear(); }
      }

      // Valeur courante : query string > 1re instance de l'utilisateur > (enum :
      // personnalisation > 05). Pour un type non-enum (string), pas de défaut deviné.
      if (paramSchema) {
        var k = paramSchema.key;
        var firstInstance = myInstances[0] && myInstances[0].params ? myInstances[0].params[k] : null;
        if (paramSchema.type === 'enum') {
          var allowed = (paramSchema.values || []).map(function (v) { return String(v.value); });
          var wanted = queryParam(k) || firstInstance || visitorDept || '05';
          currentDept = allowed.indexOf(String(wanted)) >= 0 ? String(wanted) : (allowed[0] || null);
        } else {
          var w = queryParam(k) || firstInstance || null;
          currentDept = w != null ? String(w) : null;
        }
      }

      document.getElementById('src-name').textContent = source.name;
      document.getElementById('src-badge').innerHTML = badgeFor(source.badge);
      var subEl = document.getElementById('src-subtitle');
      if (source.subtitle) subEl.textContent = source.subtitle; else subEl.hidden = true;

      // Auteur (proposée par @pseudo GitHub).
      if (source.submitted_by_github) {
        var au = document.getElementById('src-author');
        au.innerHTML = 'Proposée par ' + GITHUB_ICON + ' <a href="https://github.com/' +
          esc(source.submitted_by_github) + '" target="_blank" rel="noopener">@' + esc(source.submitted_by_github) + '</a>';
        au.hidden = false;
      }
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

      // Historique (par combinaison si source paramétrée).
      await loadHistory();

      // Navigation par combinaison : onglets d'instances + sélecteur complet.
      if (paramSchema) {
        var actionEl = document.getElementById('src-action');
        actionEl.addEventListener('click', function (e) {
          var other = e.target.closest('.dept-other');
          if (other) {
            var form = actionEl.querySelector('.dept-other-form');
            if (form) form.hidden = false;
            return;
          }
          var tab = e.target.closest('.dept-tab');
          if (tab) selectDept(tab.getAttribute('data-dept'));
        });
        actionEl.addEventListener('change', function (e) {
          var sel = e.target.closest('#dept-select');
          if (sel) selectDept(sel.value);
        });
      }

      // Manifeste OpenAlert live (pas pour les sources liées ni paramétrées).
      if (source.type !== 'linked' && !paramSchema) {
        try {
          var ares = await fetch('/api/sources/' + encodeURIComponent(ID) + '/alert.json', { headers: { Accept: 'application/json' } });
          if (ares.ok) {
            var manifest = await ares.json();
            var pre = document.createElement('pre');
            pre.className = 'code';
            pre.textContent = JSON.stringify(manifest, null, 2);
            document.getElementById('manifest-code').appendChild(pre);
            document.getElementById('manifest-section').hidden = false;
            if (window.LBACopy) LBACopy.attach(pre);
          }
        } catch (e) { /* pas de manifeste */ }
      }
    } catch (e) {
      showError('Impossible de charger le statut de cette source.');
    }
  }

  load();
})();
