(function () {
  'use strict';

  var OPENALERT_URL = 'https://github.com/Epilouptique/labonnealerte/blob/main/OPENALERT.md';

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

  // ---------- Accordéon : un seul formulaire ouvert à la fois ----------
  var openCard = null; // { form, btn }

  function closeOpen() {
    if (!openCard) return;
    openCard.form.hidden = true;
    openCard.btn.textContent = "S'abonner";
    openCard = null;
  }

  function toggleCard(form, btn) {
    if (openCard && openCard.form === form) {
      closeOpen();
      return;
    }
    closeOpen();
    form.hidden = false;
    btn.textContent = 'Annuler';
    openCard = { form: form, btn: btn };
    var input = form.querySelector('input[type="email"]');
    if (input) input.focus();
  }

  // ---------- Soumission d'un formulaire de carte ----------
  function handleSubmit(e, form, sourceId) {
    e.preventDefault();
    var msg = form.querySelector('.form-message');
    var input = form.querySelector('input[type="email"]');
    msg.className = 'form-message';
    msg.textContent = '';

    var email = input.value.trim();
    if (!email) {
      msg.className = 'form-message err';
      msg.textContent = 'Email invalide';
      return;
    }

    fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, source_id: sourceId }),
    })
      .then(function (res) {
        if (res.status === 200) {
          msg.className = 'form-message ok';
          msg.textContent = 'Vérifie ta boîte mail pour confirmer.';
          form.reset();
        } else if (res.status === 409) {
          msg.className = 'form-message err';
          msg.textContent = 'Tu es déjà inscrit à cette alerte.';
        } else if (res.status === 400) {
          msg.className = 'form-message err';
          msg.textContent = 'Email invalide.';
        } else if (res.status === 404) {
          msg.className = 'form-message err';
          msg.textContent = 'Cette source est introuvable.';
        } else {
          throw new Error('HTTP ' + res.status);
        }
      })
      .catch(function () {
        msg.className = 'form-message err';
        msg.textContent = 'Une erreur est survenue, réessaie dans un instant.';
      });
  }

  // ---------- Rendu des cartes sources ----------
  var STATE_LABELS = { active: 'Active', pending: 'En attente', inactive: 'Inactive' };
  var BADGE_LABELS = { official: 'official', verified: 'verified', community: 'community' };

  function buildSourceCard(src) {
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
    btn.textContent = "S'abonner";

    foot.appendChild(stateEl);
    foot.appendChild(btn);

    // Formulaire inline, masqué par défaut (accordéon).
    var form = document.createElement('form');
    form.className = 'subscribe-inline';
    form.hidden = true;
    form.setAttribute('novalidate', '');

    var row = document.createElement('div');
    row.className = 'field-row';
    var input = document.createElement('input');
    input.type = 'email';
    input.placeholder = 'ton@email.fr';
    input.autocomplete = 'email';
    input.required = true;
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Recevoir les alertes';
    row.appendChild(input);
    row.appendChild(submit);

    var msg = document.createElement('p');
    msg.className = 'form-message';
    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');

    var reassurance = document.createElement('p');
    reassurance.className = 'reassurance';
    reassurance.textContent =
      'Un email de confirmation, puis uniquement les alertes. Désinscription en un clic dans chaque email.';

    form.appendChild(row);
    form.appendChild(msg);
    form.appendChild(reassurance);

    btn.addEventListener('click', function () { toggleCard(form, btn); });
    form.addEventListener('submit', function (e) { handleSubmit(e, form, src.id); });

    card.appendChild(head);
    card.appendChild(desc);
    card.appendChild(foot);
    card.appendChild(form);
    return card;
  }

  function buildProposeCard() {
    var a = document.createElement('a');
    a.className = 'propose-card';
    a.href = OPENALERT_URL;
    a.target = '_blank';
    a.rel = 'noopener';

    var plus = document.createElement('span');
    plus.className = 'propose-plus';
    plus.setAttribute('aria-hidden', 'true');
    plus.textContent = '+';

    var text = document.createElement('span');
    text.className = 'propose-text';
    text.textContent = 'Proposez votre source d’alerte';

    a.appendChild(plus);
    a.appendChild(text);
    return a;
  }

  function renderSources(sources) {
    var list = document.getElementById('sources-list');
    list.innerHTML = '';
    openCard = null;

    sources.forEach(function (src) {
      list.appendChild(buildSourceCard(src));
    });

    // Bloc "proposer une source" toujours en dernier dans la grille.
    list.appendChild(buildProposeCard());
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

  loadSources();
})();
