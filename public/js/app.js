(function () {
  'use strict';

  // ---------- Thème ----------
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem('theme'); } catch (e) { /* ignore */ }
  if (stored === 'dark') root.classList.add('dark');
  if (stored === 'light') root.classList.add('light');

  var toggle = document.getElementById('theme-toggle');
  toggle.addEventListener('click', function () {
    // État courant : soit forcé par une classe, soit déduit du média.
    var isDark = root.classList.contains('dark') ||
      (!root.classList.contains('light') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    var next = isDark ? 'light' : 'dark';
    root.classList.remove('dark', 'light');
    root.classList.add(next);
    try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
  });

  // ---------- Éléments formulaire ----------
  var form = document.getElementById('subscribe-form');
  var emailInput = document.getElementById('email');
  var selectedSourceEl = document.getElementById('selected-source');
  var formMessage = document.getElementById('form-message');
  var currentSourceId = 'leboncoin-livraison'; // défaut
  var sourceNames = {};

  function selectSource(id, name) {
    currentSourceId = id;
    selectedSourceEl.hidden = false;
    selectedSourceEl.innerHTML = 'Alerte choisie : <strong></strong>';
    selectedSourceEl.querySelector('strong').textContent = name || id;
    document.getElementById('subscribe-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
    emailInput.focus();
  }

  // ---------- Rendu des cartes sources ----------
  var STATE_LABELS = { active: 'Active', pending: 'En attente', inactive: 'Inactive' };
  var BADGE_LABELS = { official: 'official', verified: 'verified', community: 'community' };

  function renderSources(sources) {
    var list = document.getElementById('sources-list');
    list.innerHTML = '';

    if (!sources.length) {
      list.innerHTML = '<p class="loading">Aucune source pour le moment.</p>';
      return;
    }

    sources.forEach(function (src) {
      sourceNames[src.id] = src.name;
      var state = src.state || 'inactive';

      var card = document.createElement('article');
      card.className = 'source-card';

      var head = document.createElement('div');
      head.className = 'source-head';

      var name = document.createElement('span');
      name.className = 'source-name';
      name.textContent = src.name;
      head.appendChild(name);

      if (src.badge) {
        var badge = document.createElement('span');
        badge.className = 'badge badge-' + src.badge;
        badge.textContent = BADGE_LABELS[src.badge] || src.badge;
        head.appendChild(badge);
      }

      var desc = document.createElement('p');
      desc.className = 'source-desc';
      desc.textContent = src.description || '';

      var foot = document.createElement('div');
      foot.className = 'source-foot';

      var stateEl = document.createElement('span');
      stateEl.className = 'state state-' + state;
      var dot = document.createElement('span');
      dot.className = 'dot';
      var label = document.createElement('span');
      label.textContent = STATE_LABELS[state] || state;
      stateEl.appendChild(dot);
      stateEl.appendChild(label);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-alert';
      btn.textContent = "M'alerter par email";
      btn.addEventListener('click', function () {
        selectSource(src.id, src.name);
      });

      foot.appendChild(stateEl);
      foot.appendChild(btn);

      card.appendChild(head);
      card.appendChild(desc);
      card.appendChild(foot);
      list.appendChild(card);
    });
  }

  function loadSources() {
    fetch('/api/sources')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(renderSources)
      .catch(function () {
        document.getElementById('sources-list').innerHTML =
          '<p class="sources-error">Impossible de charger les sources pour le moment.</p>';
      });
  }

  // ---------- Soumission du formulaire ----------
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    formMessage.className = 'form-message';
    formMessage.textContent = '';

    var email = emailInput.value.trim();
    if (!email) {
      formMessage.className = 'form-message err';
      formMessage.textContent = 'Email invalide';
      return;
    }

    fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, source_id: currentSourceId }),
    })
      .then(function (res) {
        if (res.status === 200) {
          formMessage.className = 'form-message ok';
          formMessage.textContent = 'Vérifie ta boîte mail pour confirmer.';
          form.reset();
        } else if (res.status === 409) {
          formMessage.className = 'form-message err';
          formMessage.textContent = 'Tu es déjà inscrit à cette alerte.';
        } else if (res.status === 400) {
          formMessage.className = 'form-message err';
          formMessage.textContent = 'Email invalide.';
        } else if (res.status === 404) {
          formMessage.className = 'form-message err';
          formMessage.textContent = 'Cette source est introuvable.';
        } else {
          throw new Error('HTTP ' + res.status);
        }
      })
      .catch(function () {
        formMessage.className = 'form-message err';
        formMessage.textContent = 'Une erreur est survenue, réessaie dans un instant.';
      });
  });

  loadSources();
})();
