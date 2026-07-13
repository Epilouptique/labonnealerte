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
    if (!sources) { dot.className = 'dot-idle'; txt.textContent = ''; return; }
    var n = sources.filter(function (s) { return s.state === 'active'; }).length;
    dot.className = n > 0 ? 'dot-live' : 'dot-idle';
    txt.textContent = n === 0
      ? 'Aucune alerte active — tout est calme'
      : (n === 1 ? '1 alerte active en ce moment' : n + ' alertes actives en ce moment');
  }

  /* ---------------- Kiosque : recherche + catégories + pagination ---------------- */
  var esc = LBACards.esc;
  var INITIAL = 6, STEP = 9;
  var cat = 'all', visibleLimit = INITIAL, secondaryOpen = false, currentMode = 'anon';
  var cards = [], moreBtn = null, qInput = null, grid = null;
  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function catsOf(c) { return (c.dataset.cats || '').split(' ').filter(Boolean); }
  function isShown(c) { return !c.classList.contains('filtered') && !c.classList.contains('hidden-more'); }

  function matches(c, q) {
    var okCat;
    if (cat === 'all') okCat = true;
    else if (cat === 'mine') okCat = c.dataset.subscribed === '1';
    else okCat = catsOf(c).indexOf(cat) !== -1;
    var okQ = !q || (c.dataset.search || '').indexOf(q) !== -1;
    return okCat && okQ;
  }

  // Puces : [Toutes] [Mes alertes si connecté] [3-4 catégories les + peuplées] [+ 2e ligne].
  function renderChips(mode) {
    var chipsEl = document.getElementById('chips');
    if (!chipsEl) return;
    var counts = {};
    cards.forEach(function (c) { catsOf(c).forEach(function (s) { counts[s] = (counts[s] || 0) + 1; }); });
    var slugs = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || LBACat.label(a).localeCompare(LBACat.label(b));
    });
    var primaryN = mode === 'connected' ? 3 : 4;
    var primary = slugs.slice(0, primaryN);
    var secondary = slugs.slice(primaryN, primaryN + 8);
    var mineCount = cards.filter(function (c) { return c.dataset.subscribed === '1'; }).length;

    function chip(slug, label, count) {
      return '<button class="chip-f" type="button" data-cat="' + esc(slug) + '">' +
        esc(label) + ' <span class="n">' + count + '</span></button>';
    }
    var prim = '<button class="chip-f on" type="button" data-cat="all">Toutes <span class="n">' + cards.length + '</span></button>';
    if (mode === 'connected') prim += chip('mine', 'Mes alertes', mineCount);
    primary.forEach(function (s) { prim += chip(s, LBACat.label(s), counts[s]); });
    if (secondary.length) prim += '<button class="chip-f chip-more-toggle" type="button" aria-label="Plus de catégories">+</button>';

    var sec = secondary.map(function (s) { return chip(s, LBACat.label(s), counts[s]); }).join('');
    chipsEl.innerHTML = '<div class="chips-row" id="chips-primary">' + prim + '</div>' +
      (secondary.length ? '<div class="chips-row chips-more" id="chips-secondary" hidden>' + sec + '</div>' : '');
  }

  function computeShow() {
    var q = (qInput.value || '').trim().toLowerCase();
    var searching = q.length > 0 || cat !== 'all';
    var idx = 0, hiddenMore = 0;
    cards.forEach(function (c) {
      var elig = matches(c, q);
      var show;
      if (!elig) show = false;
      else { if (searching) show = true; else { show = idx < visibleLimit; if (!show) hiddenMore++; } idx++; }
      c._elig = elig; c._show = show;
    });
    return { searching: searching, hiddenMore: hiddenMore };
  }
  function setClasses() {
    cards.forEach(function (c) {
      c.classList.toggle('filtered', !c._elig);
      c.classList.toggle('hidden-more', c._elig && !c._show);
    });
  }
  function updateMore(info) {
    if (!moreBtn) return;
    var nSpan = moreBtn.querySelector('.n');
    if (nSpan) nSpan.textContent = '(+' + Math.min(STEP, info.hiddenMore) + ')';
    moreBtn.style.display = (info.searching || info.hiddenMore === 0) ? 'none' : '';
  }
  function snapshot(list) { var m = new Map(); list.forEach(function (c) { m.set(c, c.getBoundingClientRect()); }); return m; }

  // Animation FLIP : les cartes restantes glissent, les nouvelles apparaissent.
  function flipMoves(first) {
    cards.filter(isShown).forEach(function (c) {
      var f = first.get(c);
      var last = c.getBoundingClientRect();
      if (f) {
        var dx = f.left - last.left, dy = f.top - last.top;
        if (dx || dy) {
          c.style.transition = 'none';
          c.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
          c.getBoundingClientRect(); // reflow
          requestAnimationFrame(function () {
            c.style.transition = 'transform .3s ease-out';
            c.style.transform = '';
          });
          var clr = function () { c.style.transition = ''; c.style.transform = ''; c.removeEventListener('transitionend', clr); };
          c.addEventListener('transitionend', clr);
        }
      } else {
        c.classList.add('card-enter');
        c.getBoundingClientRect();
        requestAnimationFrame(function () { c.classList.add('card-enter-active'); });
        setTimeout(function () { c.classList.remove('card-enter', 'card-enter-active'); }, 300);
      }
    });
  }

  function apply(animate) {
    if (!grid || !qInput) return;
    var doAnim = animate && !REDUCE;
    var beforeVisible = cards.filter(isShown);
    var first = doAnim ? snapshot(beforeVisible) : null;
    var info = computeShow();
    var leaving = doAnim ? beforeVisible.filter(function (c) { return !c._show; }) : [];

    if (doAnim && leaving.length) {
      leaving.forEach(function (c) { c.classList.add('card-leave'); });
      setTimeout(function () {
        leaving.forEach(function (c) { c.classList.remove('card-leave'); });
        setClasses(); updateMore(info); flipMoves(first);
      }, 200);
    } else {
      setClasses(); updateMore(info);
      if (doAnim) flipMoves(first);
    }
  }

  function selectChip(slug) {
    cat = slug;
    visibleLimit = INITIAL;
    document.querySelectorAll('.chip-f').forEach(function (x) {
      if (!x.classList.contains('chip-more-toggle')) x.classList.remove('on');
    });
    var active = document.querySelector('.chip-f[data-cat="' + slug + '"]');
    if (active) {
      active.classList.add('on');
      if (active.closest('#chips-secondary')) {
        var sec = document.getElementById('chips-secondary');
        var tgl = document.querySelector('.chip-more-toggle');
        if (sec) { sec.hidden = false; secondaryOpen = true; if (tgl) { tgl.textContent = '−'; tgl.classList.add('on'); } }
      }
    }
    apply(true);
  }

  function scrollToGrid() {
    var main = document.getElementById('alertes');
    if (!main) return;
    var top = main.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.4) main.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setupKiosk(mode) {
    grid = document.getElementById('grid');
    moreBtn = document.getElementById('moreBtn');
    qInput = document.getElementById('q');
    if (!grid || !moreBtn || !qInput) return;
    cards = Array.prototype.slice.call(grid.querySelectorAll('.card[data-cats]'));
    renderChips(mode);

    var searchTimer = null;
    qInput.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { apply(true); }, 120);
    });

    document.getElementById('chips').addEventListener('click', function (e) {
      var toggle = e.target.closest('.chip-more-toggle');
      if (toggle) {
        var sec = document.getElementById('chips-secondary');
        if (sec) { secondaryOpen = !secondaryOpen; sec.hidden = !secondaryOpen; toggle.textContent = secondaryOpen ? '−' : '+'; toggle.classList.toggle('on', secondaryOpen); }
        return;
      }
      var b = e.target.closest('.chip-f');
      if (!b || b.classList.contains('chip-more-toggle')) return;
      selectChip(b.dataset.cat);
    });

    moreBtn.addEventListener('click', function () { visibleLimit += STEP; apply(true); });

    apply(false); // initial : pagination sans animation
  }

  // Tags du verso cliquables → re-flip recto + filtre la catégorie.
  document.addEventListener('click', function (e) {
    var tag = e.target.closest('.back-tag');
    if (!tag) return;
    e.preventDefault(); e.stopPropagation();
    var card = tag.closest('.card'); if (card) card.classList.remove('flipped');
    selectChip(tag.getAttribute('data-cat'));
    scrollToGrid();
  });

  // Lien « Mes alertes » : connecté → filtre sur place ; anonyme → /connexion.
  function bindMineLinks() {
    document.querySelectorAll('.mine-link').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (currentMode === 'connected') {
          e.preventDefault();
          selectChip('mine');
          scrollToGrid();
        }
      });
    });
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

    await LBACat.load(); // labels + recherche par catégorie

    var sources;
    try {
      var r = await fetch('/api/sources', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('http ' + r.status);
      sources = await r.json();
      if (!Array.isArray(sources)) throw new Error('format');
    } catch (e) {
      showGridError(g, extras);
      updateKPI(null);
      return;
    }

    // Session : mode connecté si token valide.
    var mode = 'anon', subMap = {}, email = null;
    var token = LBASession.get();
    if (token) {
      try {
        var s = await LBASession.fetchAlerts(token);
        if (s.status === 401) LBASession.clear();
        else if (s.ok && s.data) {
          mode = 'connected';
          email = s.data.email;
          (s.data.sources || []).forEach(function (x) { subMap[x.id] = x.subscribed; });
        }
      } catch (e) { /* réseau : on reste anonyme */ }
    }
    currentMode = mode;

    var html = sources.map(function (sc) {
      if (mode === 'connected') sc.subscribed = !!subMap[sc.id];
      return LBACards.cardHTML(sc, mode);
    }).join('');

    removeSkeletons(g);
    if (extras) extras.insertAdjacentHTML('beforebegin', html);

    document.body.setAttribute('data-mode', mode);
    updateKPI(sources);
    LBASession.renderHeader(email);
    setupKiosk(mode);
    bindMineLinks();
  }

  document.addEventListener('DOMContentLoaded', loadHome);
})();
