/* site.js — home LaBonneAlerte
   - toggle de thème (persisté, respecte prefers-color-scheme)
   - accueil à deux modes : anonyme (S'abonner) / connecté (toggles)
   - cartes générées via cards.js depuis GET /api/sources (+ squelettes / erreur)
   - KPI hero dynamique, recherche + catégories + pagination */

(function () {
  'use strict';

  /* ---------------- Thème ---------------- */
  var STORAGE_KEY = 'lba-theme';
  var root = document.documentElement;
  function preferredTheme() {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(preferredTheme());
  function applyTheme(t) { root.setAttribute('data-theme', t); }
  window.toggleTheme = function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
  };

  /* ---------------- Abonnement : switch dans les deux modes ---------------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function rowOf(card) { return card.querySelector('.switch-row'); }
  function inputOf(card) { var s = card.querySelector('.switch input'); return s; }
  function setLabel(card, text, on) {
    var lbl = card.querySelector('.switch-label');
    if (!lbl) return;
    lbl.textContent = text;
    lbl.classList.toggle('on', !!on);
  }
  function note(card, text, kind) {
    var existing = card.querySelector('.sub-msg');
    if (existing) existing.remove();
    if (!text) return;
    var el = document.createElement('div');
    el.className = 'sub-msg ' + (kind || 'ok');
    el.textContent = text;
    card.querySelector('.card-front').appendChild(el);
  }
  // Animation signature : ping vert + illumination verte de la carte.
  function celebrate(card) {
    var row = rowOf(card);
    if (row) row.classList.add('celebrate');
    card.classList.add('celebrate');
    setTimeout(function () {
      if (row) row.classList.remove('celebrate');
      card.classList.remove('celebrate');
    }, 700);
  }

  // Flip recto/verso — stopPropagation pour ne pas déclencher abonnement/toggle.
  document.addEventListener('click', function (e) {
    var flip = e.target.closest('.flip-btn');
    if (flip) {
      e.preventDefault(); e.stopPropagation();
      var c = flip.closest('.card'); if (c) c.classList.add('flipped');
      return;
    }
    var back = e.target.closest('.flip-back');
    if (back) {
      e.preventDefault(); e.stopPropagation();
      var c2 = back.closest('.card'); if (c2) c2.classList.remove('flipped');
      return;
    }
  });

  /* ---- Mode anonyme : switch → « en attente » + formulaire email ---- */
  function startPending(card) {
    cancelAllPending(card);
    var row = rowOf(card);
    if (row) row.classList.add('pending');
    setLabel(card, 'En attente…', false);
    note(card, '', '');
    card.classList.add('open');
    var inp = card.querySelector('.sub-form input');
    if (inp) { inp.style.borderColor = ''; inp.focus(); }
  }
  function cancelPending(card) {
    var row = rowOf(card);
    if (row) row.classList.remove('pending');
    var input = inputOf(card);
    if (input) input.checked = false;
    setLabel(card, 'Non abonné', false);
    card.classList.remove('open');
    note(card, '', '');
  }
  function cancelAllPending(except) {
    document.querySelectorAll('.switch-row.pending').forEach(function (r) {
      var c = r.closest('.card');
      if (c && c !== except) cancelPending(c);
    });
  }
  async function submitAnon(card) {
    var input = card.querySelector('.sub-form input');
    var email = input ? input.value.trim() : '';
    if (!EMAIL_RE.test(email)) { if (input) { input.focus(); input.style.borderColor = 'var(--amber)'; } return; }
    var sourceId = card.getAttribute('data-source-id') || undefined;
    var okBtn = card.querySelector('.sub-form button');
    if (okBtn) okBtn.disabled = true;
    try {
      var res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sourceId ? { email: email, source_id: sourceId } : { email: email })
      });
      if (res.status === 200 || res.status === 409) {
        var row = rowOf(card); if (row) row.classList.remove('pending');
        var chk = inputOf(card); if (chk) chk.checked = true;
        setLabel(card, 'Abonné', true);
        card.classList.remove('open');
        celebrate(card);
        note(card, res.status === 409 ? 'Déjà inscrit ✓' : 'Vérifie tes emails ✉️', res.status === 409 ? 'dup' : 'ok');
      } else {
        cancelPending(card);
        note(card, 'Réessaie plus tard', 'err');
      }
    } catch (e) {
      cancelPending(card);
      note(card, 'Réessaie plus tard', 'err');
    } finally {
      if (okBtn) okBtn.disabled = false;
    }
  }

  /* ---- Mode connecté : toggle optimiste + rollback ---- */
  async function toggleConnected(card, input) {
    var sourceId = card.getAttribute('data-source-id');
    var desired = input.checked;
    setLabel(card, desired ? 'Abonné' : 'Non abonné', desired);
    input.disabled = true;
    try {
      var res = await fetch('/api/my-alerts/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: LBASession.get(), source_id: sourceId, subscribed: desired })
      });
      if (!res.ok) throw new Error('http ' + res.status);
      if (desired) celebrate(card); // célébration seulement à l'abonnement
    } catch (e) {
      input.checked = !desired; // rollback
      setLabel(card, !desired ? 'Abonné' : 'Non abonné', !desired);
    } finally {
      input.disabled = false;
    }
  }

  // Aiguillage du switch selon le mode de la page.
  document.addEventListener('change', function (e) {
    var input = e.target.closest('.switch input');
    if (!input) return;
    var card = input.closest('.card');
    if (!card) return;
    if (document.body.getAttribute('data-mode') === 'connected') {
      toggleConnected(card, input);
    } else if (input.checked) {
      startPending(card);
    } else {
      cancelPending(card);
    }
  });

  // Soumission du formulaire email (mode anonyme).
  document.addEventListener('click', function (e) {
    var ok = e.target.closest('.sub-form button');
    if (ok) { e.preventDefault(); submitAnon(ok.closest('.card')); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches('.sub-form input')) {
      e.preventDefault();
      submitAnon(e.target.closest('.card'));
    }
    // Entrée sur le switch le bascule (Espace est natif).
    if (e.key === 'Enter' && e.target.matches('.switch input')) {
      e.preventDefault();
      e.target.checked = !e.target.checked;
      e.target.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (e.key === 'Escape') cancelAllPending(null);
  });
  // Clic hors d'une carte « en attente » → annulation.
  document.addEventListener('click', function (e) {
    var pendingRows = document.querySelectorAll('.switch-row.pending');
    if (!pendingRows.length) return;
    pendingRows.forEach(function (r) {
      var c = r.closest('.card');
      if (c && !c.contains(e.target)) cancelPending(c);
    });
  });

  /* ---------------- KPI hero ---------------- */
  function updateKPI(sources) {
    var dot = document.getElementById('kpi-dot');
    var txt = document.getElementById('kpi-text');
    if (!dot || !txt) return;
    var sched = 'vérification toutes les 30 min';
    if (!sources) { // erreur API
      dot.className = 'dot-idle';
      txt.textContent = sched;
      return;
    }
    var n = sources.filter(function (s) { return s.state === 'active'; }).length;
    dot.className = n > 0 ? 'dot-live' : 'dot-idle';
    txt.textContent = n === 0
      ? 'Aucune alerte active — tout est calme · ' + sched
      : (n === 1 ? '1 alerte active en ce moment · ' + sched
                 : n + ' alertes actives en ce moment · ' + sched);
  }

  /* ---------------- Kiosque : recherche + catégories + pagination ---------------- */
  var INITIAL = 6, STEP = 9;
  var cat = 'all', expanded = false;
  var cards = [], moreBtn = null, qInput = null, grid = null;

  function catsOf(c) { return (c.dataset.cats || '').split(' ').filter(Boolean); }

  // Reconstruit les puces à partir des catégories réellement présentes.
  function renderChips(sources) {
    var chipsEl = document.getElementById('chips');
    if (!chipsEl) return;
    var present = {};
    sources.forEach(function (s) { (s.categories || []).forEach(function (c) { present[c] = true; }); });
    var labels = LBACards.CATEGORY_LABELS, order = LBACards.CATEGORY_ORDER;
    var html = '<button class="chip-f on" type="button" data-cat="all">Toutes <span class="n"></span></button>';
    order.filter(function (c) { return present[c]; }).forEach(function (c) {
      html += '<button class="chip-f" type="button" data-cat="' + c + '">' +
        (labels[c] || c) + ' <span class="n"></span></button>';
    });
    chipsEl.innerHTML = html;
  }

  function updateCounts() {
    var counts = { all: cards.length };
    cards.forEach(function (c) {
      catsOf(c).forEach(function (cat) { counts[cat] = (counts[cat] || 0) + 1; });
    });
    document.querySelectorAll('.chip-f').forEach(function (chip) {
      var span = chip.querySelector('.n');
      var v = counts[chip.dataset.cat];
      if (span) span.textContent = v != null ? v : 0;
    });
  }

  function apply() {
    var q = (qInput.value || '').trim().toLowerCase();
    var searching = q.length > 0 || cat !== 'all';
    var hiddenCount = 0;
    cards.forEach(function (c) {
      var okCat = cat === 'all' || catsOf(c).indexOf(cat) !== -1;
      var okQ = !q || c.textContent.toLowerCase().indexOf(q) !== -1;
      c.classList.toggle('filtered', !(okCat && okQ));
      if (c.classList.contains('hidden-more')) {
        if (searching || expanded) { c.classList.remove('hidden-more'); c.dataset.more = '1'; }
      } else if (c.dataset.more && !searching && !expanded) {
        c.classList.add('hidden-more');
      }
      if (c.classList.contains('hidden-more') && okCat && okQ) hiddenCount++;
    });
    var nSpan = moreBtn.querySelector('.n');
    if (nSpan) nSpan.textContent = '(+' + Math.min(STEP, hiddenCount) + ')';
    moreBtn.style.display = (searching || expanded || hiddenCount === 0) ? 'none' : '';
  }

  function setupKiosk() {
    grid = document.getElementById('grid');
    moreBtn = document.getElementById('moreBtn');
    qInput = document.getElementById('q');
    if (!grid || !moreBtn || !qInput) return;
    cards = Array.prototype.slice.call(grid.querySelectorAll('.card[data-cats]'));
    cards.forEach(function (c, i) { c.classList.toggle('hidden-more', i >= INITIAL); delete c.dataset.more; });
    updateCounts();
    qInput.addEventListener('input', apply);
    document.getElementById('chips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip-f');
      if (!b) return;
      document.querySelectorAll('.chip-f').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      cat = b.dataset.cat;
      apply();
    });
    moreBtn.addEventListener('click', function () {
      var hidden = cards.filter(function (c) { return c.classList.contains('hidden-more'); });
      hidden.slice(0, STEP).forEach(function (c) { c.classList.remove('hidden-more'); c.dataset.more = '1'; });
      if (hidden.length <= STEP) expanded = true;
      apply();
    });
    apply();
  }

  /* ---------------- Chargement de l'accueil ---------------- */
  function removeSkeletons(g) {
    g.querySelectorAll('.card.skeleton').forEach(function (n) { n.remove(); });
  }

  function showGridError(g, extras) {
    removeSkeletons(g);
    var el = document.createElement('div');
    el.className = 'grid-error';
    el.textContent = 'Impossible de charger les alertes, réessayez.';
    if (extras) extras.insertAdjacentElement('beforebegin', el);
    else g.appendChild(el);
  }

  async function loadHome() {
    var g = document.getElementById('grid');
    if (!g) return;
    var extras = document.getElementById('static-extras');

    var sources;
    try {
      var r = await fetch('/api/sources', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('http ' + r.status);
      sources = await r.json();
      if (!Array.isArray(sources)) throw new Error('format');
    } catch (e) {
      showGridError(g, extras);
      updateKPI(null);
      setupKiosk();
      return;
    }

    // Session : mode connecté si token valide.
    var mode = 'anon', subMap = {}, email = null;
    var token = LBASession.get();
    if (token) {
      try {
        var s = await LBASession.fetchAlerts(token);
        if (s.status === 401) {
          LBASession.clear();
        } else if (s.ok && s.data) {
          mode = 'connected';
          email = s.data.email;
          (s.data.sources || []).forEach(function (x) { subMap[x.id] = x.subscribed; });
        }
      } catch (e) { /* réseau : on reste anonyme */ }
    }

    // L'ordre vient du serveur (display_order ASC, name ASC) — on le respecte.
    var html = sources.map(function (sc) {
      if (mode === 'connected') sc.subscribed = !!subMap[sc.id];
      return LBACards.cardHTML(sc, mode);
    }).join('');

    removeSkeletons(g);
    if (extras) extras.insertAdjacentHTML('beforebegin', html);

    document.body.setAttribute('data-mode', mode);
    updateKPI(sources);
    renderChips(sources);
    LBASession.renderHeader(email);
    setupKiosk();
  }

  document.addEventListener('DOMContentLoaded', loadHome);
})();
