/* myalerts.js — page /connexion : UNIQUEMENT la connexion (lien magique).
   - arrivée avec ?token=XXX : valider → stocker → nettoyer l'URL → rediriger vers /
   - token valide déjà en localStorage : rediriger vers /
   - sinon : formulaire d'envoi du lien magique (état de succès soigné) */

(function () {
  'use strict';

  /* ---------------- Thème (persisté) ---------------- */
  var STORAGE_KEY = 'lba-theme';
  var root = document.documentElement;
  (function () {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    var t = (saved === 'light' || saved === 'dark') ? saved
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    root.setAttribute('data-theme', t);
  })();
  window.toggleTheme = function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
  };

  var S = window.LBASession;
  var URL_TOKEN = new URLSearchParams(window.location.search).get('token');

  var loading = document.getElementById('cx-loading');
  var view = document.getElementById('cx-view');
  var card = document.getElementById('cx-card');

  function showForm(expired) {
    if (loading) loading.hidden = true;
    if (view) view.hidden = false;
    var banner = document.getElementById('cx-expired');
    if (banner) banner.hidden = !expired;
  }

  /* ---------------- Formulaire d'envoi du lien ---------------- */
  var form = document.getElementById('cx-form');
  var btn = document.getElementById('cx-btn');
  var successText = document.getElementById('cx-success-text');

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = form.email.value.trim();
      if (!email) return;
      btn.disabled = true;
      var label = btn.textContent;
      btn.textContent = 'Envoi…';
      try {
        var res = await fetch('/api/my-alerts/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email })
        });
        var data = await res.json().catch(function () { return {}; });
        if (res.status === 429) {
          btn.disabled = false;
          btn.textContent = label;
          if (successText) { /* laisse le formulaire, message inline */ }
          alertInline('Trop de demandes, réessayez dans une minute.');
          return;
        }
        if (successText && data.message) {
          successText.textContent = data.message + ' Pensez à vérifier vos spams.';
        }
        card.classList.add('sent'); // bascule vers l'état de succès
      } catch (e2) {
        btn.disabled = false;
        btn.textContent = label;
        alertInline('Erreur réseau, réessayez plus tard.');
      }
    });
  }

  // Petit message d'erreur inline sous le formulaire (rare).
  function alertInline(text) {
    var existing = document.getElementById('cx-inline-err');
    if (!existing) {
      existing = document.createElement('p');
      existing.id = 'cx-inline-err';
      existing.style.cssText = 'color:var(--amber);font-size:13px;font-weight:600;margin-top:12px';
      form.insertAdjacentElement('afterend', existing);
    }
    existing.textContent = text;
  }

  /* ---------------- Aiguillage ---------------- */
  async function routeMagicLink() {
    try {
      var r = await S.fetchAlerts(URL_TOKEN);
      if (r.status === 401 || !r.ok) {
        history.replaceState(null, '', '/connexion');
        showForm(true);
        return;
      }
      S.set(URL_TOKEN);
      history.replaceState(null, '', '/connexion');
      window.location.replace('/'); // accueil connecté
    } catch (e) {
      showForm(false);
    }
  }

  if (URL_TOKEN) {
    routeMagicLink();
  } else if (S.get()) {
    window.location.replace('/'); // déjà connecté → accueil
  } else {
    showForm(false);
  }
})();
