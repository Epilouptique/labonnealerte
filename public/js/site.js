/* site.js — home LaBonneAlerte
   - toggle de thème (persisté dans localStorage, respecte prefers-color-scheme)
   - grille de cartes générée depuis GET /api/sources (fallback : cartes statiques)
   - formulaires d'abonnement branchés sur POST /api/subscribe */

(function () {
  'use strict';

  /* ---------------- Thème ---------------- */
  var STORAGE_KEY = 'lba-theme';
  var root = document.documentElement;

  function preferredTheme() {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
  }

  applyTheme(preferredTheme());

  window.toggleTheme = function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
  };

  /* ---------------- Abonnement ---------------- */
  // Révèle le formulaire inline d'une carte.
  window.revealForm = function (btn) {
    var card = btn.closest('.card');
    if (card) card.classList.add('open');
  };

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function showMsg(card, text, kind) {
    var form = card.querySelector('.sub-form');
    var existing = card.querySelector('.sub-msg');
    if (existing) existing.remove();
    if (form) form.style.display = 'none';
    var el = document.createElement('div');
    el.className = 'sub-msg ' + kind;
    el.textContent = text;
    (form || card).insertAdjacentElement('afterend', el);
  }

  async function submitSubscription(card) {
    var input = card.querySelector('.sub-form input');
    var email = input ? input.value.trim() : '';
    var sourceId = card.getAttribute('data-source-id') || undefined;

    if (!EMAIL_RE.test(email)) {
      input.focus();
      input.style.borderColor = 'var(--amber)';
      return;
    }

    var body = sourceId ? { email: email, source_id: sourceId } : { email: email };

    try {
      var res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.status === 200) {
        showMsg(card, 'Vérifie tes emails ✉️', 'ok');
      } else if (res.status === 409) {
        showMsg(card, 'Déjà inscrit', 'dup');
      } else {
        showMsg(card, 'Réessaie plus tard', 'err');
      }
    } catch (e) {
      showMsg(card, 'Réessaie plus tard', 'err');
    }
  }

  // Délégation d'événements : marche pour les cartes statiques ET dynamiques.
  document.addEventListener('click', function (e) {
    var reveal = e.target.closest('.sub-btn');
    if (reveal && !reveal.disabled) {
      window.revealForm(reveal);
      var inp = reveal.closest('.card').querySelector('.sub-form input');
      if (inp) inp.focus();
      return;
    }
    var ok = e.target.closest('.sub-form button');
    if (ok) {
      e.preventDefault();
      submitSubscription(ok.closest('.card'));
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches('.sub-form input')) {
      e.preventDefault();
      submitSubscription(e.target.closest('.card'));
    }
  });

  /* ---------------- Grille dynamique ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function badgeFor(badge) {
    var b = (badge || 'community').toLowerCase();
    if (b !== 'official' && b !== 'verified' && b !== 'community') b = 'community';
    return '<span class="badge ' + b + '">' + b + '</span>';
  }

  function stateFor(state) {
    if (state === 'active') {
      return '<div class="state active"><span class="dot-live"></span> Active en ce moment</div>';
    }
    return '<div class="state idle"><span class="dot-idle"></span> Rien à signaler</div>';
  }

  // Extrait le domaine affichable d'une URL (sans protocole ni www / chemin).
  function domainOf(url) {
    var s = String(url || '').replace(/^https?:\/\//, '').replace(/^www\./, '');
    return s.split('/')[0];
  }

  function cardHTML(s) {
    var cat = esc(s.category || '');
    var header =
      '<div class="card-top"><h3>' + esc(s.name) + '</h3>' + badgeFor(s.badge) + '</div>' +
      '<p>' + esc(s.description || '') + '</p>';

    // Source externe liée : pas d'abonnement, un lien de configuration vers le partenaire.
    if (s.type === 'linked') {
      var domain = domainOf(s.link_url);
      return '' +
        '<div class="card" data-cat="' + cat + '" data-source-id="' + esc(s.id) + '">' +
          header +
          '<div class="state partner"><span class="dot-idle"></span> Service partenaire</div>' +
          '<a class="link-btn" href="' + esc(s.link_url) + '" target="_blank" rel="noopener">' +
            'Configurer sur ' + esc(domain) + ' →</a>' +
        '</div>';
    }

    return '' +
      '<div class="card" data-cat="' + cat + '" data-source-id="' + esc(s.id) + '">' +
        header +
        stateFor(s.state) +
        '<button class="sub-btn" type="button">S\'abonner</button>' +
        '<div class="sub-form"><input type="email" placeholder="votre@email.fr" aria-label="Adresse email"><button type="button">OK</button></div>' +
        '<div class="endpoint">/api/sources/' + esc(s.id) + '/alert.json</div>' +
      '</div>';
  }

  /* ---------------- Kiosque : recherche + catégories + pagination ---------------- */
  var INITIAL = 6; // cartes catégorisées affichées au chargement (hors carte « Proposer »)
  var STEP = 9;    // cartes révélées par clic sur « Afficher plus »
  var cat = 'all', expanded = false;
  var cards = [], moreBtn = null, qInput = null, grid = null;

  function updateCounts() {
    var counts = { all: cards.length, plans: 0, risques: 0, tech: 0 };
    cards.forEach(function (c) {
      var k = c.dataset.cat;
      if (counts[k] != null) counts[k]++;
    });
    document.querySelectorAll('.chip-f').forEach(function (chip) {
      var span = chip.querySelector('.n');
      var v = counts[chip.dataset.cat];
      if (span) span.textContent = v != null ? v : 0;
    });
  }

  // Filtrage + pagination. La recherche/le filtre s'appliquent à TOUTES les cartes.
  function apply() {
    var q = (qInput.value || '').trim().toLowerCase();
    var searching = q.length > 0 || cat !== 'all';
    var hiddenCount = 0;

    cards.forEach(function (c) {
      var okCat = cat === 'all' || c.dataset.cat === cat;
      var okQ = !q || c.textContent.toLowerCase().indexOf(q) !== -1;
      c.classList.toggle('filtered', !(okCat && okQ));

      if (c.classList.contains('hidden-more')) {
        if (searching || expanded) { c.classList.remove('hidden-more'); c.dataset.more = '1'; }
      } else if (c.dataset.more && !searching && !expanded) {
        c.classList.add('hidden-more');
      }
      if (c.classList.contains('hidden-more') && okCat && okQ) hiddenCount++;
    });

    var nSpan = moreBtn.querySelector('.n');
    if (nSpan) nSpan.textContent = '(+' + Math.min(STEP, hiddenCount) + ')';
    moreBtn.style.display = (searching || expanded || hiddenCount === 0) ? 'none' : '';
  }

  function setupKiosk() {
    grid = document.getElementById('grid');
    moreBtn = document.getElementById('moreBtn');
    qInput = document.getElementById('q');
    if (!grid || !moreBtn || !qInput) return;

    // Toutes les cartes catégorisées (la carte « Proposer » n'a pas de data-cat → toujours visible).
    cards = Array.prototype.slice.call(grid.querySelectorAll('.card[data-cat]'));
    // Au chargement : les cartes au-delà du maximum initial sont masquées.
    cards.forEach(function (c, i) {
      c.classList.toggle('hidden-more', i >= INITIAL);
      delete c.dataset.more;
    });

    updateCounts();

    qInput.addEventListener('input', apply);
    document.getElementById('chips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip-f');
      if (!b) return;
      document.querySelectorAll('.chip-f').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      cat = b.dataset.cat;
      apply();
    });
    moreBtn.addEventListener('click', function () {
      var hidden = cards.filter(function (c) { return c.classList.contains('hidden-more'); });
      hidden.slice(0, STEP).forEach(function (c) { c.classList.remove('hidden-more'); c.dataset.more = '1'; });
      if (hidden.length <= STEP) expanded = true;
      apply();
    });

    apply();
  }

  async function loadSources() {
    var g = document.getElementById('grid');
    if (!g) return;
    var extras = document.getElementById('static-extras'); // ancre : EcoWatt + Proposer conservées
    try {
      var res = await fetch('/api/sources', { headers: { Accept: 'application/json' } });
      if (res.ok) {
        var sources = await res.json();
        if (Array.isArray(sources) && sources.length > 0 && extras) {
          // Sources actives en premier.
          sources.sort(function (a, b) {
            return (b.state === 'active' ? 1 : 0) - (a.state === 'active' ? 1 : 0);
          });
          extras.insertAdjacentHTML('beforebegin', sources.map(cardHTML).join(''));
          // Retire les cartes de démonstration (fallback) une fois l'API répondue.
          g.querySelectorAll('.card.demo').forEach(function (n) { n.remove(); });
        }
      }
      // (sinon : les cartes statiques de fallback déjà présentes restent affichées)
    } catch (e) {
      // réseau KO : les cartes statiques restent affichées
    }
    setupKiosk();
  }

  document.addEventListener('DOMContentLoaded', loadSources);
})();
