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
  var themeDeg = 0;
  window.toggleTheme = function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    // Volet I : petite rotation rotateY du bouton (sauf reduced-motion).
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var btn = document.querySelector('.theme-btn');
    if (btn && !reduce) { themeDeg += 180; btn.style.transform = 'rotateY(' + themeDeg + 'deg)'; }
  };
  // Liaison du bouton (plus d'onclick inline — CSP script-src 'self').
  (function () { var tb = document.querySelector('.theme-btn'); if (tb) tb.addEventListener('click', window.toggleTheme); })();

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

  // Partage d'une carte — retourne la carte vers sa face « Partager » (3e face).
  document.addEventListener('click', function (e) {
    var sb = e.target.closest('.card-share');
    if (!sb) return;
    e.preventDefault(); e.stopPropagation();
    var card = sb.closest('.card');
    if (!card) return;
    var id = card.getAttribute('data-source-id');
    var h3 = card.querySelector('h3');
    var name = h3 ? h3.textContent : 'La Bonne Alerte';
    var url = 'https://www.labonnealerte.fr/source/' + id + '/statut';
    var faceGrid = card.querySelector('.share-face-grid');
    if (faceGrid && window.LBAShare && !faceGrid.dataset.filled) {
      faceGrid.innerHTML = LBAShare.optionsHTML(name, url);
      LBAShare.bindCopy(faceGrid, url);
      faceGrid.dataset.filled = '1';
    }
    card.classList.add('flipped', 'face-share');
  });

  // Ignorer la recommandation → la carte perd son habillage et reprend sa
  // position normale (FLIP) ; la reco ne réapparaît plus de la session.
  document.addEventListener('click', function (e) {
    var x = e.target.closest('.reco-x');
    if (!x) return;
    e.preventDefault(); e.stopPropagation();
    var card = x.closest('.card.card-reco');
    if (!card) return;
    try { sessionStorage.setItem('lba-reco-dismissed', '1'); } catch (e2) {}
    undressReco(card);
  });

  // Sélectionne la meilleure source à recommander (connecté, sources non suivies).
  function pickReco(sources, subMap) {
    try { if (sessionStorage.getItem('lba-reco-dismissed')) return null; } catch (e) {}
    var followedCats = {};
    sources.forEach(function (s) {
      if (subMap[s.id]) (s.categories || []).forEach(function (c) { followedCats[c] = true; });
    });
    var candidates = sources.filter(function (s) { return s.type !== 'linked' && !subMap[s.id]; });
    if (!candidates.length) return null;
    var maxSub = 0;
    candidates.forEach(function (s) { maxSub = Math.max(maxSub, s.subscriber_count || 0); });
    var now = Date.now();
    candidates.forEach(function (s) {
      var common = (s.categories || []).filter(function (c) { return followedCats[c]; }).length;
      var recent = (s.last_activated_at && (now - new Date(s.last_activated_at).getTime()) < 30 * 86400000) ? 1 : 0;
      var pop = maxSub > 0 ? (s.subscriber_count || 0) / maxSub : 0;
      s._score = 3 * common + 2 * recent + 1 * pop;
    });
    candidates.sort(function (a, b) { return b._score - a._score || (b.subscriber_count || 0) - (a.subscriber_count || 0); });
    return candidates[0];
  }

  // Rebuild du tableau `cards` depuis le DOM (après un déplacement de carte).
  function refreshCards() {
    if (grid) cards = Array.prototype.slice.call(grid.querySelectorAll('.card[data-cats]'));
  }

  // Habille une carte existante en « recommandée » (étiquette + classe).
  function dressReco(card) {
    if (!card) return;
    card.classList.add('card-reco');
    if (!card.querySelector('.reco-label')) {
      card.insertAdjacentHTML('afterbegin',
        '<span class="reco-label">Recommandée pour vous ' +
        '<button type="button" class="reco-x" aria-label="Ignorer la recommandation">×</button></span>');
    }
  }

  // Réinsère une carte à sa place d'origine (ordre source, via data-order).
  function placeByOrder(card) {
    if (!grid) return;
    var extras = document.getElementById('static-extras');
    var order = +card.dataset.order || 0;
    var sibs = grid.querySelectorAll('.card[data-cats]');
    var ref = null;
    for (var i = 0; i < sibs.length; i++) {
      if (sibs[i] === card) continue;
      if ((+sibs[i].dataset.order || 0) > order) { ref = sibs[i]; break; }
    }
    grid.insertBefore(card, ref || extras || null);
  }

  // Retire l'habillage reco et rend la carte à sa position normale (avec FLIP).
  function undressReco(card) {
    if (!card || !card.classList.contains('card-reco')) return;
    apply(true, function () {
      card.classList.remove('card-reco');
      var label = card.querySelector('.reco-label');
      if (label) label.remove();
      placeByOrder(card);
      refreshCards();
    });
  }

  // Connecté : la source recommandée n'est PAS dupliquée — sa carte unique est
  // habillée et déplacée en dernière position de la grille.
  function applyReco(reco) {
    // Appelé AVANT setupKiosk : la variable module `grid` n'est pas encore
    // affectée → on résout l'élément directement.
    var gg = grid || document.getElementById('grid');
    if (!reco || !gg) return;
    var sel = (window.CSS && CSS.escape) ? CSS.escape(reco.id) : reco.id;
    var card = gg.querySelector('.card[data-source-id="' + sel + '"]');
    if (!card) return;
    var extras = document.getElementById('static-extras');
    dressReco(card);
    gg.insertBefore(card, extras || null); // dernière position (avant Proposer masquée)
  }

  // Flip recto ⇄ verso-info ⇄ verso-partage. flip-back ramène toujours au recto.
  document.addEventListener('click', function (e) {
    var flip = e.target.closest('.flip-btn');
    if (flip) {
      e.preventDefault(); e.stopPropagation();
      var c = flip.closest('.card'); if (c) { c.classList.remove('face-share'); c.classList.add('flipped'); }
      return;
    }
    var back = e.target.closest('.flip-back');
    if (back) {
      e.preventDefault(); e.stopPropagation();
      var c2 = back.closest('.card');
      if (c2) {
        var wasShare = c2.classList.contains('face-share');
        c2.classList.remove('flipped');
        // Garde la face partage cachant l'info pendant la rotation de retour (anti-flicker).
        if (wasShare) setTimeout(function () { c2.classList.remove('face-share'); }, REDUCE ? 0 : 520);
      }
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
      // Succès : on met à jour l'appartenance interne + tout ce qui en dépend.
      card.dataset.subscribed = desired ? '1' : '0';
      refreshMineDependent();
      if (desired) {
        celebrate(card); // célébration seulement à l'abonnement
        // Carte recommandée adoptée : après la célébration, on retire l'habillage
        // et elle reprend sa place normale (une autre reco pourra apparaître au
        // prochain chargement, pas immédiatement).
        if (card.classList.contains('card-reco')) {
          setTimeout(function () { undressReco(card); }, 800);
        }
      }
    } catch (e) {
      input.checked = !desired; // rollback du switch
      setLabel(card, !desired ? 'Abonné' : 'Non abonné', !desired);
      // data-subscribed n'est modifié qu'en cas de succès : rien à annuler ici,
      // on resynchronise par sûreté (compteur/KPI/état interne cohérents).
      card.dataset.subscribed = card.dataset.subscribed === '1' ? '1' : '0';
      refreshMineDependent();
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

  // KPI personnalisé (connecté) : alertes actives PARMI les abonnements.
  function updateKPIMine(n) {
    var dot = document.getElementById('kpi-dot');
    var txt = document.getElementById('kpi-text');
    if (!dot || !txt) return;
    dot.className = n > 0 ? 'dot-live' : 'dot-idle';
    txt.textContent = n === 0
      ? "Aucune de vos alertes n'est active — tout est calme"
      : (n === 1 ? '1 de vos alertes est active en ce moment' : n + ' de vos alertes sont actives en ce moment');
  }

  // Une carte est-elle « active » (source déclenchée) ? (état rendu dans .state)
  function cardIsActive(c) {
    var st = c.querySelector('.state');
    return !!(st && st.classList.contains('active'));
  }

  // Recalcule tout ce qui dépend de la liste des abonnements, sans rechargement :
  // compteur du chip « Mes alertes », KPI perso, et re-filtrage si « mine » actif.
  function refreshMineDependent() {
    var mineCount = cards.filter(function (c) { return c.dataset.subscribed === '1'; }).length;
    var mineChipN = document.querySelector('.chip-f[data-cat="mine"] .n');
    if (mineChipN) mineChipN.textContent = mineCount;

    var mineActive = cards.filter(function (c) {
      return c.dataset.subscribed === '1' && cardIsActive(c);
    }).length;
    updateKPIMine(mineActive);

    // Sur le filtre « Mes alertes », la carte désabonnée doit sortir (FLIP).
    if (cat === 'mine') apply(true);
  }

  /* ---------------- Kiosque : recherche + catégories + pagination ---------------- */
  var esc = LBACards.esc;
  // Seuil de pagination par défaut : anonyme 6 (+ carte Proposer), connecté 8
  // cartes normales (+ la carte recommandée épinglée en 9e = 9 visibles).
  var INITIAL_ANON = 6, INITIAL_CONNECTED = 8, STEP = 9;
  var cat = 'all', visibleLimit = INITIAL_ANON, secondaryOpen = false, currentMode = 'anon';
  function initialLimit() { return currentMode === 'connected' ? INITIAL_CONNECTED : INITIAL_ANON; }
  var cards = [], moreBtn = null, qInput = null, grid = null, addCard = null;
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
    // La 2e ligne est fermée par défaut (CSS max-height:0), ouverte via .open.
    // Elle est rendue HORS de .toolbar pour ne pas décaler la barre de recherche (I).
    secondaryOpen = false;
    chipsEl.innerHTML = '<div class="chips-row" id="chips-primary">' + prim + '</div>';
    var secWrap = document.getElementById('chips-secondary-wrap');
    if (secWrap) secWrap.innerHTML = secondary.length
      ? '<div class="chips-row chips-more" id="chips-secondary">' + sec + '</div>' : '';
  }

  function computeShow() {
    var q = (qInput.value || '').trim().toLowerCase();
    var searching = q.length > 0 || cat !== 'all';
    var idx = 0, hiddenMore = 0;
    cards.forEach(function (c) {
      var elig = matches(c, q);
      var isReco = c.classList.contains('card-reco');
      var show;
      if (!elig) show = false;
      else if (searching) show = true;      // sous filtre/recherche : comme les autres cartes
      else if (isReco) show = true;         // vue par défaut : épinglée, ne consomme pas de créneau
      else { show = idx < visibleLimit; if (!show) hiddenMore++; idx++; }
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

  // Cartes participant au placement : cartes filtrables affichées + carte « Proposer » (G).
  function positionedShown() {
    var list = cards.filter(isShown);
    if (addCard) list.push(addCard);
    return list;
  }

  // Empty-state du filtre « mine » (aucune alerte suivie).
  function updateMineEmpty() {
    var el = document.getElementById('mine-empty');
    if (!el || !grid) return;
    var anyElig = cards.some(function (c) { return c._elig; });
    var show = (cat === 'mine') && !anyElig;
    el.hidden = !show;
    grid.style.display = show ? 'none' : '';
  }

  // Volet E : anime la hauteur du conteneur pour éviter tout saut de la section suivante.
  function animateGridHeight(fromH) {
    if (!grid) return;
    var toH = grid.offsetHeight;
    if (Math.abs(toH - fromH) < 2) return;
    grid.style.height = fromH + 'px';
    grid.getBoundingClientRect();
    grid.style.transition = 'height .3s ease-out';
    grid.style.height = toH + 'px';
    var clr = function () { grid.style.transition = ''; grid.style.height = ''; grid.removeEventListener('transitionend', clr); };
    grid.addEventListener('transitionend', clr);
  }

  // Volet F/G/A : movers glissent (FLIP) ; la carte Proposer anime aussi sa HAUTEUR
  // (mesurée, car height:auto issu du stretch n'est pas transitionnable) dans les deux sens.
  function flipMoves(first, fromAddH) {
    if (!grid.offsetHeight) return;
    var movers = positionedShown();
    var enterIdx = 0;
    movers.forEach(function (c, i) {
      var isAdd = (c === addCard);
      var f = first.get(c);
      var last = c.getBoundingClientRect();
      if (f) {
        var dx = f.left - last.left, dy = f.top - last.top;
        var dh = isAdd ? Math.abs(last.height - fromAddH) : 0;
        if (dx || dy || dh > 2) {
          c.style.transition = 'none';
          c.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
          if (isAdd && dh > 2) c.style.height = fromAddH + 'px';
          c.getBoundingClientRect();
          requestAnimationFrame(function () {
            c.style.transition = (isAdd && dh > 2) ? 'transform .3s ease-out, height .3s ease-out' : 'transform .3s ease-out';
            c.style.transform = '';
            if (isAdd && dh > 2) c.style.height = last.height + 'px';
          });
          (function (card) {
            var clr = function (ev) {
              if (ev && ev.propertyName && ev.propertyName !== 'transform' && ev.propertyName !== 'height') return;
              card.style.transition = ''; card.style.transform = ''; card.style.height = '';
              card.removeEventListener('transitionend', clr);
            };
            card.addEventListener('transitionend', clr);
          })(c);
        }
      } else {
        var dir = (i % 2 === 0) ? 1 : -1;
        var delay = enterIdx * 30; enterIdx++;
        c.style.transition = 'none';
        c.style.transform = 'translateX(' + (24 * dir) + 'px) scale(.97)';
        c.style.opacity = '0';
        c.getBoundingClientRect();
        requestAnimationFrame(function () {
          c.style.transition = 'transform .28s ease-out ' + delay + 'ms, opacity .28s ease-out ' + delay + 'ms';
          c.style.transform = ''; c.style.opacity = '';
        });
        (function (card) {
          var clr = function () { card.style.transition = ''; card.style.transform = ''; card.style.opacity = ''; card.removeEventListener('transitionend', clr); };
          card.addEventListener('transitionend', clr);
        })(c);
      }
    });
  }

  function apply(animate, mutate) {
    if (!grid || !qInput) return;
    var doAnim = animate && !REDUCE;
    var beforeVisible = cards.filter(isShown);
    var first = doAnim ? snapshot(positionedShown()) : null;
    var fromH = grid.offsetHeight;
    var fromAddH = (doAnim && addCard) ? addCard.getBoundingClientRect().height : 0;
    // Mutation DOM éventuelle (ré-ordonnancement) APRÈS le snapshot → animée par FLIP.
    if (mutate) mutate();
    var info = computeShow();
    var leaving = doAnim ? beforeVisible.filter(function (c) { return !c._show; }) : [];

    function commit() {
      setClasses();
      updateMore(info);
      updateMineEmpty();
      if (doAnim) { flipMoves(first, fromAddH); animateGridHeight(fromH); }
    }

    if (doAnim && leaving.length) {
      // Sortie : déplacement latéral inverse + fade, puis retrait effectif.
      leaving.forEach(function (c, i) {
        var dir = (i % 2 === 0) ? -1 : 1;
        c.style.transition = 'transform .2s ease, opacity .2s ease';
        c.style.transform = 'translateX(' + (24 * dir) + 'px) scale(.97)';
        c.style.opacity = '0';
      });
      setTimeout(function () {
        leaving.forEach(function (c) { c.style.transition = ''; c.style.transform = ''; c.style.opacity = ''; });
        commit();
      }, 210);
    } else {
      commit();
    }
  }

  function selectChip(slug) {
    cat = slug;
    visibleLimit = initialLimit();
    document.querySelectorAll('.chip-f').forEach(function (x) {
      if (!x.classList.contains('chip-more-toggle')) x.classList.remove('on');
    });
    var active = document.querySelector('.chip-f[data-cat="' + slug + '"]');
    if (active) {
      active.classList.add('on');
      if (active.closest('#chips-secondary')) {
        var sec = document.getElementById('chips-secondary');
        var tgl = document.querySelector('.chip-more-toggle');
        if (sec) { setSecOpen(sec, true); secondaryOpen = true; if (tgl) { tgl.textContent = '−'; tgl.classList.add('on'); } }
      }
    }
    apply(true);
  }

  // Ouverture/fermeture fluide de la 2e ligne de catégories : on anime la
  // max-height depuis la hauteur RÉELLE du contenu (scrollHeight) et non depuis
  // une valeur fixe — sinon la fin du repli se fait d'un coup (effet saccadé).
  function setSecOpen(sec, open) {
    if (open) {
      sec.classList.add('open');
      sec.style.maxHeight = sec.scrollHeight + 'px';
    } else {
      // Fige la hauteur courante, force un reflow, puis anime vers 0.
      sec.style.maxHeight = sec.scrollHeight + 'px';
      void sec.offsetHeight;
      sec.classList.remove('open');
      sec.style.maxHeight = '0px';
    }
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
    addCard = grid.querySelector('.card.add:not(.reco-hidden)'); // Proposer masquée en mode connecté
    visibleLimit = initialLimit(); // 6 (anon) ou 8 (connecté, + reco épinglée)
    renderChips(mode);

    var meb = document.getElementById('mine-empty-btn');
    if (meb) meb.addEventListener('click', function () { if (qInput) qInput.value = ''; selectChip('all'); });

    var searchTimer = null;
    qInput.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { apply(true); }, 120);
    });

    function onChipClick(e) {
      var toggle = e.target.closest('.chip-more-toggle');
      if (toggle) {
        var sec = document.getElementById('chips-secondary');
        if (sec) { secondaryOpen = !secondaryOpen; setSecOpen(sec, secondaryOpen); toggle.textContent = secondaryOpen ? '−' : '+'; toggle.classList.toggle('on', secondaryOpen); }
        return;
      }
      var b = e.target.closest('.chip-f');
      if (!b || b.classList.contains('chip-more-toggle')) return;
      selectChip(b.dataset.cat);
    }
    document.getElementById('chips').addEventListener('click', onChipClick);
    var secWrap = document.getElementById('chips-secondary-wrap');
    if (secWrap) secWrap.addEventListener('click', onChipClick);

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

  /* ---------------- Bloc stats marketing (A) ---------------- */
  function fmtFR(n) { return Number(n).toLocaleString('fr-FR'); } // espace fine insécable

  // Compte chaque grand chiffre de 0 à sa valeur (ease-out ~1,2s) ; le « 0 » ne
  // compte pas mais fait un pop quand les autres finissent. Une seule fois.
  function animateCounts() {
    var tile = document.getElementById('stats-tile');
    if (!tile) return;
    var counters = Array.prototype.slice.call(tile.querySelectorAll('.stat-count'));
    var zero = tile.querySelector('.stat-spam .zero');
    if (REDUCE) {
      counters.forEach(function (el) { el.textContent = fmtFR(el.dataset.target || 0); });
      return; // pas de comptage ni de pop
    }
    var DUR = 1200, start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / DUR);
      var e = 1 - Math.pow(1 - t, 3); // ease-out cubic (décélère en approchant)
      counters.forEach(function (el) {
        el.textContent = fmtFR(Math.round((Number(el.dataset.target) || 0) * e));
      });
      if (t < 1) requestAnimationFrame(frame);
      else {
        counters.forEach(function (el) { el.textContent = fmtFR(el.dataset.target || 0); });
        if (zero) zero.classList.add('pop'); // petit pop final du « 0 »
      }
    }
    requestAnimationFrame(frame);
  }

  function setupStatsCounter() {
    var tile = document.getElementById('stats-tile');
    if (!tile) return;
    if (!('IntersectionObserver' in window)) { animateCounts(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { io.disconnect(); animateCounts(); } });
    }, { threshold: 0.35 });
    io.observe(tile);
  }

  async function loadStats() {
    var lines = document.getElementById('stats-lines');
    if (!lines) return;
    try {
      var r = await fetch('/api/stats', { headers: { Accept: 'application/json' } });
      if (!r.ok) return;
      var d = await r.json();
      var checks = Number(d.checks_this_month || 0);
      var alerts = Number(d.alerts_this_month || 0);
      lines.innerHTML =
        '<div class="stat-big stat-count" data-target="' + checks + '">0</div>' +
        '<div class="stat-cap">vérifications effectuées</div>' +
        '<div class="stat-mid"><span class="stat-count" data-target="' + alerts + '">0</span> <span class="stat-cap-inline">alertes déclenchées</span></div>' +
        '<div class="stat-spam"><span class="zero">0</span> <span class="spam-cap">spam, comme promis</span></div>';
      // TODO : quand emails_this_month sera significatif, ajouter ici une ligne
      //        '<div class="stat-mid stat-count" data-target="..."> notifications envoyées</div>' (d.emails_this_month).
      setupStatsCounter();
    } catch (e) { /* silencieux */ }
  }

  /* ---------------- Historique connecté (B) ---------------- */
  async function loadHistory(token) {
    var section = document.getElementById('history-section');
    var devs = document.getElementById('openalert');
    if (!section) return;
    if (devs) devs.hidden = true;      // masque « // pour les développeurs »
    section.hidden = false;            // affiche « // votre historique »
    var tl = document.getElementById('history-timeline');
    var empty = document.getElementById('history-empty');
    try {
      var r = await fetch('/api/my-alerts/history?token=' + encodeURIComponent(token), { headers: { Accept: 'application/json' } });
      var d = r.ok ? await r.json() : { events: [] };
      var events = d.events || [];
      if (events.length === 0) { if (empty) empty.hidden = false; if (tl) tl.innerHTML = ''; }
      else { if (empty) empty.hidden = true; if (window.LBATimeline) LBATimeline.render(tl, events); }
    } catch (e) {
      if (empty) empty.hidden = false;
    }
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
    // Mémorise l'ordre source de chaque carte (pour restaurer sa position après reco).
    g.querySelectorAll('.card[data-cats]').forEach(function (c, i) { c.dataset.order = i; });

    // Connecté : Proposer masquée ; la source recommandée est HABILLÉE (jamais
    // dupliquée) et déplacée en dernière position — une source = une seule carte.
    if (mode === 'connected') {
      if (extras) extras.classList.add('reco-hidden');
      applyReco(pickReco(sources, subMap));
    }

    document.body.setAttribute('data-mode', mode);
    if (mode === 'connected') {
      // D) KPI personnalisé : actives parmi les abonnements.
      var mineActive = sources.filter(function (s) { return subMap[s.id] && s.state === 'active'; }).length;
      updateKPIMine(mineActive);
      // Salutation à la place du h1 : « Bonjour <prénom en accent> ».
      var h1 = document.querySelector('.hero h1');
      if (h1) {
        var nm = LBASession.firstName ? LBASession.firstName(email) : null;
        h1.innerHTML = 'Bonjour' + (nm ? ' <span class="hl-name">' + esc(nm) + '</span>' : '');
      }
    } else {
      updateKPI(sources);
    }
    LBASession.renderHeader(email);
    setupKiosk(mode);
    bindMineLinks();
    bindBrandTop();

    loadStats();
    if (mode === 'connected') loadHistory(token);
  }

  // Volet J : sur la home, le logo remonte en haut sans recharger + reset des filtres.
  function bindBrandTop() {
    var brand = document.querySelector('.brand');
    if (!brand) return;
    brand.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (qInput) qInput.value = '';
      selectChip('all');
    });
  }

  document.addEventListener('DOMContentLoaded', loadHome);
})();
