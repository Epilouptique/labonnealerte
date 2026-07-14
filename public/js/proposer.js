/* proposer.js — page /proposer : validation de manifeste + champ de tags + soumission.
   Externalisé depuis proposer.html pour respecter la CSP script-src 'self'. */

(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- Validation du manifeste ---------- */
  var lastParamsSchema = null; // schéma params du dernier manifeste validé (v2)
  var urlInput = document.getElementById('manifest-url');
  var validateBtn = document.getElementById('validate-btn');
  var resultBox = document.getElementById('validate-result');

  function previewCard(m) {
    var stateHtml;
    if (m.state === 'active') {
      stateHtml = '<div class="state active"><span class="dot-live"></span> Active en ce moment</div>';
    } else {
      stateHtml = '<div class="state idle"><span class="dot-idle"></span> Rien à signaler</div>';
    }
    return '' +
      '<div class="preview">' +
        '<div class="preview-label">Aperçu sur le kiosque</div>' +
        '<div class="card">' +
          '<div class="card-top"><h3>' + esc(m.name || '(sans nom)') + '</h3><span class="badge-ic community" title="Source communautaire" role="img" aria-label="Source communautaire"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.4 12.4l2.3 2.3 4.9-4.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div>' +
          '<p>' + esc(m.message || m.name || '') + '</p>' +
          stateHtml +
        '</div>' +
      '</div>';
  }

  function renderResult(data) {
    resultBox.hidden = false;

    if (data.network_error) {
      resultBox.innerHTML = '<div class="net-error">⚠️ ' + esc(data.network_error) + '</div>';
      return;
    }

    var checks = data.checks || [];
    var items = checks.map(function (c) {
      return '<li class="check-item ' + (c.ok ? 'ok' : 'err') + '">' +
        '<span class="mark">' + (c.ok ? '✓' : '✕') + '</span>' +
        '<span class="fld">' + esc(c.field) + '</span>' +
        '<span class="msg">' + esc(c.message) + '</span>' +
      '</li>';
    }).join('');

    var headline = data.valid
      ? '<div class="result-headline ok">✓ Manifeste valide — conforme au standard OpenAlert v0.1</div>'
      : '<div class="result-headline err">Des corrections sont nécessaires :</div>';

    var preview = (data.valid && data.manifest) ? previewCard(data.manifest) : '';

    // Source paramétrée : mémorise le schéma (pour la soumission) + montre la sonde.
    lastParamsSchema = (data.valid && data.manifest && data.manifest.params) ? data.manifest.params : null;
    var probeHtml = '';
    if (data.probe) {
      var pv = data.probe;
      probeHtml = '<div class="probe-block ' + (pv.valid ? 'ok' : 'err') + '">' +
        '<strong>Sonde dynamique</strong> — interrogation avec ' +
        '<code>' + esc(JSON.stringify(pv.example || {})) + '</code> : ' +
        (pv.valid ? '✓ réponse conforme au manifeste v1'
                  : '✕ ' + esc(pv.error || 'la réponse n\'est pas un manifeste v1 valide')) + '</div>';
    }

    resultBox.innerHTML = headline + '<ul class="check-list">' + items + '</ul>' + probeHtml + preview;
  }

  async function validate() {
    var url = urlInput.value.trim();
    if (!url) { urlInput.focus(); return; }

    validateBtn.disabled = true;
    var label = validateBtn.textContent;
    validateBtn.textContent = 'Validation…';
    resultBox.hidden = true;

    try {
      var res = await fetch('/api/dev/validate-manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
      });
      if (res.status === 429) {
        renderResult({ network_error: 'Trop de requêtes, réessayez dans une minute.' });
      } else {
        renderResult(await res.json());
      }
    } catch (e) {
      renderResult({ network_error: 'Erreur réseau : impossible de contacter le serveur.' });
    } finally {
      validateBtn.disabled = false;
      validateBtn.textContent = label;
    }
  }

  validateBtn.addEventListener('click', validate);
  urlInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); validate(); }
  });

  /* ---------- Champ de tags catégories (autocomplétion, max 3) ---------- */
  var MAX_CATS = 3;
  var PRESET = []; // chargé depuis /api/categories
  fetch('/api/categories', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (arr) { if (Array.isArray(arr)) PRESET = arr; })
    .catch(function () {});
  var selected = [];
  var pills = document.getElementById('tags-pills');
  var entry = document.getElementById('tag-entry');
  var suggest = document.getElementById('tags-suggest');
  var tagsBox = document.getElementById('tags-box');

  function slugify(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  }
  function labelFor(slug) {
    var p = PRESET.filter(function (x) { return x.slug === slug; })[0];
    return p ? p.label : slug;
  }
  function hideSuggest() { suggest.hidden = true; suggest.innerHTML = ''; }
  function renderPills() {
    pills.innerHTML = selected.map(function (s) {
      return '<span class="tag-pill" data-slug="' + esc(s) + '">' + esc(labelFor(s)) +
        '<button type="button" class="pill-x" aria-label="Retirer ' + esc(labelFor(s)) + '">×</button></span>';
    }).join('');
    var atMax = selected.length >= MAX_CATS;
    entry.disabled = atMax;
    entry.placeholder = atMax ? '' : (selected.length ? 'Ajouter…' : 'Ajouter une catégorie…');
    tagsBox.classList.toggle('full', atMax);
  }
  function addTag(slug) {
    slug = slugify(slug);
    if (!slug || selected.length >= MAX_CATS) { entry.value = ''; hideSuggest(); return; } // refus silencieux
    if (selected.indexOf(slug) === -1) selected.push(slug);
    entry.value = '';
    renderPills(); hideSuggest();
  }
  function removeTag(slug) { selected = selected.filter(function (s) { return s !== slug; }); renderPills(); }

  function renderSuggest() {
    var raw = entry.value.trim().toLowerCase();
    var q = slugify(entry.value);
    if (!raw || selected.length >= MAX_CATS) { hideSuggest(); return; }
    var matches = PRESET.filter(function (p) {
      return selected.indexOf(p.slug) === -1 &&
        (p.slug.indexOf(q) !== -1 || p.label.toLowerCase().indexOf(raw) !== -1);
    }).slice(0, 8); // ~8 suggestions pertinentes
    if (!matches.length) { hideSuggest(); return; }
    suggest.innerHTML = matches.map(function (p) {
      return '<li role="option" data-slug="' + p.slug + '">' + esc(p.label) + '</li>';
    }).join('');
    suggest.hidden = false;
  }

  entry.addEventListener('input', renderSuggest);
  entry.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      var first = suggest.hidden ? null : suggest.querySelector('li');
      if (first) addTag(first.getAttribute('data-slug'));
      else if (entry.value.trim()) addTag(entry.value); // tag libre
    } else if (e.key === 'Backspace' && !entry.value && selected.length) {
      removeTag(selected[selected.length - 1]);
    } else if (e.key === 'Escape') {
      hideSuggest();
    }
  });
  suggest.addEventListener('click', function (e) {
    var li = e.target.closest('li[data-slug]');
    if (li) { addTag(li.getAttribute('data-slug')); entry.focus(); }
  });
  pills.addEventListener('click', function (e) {
    var x = e.target.closest('.pill-x');
    if (x) removeTag(x.parentNode.getAttribute('data-slug'));
  });
  document.addEventListener('click', function (e) {
    if (!tagsBox.contains(e.target)) hideSuggest();
  });

  /* ---------- Soumission de la source ---------- */
  var form = document.getElementById('submit-form');
  var submitBtn = document.getElementById('submit-btn');
  var submitMsg = document.getElementById('submit-msg');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (selected.length < 1) {
      submitMsg.className = 'submit-msg err';
      submitMsg.textContent = 'Choisissez au moins une catégorie (3 maximum).';
      submitMsg.hidden = false;
      entry.focus();
      return;
    }
    var fd = new FormData(form);
    var body = {
      name: (fd.get('name') || '').trim(),
      description: (fd.get('description') || '').trim(),
      manifest_url: (fd.get('manifest_url') || '').trim(),
      github: (fd.get('github') || '').trim(),
      email: (fd.get('email') || '').trim(),
      categories: selected.slice(),
      params_schema: lastParamsSchema // null si source broadcast
    };

    submitBtn.disabled = true;
    var label = submitBtn.textContent;
    submitBtn.textContent = 'Envoi…';
    submitMsg.hidden = true;

    try {
      var res = await fetch('/api/dev/submit-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var data = await res.json().catch(function () { return {}; });
      if (res.status === 200) {
        submitMsg.className = 'submit-msg ok';
        submitMsg.textContent = data.message || 'Merci ! Votre source sera examinée manuellement avant publication.';
        form.reset();
        selected = [];
        renderPills();
      } else if (res.status === 429) {
        submitMsg.className = 'submit-msg err';
        submitMsg.textContent = 'Trop de requêtes, réessayez dans une minute.';
      } else {
        submitMsg.className = 'submit-msg err';
        submitMsg.textContent = data.error || 'Une erreur est survenue. Réessayez plus tard.';
      }
    } catch (e2) {
      submitMsg.className = 'submit-msg err';
      submitMsg.textContent = 'Erreur réseau : impossible de contacter le serveur.';
    } finally {
      submitMsg.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = label;
    }
  });

  renderPills();
})();
