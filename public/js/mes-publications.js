/* mes-publications.js — liste des sources de l'auteur (statut lisible + actions).
 * S'appuie sur GET /api/community-sources et les routes preview/submit (lots 2-3).
 * Aucune source d'un autre compte n'est renvoyée par l'API (filtre author_subscriber_id). */
(function () {
  'use strict';
  var F = window.PublierFlow;
  var root = document.getElementById('mp-root');
  var line = document.getElementById('mp-status-line');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); }); };
  function token() { try { return localStorage.getItem('lba-token') || ''; } catch (e) { return ''; } }
  function headers() { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }; }

  document.body.classList.remove('loading');
  if (!token()) {
    line.innerHTML = 'Connectez-vous pour voir vos publications : <a class="inline-link" href="/connexion?next=/mes-publications">Se connecter</a>.';
    return;
  }

  var cls = { published: 'published', suspended: 'suspended', review: 'review' };

  function load() {
    fetch('/api/community-sources', { headers: headers() })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); })
      .then(function (x) {
        if (!x.ok) { line.textContent = (x.b && x.b.error) || 'Impossible de charger vos publications.'; return; }
        render(x.b.sources || []);
      })
      .catch(function () { line.textContent = 'Erreur réseau.'; });
  }

  function render(sources) {
    line.remove();
    var old = root.querySelectorAll('.mp-item, .mp-empty'); [].forEach.call(old, function (n) { n.remove(); });
    if (!sources.length) {
      var p = document.createElement('p'); p.className = 'mp-empty';
      p.innerHTML = 'Vous n’avez encore rien publié. <a class="inline-link" href="/publier">Publier une alerte →</a>';
      root.appendChild(p); return;
    }
    sources.forEach(function (s) {
      var label = F.statusLabel(s.status, s.status_reason);
      var div = document.createElement('div'); div.className = 'mp-item';
      var acts = '';
      if (s.status === 'draft' || s.status === 'testing') {
        acts += '<a href="/publier?id=' + encodeURIComponent(s.id) + '">Modifier</a>';
        acts += '<button data-act="preview" data-id="' + esc(s.id) + '">Lancer un aperçu</button>';
      }
      if (s.status === 'testing') acts += '<button data-act="submit" data-id="' + esc(s.id) + '">Soumettre pour validation</button>';
      if (s.status === 'draft' || s.status === 'testing') acts += '<button data-act="delete" data-id="' + esc(s.id) + '">Supprimer</button>';
      if (s.status === 'published') acts += '<a href="/source/' + encodeURIComponent(s.id) + '/statut">Voir la fiche publique</a>';
      div.innerHTML = '<h2>' + esc(s.name) + '</h2>' +
        '<span class="mp-status ' + (cls[s.status] || '') + '">' + esc(label) + '</span> ' +
        '<span class="mp-msg">' + esc(s.engine || '') + ' · ' + esc(s.endpoint_url || '') + '</span>' +
        (acts ? '<div class="mp-actions">' + acts + '</div>' : '') +
        '<p class="mp-msg" data-msg></p>';
      root.appendChild(div);
    });
    [].forEach.call(root.querySelectorAll('[data-act]'), function (btn) {
      btn.onclick = function () { action(btn.getAttribute('data-act'), btn.getAttribute('data-id'), btn); };
    });
  }

  function action(act, id, btn) {
    var msg = btn.closest('.mp-item').querySelector('[data-msg]');
    if (act === 'delete') {
      if (!window.confirm('Supprimer définitivement ce brouillon ?')) return;
      btn.disabled = true; msg.textContent = 'Suppression…';
      fetch('/api/community-sources/' + encodeURIComponent(id), { method: 'DELETE', headers: headers() })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); })
        .then(function (x) { if (!x.ok) { btn.disabled = false; msg.textContent = (x.b && x.b.error) || 'Suppression impossible.'; return; } load(); })
        .catch(function () { btn.disabled = false; msg.textContent = 'Erreur réseau.'; });
      return;
    }
    btn.disabled = true; msg.textContent = 'En cours…';
    fetch('/api/community-sources/' + encodeURIComponent(id) + '/' + act, { method: 'POST', headers: headers(), body: '{}' })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); })
      .then(function (x) {
        btn.disabled = false;
        if (!x.ok && x.b && x.b.error) { msg.textContent = x.b.error; return; }
        if (act === 'preview') {
          if (x.b.ok === false) { msg.textContent = x.b.error || 'Aperçu échoué.'; return; }
          msg.textContent = 'Aperçu OK' + (x.b.unstable ? ' (page instable — attention aux fausses alertes).' : '.');
          load();
        } else { msg.textContent = (x.b && x.b.message) || 'Fait.'; load(); }
      })
      .catch(function () { btn.disabled = false; msg.textContent = 'Erreur réseau.'; });
  }

  load();
})();
