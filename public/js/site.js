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

  // A) Ensemble des recommandations REFUSÉES (par id), persisté le temps de la
  // session (survit à un rechargement dans l'onglet).
  function dismissedSet() {
    try { var a = JSON.parse(sessionStorage.getItem('lba-reco-dismissed') || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function addDismissed(id) {
    try {
      var s = dismissedSet();
      if (s.indexOf(id) === -1) { s.push(id); sessionStorage.setItem('lba-reco-dismissed', JSON.stringify(s)); }
    } catch (e) {}
  }

  // Ignorer la recommandation → elle est refusée (session) et REMPLACÉE sans
  // rechargement par la reco pertinente suivante (ou une carte normale non suivie
  // s'il n'y en a plus), pour ne jamais laisser de trou dans la grille.
  document.addEventListener('click', function (e) {
    var x = e.target.closest('.reco-x');
    if (!x) return;
    e.preventDefault(); e.stopPropagation();
    var card = x.closest('.card.card-reco');
    if (!card) return;
    dismissReco(card);
  });

  // Sélectionne la meilleure source à recommander (connecté, sources non suivies,
  // hors recommandations déjà refusées dans la session).
  function pickReco(sources, subMap) {
    var dismissed = dismissedSet();
    var followedCats = {};
    sources.forEach(function (s) {
      if (subMap[s.id]) (s.categories || []).forEach(function (c) { followedCats[c] = true; });
    });
    var candidates = sources.filter(function (s) {
      if (s.type === 'linked' || subMap[s.id] || dismissed.indexOf(s.id) !== -1) return false;
      // B1) Jamais recommander une source désactivée (bug « vigilance Paris »).
      if (s.enabled === false || s.disabled === true) return false;
      // B2) Source géo « fixe » d'un AUTRE département que le profil : jamais recommandée.
      if (profile.departement) {
        var gd = fixedGeoDept(s);
        if (gd && String(gd) !== String(profile.departement)) return false;
      }
      return true;
    });
    if (!candidates.length) return null;
    var maxSub = 0;
    candidates.forEach(function (s) { maxSub = Math.max(maxSub, s.subscriber_count || 0); });
    var now = Date.now();
    candidates.forEach(function (s) {
      var common = (s.categories || []).filter(function (c) { return followedCats[c]; }).length;
      var recent = (s.last_activated_at && (now - new Date(s.last_activated_at).getTime()) < 30 * 86400000) ? 1 : 0;
      var pop = maxSub > 0 ? (s.subscriber_count || 0) / maxSub : 0;
      // D) Personnalisation : le département (le plus fort) puis les centres d'intérêt
      // passent devant les critères historiques.
      var dept = sourceMatchesDept(s) ? 1 : 0;
      var interest = sourceMatchesInterest(s) ? 1 : 0;
      s._score = 4 * dept + 3 * interest + 3 * common + 2 * recent + 1 * pop;
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

  // État d'abonnement courant, lu depuis le DOM (source de vérité en direct).
  function currentSubMap() {
    var m = {};
    cards.forEach(function (c) { m[c.getAttribute('data-source-id')] = c.dataset.subscribed === '1'; });
    return m;
  }

  // A) Comble l'emplacement libéré par une carte normale NON suivie (épinglée sans
  // habillage reco) : garantit que la grille ne présente jamais de trou en vue par
  // défaut. On préfère une carte actuellement masquée (entrée en fin de grille).
  function fillEmptySlot(excludeId) {
    var subMap = currentSubMap();
    var extras = document.getElementById('static-extras');
    var pick = null;
    for (var i = 0; i < sourcesData.length; i++) {
      var s = sourcesData[i];
      if (s.type === 'linked' || subMap[s.id] || s.id === excludeId) continue;
      var c = cardById(s.id);
      if (!c || c.classList.contains('card-filler') || c.classList.contains('card-reco')) continue;
      if (c.classList.contains('hidden-more')) { pick = c; break; }
      if (!pick) pick = c; // repli : n'importe quelle carte non suivie
    }
    if (pick) { pick.classList.add('card-filler'); grid.insertBefore(pick, extras || null); }
  }

  // A) Fermeture (×) d'une recommandation : elle est refusée, retirée de la grille
  // (retour à sa place naturelle) et REMPLACÉE — reco suivante pertinente si elle
  // existe, sinon une carte normale non suivie — le tout animé (FLIP).
  function dismissReco(card) {
    if (!card || !card.classList.contains('card-reco')) return;
    var id = card.getAttribute('data-source-id');
    addDismissed(id);
    var next = pickReco(sourcesData, currentSubMap());
    apply(true, function () {
      card.classList.remove('card-reco');
      stripRecoLabel(card);
      placeByOrder(card);
      var extras = document.getElementById('static-extras');
      if (next && next.id !== id) {
        var newCard = cardById(next.id);
        if (newCard) { dressReco(newCard); grid.insertBefore(newCard, extras || null); }
      } else {
        fillEmptySlot(id); // plus de reco : on comble pour éviter tout trou
      }
      refreshCards();
    });
  }

  // Retire juste l'étiquette « Recommandée » (la carte reste épinglée en place).
  function stripRecoLabel(card) {
    if (!card) return;
    var label = card.querySelector('.reco-label');
    if (label) label.remove();
  }

  // Résout l'élément carte d'une source par son id (échappement CSS sûr).
  function cardById(id) {
    if (!grid || !id) return null;
    var sel = (window.CSS && CSS.escape) ? CSS.escape(id) : id;
    return grid.querySelector('.card[data-source-id="' + sel + '"]');
  }

  // B) Adoption de la recommandée : l'étiquette part, la carte reste, et une
  // nouvelle recommandation est calculée immédiatement parmi les sources non
  // suivies restantes. Aucun trou, aucun rechargement.
  function adoptReco(card) {
    if (!card || !card.classList.contains('card-reco')) return;
    // État d'abonnement courant, lu depuis le DOM (inclut la carte tout juste adoptée).
    var adoptedId = card.getAttribute('data-source-id');
    var next = pickReco(sourcesData, currentSubMap());

    if (next && next.id !== adoptedId) {
      // Relève disponible : la carte adoptée reprend sa place, la nouvelle reco
      // arrive en fin de grille avec son étiquette — le tout animé (FLIP + apparition).
      apply(true, function () {
        card.classList.remove('card-reco');
        stripRecoLabel(card);
        placeByOrder(card);
        var extras = document.getElementById('static-extras');
        var newCard = cardById(next.id);
        if (newCard) {
          dressReco(newCard);
          grid.insertBefore(newCard, extras || null); // fin de grille (Proposer masquée)
        }
        refreshCards();
      });
    } else {
      // Aucune relève : la carte reste épinglée en place, sans étiquette (grille pleine).
      apply(true, function () {
        stripRecoLabel(card);
        refreshCards();
      });
    }
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
      var payload = sourceId ? { email: email, source_id: sourceId } : { email: email };
      if (card._pendingParams) payload.params = card._pendingParams; // instance paramétrée (anonyme)
      var res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
        // Carte recommandée adoptée : après la célébration, l'étiquette part et une
        // nouvelle recommandation est calculée immédiatement (voir adoptReco).
        if (card.classList.contains('card-reco')) {
          setTimeout(function () { adoptReco(card); }, 800);
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

  /* ---- Abonnement paramétré (OpenAlert v2) : select + instances ---- */
  var escP = LBACards.esc;
  function ensureAddBtn(card) {
    if (card.querySelector('.param-add')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'param-add'; b.textContent = '+ ajouter';
    var form = card.querySelector('.param-form');
    if (form) form.parentNode.insertBefore(b, form);
  }
  function chipsContainer(card) {
    var c = card.querySelector('.param-chips');
    if (!c) {
      c = document.createElement('div'); c.className = 'param-chips';
      var form = card.querySelector('.param-form');
      if (form) form.parentNode.insertBefore(c, form);
    }
    return c;
  }
  function addChip(card, params, label) {
    var c = chipsContainer(card);
    var key = JSON.stringify(params);
    var dup = [].some.call(c.querySelectorAll('.param-chip'), function (ch) { return ch.getAttribute('data-params') === key; });
    if (!dup) {
      var span = document.createElement('span');
      span.className = 'param-chip'; span.setAttribute('data-params', key);
      span.innerHTML = '<span class="pc-dot"></span>' + escP(label) +
        '<button type="button" class="param-remove" aria-label="Se désabonner">✕</button>';
      c.appendChild(span);
    }
    ensureAddBtn(card);
  }
  function togglePicker(card, show) {
    var f = card.querySelector('.param-form'); if (f) f.hidden = !show;
    // Point 7 : « + ajouter » masqué tant que le picker est ouvert (sinon une ligne
    // en trop reste affichée), réaffiché à la fermeture (validation ou annulation).
    var add = card.querySelector('.param-add'); if (add) add.hidden = show;
  }
  // H) Maintient l'indicateur « Abonné / Non abonné » d'une carte paramétrée.
  function setParamStatus(card, on) {
    var l = card.querySelector('.param-status .switch-label');
    if (!l) return;
    l.textContent = on ? 'Abonné' : 'Non abonné';
    l.classList.toggle('on', !!on);
  }

  // Lit le contrôle de saisie (select enum OU input string/number) et valide
  // le format côté client (attribut pattern). Retourne { params, label } ou null.
  function readParam(card) {
    var ctrl = card.querySelector('.param-select, .param-input');
    if (!ctrl) return null;
    var val = ctrl.value;
    if (ctrl.tagName === 'INPUT') {
      val = String(val || '').trim();
      var ok = !!val;
      var pat = ctrl.getAttribute('pattern');
      if (ok && pat) { try { ok = new RegExp(pat, 'i').test(val); } catch (e) { ok = true; } }
      if (!ok) { ctrl.focus(); ctrl.style.borderColor = 'var(--amber)'; return null; }
      ctrl.style.borderColor = '';
    }
    var label = (ctrl.tagName === 'SELECT' && ctrl.options[ctrl.selectedIndex]) ? ctrl.options[ctrl.selectedIndex].text : val;
    var params = {}; params[ctrl.getAttribute('data-key')] = val;
    return { params: params, label: label };
  }

  async function followParamConnected(card) {
    var r = readParam(card); if (!r) return;
    var params = r.params, label = r.label;
    var btn = card.querySelector('.param-follow'); if (btn) btn.disabled = true;
    try {
      var res = await fetch('/api/my-alerts/toggle-param', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: LBASession.get(), source_id: card.getAttribute('data-source-id'), params: params, subscribed: true })
      });
      if (!res.ok) throw new Error('http');
      var data = await res.json();
      addChip(card, data.params || params, data.label || label);
      card.dataset.subscribed = '1';
      setParamStatus(card, true);
      togglePicker(card, false);
      celebrate(card);
      refreshMineDependent();
      // Carte recommandée adoptée : l'étiquette part, une nouvelle reco est calculée.
      if (card.classList.contains('card-reco')) setTimeout(function () { adoptReco(card); }, 800);
    } catch (e) { note(card, 'Réessaie plus tard', 'err'); }
    finally { if (btn) btn.disabled = false; }
  }

  async function removeParam(card, chip) {
    var params;
    try { params = JSON.parse(chip.getAttribute('data-params')); } catch (e) { return; }
    try {
      var res = await fetch('/api/my-alerts/toggle-param', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: LBASession.get(), source_id: card.getAttribute('data-source-id'), params: params, subscribed: false })
      });
      if (!res.ok) throw new Error('http');
      chip.remove();
      var c = card.querySelector('.param-chips');
      if (c && !c.querySelector('.param-chip')) {
        card.dataset.subscribed = '0';
        setParamStatus(card, false);
        var add = card.querySelector('.param-add'); if (add) add.remove();
        togglePicker(card, true);
      }
      refreshMineDependent();
    } catch (e) { /* silencieux */ }
  }

  function followParamAnon(card) {
    var r = readParam(card); if (!r) return;
    card._pendingParams = r.params;
    var sf = card.querySelector('.param-subform');
    if (sf) { sf.style.display = 'flex'; var i = sf.querySelector('input'); if (i) i.focus(); }
  }

  document.addEventListener('click', function (e) {
    var card = e.target.closest('.card'); if (!card) return;
    if (e.target.closest('.param-follow')) {
      e.preventDefault();
      if (document.body.getAttribute('data-mode') === 'connected') followParamConnected(card);
      else followParamAnon(card);
    } else if (e.target.closest('.param-remove')) {
      e.preventDefault();
      removeParam(card, e.target.closest('.param-chip'));
    } else if (e.target.closest('.param-add')) {
      e.preventDefault();
      // Ouvre le picker (et masque « + ajouter » — point 7).
      togglePicker(card, true);
      var ctrl = card.querySelector('.param-select, .param-input');
      if (ctrl) ctrl.focus();
    }
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
  // Met à jour le nombre compact (toujours visible) du compteur d'alertes.
  function setKpiNum(n) {
    var num = document.getElementById('kpi-num');
    if (num) num.textContent = n;
  }
  function updateKPI(sources) {
    var dot = document.getElementById('kpi-dot');
    var txt = document.getElementById('kpi-text');
    if (!dot || !txt) return;
    if (!sources) { dot.className = 'dot-idle'; txt.textContent = ''; setKpiNum(''); return; }
    var n = sources.filter(function (s) { return s.state === 'active'; }).length;
    dot.className = n > 0 ? 'dot-live' : 'dot-idle';
    // F2) Nombre exposé sur le conteneur → forme compacte (icône + X) sur PC étroit.
    if (dot.parentElement) { dot.parentElement.dataset.n = n; dot.parentElement.dataset.active = n > 0; }
    setKpiNum(n);
    var full = n === 0
      ? 'Aucune alerte active — tout est calme'
      : (n === 1 ? '1 alerte active en ce moment' : n + ' alertes actives en ce moment');
    // A11y : le libellé complet (avec le nombre) reste lisible par lecteur d'écran.
    if (dot.parentElement) dot.parentElement.setAttribute('aria-label', full);
    // L'overlay de survol suit le « ● N » compact déjà visible → on retire le nombre
    // en tête pour éviter de l'afficher deux fois.
    txt.textContent = full.replace(/^\d+\s*/, '');
  }

  // KPI personnalisé (connecté) : alertes actives PARMI les abonnements.
  function updateKPIMine(n) {
    var dot = document.getElementById('kpi-dot');
    var txt = document.getElementById('kpi-text');
    if (!dot || !txt) return;
    dot.className = n > 0 ? 'dot-live' : 'dot-idle';
    if (dot.parentElement) { dot.parentElement.dataset.n = n; dot.parentElement.dataset.active = n > 0; }
    setKpiNum(n);
    var full = n === 0
      ? "Aucune de vos alertes n'est active — tout est calme"
      : (n === 1 ? '1 de vos alertes est active en ce moment' : n + ' de vos alertes sont actives en ce moment');
    if (dot.parentElement) dot.parentElement.setAttribute('aria-label', full);
    txt.textContent = full.replace(/^\d+\s*/, '');
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
  var accountEmail = null; // email de la session connectée (pour le panneau compte)
  function initialLimit() { return currentMode === 'connected' ? INITIAL_CONNECTED : INITIAL_ANON; }
  var cards = [], moreBtn = null, qInput = null, grid = null, addCard = null;
  var sourcesData = []; // liste des sources (pour recalculer une recommandation à l'adoption)
  // D) Personnalisation (connecté) : renseignée depuis /api/my-alerts au chargement.
  var profile = { departement: null, interests: [] };
  // Une source est-elle géolocalisée sur le département choisi ? Signal simple et
  // lisible : son id se termine par « -<dept> » (vigilance-meteo-05, vigicrues-05…).
  function sourceMatchesDept(s) {
    if (!profile.departement) return false;
    // 1) source géo « fixe » : son id se termine par « -<dept> » (vigilance-meteo-05…)
    if (new RegExp('-' + profile.departement + '$').test(s.id || '')) return true;
    // 2) B) source PARAMÉTRÉE : une valeur enum de son schéma correspond au département
    //    profil (ex. vigilance météo paramétrée par département) → même boost.
    if (Array.isArray(s.params_schema)) {
      return s.params_schema.some(function (sch) {
        return sch && sch.type === 'enum' && (sch.values || []).some(function (v) {
          return String(v.value) === String(profile.departement);
        });
      });
    }
    return false;
  }
  // B) Une source est-elle géolocalisée « en dur » (id suffixé par un département) ?
  //    Sert à écarter de la reco une source géo d'un AUTRE département que le profil.
  function fixedGeoDept(s) {
    var m = String(s.id || '').match(/-(\d{2,3}|2[ab])$/i);
    return m ? m[1] : null;
  }
  // Une catégorie de la source figure-t-elle dans les centres d'intérêt ?
  function sourceMatchesInterest(s) {
    if (!profile.interests || !profile.interests.length) return false;
    return (s.categories || []).some(function (c) { return profile.interests.indexOf(c) !== -1; });
  }
  function hasPersonalization() {
    return !!profile.departement || (profile.interests && profile.interests.length > 0);
  }
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
    // Mobile (≤720px) : rail horizontal unique — TOUTES les catégories dans la 1re
    // ligne (pas de « + » ni de 2e ligne). Desktop : 7 puces visibles ≥1024px (sinon 5)
    // avant le « + ». Total visible = Toutes [+ Mes alertes] + primary.
    var mobile = !!(window.matchMedia && window.matchMedia('(max-width: 720px)').matches);
    var wide = !!(window.matchMedia && window.matchMedia('(min-width: 1024px)').matches);
    var primaryN = mobile ? slugs.length : (mode === 'connected' ? (wide ? 5 : 3) : (wide ? 6 : 4));
    var primary = slugs.slice(0, primaryN);
    var secondary = mobile ? [] : slugs.slice(primaryN, primaryN + 8);
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
      // Épinglées (ne consomment pas de créneau) : la reco ET la carte de comblement.
      var isReco = c.classList.contains('card-reco') || c.classList.contains('card-filler');
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
    // A) Plus de compteur « (+X) » : le bouton dit simplement « Afficher plus d'alertes ».
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

    // Point 3 : header identique en tout contexte → si le panneau compte est ouvert,
    // toute interaction avec la recherche/les catégories du header revient à la grille.
    function backToGridIfAccount() {
      var panel = document.getElementById('account-panel');
      if (panel && !panel.hidden && window.LBAAccount && LBAAccount.close) LBAAccount.close();
    }

    var searchTimer = null;
    qInput.addEventListener('input', function () {
      backToGridIfAccount();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { apply(true); }, 120);
    });
    // Point 6 : bouton de recherche (déclencheur explicite, la recherche reste
    // instantanée à la frappe). Applique immédiatement le filtre courant.
    var searchGo = document.querySelector('.search .search-go');
    if (searchGo) searchGo.addEventListener('click', function () {
      clearTimeout(searchTimer);
      apply(true);
      qInput.focus();
    });

    function onChipClick(e) {
      backToGridIfAccount();
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
          // C) Si le panneau compte est ouvert, on le ferme d'abord, puis on
          // applique le comportement normal (filtre « mine » + scroll).
          if (window.LBAAccount && window.LBAAccount.close) window.LBAAccount.close();
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

  /* ---------------- Historique connecté (verso du panneau compte) ---------------- */
  async function loadHistory(token) {
    var devs = document.getElementById('openalert');
    if (devs) devs.hidden = true;      // masque « // pour les développeurs » en connecté
    var tl = document.getElementById('history-timeline');
    var empty = document.getElementById('history-empty');
    if (!tl) return;
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
    var mode = 'anon', subMap = {}, mineMap = {}, email = null;
    var token = LBASession.get();
    if (token) {
      try {
        var s = await LBASession.fetchAlerts(token);
        if (s.status === 401) LBASession.clear();
        else if (s.ok && s.data) {
          mode = 'connected';
          email = s.data.email;
          (s.data.sources || []).forEach(function (x) { subMap[x.id] = x.subscribed; mineMap[x.id] = x; });
          profile.departement = s.data.departement || null;
          profile.interests = s.data.interests || [];
        }
      } catch (e) { /* réseau : on reste anonyme */ }
    }
    currentMode = mode;
    // Valeur par défaut du sélecteur paramétré (personnalisation département).
    window.LBADefaults = { departement: profile.departement || null };

    // D) Ordre personnalisé (connecté) : les sources matchant département/intérêts
    // remontent, tri secondaire STABLE sur l'ordre serveur (display_order). Si aucun
    // champ n'est renseigné, l'ordre reste STRICTEMENT celui du serveur.
    if (mode === 'connected' && hasPersonalization()) {
      sources = sources
        .map(function (s, i) {
          var score = (sourceMatchesDept(s) ? 2 : 0) + (sourceMatchesInterest(s) ? 1 : 0);
          return { s: s, i: i, score: score };
        })
        .sort(function (a, b) { return b.score - a.score || a.i - b.i; })
        .map(function (x) { return x.s; });
    }

    sourcesData = sources; // conservé pour recalculer une reco à l'adoption

    var html = sources.map(function (sc) {
      if (mode === 'connected') {
        sc.subscribed = !!subMap[sc.id];
        // Source paramétrée : instances suivies + état (le pire) depuis /my-alerts.
        var mine = mineMap[sc.id];
        if (mine && Array.isArray(sc.params_schema) && sc.params_schema.length) {
          sc.instances = mine.instances || [];
          if (sc.instances.length) sc.state = mine.state;
        }
      }
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
    accountEmail = (mode === 'connected') ? email : null;
    LBASession.renderHeader(email);
    setupKiosk(mode);
    bindMineLinks();
    bindBrandTop();
    if (mode === 'connected') bindAccount();

    loadStats();
    if (mode === 'connected') loadHistory(token);
  }

  /* ---------------- Panneau « Mon compte » ---------------- */
  // En-tête du recto : prénom déduit (même logique que le hero) + email complet.
  function fillAccountHeader() {
    var nameEl = document.getElementById('acct-name');
    var emailEl = document.getElementById('acct-email');
    var nm = (LBASession.firstName && accountEmail) ? LBASession.firstName(accountEmail) : null;
    if (nameEl) nameEl.textContent = nm ? 'Bonjour ' + nm : 'Mon compte';
    if (emailEl) emailEl.textContent = accountEmail || '';
  }

  // Échange animé (fondu) entre deux blocs plein-largeur.
  function swap(hideEl, showEl) {
    if (REDUCE) { hideEl.hidden = true; showEl.hidden = false; return; }
    hideEl.style.transition = 'opacity .18s ease';
    hideEl.style.opacity = '0';
    setTimeout(function () {
      hideEl.hidden = true; hideEl.style.opacity = ''; hideEl.style.transition = '';
      showEl.hidden = false;
      showEl.style.transition = 'none'; showEl.style.opacity = '0'; showEl.style.transform = 'translateY(8px)';
      showEl.getBoundingClientRect();
      requestAnimationFrame(function () {
        showEl.style.transition = 'opacity .22s ease, transform .22s ease';
        showEl.style.opacity = '1'; showEl.style.transform = '';
      });
      var clr = function () {
        showEl.style.transition = ''; showEl.style.transform = ''; showEl.style.opacity = '';
        showEl.removeEventListener('transitionend', clr);
      };
      showEl.addEventListener('transitionend', clr);
    }, 180);
  }

  // B2) Le label fixe du panneau suit la face affichée (recto / historique / soutenir).
  function setAccountLabel(text) {
    var lbl = document.getElementById('acct-panel-label');
    if (lbl) lbl.textContent = text || 'Mon compte';
  }
  // Point 6/7 : remonte la page en haut du panneau (respecte reduced-motion).
  function scrollAcctTop() {
    window.scrollTo({ top: 0, behavior: REDUCE ? 'auto' : 'smooth' });
  }

  function openAccount() {
    var main = document.getElementById('alertes');
    var panel = document.getElementById('account-panel');
    if (!main || !panel || currentMode !== 'connected' || !panel.hidden) return;
    fillAccountHeader();
    var card = document.getElementById('acct-card');
    if (card) card.classList.remove('flipped', 'acct-face-support'); // toujours ouvrir sur le recto
    setAccountLabel('Mon compte');
    document.body.classList.add('account-open');
    swap(main, panel);
  }

  function closeAccount() {
    var main = document.getElementById('alertes');
    var panel = document.getElementById('account-panel');
    if (!main || !panel || panel.hidden) return;
    var card = document.getElementById('acct-card');
    if (card) card.classList.remove('flipped', 'acct-face-support');
    setAccountLabel('Mon compte');
    document.body.classList.remove('account-open');
    swap(panel, main);
  }

  function bindAccount() {
    var card = document.getElementById('acct-card');
    var toHist = document.getElementById('acct-to-history');
    // Point 6 : « Mon historique » → flip + remontée en haut de page (voir le début).
    if (toHist && card) toHist.addEventListener('click', function () {
      card.classList.remove('acct-face-support');
      card.classList.add('flipped');
      setAccountLabel('Mon historique');
      scrollAcctTop();
    });
    // Point 7 : « Toutes les façons d'aider » → 3e face « Nous soutenir » (flip).
    var toSupport = document.getElementById('acct-to-support');
    if (toSupport && card) toSupport.addEventListener('click', function () {
      card.classList.add('flipped', 'acct-face-support');
      setAccountLabel('Nous soutenir');
      scrollAcctTop();
    });
    // Le ↩ de chaque face est géré par le handler global .flip-back (retour au recto) :
    // on remet le label sur « Mon compte » et on retire la 3e face (après la rotation,
    // pour éviter tout flicker de la face historique).
    if (card) card.querySelectorAll('.flip-back').forEach(function (fb) {
      fb.addEventListener('click', function () {
        setAccountLabel('Mon compte');
        setTimeout(function () { card.classList.remove('acct-face-support'); }, REDUCE ? 0 : 520);
      });
    });
    var close = document.getElementById('acct-close');
    if (close) close.addEventListener('click', closeAccount);
    var backGrid = document.getElementById('acct-back-grid');
    if (backGrid) backGrid.addEventListener('click', closeAccount);
    var lo = document.getElementById('acct-logout');
    if (lo) lo.addEventListener('click', function () { LBASession.logout(); });
    // E) Suppression de compte, désormais dans le panneau (recto).
    var del = document.getElementById('acct-delete-link');
    if (del) del.addEventListener('click', function () { LBASession.deleteAccount(); });
    // G) Charge « Mes sources » (espace développeur embryonnaire).
    loadMySources();
  }

  /* ---------------- G) Mes sources (recto du panneau compte) ---------------- */
  async function loadMySources() {
    var section = document.getElementById('acct-sources');
    var list = document.getElementById('acct-src-list');
    if (!section || !list) return;
    var token = LBASession.get();
    if (!token) return;
    var sources = [];
    try {
      var r = await fetch('/api/my-alerts/sources?token=' + encodeURIComponent(token), { headers: { Accept: 'application/json' } });
      if (r.ok) { var d = await r.json(); sources = (d && d.sources) || []; }
    } catch (e) { /* réseau : on n'affiche rien */ }

    // « Proposer une source » est désormais une entrée permanente du panneau (B) ;
    // la rubrique « Mes sources » n'apparaît que si l'utilisateur a soumis une source.
    if (!sources.length) {
      section.hidden = true;
      return;
    }

    list.innerHTML = sources.map(function (s) {
      var published = !!s.enabled;
      var statut = published
        ? '<span class="acct-src-status ok">Publiée ✓</span>'
        : '<span class="acct-src-status pending">En examen</span>';
      var badgeIc = LBACards && LBACards.badgeFor ? LBACards.badgeFor(s.badge) : '';
      var inner =
        '<span class="acct-src-name">' + esc(s.name || s.id) + '</span>' +
        badgeIc + statut;
      if (published) {
        var sel = encodeURIComponent(s.id);
        return '<li class="acct-src-item"><a class="acct-src-link" href="/source/' + sel + '/statut">' + inner + '</a></li>';
      }
      return '<li class="acct-src-item">' + inner + '</li>';
    }).join('');
    section.hidden = false;
  }

  // C) Depuis le header : « Mon compte » bascule (ouvre / ferme) le panneau.
  function toggleAccount() {
    var panel = document.getElementById('account-panel');
    if (panel && !panel.hidden) closeAccount();
    else openAccount();
  }

  window.LBAAccount = { open: openAccount, close: closeAccount, toggle: toggleAccount };

  // Volet J : sur la home, le logo remonte en haut sans recharger + reset des filtres.
  function bindBrandTop() {
    var brand = document.querySelector('.brand');
    if (!brand) return;
    brand.addEventListener('click', function (e) {
      e.preventDefault();
      closeAccount(); // si le panneau compte est ouvert, on revient à la grille
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (qInput) qInput.value = '';
      selectChip('all');
    });
  }

  document.addEventListener('DOMContentLoaded', loadHome);
})();
