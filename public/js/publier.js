/* publier.js — UI de l'assistant « Publier une alerte » (LOT 9, style Leboncoin, 2 écrans).
 * S'appuie sur publier-flow.js (logique pure) et les routes existantes : POST
 * /api/community-sources (titre + catégorie + type + url dès la création), /:id/preview,
 * /:id/submit, /:id (PATCH). Brouillon conservé en localStorage ; compte requis. */
(function () {
  'use strict';
  var F = window.PublierFlow;
  var root = document.getElementById('pub-root');
  var DRAFT_KEY = 'lba-publier-draft';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); }); };
  var nbsp = function (s) { return String(s).replace(/ ([!?:;»])/g, ' $1').replace(/« /g, '« '); };

  function token() { try { return localStorage.getItem('lba-token') || ''; } catch (e) { return ''; } }
  function loadDraft() { try { return Object.assign(F.emptyDraft(), JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}')); } catch (e) { return F.emptyDraft(); } }
  function saveDraft(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) {} }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }

  var d = loadDraft();
  var CATS = [];
  var err = '';
  var busy = false;

  function authHeaders() { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }; }
  function familyLabel(g) { return String(g || 'autre').split('-').map(function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1) : w; }).join(' '); }
  function catLabel(slug) { for (var i = 0; i < CATS.length; i++) if (CATS[i].slug === slug) return CATS[i].label; return slug; }

  // ---- Gate compte requis -----------------------------------------------------
  function renderGate() {
    root.innerHTML = '<section class="pub-step"><h1>Publier une alerte</h1>' +
      '<p>Pour publier et suivre vos alertes, vous devez être connecté. Votre brouillon est conservé.</p>' +
      '<p><a class="pub-btn" style="display:inline-block;text-decoration:none" href="/connexion?next=/publier">Se connecter</a></p>' +
      devLink() + '</section>';
  }
  function devLink() {
    return '<p class="pub-dev">Vous êtes développeur ? <a class="inline-link" href="/proposer">Pour les développeurs : manifeste alert.json →</a></p>';
  }

  // ---- Rendu ------------------------------------------------------------------
  function render() {
    if (!token()) { renderGate(); return; }
    if (d.step === 'confirme') { renderConfirm(); return; }
    var step = d.step === 'details' ? 'details' : 'essentiel';
    var html = '<div class="pub-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + F.progress(step) + '"><i style="width:' + F.progress(step) + '%"></i></div>';
    html += '<p class="pub-stepinfo">Étape ' + (F.indexOf(step) + 1) + ' sur ' + F.STEPS.length + '</p>';
    html += '<section class="pub-step"><h1>' + esc(nbsp(F.STEP_TITLES[step])) + '</h1>';
    html += step === 'essentiel' ? bodyEssentiel() : bodyDetails();
    if (err) html += '<p class="pub-err" role="alert">' + err + '</p>';
    html += '</section>';
    html += actions(step);
    if (step === 'essentiel') html += devLink();
    root.innerHTML = html;
    bind(step);
  }

  function actions(step) {
    var h = '<div class="pub-actions">';
    if (step === 'details') h += '<button type="button" class="pub-btn ghost" id="pub-back">Retour</button>';
    if (step === 'essentiel') {
      h += '<button type="button" class="pub-btn" id="pub-next"' + (busy ? ' disabled' : '') + '>Continuer</button>';
    } else {
      // Écran 2 : « Continuer » lance l'aperçu ; « Valider » n'apparaît qu'après un aperçu réussi.
      if (!d.previewOk) h += '<button type="button" class="pub-btn" id="pub-preview"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Vérification…' : 'Continuer') + '</button>';
      else h += '<button type="button" class="pub-btn" id="pub-submit"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Envoi…' : 'Valider') + '</button>';
    }
    return h + '</div>';
  }

  // ---- Écran 1 : l'essentiel --------------------------------------------------
  function bodyEssentiel() {
    var title = d.title || '';
    var sugg = F.suggestCategories(title, CATS, 3);
    var h = '<label class="pub-field"><span>Quel est le titre de l’alerte ?</span>' +
      '<input type="text" id="f-title" maxlength="' + F.TITLE_MAX + '" placeholder="Ex. : Baisse de prix carte graphique RTX" value="' + esc(title) + '">' +
      '<span class="pub-hint"><span id="title-count">' + title.length + '</span>/' + F.TITLE_MAX + '</span></label>';

    h += '<div class="pub-field"><span id="sugg-lab">Catégories suggérées</span>';
    if (sugg.length) {
      h += '<div class="pub-cards pub-cats-sugg" role="group" aria-labelledby="sugg-lab">' +
        sugg.map(function (c) {
          return '<button type="button" class="pub-card pub-card-sm" data-cat="' + esc(c.slug) + '" aria-pressed="' + (d.category === c.slug) + '">' +
            '<b>' + esc(c.label) + '</b><span>' + esc(familyLabel(c.group)) + '</span></button>';
        }).join('') + '</div>';
    } else {
      h += '<p class="pub-hint">Saisissez un titre pour voir des suggestions, ou choisissez ci-dessous.</p>';
    }
    h += '</div>';

    var groups = F.groupedCategories(CATS);
    h += '<label class="pub-field"><span>Ou choisissez une autre catégorie</span>' +
      '<select id="f-cat"><option value="">— Sélectionnez une catégorie —</option>' +
      groups.map(function (g) {
        return '<optgroup label="' + esc(familyLabel(g.group)) + '">' +
          g.items.map(function (it) { return '<option value="' + esc(it.slug) + '"' + (d.category === it.slug ? ' selected' : '') + '>' + esc(it.label) + '</option>'; }).join('') +
          '</optgroup>';
      }).join('') + '</select></label>';
    return h;
  }

  // ---- Écran 2 : détails ------------------------------------------------------
  function bodyDetails() {
    var h = '<div class="pub-cards" role="group" aria-label="Type de surveillance">' +
      Object.keys(F.TYPES).map(function (k) {
        var t = F.TYPES[k];
        return '<button type="button" class="pub-card" data-type="' + k + '" aria-pressed="' + (d.type === k) + '">' +
          '<b>' + esc(t.label) + '</b><span>' + esc(nbsp(t.example)) + '</span></button>';
      }).join('') + '</div>';

    if (d.type) {
      h += '<div class="pub-detailblock">';
      h += '<label class="pub-field"><span>L’adresse à surveiller (https)</span>' +
        '<input type="url" id="f-url" inputmode="url" placeholder="https://exemple.fr/page" value="' + esc(d.url) + '"></label>';
      if (d.type === 'page') {
        h += '<label class="pub-field"><span>Zone à surveiller (facultatif)</span>' +
          '<input type="text" id="f-zone" placeholder="#prix ou .tarifs" value="' + esc(d.zone) + '">' +
          '<span class="pub-hint">Pour ne suivre qu’une partie de la page : une balise (ex. <code>article</code>), un identifiant (<code>#prix</code>) ou une classe (<code>.tarifs</code>). Laissez vide pour toute la page.</span></label>';
      }
      h += '<label class="pub-field"><span>Message d’alerte (facultatif)</span>' +
        '<input type="text" id="f-msg" maxlength="280" placeholder="Ce qui sera affiché quand ça change" value="' + esc(d.alert_message) + '"></label>';
      h += '<label class="pub-field"><span>Lien d’alerte (facultatif)</span>' +
        '<input type="url" id="f-link" placeholder="https://… (page à ouvrir)" value="' + esc(d.alert_url) + '"></label>';
      if (d.type === 'agenda') {
        h += '<label class="pub-field"><span>Préavis (jours avant l’évènement)</span>' +
          '<input type="number" id="f-preavis" min="0" max="30" value="' + esc(d.preavis) + '"></label>';
      }
      // Résultat d'aperçu sur la même page.
      if (d.previewExtract != null) {
        h += '<p><strong>Texte extrait :</strong></p><div class="pub-extract">' + (d.previewExtract ? esc(d.previewExtract) : '<em>(aucun texte)</em>') + '</div>';
      }
      if (d.previewUnstable) h += '<div class="pub-warn" role="alert">⚠️ Cette page change à chaque lecture (contenu dynamique). Risque de fausses alertes : ciblez une zone plus stable.</div>';
      if (d.previewOk) h += '<p class="pub-ok">✓ Aperçu réussi. Vous pouvez valider votre alerte.</p>';
      h += '</div>';
    }
    return h;
  }

  // ---- Confirmation -----------------------------------------------------------
  function renderConfirm() {
    root.innerHTML = '<section class="pub-step pub-confirm"><h1>Merci !</h1>' +
      '<p>Votre alerte « ' + esc(d.confirmName || 'votre alerte') + ' » est en cours de vérification. ' +
      'Nous vous préviendrons dès qu’elle sera publiée.</p>' +
      '<div class="pub-actions">' +
      '<a class="pub-btn" style="text-decoration:none;text-align:center" href="/mes-publications">Mes publications</a>' +
      '<button type="button" class="pub-btn ghost" id="pub-again">Publier une autre alerte</button>' +
      '</div></section>';
    var again = document.getElementById('pub-again');
    if (again) again.onclick = function () { clearDraft(); d = F.emptyDraft(); err = ''; render(); };
  }

  // ---- Interactions -----------------------------------------------------------
  function bind(step) {
    var back = document.getElementById('pub-back');
    if (back) back.onclick = function () { err = ''; d.step = 'essentiel'; saveDraft(d); render(); };
    var next = document.getElementById('pub-next');
    if (next) next.onclick = onNext;
    var pv = document.getElementById('pub-preview');
    if (pv) pv.onclick = onPreview;
    var sub = document.getElementById('pub-submit');
    if (sub) sub.onclick = submit;

    if (step === 'essentiel') {
      var ti = document.getElementById('f-title');
      if (ti) ti.oninput = function () {
        d.title = ti.value; err = ''; saveDraft(d);
        var cnt = document.getElementById('title-count'); if (cnt) cnt.textContent = String((d.title || '').length);
        renderSuggestions();
      };
      bindSuggestions();
      var sel = document.getElementById('f-cat');
      if (sel) sel.onchange = function () { d.category = sel.value || null; err = ''; saveDraft(d); render(); };
    }
    if (step === 'details') {
      [].forEach.call(root.querySelectorAll('.pub-card[data-type]'), function (b) {
        b.onclick = function () { setField('type', b.getAttribute('data-type')); render(); };
      });
      wire('f-url', 'url'); wire('f-zone', 'zone'); wire('f-msg', 'alert_message'); wire('f-link', 'alert_url'); wire('f-preavis', 'preavis');
    }
  }
  function bindSuggestions() {
    [].forEach.call(root.querySelectorAll('.pub-cats-sugg .pub-card'), function (b) {
      b.onclick = function () {
        d.category = b.getAttribute('data-cat'); err = ''; saveDraft(d);
        var sel = document.getElementById('f-cat'); if (sel) sel.value = d.category;
        [].forEach.call(root.querySelectorAll('.pub-cats-sugg .pub-card'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        render();
      };
    });
  }
  // Re-rendu ciblé des suggestions pendant la frappe (sans reconstruire tout l'écran).
  function renderSuggestions() {
    var host = document.querySelector('.pub-cats-sugg');
    var labHost = host ? host.parentNode : document.querySelector('[aria-labelledby="sugg-lab"], #sugg-lab');
    var sugg = F.suggestCategories(d.title || '', CATS, 3);
    var wrap = document.getElementById('sugg-lab') ? document.getElementById('sugg-lab').parentNode : null;
    if (!wrap) return;
    var html = '<span id="sugg-lab">Catégories suggérées</span>';
    if (sugg.length) {
      html += '<div class="pub-cards pub-cats-sugg" role="group" aria-labelledby="sugg-lab">' +
        sugg.map(function (c) {
          return '<button type="button" class="pub-card pub-card-sm" data-cat="' + esc(c.slug) + '" aria-pressed="' + (d.category === c.slug) + '"><b>' + esc(c.label) + '</b><span>' + esc(familyLabel(c.group)) + '</span></button>';
        }).join('') + '</div>';
    } else {
      html += '<p class="pub-hint">Saisissez un titre pour voir des suggestions, ou choisissez ci-dessous.</p>';
    }
    wrap.innerHTML = html;
    bindSuggestions();
  }
  function wire(id, field) {
    var el = document.getElementById(id); if (!el) return;
    el.oninput = function () { setField(field, el.value); };
  }
  function setField(field, val) {
    d[field] = val;
    if (F.invalidatesPreview(field)) { d.previewOk = false; d.previewExtract = null; d.previewUnstable = false; }
    err = ''; saveDraft(d);
  }

  function onNext() {
    err = '';
    var v = F.validateStep('essentiel', d);
    if (!v.ok) { err = esc(v.error); render(); return; }
    d.step = 'details'; saveDraft(d); render();
  }

  // Écran 2 « Continuer » → création (si besoin) + aperçu sur la même page.
  async function onPreview() {
    err = '';
    var v = F.validateStep('details', d);
    if (!v.ok) { err = esc(v.error); render(); return; }
    busy = true; render();
    try {
      if (!d.id) {
        var cr = await fetch('/api/community-sources', { method: 'POST', headers: authHeaders(), body: JSON.stringify(F.createBody(d)) });
        var cb = await cr.json().catch(function () { return {}; });
        if (!cr.ok) { var m = F.mapCreateError(cr.status, cb); err = esc(m.message) + (m.link ? ' <a href="' + esc(m.link) + '">' + esc(m.linkLabel) + '</a>' : ''); busy = false; render(); return; }
        d.id = cb.id; d.status = cb.status || 'draft'; d.syncedUrl = d.url; d.syncedZone = d.zone || ''; saveDraft(d);
      } else if (d.url !== d.syncedUrl || (d.zone || '') !== (d.syncedZone || '')) {
        var ar = await fetch('/api/community-sources/' + encodeURIComponent(d.id), { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(F.addressBody(d)) });
        var ab = await ar.json().catch(function () { return {}; });
        if (!ar.ok) { var m2 = F.mapCreateError(ar.status, ab); err = esc(m2.message) + (m2.link ? ' <a href="' + esc(m2.link) + '">' + esc(m2.linkLabel) + '</a>' : ''); busy = false; render(); return; }
        d.status = ab.status || 'draft'; d.syncedUrl = d.url; d.syncedZone = d.zone || ''; saveDraft(d);
      }
      var pr = await fetch('/api/community-sources/' + encodeURIComponent(d.id) + '/preview', { method: 'POST', headers: authHeaders(), body: '{}' });
      var pb = await pr.json().catch(function () { return {}; });
      if (!pr.ok || pb.ok === false) {
        d.previewOk = false; d.previewExtract = (pb.detected && pb.detected.excerpt) || '';
        err = esc((pb && pb.error) || 'L’aperçu a échoué. Vérifiez l’adresse ou la zone.');
      } else {
        d.previewOk = true;
        d.previewExtract = (pb.detected && pb.detected.excerpt) || '';
        d.previewUnstable = !!pb.unstable;
        if (pb.status) d.status = pb.status;
      }
      saveDraft(d);
    } catch (e) { err = 'Erreur réseau, réessayez.'; }
    busy = false; render();
  }

  async function submit() {
    if (!d.id || !d.previewOk) { err = 'Lancez d’abord un aperçu réussi.'; render(); return; }
    busy = true; render();
    try {
      var r = await fetch('/api/community-sources/' + encodeURIComponent(d.id) + '/submit', { method: 'POST', headers: authHeaders(), body: '{}' });
      var b = await r.json().catch(function () { return {}; });
      if (!r.ok) { err = esc(b.error || 'Soumission impossible.'); busy = false; render(); return; }
      var name = d.title || 'votre alerte';
      clearDraft(); d = F.emptyDraft(); d.step = 'confirme'; d.confirmName = name; busy = false; err = '';
      render();
    } catch (e) { err = 'Erreur réseau, réessayez.'; busy = false; render(); }
  }

  // Hydrate le brouillon depuis ?id= (édition depuis « Mes publications »).
  async function hydrateFromId(id) {
    try {
      var r = await fetch('/api/community-sources', { headers: authHeaders() });
      var b = await r.json().catch(function () { return {}; });
      var s = (b.sources || []).filter(function (x) { return x.id === id; })[0];
      if (!s) return;
      var typeByEngine = { 'veille-page': 'page', 'veille-rss': 'rss', 'veille-agenda': 'agenda' };
      var cfg = s.engine_config || {};
      d = Object.assign(F.emptyDraft(), {
        id: s.id, status: s.status, title: s.name || '',
        category: Array.isArray(s.categories) && s.categories.length ? s.categories[0] : null,
        type: typeByEngine[s.engine] || null, url: s.endpoint_url || '', zone: cfg.zone || '',
        alert_message: cfg.message || '', alert_url: cfg.url || '', preavis: cfg.preavis != null ? cfg.preavis : 1,
        syncedUrl: s.endpoint_url || '', syncedZone: cfg.zone || '', step: 'essentiel',
      });
      saveDraft(d);
    } catch (e) { /* on garde le brouillon local */ }
  }

  // ---- Démarrage --------------------------------------------------------------
  document.body.classList.remove('loading');
  var editId = new URLSearchParams(window.location.search).get('id');
  fetch('/api/categories', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.json(); })
    .then(function (list) { CATS = Array.isArray(list) ? list : []; })
    .catch(function () {})
    .then(function () { if (editId && token()) return hydrateFromId(editId); })
    .then(function () { render(); });
})();
