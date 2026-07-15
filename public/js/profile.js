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

  var state = { country: 'FR', departement: null, interests: [] };
  var geo = { countries: [], departements: [] };
  var kioskCats = []; // slugs de catégories réellement utilisées par le kiosque

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function catLabel(slug) { return (window.LBACat && LBACat.label) ? LBACat.label(slug) : slug; }

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

  async function save() {
    var payload = {
      token: token,
      country: state.country || null,
      departement: state.country === 'FR' ? state.departement : null,
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

  function chipHTML(slug) {
    var on = state.interests.indexOf(slug) !== -1;
    return '<button type="button" class="pref-chip' + (on ? ' on' : '') +
      '" data-slug="' + esc(slug) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      esc(catLabel(slug)) + '</button>';
  }
  // Point 5 : ~40 caractères cumulés de libellés visibles par défaut, le reste sous
  // un bouton « + » (même pattern que la 2e ligne de catégories du kiosque).
  function renderChips() {
    var box = document.getElementById('pref-chips');
    if (!box) return;
    var LIMIT = 40, acc = 0, primary = [], secondary = [];
    kioskCats.forEach(function (slug) {
      if (primary.length === 0 || acc <= LIMIT) { primary.push(slug); acc += catLabel(slug).length + 2; }
      else secondary.push(slug);
    });
    var html = primary.map(chipHTML).join('');
    if (secondary.length) {
      html += '<button type="button" class="pref-chip pref-chip-more" id="pref-chips-more-toggle"' +
        ' aria-label="Plus de centres d\'intérêt" aria-expanded="false">+</button>' +
        '<div class="pref-chips-more chips-more" id="pref-chips-more">' + secondary.map(chipHTML).join('') + '</div>';
    }
    box.innerHTML = html;
  }

  function syncDeptVisibility() {
    var row = document.getElementById('pref-dept-row');
    if (row) row.hidden = state.country !== 'FR';
  }

  function render() {
    mount.innerHTML =
      '<div class="acct-subhead">Personnaliser les alertes <span id="pref-feedback" class="pref-feedback" role="status"></span></div>' +
      '<div class="notif-card">' +
      '  <div class="notif-row">' +
      '    <div class="notif-txt"><strong>Pays</strong><span class="notif-sub">Adapte les alertes à votre région</span></div>' +
      '    <select id="pref-country" class="pref-select" aria-label="Pays">' + optionList(geo.countries, state.country, null) + '</select>' +
      '  </div>' +
      '  <div class="notif-row" id="pref-dept-row">' +
      '    <div class="notif-txt"><strong>Département</strong><span class="notif-sub">Priorise les alertes locales</span></div>' +
      '    <select id="pref-dept" class="pref-select" aria-label="Département">' + optionList(geo.departements, state.departement, '—') + '</select>' +
      '  </div>' +
      '  <div class="notif-row pref-interests-row">' +
      '    <div class="notif-txt"><strong>Centres d\'intérêt</strong><span class="notif-sub">Vos thèmes remontent en tête du kiosque</span></div>' +
      '    <div class="pref-chips" id="pref-chips"></div>' +
      '  </div>' +
      '</div>';

    renderChips();
    syncDeptVisibility();

    document.getElementById('pref-country').addEventListener('change', function (e) {
      state.country = e.target.value || 'FR';
      if (state.country !== 'FR') state.departement = null;
      syncDeptVisibility();
      save();
    });
    document.getElementById('pref-dept').addEventListener('change', function (e) {
      state.departement = e.target.value || null;
      save();
    });
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
        fetch('/api/geo', { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : { countries: [], departements: [] }; }),
        fetch('/api/my-alerts?token=' + encodeURIComponent(token), { headers: { Accept: 'application/json' } }).then(function (r) { return r.status === 401 ? null : r.json(); }),
        fetch('/api/sources', { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : []; }),
      ]);
      var g = results[0], me = results[1], srcs = results[2];
      if (me === null) return; // session invalide : on n'affiche rien

      geo = { countries: g.countries || [], departements: g.departements || [] };

      // Profil courant (France = défaut d'affichage si non renseigné).
      state.country = (me && me.country) || 'FR';
      state.departement = (me && me.departement) || null;
      state.interests = (me && me.interests) || [];

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
