/* mairie-publier.js — assistant 3 écrans de publication d'un événement municipal.
   (1) modèle + titre ; (2) texte, dates, catégorie ; (3) relecture (aperçu habitant) + Publier.
   AUCUNE notification n'est envoyée (lot B) : publier rend l'événement visible (fiche commune).
   Dépend d'un compte connecté (localStorage 'lba-token') membre ACTIF d'une organisation VÉRIFIÉE. */
(function () {
  'use strict';
  var root = document.getElementById('mp-root');
  if (!root) return;

  function token() { try { return localStorage.getItem('lba-token') || ''; } catch (e) { return ''; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  var TEMPLATES = [
    { id: 'coupure-eau', label: 'Coupure d’eau', hint: 'Interruption du réseau d’eau potable.', cat: 'coupures-eau', title: 'Coupure d’eau' },
    { id: 'travaux', label: 'Travaux', hint: 'Chantier, voirie, réseau.', cat: 'travaux-voirie', title: 'Travaux' },
    { id: 'evenement', label: 'Événement', hint: 'Manifestation, fête, réunion publique.', cat: 'evenements-locaux', title: '' },
    { id: 'fermeture', label: 'Fermeture', hint: 'Service ou équipement fermé.', cat: 'mairie', title: 'Fermeture' },
    { id: 'libre', label: 'Message libre', hint: 'Tout autre type d’information.', cat: '', title: '' }
  ];
  var TPL_LABEL = {}; TEMPLATES.forEach(function (t) { TPL_LABEL[t.id] = t.label; });
  var STEPS = ['modele', 'contenu', 'relecture'];

  var state = {
    step: 'modele', orgs: [], org: null, loaded: false, authError: false,
    draft: { template: '', title: '', body: '', category: '', starts_at: '', ends_at: '' },
    createdId: null, busy: false, err: '', ok: ''
  };

  function api(method, path, body) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    var b = body ? Object.assign({}, body) : {};
    b.token = token();
    if (method !== 'GET') opts.body = JSON.stringify(b);
    var url = path + (method === 'GET' ? (path.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token()) : '');
    return fetch(url, opts).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); });
  }

  function loadOrgs() {
    return api('GET', '/api/organizations').then(function (r) {
      if (r.status === 401) { state.authError = true; return; }
      var list = (r.body && r.body.organizations) || [];
      // Organisations VÉRIFIÉES dont l'utilisateur est membre ACTIF.
      state.orgs = list.filter(function (o) { return o.status === 'verified' && o.my_member_status === 'actif'; });
      state.org = state.orgs[0] || null;
    }).catch(function () { state.err = 'Chargement impossible.'; });
  }

  function progress() { return Math.round(((STEPS.indexOf(state.step) + 1) / STEPS.length) * 100); }

  function tplById(id) { for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i]; return null; }

  // ── Rendu des écrans ────────────────────────────────────────────────────────
  function render() {
    if (state.authError) { root.innerHTML = block('<h1>Connexion requise</h1><p>Connectez-vous avec le compte de votre collectivité pour publier un événement.</p><p><a class="pub-btn" href="/connexion" style="display:inline-block;text-decoration:none;text-align:center">Se connecter</a></p>'); return; }
    if (!state.loaded) { root.innerHTML = block('<p>Chargement…</p>'); return; }
    if (!state.orgs.length) {
      root.innerHTML = block('<h1>Aucune organisation vérifiée</h1><p>Vous devez appartenir à une organisation <strong>vérifiée</strong> pour publier. Déposez une demande, elle sera examinée avant toute publication.</p>');
      return;
    }
    var html = '<section class="pub-step">';
    html += '<div class="pub-progress"><i style="width:' + progress() + '%"></i></div>';
    html += '<p class="pub-stepinfo">Étape ' + (STEPS.indexOf(state.step) + 1) + ' sur ' + STEPS.length + ' — ' + esc(state.org.name) + '</p>';
    if (state.step === 'modele') html += stepModele();
    else if (state.step === 'contenu') html += stepContenu();
    else html += stepRelecture();
    if (state.err) html += '<p class="pub-err">' + esc(state.err) + '</p>';
    if (state.ok) html += '<p class="pub-ok">' + esc(state.ok) + '</p>';
    html += actions();
    html += '</section>';
    root.innerHTML = html;
    wire();
  }
  function block(inner) { return '<section class="pub-step">' + inner + '</section>'; }

  function orgPicker() {
    if (state.orgs.length < 2) return '';
    var opts = state.orgs.map(function (o) { return '<option value="' + o.id + '"' + (state.org && state.org.id === o.id ? ' selected' : '') + '>' + esc(o.name) + '</option>'; }).join('');
    return '<label class="pub-field"><span>Organisation</span><select id="mp-org">' + opts + '</select></label>';
  }

  function stepModele() {
    var cards = TEMPLATES.map(function (t) {
      var on = state.draft.template === t.id;
      return '<button type="button" class="pub-card" data-tpl="' + t.id + '" aria-pressed="' + (on ? 'true' : 'false') + '"><b>' + esc(t.label) + '</b><span>' + esc(t.hint) + '</span></button>';
    }).join('');
    return '<h1>Quel type d’information ?</h1>' + orgPicker() +
      '<div class="pub-cards">' + cards + '</div>' +
      '<label class="pub-field" style="margin-top:16px"><span>Titre</span><input id="mp-title" type="text" maxlength="120" value="' + esc(state.draft.title) + '" placeholder="Ex. Coupure d’eau secteur centre-ville"></label>';
  }

  function stepContenu() {
    return '<div class="pub-detailblock"><h1>Le message</h1>' +
      '<label class="pub-field"><span>Texte (vu par les habitants)</span><textarea id="mp-body" maxlength="2000" placeholder="Décrivez l’information : quoi, où, quand, consignes…">' + esc(state.draft.body) + '</textarea></label>' +
      '<div class="pub-row">' +
        '<label class="pub-field"><span>Début (facultatif)</span><input id="mp-start" type="datetime-local" value="' + esc(state.draft.starts_at) + '"></label>' +
        '<label class="pub-field"><span>Fin / expiration (facultatif)</span><input id="mp-end" type="datetime-local" value="' + esc(state.draft.ends_at) + '"></label>' +
      '</div>' +
      '<label class="pub-field"><span>Catégorie (facultatif)</span><input id="mp-cat" type="text" maxlength="30" value="' + esc(state.draft.category) + '" placeholder="ex. coupures-eau, travaux-voirie…"><p class="pub-hint">Laissez vide pour reprendre la catégorie du modèle.</p></label>' +
      '</div>';
  }

  function fmtDate(v) { if (!v) return ''; try { return new Date(v).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return v; } }

  function stepRelecture() {
    var d = state.draft;
    var meta = [TPL_LABEL[d.template] || 'Information', state.org.name];
    var dates = '';
    if (d.starts_at || d.ends_at) dates = '<p class="meta">' + (d.starts_at ? 'Du ' + esc(fmtDate(d.starts_at)) : '') + (d.ends_at ? ' au ' + esc(fmtDate(d.ends_at)) : '') + '</p>';
    return '<div class="pub-detailblock"><h1>Relecture</h1>' +
      '<p class="pub-hint">Voici ce que verront les habitants de la commune. Aucune notification n’est envoyée : l’événement apparaît sur la fiche de la commune.</p>' +
      '<div class="pub-preview"><p class="meta">' + esc(meta.join(' · ')) + '</p>' +
        '<h3>' + esc(d.title) + '</h3>' + dates +
        '<p class="body">' + esc(d.body) + '</p></div></div>';
  }

  function actions() {
    var i = STEPS.indexOf(state.step);
    var back = i > 0 ? '<button type="button" class="pub-btn ghost" id="mp-back">Retour</button>' : '';
    var nextLabel = state.step === 'relecture' ? 'Publier' : 'Continuer';
    var next = '<button type="button" class="pub-btn" id="mp-next"' + (state.busy ? ' disabled' : '') + '>' + nextLabel + '</button>';
    return '<div class="pub-actions">' + back + next + '</div>';
  }

  // ── Validation côté client (le serveur reste l’autorité) ──────────────────────
  function validate(step) {
    var d = state.draft;
    if (step === 'modele') {
      if (!d.template) return 'Choisissez un modèle.';
      if (!d.title || d.title.trim().length < 3) return 'Donnez un titre (3 caractères min).';
    }
    if (step === 'contenu') {
      if (!d.body || d.body.trim().length < 10) return 'Le texte doit faire au moins 10 caractères.';
      if (d.starts_at && d.ends_at && new Date(d.ends_at) <= new Date(d.starts_at)) return 'La date de fin doit suivre la date de début.';
    }
    return '';
  }

  function collect() {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : undefined; };
    if (state.step === 'modele') { if (g('mp-title') != null) state.draft.title = g('mp-title'); if (g('mp-org') != null) { state.org = state.orgs.filter(function (o) { return String(o.id) === g('mp-org'); })[0] || state.org; } }
    if (state.step === 'contenu') { state.draft.body = g('mp-body') || ''; state.draft.starts_at = g('mp-start') || ''; state.draft.ends_at = g('mp-end') || ''; state.draft.category = (g('mp-cat') || '').trim(); }
  }

  // Crée (ou met à jour) le brouillon serveur à la sortie de l’écran 2, puis publie à l’écran 3.
  function ensureDraft() {
    var d = state.draft;
    var tpl = tplById(d.template);
    var payload = {
      template: d.template, title: d.title, body: d.body,
      category: d.category || (tpl ? tpl.cat : '') || undefined,
      starts_at: d.starts_at || undefined, ends_at: d.ends_at || undefined
    };
    if (state.createdId) {
      return api('PATCH', '/api/municipal-events/' + state.createdId, payload);
    }
    return api('POST', '/api/organizations/' + state.org.id + '/events', payload).then(function (r) {
      if (r.ok && r.body.event) state.createdId = r.body.event.id;
      return r;
    });
  }

  function goNext() {
    state.err = ''; state.ok = ''; collect();
    var v = validate(state.step);
    if (v) { state.err = v; render(); return; }
    if (state.step === 'modele') { state.step = 'contenu'; render(); return; }
    if (state.step === 'contenu') {
      state.busy = true; render();
      ensureDraft().then(function (r) {
        state.busy = false;
        if (!r.ok) { state.err = (r.body && r.body.error) || 'Enregistrement impossible.'; render(); return; }
        state.step = 'relecture'; render();
      });
      return;
    }
    // relecture → Publier
    state.busy = true; render();
    ensureDraft().then(function (r) {
      if (!r.ok) { state.busy = false; state.err = (r.body && r.body.error) || 'Enregistrement impossible.'; render(); return; }
      api('POST', '/api/municipal-events/' + state.createdId + '/publish').then(function (p) {
        state.busy = false;
        if (!p.ok) { state.err = (p.body && p.body.error) || 'Publication impossible.'; render(); return; }
        state.ok = p.body.published ? 'Publié : l’événement est visible sur la fiche de la commune.' : 'Envoyé en relecture : un administrateur de l’organisation doit le publier.';
        root.innerHTML = block('<h1>' + (p.body.published ? 'C’est publié ✅' : 'Envoyé en relecture ✅') + '</h1><p>' + esc(state.ok) + '</p><p><a class="pub-btn" href="/mairie/publier" style="display:inline-block;text-decoration:none;text-align:center">Nouvel événement</a></p>');
      });
    });
  }

  function goBack() { state.err = ''; state.ok = ''; collect(); var i = STEPS.indexOf(state.step); if (i > 0) state.step = STEPS[i - 1]; render(); }

  function wire() {
    [].forEach.call(root.querySelectorAll('.pub-card[data-tpl]'), function (b) {
      b.onclick = function () { var t = tplById(b.getAttribute('data-tpl')); state.draft.template = t.id; if (t.title && (!state.draft.title || state.draft.title.trim() === '')) state.draft.title = t.title; render(); };
    });
    var next = document.getElementById('mp-next'); if (next) next.onclick = goNext;
    var back = document.getElementById('mp-back'); if (back) back.onclick = goBack;
    var orgSel = document.getElementById('mp-org'); if (orgSel) orgSel.onchange = function () { state.org = state.orgs.filter(function (o) { return String(o.id) === orgSel.value; })[0] || state.org; };
  }

  // ── Démarrage ─────────────────────────────────────────────────────────────────
  if (!token()) { state.authError = true; state.loaded = true; render(); return; }
  render();
  loadOrgs().then(function () { state.loaded = true; render(); });
})();
