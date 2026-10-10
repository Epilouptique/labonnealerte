/* publier.js — UI de l'assistant « Publier une alerte ». S'appuie sur publier-flow.js
 * (logique pure) et sur les routes des lots 2-3 : POST /api/community-sources, /:id/preview,
 * /:id/submit. Brouillon conservé en localStorage ; compte requis. Aucune logique métier ici. */
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

  // ---- Gate compte requis -----------------------------------------------------
  function renderGate() {
    root.innerHTML = '<section class="pub-step"><h1>Publier une alerte</h1>' +
      '<p>Pour publier et suivre vos alertes, vous devez être connecté. Votre brouillon est conservé.</p>' +
      '<p><a class="pub-btn" style="display:inline-block;text-decoration:none" href="/connexion?next=/publier">Se connecter</a></p>' +
      devLink() + '</section>';
  }
  function devLink() {
    return '<p class="pub-dev">Vous êtes développeur ? <a class="inline-link" href="/proposer">Pour les développeurs : manifeste alert.json →</a></p>';
  }

  // ---- Rendu d'une étape ------------------------------------------------------
  function render() {
    if (!token()) { renderGate(); return; }
    var step = d.step;
    var html = '<div class="pub-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + F.progress(step) + '"><i style="width:' + F.progress(step) + '%"></i></div>';
    html += '<p class="pub-stepinfo">Étape ' + (F.indexOf(step) + 1) + ' sur ' + F.STEPS.length +
      (d.id ? ' · <button type="button" class="link-btn" id="pub-delete">Supprimer ce brouillon</button>' : '') + '</p>';
    html += '<section class="pub-step"><h1>' + esc(nbsp(F.STEP_TITLES[step])) + '</h1>';
    html += BODY[step] ? BODY[step]() : '';
    if (err) html += '<p class="pub-err" role="alert">' + err + '</p>';
    html += '</section>';
    html += '<div class="pub-bar">';
    if (F.indexOf(step) > 0) html += '<button type="button" class="pub-btn ghost" id="pub-back">Retour</button>';
    html += '<button type="button" class="pub-btn" id="pub-next"' + (busy ? ' disabled' : '') + '>' + nextLabel(step) + '</button>';
    html += '</div>';
    if (step === 'type') html += devLink();
    root.innerHTML = html;
    bind(step);
  }

  function nextLabel(step) {
    if (busy) return 'Veuillez patienter…';
    if (step === 'apercu') return 'Continuer';
    if (step === 'recap') return 'Soumettre pour validation';
    return 'Continuer';
  }

  var BODY = {
    type: function () {
      return '<div class="pub-cards" role="group" aria-label="Type de surveillance">' +
        Object.keys(F.TYPES).map(function (k) {
          var t = F.TYPES[k];
          return '<button type="button" class="pub-card" data-type="' + k + '" aria-pressed="' + (d.type === k) + '">' +
            '<b>' + esc(t.label) + '</b><span>' + esc(nbsp(t.example)) + '</span></button>';
        }).join('') + '</div>';
    },
    adresse: function () {
      var h = '<label class="pub-field"><span>Adresse à surveiller (https)</span>' +
        '<input type="url" id="f-url" inputmode="url" placeholder="https://exemple.fr/page" value="' + esc(d.url) + '"></label>';
      if (d.type === 'page') {
        h += '<label class="pub-field"><span>Zone à surveiller (facultatif)</span>' +
          '<input type="text" id="f-zone" placeholder="#prix ou .tarifs" value="' + esc(d.zone) + '">' +
          '<span class="pub-hint">Pour ne suivre qu’une partie de la page : une balise (ex. <code>article</code>), un identifiant (<code>#prix</code>) ou une classe (<code>.tarifs</code>). Laissez vide pour toute la page.</span></label>';
      }
      return h;
    },
    presentation: function () {
      var h = '<label class="pub-field"><span>Nom de l’alerte</span>' +
        '<input type="text" id="f-name" maxlength="60" placeholder="Ex. : Tarifs Netflix" value="' + esc(d.name) + '"><span class="pub-hint">De 3 à 60 caractères. Sert aussi de description courte.</span></label>';
      h += '<div class="pub-field"><span id="cats-lab">Catégories (au moins une)</span><div class="pub-cats" role="group" aria-labelledby="cats-lab">' +
        CATS.map(function (c) {
          var on = d.categories.indexOf(c.slug) >= 0;
          return '<label><input type="checkbox" value="' + esc(c.slug) + '"' + (on ? ' checked' : '') + '> ' + esc(c.label) + '</label>';
        }).join('') + '</div></div>';
      h += '<label class="pub-field"><span>Message d’alerte (facultatif)</span>' +
        '<input type="text" id="f-msg" maxlength="280" placeholder="Ce qui sera affiché quand ça change" value="' + esc(d.alert_message) + '"></label>';
      h += '<label class="pub-field"><span>Lien d’alerte (facultatif)</span>' +
        '<input type="url" id="f-link" placeholder="https://… (page à ouvrir)" value="' + esc(d.alert_url) + '"></label>';
      if (d.type === 'agenda') {
        h += '<label class="pub-field"><span>Préavis (jours avant l’évènement)</span>' +
          '<input type="number" id="f-preavis" min="0" max="30" value="' + esc(d.preavis) + '"></label>';
      }
      return h;
    },
    apercu: function () {
      var h = '<p>Nous allons lire l’adresse et vous montrer ce qui sera surveillé. Rien n’est enregistré ni envoyé.</p>';
      if (!d.previewExtract && !d.previewOk) {
        h += '<p><button type="button" class="pub-btn" id="pub-preview" style="max-width:260px"' + (busy ? ' disabled' : '') + '>Lancer l’aperçu</button></p>';
      }
      if (d.previewExtract != null) {
        h += '<p><strong>Texte extrait :</strong></p><div class="pub-extract">' + (d.previewExtract ? esc(d.previewExtract) : '<em>(aucun texte)</em>') + '</div>';
        h += '<p><button type="button" class="link-btn" id="pub-preview">Relancer l’aperçu</button></p>';
      }
      if (d.previewUnstable) h += '<div class="pub-warn" role="alert">⚠️ Cette page change à chaque lecture (contenu dynamique). Risque de fausses alertes : ciblez une zone plus stable à l’étape précédente.</div>';
      if (d.previewOk) h += '<p class="pub-hint">Aperçu réussi. Vous pouvez continuer.</p>';
      return h;
    },
    recap: function () {
      var t = F.TYPES[d.type] || {};
      return '<ul class="pub-recap">' +
        li('Type', t.label) + li('Adresse', d.url) + (d.zone ? li('Zone', d.zone) : '') +
        li('Nom', d.name) + li('Catégories', (d.categories || []).join(', ')) +
        (d.alert_message ? li('Message', d.alert_message) : '') + (d.alert_url ? li('Lien', d.alert_url) : '') +
        (d.type === 'agenda' ? li('Préavis', d.preavis + ' j') : '') + '</ul>' +
        '<p class="pub-hint">En soumettant, votre alerte part en revue. Elle sera visible publiquement une fois validée, avec le badge « Communautaire ».</p>';
    },
  };
  function li(k, v) { return '<li><strong>' + esc(k) + ' :</strong> ' + esc(v || '—') + '</li>'; }

  // ---- Interactions -----------------------------------------------------------
  function bind(step) {
    var back = document.getElementById('pub-back');
    if (back) back.onclick = function () { err = ''; d.step = F.prevStep(step); saveDraft(d); render(); };
    var next = document.getElementById('pub-next');
    if (next) next.onclick = onNext;
    var del = document.getElementById('pub-delete');
    if (del) del.onclick = deleteDraft;

    if (step === 'type') {
      [].forEach.call(root.querySelectorAll('.pub-card'), function (b) {
        b.onclick = function () { setField('type', b.getAttribute('data-type')); render(); };
      });
    }
    if (step === 'adresse') {
      wire('f-url', 'url'); wire('f-zone', 'zone');
    }
    if (step === 'presentation') {
      wire('f-name', 'name'); wire('f-msg', 'alert_message'); wire('f-link', 'alert_url'); wire('f-preavis', 'preavis');
      [].forEach.call(root.querySelectorAll('.pub-cats input'), function (cb) {
        cb.onchange = function () {
          var set = d.categories.slice();
          if (cb.checked) { if (set.indexOf(cb.value) < 0) set.push(cb.value); }
          else set = set.filter(function (x) { return x !== cb.value; });
          if (set.length > 3) { cb.checked = false; return; }
          d.categories = set; saveDraft(d);
        };
      });
    }
    if (step === 'apercu') {
      var pv = document.getElementById('pub-preview');
      if (pv) pv.onclick = runPreview;
    }
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
    var step = d.step;
    var v = F.validateStep(step, d);
    if (!v.ok) { err = esc(v.error); render(); return; }
    if (step === 'recap') { submit(); return; }
    if (step === 'presentation') { savePresentation(); return; }
    d.step = F.nextStep(step); saveDraft(d); render();
  }

  // Étape « présentation » : PATCH nom/catégories/perso puis passage au récap.
  async function savePresentation() {
    if (!d.id) { err = 'Lancez d’abord un aperçu.'; d.step = 'apercu'; render(); return; }
    busy = true; render();
    try {
      var r = await fetch('/api/community-sources/' + encodeURIComponent(d.id), { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(F.presentationBody(d)) });
      var b = await r.json().catch(function () { return {}; });
      if (!r.ok) { err = esc(b.error || 'Enregistrement impossible.'); busy = false; render(); return; }
      busy = false; d.step = 'recap'; saveDraft(d); render();
    } catch (e) { err = 'Erreur réseau, réessayez.'; busy = false; render(); }
  }

  // Création du brouillon minimal (si besoin), ou MAJ de l'adresse si elle a changé,
  // puis aperçu. Étape « apercu ».
  async function runPreview() {
    err = ''; busy = true; render();
    try {
      if (!d.id) {
        var cr = await fetch('/api/community-sources', { method: 'POST', headers: authHeaders(), body: JSON.stringify(F.createBody(d)) });
        var cb = await cr.json().catch(function () { return {}; });
        if (!cr.ok) { var m = F.mapCreateError(cr.status, cb); err = esc(m.message) + (m.link ? ' <a href="' + esc(m.link) + '">' + esc(m.linkLabel) + '</a>' : ''); busy = false; render(); return; }
        d.id = cb.id; d.status = cb.status || 'draft'; d.syncedUrl = d.url; d.syncedZone = d.zone || ''; saveDraft(d);
      } else if (d.url !== d.syncedUrl || (d.zone || '') !== (d.syncedZone || '')) {
        // L'adresse/zone a changé après création → PATCH (repasse en draft côté serveur).
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
    if (!d.id) { err = 'Lancez d’abord un aperçu.'; d.step = 'apercu'; render(); return; }
    busy = true; render();
    try {
      var r = await fetch('/api/community-sources/' + encodeURIComponent(d.id) + '/submit', { method: 'POST', headers: authHeaders(), body: '{}' });
      var b = await r.json().catch(function () { return {}; });
      if (!r.ok) { err = esc(b.error || 'Soumission impossible.'); busy = false; render(); return; }
      clearDraft();
      root.innerHTML = '<section class="pub-step"><h1>C’est envoyé !</h1>' +
        '<p>Votre alerte « ' + esc(d.name) + ' » est en revue. Vous la retrouverez dans ' +
        '<a class="inline-link" href="/mes-publications">Mes publications</a>.</p></section>';
    } catch (e) { err = 'Erreur réseau, réessayez.'; busy = false; render(); }
  }

  async function deleteDraft() {
    if (!d.id) { clearDraft(); d = F.emptyDraft(); render(); return; }
    if (!window.confirm('Supprimer définitivement ce brouillon ?')) return;
    busy = true; render();
    try {
      var r = await fetch('/api/community-sources/' + encodeURIComponent(d.id), { method: 'DELETE', headers: authHeaders() });
      var b = await r.json().catch(function () { return {}; });
      if (!r.ok) { err = esc(b.error || 'Suppression impossible.'); busy = false; render(); return; }
    } catch (e) { /* on efface quand même localement */ }
    clearDraft(); d = F.emptyDraft(); busy = false; err = ''; render();
  }

  // Hydrate le brouillon depuis ?id= (édition depuis « Mes publications »).
  async function hydrateFromId(id) {
    try {
      var r = await fetch('/api/community-sources', { headers: authHeaders() });
      var b = await r.json().catch(function () { return {}; });
      var s = (b.sources || []).filter(function (x) { return x.id === id; })[0];
      if (!s) return false;
      var typeByEngine = { 'veille-page': 'page', 'veille-rss': 'rss', 'veille-agenda': 'agenda' };
      var cfg = s.engine_config || {};
      d = Object.assign(F.emptyDraft(), {
        id: s.id, status: s.status, type: typeByEngine[s.engine] || null,
        url: s.endpoint_url || '', zone: cfg.zone || '', name: s.name || '',
        categories: Array.isArray(s.categories) ? s.categories : [],
        alert_message: cfg.message || '', alert_url: cfg.url || '', preavis: cfg.preavis != null ? cfg.preavis : 1,
        syncedUrl: s.endpoint_url || '', syncedZone: cfg.zone || '', step: 'adresse',
      });
      saveDraft(d);
      return true;
    } catch (e) { return false; }
  }

  // ---- Démarrage --------------------------------------------------------------
  document.body.classList.remove('loading');
  var editId = new URLSearchParams(window.location.search).get('id');
  fetch('/api/categories', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.json(); })
    .then(function (list) { CATS = Array.isArray(list) ? list : []; })
    .catch(function () {})
    .then(function () {
      if (editId && token()) return hydrateFromId(editId);
    })
    .then(function () { render(); });
})();
