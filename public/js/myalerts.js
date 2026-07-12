/* myalerts.js — page /mes-alertes : UNIQUEMENT la connexion.
   - arrivée avec ?token=XXX : valider → stocker → nettoyer l'URL → rediriger vers /
   - token valide déjà en localStorage : rediriger vers /
   - sinon : formulaire d'envoi du lien magique (message « expiré » si besoin) */

(function () {
  'use strict';

  /* ---------------- Thème (identique à la home) ---------------- */
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

  var requestView = document.getElementById('request-view');
  var loading = document.getElementById('ma-loading');

  function showForm(expired) {
    if (loading) loading.hidden = true;
    requestView.hidden = false;
    var banner = document.getElementById('expired-banner');
    if (banner) banner.hidden = !expired;
  }

  /* ---------------- Formulaire d'envoi du lien ---------------- */
  var form = document.getElementById('request-form');
  var reqBtn = document.getElementById('request-btn');
  var reqMsg = document.getElementById('request-msg');

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = form.email.value.trim();
      if (!email) return;
      reqBtn.disabled = true;
      var label = reqBtn.textContent;
      reqBtn.textContent = 'Envoi…';
      try {
        var res = await fetch('/api/my-alerts/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email })
        });
        var data = await res.json().catch(function () { return {}; });
        reqMsg.textContent = res.status === 429
          ? 'Trop de demandes, réessayez dans une minute.'
          : (data.message || "Si cet email est inscrit, un lien d'accès vient de lui être envoyé.");
        reqMsg.hidden = false;
        if (res.status === 200) form.reset();
      } catch (e2) {
        reqMsg.textContent = 'Erreur réseau, réessayez plus tard.';
        reqMsg.hidden = false;
      } finally {
        reqBtn.disabled = false;
        reqBtn.textContent = label;
      }
    });
  }

  /* ---------------- Aiguillage ---------------- */
  async function routeMagicLink() {
    try {
      var r = await S.fetchAlerts(URL_TOKEN);
      if (r.status === 401 || !r.ok) {
        // Nettoie l'URL pour retirer le token invalide, puis formulaire « expiré ».
        history.replaceState(null, '', '/mes-alertes');
        showForm(true);
        return;
      }
      S.set(URL_TOKEN);
      history.replaceState(null, '', '/mes-alertes');
      window.location.replace('/'); // accueil connecté
    } catch (e) {
      showForm(false);
    }
  }

  if (URL_TOKEN) {
    routeMagicLink();
  } else if (S.get()) {
    // Déjà une session : l'accueil est l'écran de gestion.
    window.location.replace('/');
  } else {
    showForm(false);
  }
})();
