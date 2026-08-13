/* profile.js — « Personnaliser les alertes » (panneau Mon compte, mode connecté).
   Pays / département / centres d'intérêt. Tout est optionnel, auto-sauvegarde au
   changement (feedback bref) — cohérent avec l'interrupteur email du panneau.
   La France est le défaut d'AFFICHAGE seulement : rien n'est écrit tant que
   l'utilisateur n'agit pas. */

(function () {
  'use strict';

  var S = window.LBASession;
  var mount = document.getElementById('profile-mount');
  if (!mount || !S) return;
  var token = S.get();
  if (!token) return; // anonyme : pas de personnalisation

  var state = { country: 'FR', departement: null, region: null, ville: null, interests: [], displayName: null, pseudo: null, points: 0, rank: null, optout: false };
  var geo = { countries: [], departements: [], regions: [] };
  var kioskCats = []; // slugs de catégories réellement utilisées par le kiosque

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function catLabel(slug) { return (window.LBACat && LBACat.label) ? LBACat.label(slug) : slug; }
  // Ordinal francais : 1 -> "1er", n -> "Ne" (2e, 3e, 20e...).
  function ordinal(n) { return n === 1 ? '1er' : (String(n) + 'e'); }

  // Bascule opt-out classement (auto-save serveur, comme le pseudo/profil). Re-rend
  // la carte pour refleter le rang (affiche/masque) apres la reponse.
  async function saveOptout(next) {
    try {
      var res = await fetch('/api/my-alerts/leaderboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, optout: next }),
      });
      if (!res.ok) throw new Error('http ' + res.status);
      var d = await res.json();
      state.optout = !!d.leaderboard_optout;
      state.rank = d.rank != null ? d.rank : null;
      flash('Enregistré ✓', true);
    } catch (e) {
      state.optout = !next; // rollback visuel
      flash('Échec de l\'enregistrement', false);
    }
    render();
  }

  var flashTimer = null;
  function flash(msg, ok) {
    var el = document.getElementById('pref-feedback');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('err', !ok);
    el.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { el.classList.remove('show'); }, 1600);
  }

  // Enregistre le nom public (pseudo). Validation serveur : longueur, caractères,
  // pas d'URL/@, jetons interdits, unicité, rate-limit 3/mois.
  async function saveDisplayName() {
    var input = document.getElementById('pref-dn');
    var msg = document.getElementById('pref-dn-msg');
    if (!input) return;
    var val = (input.value || '').trim();
    // Valeur inchangée : ne pas re-solliciter le serveur (quota 3/mois).
    if (val === (state.displayName || '')) { if (msg) { msg.classList.remove('show', 'err'); } return; }
    // Pseudo obligatoire : on refuse le vide (ou les espaces seuls) côté client, avec un
    // message clair, et on restaure le pseudo précédent. Le serveur refuse aussi (min 3),
    // donc le pseudo par défaut auto-rempli n'est jamais écrasé par une chaîne vide.
    if (!val) {
      if (msg) { msg.textContent = 'Le pseudo ne peut pas être vide.'; msg.classList.remove('show'); void msg.offsetWidth; msg.classList.add('show', 'err'); }
      input.value = state.displayName || '';
      return;
    }
    if (msg) { msg.classList.remove('err'); msg.classList.add('show'); msg.textContent = '…'; }
    try {
      var res = await fetch('/api/my-alerts/display-name', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, display_name: val }),
      });
      var d = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        if (msg) { msg.textContent = d.error || 'Échec'; msg.classList.add('err'); }
        return;
      }
      state.displayName = d.display_name || null;
      // Pseudo unifié : rafraîchit « Bonjour <prénom> » + l'avatar sans recharger.
      if (window.LBAAccount && window.LBAAccount.refreshName) window.LBAAccount.refreshName(state.displayName);
      if (msg) { msg.classList.remove('err'); msg.textContent = 'Enregistré ✓'; }
      clearTimeout(flashTimer);
      flashTimer = setTimeout(function () { if (msg) msg.classList.remove('show'); }, 1600);
    } catch (e) {
      if (msg) { msg.textContent = 'Échec réseau'; msg.classList.add('err'); }
    }
  }

  async function save() {
    // On envoie TOUJOURS l'ensemble des champs (le serveur fait un overwrite complet et
    // pose *_source='manual' pour chaque champ renseigné).
    var payload = {
      token: token,
      country: state.country || null,
      departement: state.country === 'FR' ? state.departement : null,
      region: state.region || null,
      ville: state.ville || null,
      interests: state.interests,
    };
    try {
      var res = await fetch('/api/my-alerts/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('http ' + res.status);
      var d = await res.json();
      // La France reste le défaut d'affichage si rien n'est renseigné.
      state.country = d.country || 'FR';
      state.departement = d.departement || null;
      state.region = d.region || null;
      state.ville = d.ville || null;
      state.interests = d.interests || [];
      flash('Enregistré ✓', true);
    } catch (e) {
      flash('Échec de l\'enregistrement', false);
    }
  }

  function optionList(items, selected, placeholder) {
    var html = placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '';
    items.forEach(function (it) {
      var sel = it.code === selected ? ' selected' : '';
      html += '<option value="' + esc(it.code) + '"' + sel + '>' + esc(it.name) + '</option>';
    });
    return html;
  }

  // Options de région : uniquement si France (les autres pays du profil n'ont pas de
  // subdivisions gérées). Si la région stockée (valeur IPLocate) n'est pas dans le
  // référentiel, on l'ajoute quand même en tête pour ne jamais l'effacer à l'affichage.
  function regionOptions() {
    var list = state.country === 'FR' ? (geo.regions || []) : [];
    var html = '<option value="">—</option>';
    var found = false;
    list.forEach(function (r) {
      var sel = r.code === state.region ? ' selected' : '';
      if (sel) found = true;
      html += '<option value="' + esc(r.code) + '"' + sel + '>' + esc(r.name) + '</option>';
    });
    if (state.country === 'FR' && state.region && !found) {
      html += '<option value="' + esc(state.region) + '" selected>' + esc(state.region) + '</option>';
    }
    return html;
  }

  // Options de département : filtrées à la région choisie (si présente), sinon tous les
  // départements FR. Vide hors France.
  function deptOptions() {
    var list = geo.departements || [];
    if (state.country !== 'FR') list = [];
    else if (state.region) list = list.filter(function (d) { return d.region === state.region; });
    return optionList(list, state.departement, '—');
  }

  // Reconstruit les selects Région/Département depuis l'état courant + gère leur
  // (dés)activation et la visibilité des rangées hors France.
  function refreshGeoSelects() {
    var reg = document.getElementById('pref-region');
    var dep = document.getElementById('pref-dept');
    if (reg) { reg.innerHTML = regionOptions(); reg.disabled = state.country !== 'FR'; }
    if (dep) { dep.innerHTML = deptOptions(); dep.disabled = state.country !== 'FR'; }
    var regRow = document.getElementById('pref-region-row');
    var depRow = document.getElementById('pref-dept-row');
    if (regRow) regRow.hidden = state.country !== 'FR';
    if (depRow) depRow.hidden = state.country !== 'FR';
  }

  // Datalist de villes : aucune base de communes n'est embarquée dans le projet (vigieau
  // consomme des codes INSEE saisis, pas une liste de noms). On alimente donc à la demande
  // via /api/communes (relais serveur de geo.api.gouv.fr, même origine → CSP OK), filtré au
  // département sélectionné (le filtre le plus fin). Dégradation propre : si l'API échoue ou
  // qu'aucun département n'est choisi, la datalist reste vide et le champ redevient un
  // simple texte libre.
  var villeReqDept = null;
  function fillVilleSuggestions() {
    var dl = document.getElementById('pref-ville-list');
    if (!dl) return;
    var dept = state.country === 'FR' ? state.departement : null;
    if (!dept) { dl.innerHTML = ''; villeReqDept = null; return; }
    if (dept === villeReqDept) return; // déjà chargé pour ce département
    villeReqDept = dept;
    fetch('/api/communes?departement=' + encodeURIComponent(dept), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { communes: [] }; })
      .then(function (d) {
        if (villeReqDept !== dept) return; // une sélection plus récente a pris la main
        var list = (d && Array.isArray(d.communes)) ? d.communes : [];
        dl.innerHTML = list.map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('');
      })
      .catch(function () { /* repli silencieux : champ texte libre */ });
  }

  function chipHTML(slug) {
    var on = state.interests.indexOf(slug) !== -1;
    return '<button type="button" class="pref-chip' + (on ? ' on' : '') +
      '" data-slug="' + esc(slug) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      esc(catLabel(slug)) + '</button>';
  }
  // Sur PC : exactement 7 centres d'intérêt visibles par défaut, le reste sous un bouton
  // « + » (même pattern que la 2e ligne de catégories du kiosque). Nombre FIXE (plus de
  // seuil variable en caractères) pour un rendu stable sur desktop.
  var PRIMARY_CHIPS = 7;
  function renderChips() {
    var box = document.getElementById('pref-chips');
    if (!box) return;
    var primary = kioskCats.slice(0, PRIMARY_CHIPS);
    var secondary = kioskCats.slice(PRIMARY_CHIPS);
    var html = primary.map(chipHTML).join('');
    if (secondary.length) {
      html += '<button type="button" class="pref-chip pref-chip-more" id="pref-chips-more-toggle"' +
        ' aria-label="Plus de centres d\'intérêt" aria-expanded="false">+</button>' +
        '<div class="pref-chips-more chips-more" id="pref-chips-more">' + secondary.map(chipHTML).join('') + '</div>';
    }
    box.innerHTML = html;
  }

  // Mosaïque « Mon compte » : chaque rubrique a sa propre petite carte, donc son
  // propre point de montage. Si un mount dédié manque (page sans mosaïque), on
  // retombe sur #profile-mount pour ne rien perdre.
  function paint(id, html) {
    var el = document.getElementById(id);
    if (el) { el.innerHTML = html; return; }
    mount.insertAdjacentHTML('beforeend', html);
  }

  function render() {
    mount.innerHTML =
      '<div class="acct-subhead">Personnaliser les alertes <span id="pref-feedback" class="pref-feedback" role="status"></span></div>' +
      '<div class="notif-card">' +
      '  <div class="notif-row">' +
      '    <div class="notif-txt"><strong>Pays</strong><span class="notif-sub">Adapte les alertes à votre région</span></div>' +
      '    <select id="pref-country" class="pref-select" aria-label="Pays">' + optionList(geo.countries, state.country, null) + '</select>' +
      '  </div>' +
      // Région : select lié (les options se filtrent au pays ; choisir une région filtre
      // les départements et renseigne le pays). Ordre logique Pays → Région → Département.
      '  <div class="notif-row" id="pref-region-row">' +
      '    <div class="notif-txt"><strong>Région</strong><span class="notif-sub">Filtre les départements</span></div>' +
      '    <select id="pref-region" class="pref-select" aria-label="Région">' + regionOptions() + '</select>' +
      '  </div>' +
      '  <div class="notif-row" id="pref-dept-row">' +
      '    <div class="notif-txt"><strong>Département</strong><span class="notif-sub">Priorise les alertes locales</span></div>' +
      '    <select id="pref-dept" class="pref-select" aria-label="Département">' + deptOptions() + '</select>' +
      '  </div>' +
      // Ville : reste un champ de saisie (aucune base de communes embarquée — cf. rapport),
      // assistée par une datalist native remplie à la demande selon le département choisi.
      '  <div class="notif-row" id="pref-ville-row">' +
      '    <div class="notif-txt"><strong>Ville</strong><span class="notif-sub">Détectée automatiquement, à corriger si besoin</span></div>' +
      '    <input id="pref-ville" class="pref-dn-input" type="text" maxlength="80" placeholder="—" list="pref-ville-list" autocomplete="off" value="' + esc(state.ville || '') + '">' +
      '    <datalist id="pref-ville-list"></datalist>' +
      '  </div>' +
      '  <div class="notif-row pref-interests-row">' +
      '    <div class="notif-txt"><strong>Centres d\'intérêt</strong><span class="notif-sub">Vos thèmes remontent en tête du kiosque</span></div>' +
      '    <div class="pref-chips" id="pref-chips"></div>' +
      '  </div>' +
      '</div>';

    // Phase 2 : nom public (pseudo) — signe les decks partagés, jamais l'email.
    paint('pseudo-mount',
      '<div class="acct-subhead">Mon pseudo <span id="pref-dn-msg" class="pref-feedback" role="status"></span></div>' +
      // J) Une SEULE notif-row : libellé à gauche, saisie + « Enregistrer » à droite,
      // au style du site (notif-sub explicatif supprimé).
      '<div class="notif-card">' +
      '  <div class="notif-row pref-dn-row">' +
      '    <div class="notif-txt"><strong>Mon pseudo</strong></div>' +
      '    <div class="pref-dn-input-row">' +
      '      <input id="pref-dn" class="pref-dn-input" type="text" maxlength="25" placeholder="ex. Hugo des Alpes" value="' + esc(state.displayName || '') + '">' +
      '    </div>' +
      '  </div>' +
      // @pseudo public : identifiant STABLE posé une fois (jamais régénéré au
      // renommage), c'est lui qui signe le forum et sert d'URL /u/:pseudo.
      (state.pseudo
        ? '  <div class="notif-row pref-at-row">' +
          '    <div class="notif-txt"><strong>Mon identifiant public</strong>' +
          '      <span class="notif-sub">Signe vos messages du forum et vos decks partagés.</span></div>' +
          '    <a class="pref-at" href="/u/' + esc(state.pseudo) + '">@' + esc(state.pseudo) + '</a>' +
          '  </div>'
        : '') +
      '</div>');

    // Points cosmetiques (phase 1) : affichage minimal, juste le solde (pas de detail
    // du ledger). Purement statutaire/ludique, jamais convertible en argent.
    paint('points-mount',
      '<div class="acct-subhead">Mes points</div>' +
      '<div class="notif-card">' +
      '  <div class="notif-row">' +
      '    <div class="notif-txt"><strong>Solde</strong><span class="notif-sub">Points gagnés en créant et adoptant des decks</span></div>' +
      '    <div class="pref-points" aria-label="Solde de points">' + esc(String(state.points || 0)) + '</div>' +
      '  </div>' +
      // Rang privé (phase 2) : visible seulement par vous, jamais exposé à un tiers.
      // Masqué si opt-out ou pas encore de rang (rank null).
      (!state.optout && state.rank != null
        ? '  <div class="notif-row pref-rank-row">' +
          '    <div class="notif-txt"><strong>Votre classement</strong>' +
          '      <span class="notif-sub">Visible de vous seul, jamais partagé</span></div>' +
          '    <div class="pref-rank" aria-label="Votre rang">Vous êtes classé ' + esc(ordinal(state.rank)) + '</div>' +
          '  </div>'
        : '') +
      // Opt-out : décoché = vous participez (défaut). Coché = exclu du classement.
      '  <div class="notif-row">' +
      '    <div class="notif-txt"><strong>Ne pas participer au classement</strong>' +
      '      <span class="notif-sub">Vous retire du calcul de rang</span></div>' +
      '    <button type="button" class="notif-toggle" id="pref-optout" role="switch" aria-label="Ne pas participer au classement"></button>' +
      '  </div>' +
      // Phase 3 : acces a la boutique de skins cosmetiques.
      '  <a class="notif-row notif-nav" href="/boutique">' +
      '    <span class="notif-txt"><strong>Boutique</strong>' +
      '      <span class="notif-sub">Débloquez des skins avec vos points</span></span>' +
      '    <span class="notif-chevron" aria-hidden="true">→</span>' +
      '  </a>' +
      '</div>');

    renderChips();
    refreshGeoSelects();
    fillVilleSuggestions();

    // Toggle opt-out classement : peint l'état courant puis bascule au clic (auto-save).
    var optoutTgl = document.getElementById('pref-optout');
    if (optoutTgl) {
      optoutTgl.classList.toggle('on', state.optout);
      optoutTgl.setAttribute('aria-checked', state.optout ? 'true' : 'false');
      optoutTgl.addEventListener('click', function () { saveOptout(!state.optout); });
    }

    // Pays : ne préremplit RIEN en dessous (trop large), mais filtre/vide Région et
    // Département. Hors France, aucune subdivision gérée → on vide et masque proprement.
    document.getElementById('pref-country').addEventListener('change', function (e) {
      state.country = e.target.value || 'FR';
      if (state.country !== 'FR') { state.region = null; state.departement = null; }
      refreshGeoSelects();
      fillVilleSuggestions();
      save();
    });
    // Région : renseigne le Pays (France) et filtre les départements. Si le département
    // actuel n'appartient plus à la région choisie, on le vide (pas d'incohérence affichée).
    var regionInput = document.getElementById('pref-region');
    if (regionInput) regionInput.addEventListener('change', function (e) {
      var v = (e.target.value || '').trim() || null;
      if (v === state.region) return;
      state.region = v;
      if (v) {
        state.country = 'FR';
        var dep = state.departement && (geo.departements || []).filter(function (d) { return d.code === state.departement; })[0];
        if (dep && dep.region !== v) state.departement = null; // dept hors région → vidé
      }
      refreshGeoSelects();
      fillVilleSuggestions();
      save();
    });
    // Département : renseigne automatiquement Région et Pays correspondants (correspondance
    // directe — un département n'appartient qu'à une région et un pays).
    document.getElementById('pref-dept').addEventListener('change', function (e) {
      state.departement = e.target.value || null;
      if (state.departement) {
        state.country = 'FR';
        var dep = (geo.departements || []).filter(function (d) { return d.code === state.departement; })[0];
        if (dep && dep.region) state.region = dep.region;
      }
      refreshGeoSelects();
      fillVilleSuggestions();
      save();
    });
    var villeInput = document.getElementById('pref-ville');
    if (villeInput) villeInput.addEventListener('change', function (e) {
      var v = (e.target.value || '').trim();
      if (v === (state.ville || '')) return;
      state.ville = v || null; save();
    });
    // Sauvegarde à la volée (plus de bouton) : après une courte pause de frappe
    // (anti-rafales — la validation serveur est limitée à 3/mois), à la sortie du
    // champ, et sur Entrée. saveDisplayName ignore une valeur inchangée.
    var dnInput = document.getElementById('pref-dn');
    if (dnInput) {
      var dnTimer = null;
      var scheduleDn = function () { clearTimeout(dnTimer); dnTimer = setTimeout(saveDisplayName, 700); };
      dnInput.addEventListener('input', scheduleDn);
      dnInput.addEventListener('blur', function () { clearTimeout(dnTimer); saveDisplayName(); });
      dnInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(dnTimer); saveDisplayName(); } });
    }

    document.getElementById('pref-chips').addEventListener('click', function (e) {
      // Point 5 : bascule d'ouverture/fermeture de la 2e ligne (transition fluide).
      var tgl = e.target.closest('.pref-chip-more');
      if (tgl) {
        var more = document.getElementById('pref-chips-more');
        var open = more.classList.toggle('open');
        tgl.classList.toggle('on', open);
        tgl.textContent = open ? '−' : '+';
        tgl.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (more) more.style.maxHeight = open ? more.scrollHeight + 'px' : '0px';
        return;
      }
      var b = e.target.closest('.pref-chip');
      if (!b) return;
      var slug = b.getAttribute('data-slug');
      var i = state.interests.indexOf(slug);
      if (i === -1) state.interests.push(slug); else state.interests.splice(i, 1);
      b.classList.toggle('on');
      b.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
      save();
    });
  }

  (async function initProfile() {
    try {
      if (window.LBACat && LBACat.load) await LBACat.load();
      var results = await Promise.all([
        fetch('/api/geo', { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : { countries: [], departements: [], regions: [] }; }),
        fetch('/api/my-alerts?token=' + encodeURIComponent(token), { headers: { Accept: 'application/json' } }).then(function (r) { return r.status === 401 ? null : r.json(); }),
        fetch('/api/sources', { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : []; }),
      ]);
      var g = results[0], me = results[1], srcs = results[2];
      if (me === null) return; // session invalide : on n'affiche rien

      geo = { countries: g.countries || [], departements: g.departements || [], regions: g.regions || [] };

      // Profil courant (France = défaut d'affichage si non renseigné).
      state.country = (me && me.country) || 'FR';
      state.departement = (me && me.departement) || null;
      state.region = (me && me.region) || null;
      state.ville = (me && me.ville) || null;
      state.interests = (me && me.interests) || [];
      state.displayName = (me && me.display_name) || null;
      state.pseudo = (me && me.pseudo) || null; // @handle public, stable
      state.points = (me && me.points_balance) || 0;
      state.rank = me && me.rank != null ? me.rank : null; // null = opt-out ou sans pseudo
      state.optout = !!(me && me.leaderboard_optout);

      // Centres d'intérêt proposés = catégories réellement présentes dans le kiosque,
      // restreintes à la taxonomie connue (libellés fiables, acceptées côté serveur).
      var valid = {};
      if (window.LBACat && LBACat.all) LBACat.all().forEach(function (e) { valid[e.slug] = true; });
      var seen = {};
      (Array.isArray(srcs) ? srcs : []).forEach(function (s) {
        (s.categories || []).forEach(function (c) { if (valid[c] && !seen[c]) { seen[c] = true; kioskCats.push(c); } });
      });
      kioskCats.sort(function (a, b) { return catLabel(a).localeCompare(catLabel(b)); });

      render();
    } catch (e) {
      /* silencieux : la personnalisation est un bonus, jamais bloquante */
    }
  })();
})();
