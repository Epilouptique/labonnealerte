/* session.js — session « lien magique » partagée (toutes pages).
   Le token validé est conservé en localStorage sous la clé 'lba-token'.
   Expose window.LBASession + rend l'état du header (connexion / email / déconnexion). */

(function () {
  'use strict';

  var KEY = 'lba-token';
  var API = '/api/my-alerts';

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(t) { try { localStorage.setItem(KEY, t); } catch (e) {} }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // Récupère les alertes de l'utilisateur pour un token donné.
  // -> { status, ok, data }
  async function fetchAlerts(token) {
    var res = await fetch(API + '?token=' + encodeURIComponent(token), {
      headers: { Accept: 'application/json' }
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    return { status: res.status, ok: res.ok, data: data };
  }

  // Tronque un email long pour l'affichage discret dans le header.
  function truncateEmail(email) {
    if (!email) return '';
    if (email.length <= 24) return email;
    var at = email.indexOf('@');
    if (at > 0) {
      var local = email.slice(0, at);
      var domain = email.slice(at);
      if (local.length > 10) local = local.slice(0, 9) + '…';
      return local + domain;
    }
    return email.slice(0, 21) + '…';
  }

  function logout() {
    clear();
    window.location.reload();
  }

  // Déduit un prénom de l'email pour un accueil chaleureux. Renvoie null si peu fiable.
  function firstName(email) {
    if (!email) return null;
    var local = email.split('@')[0];
    var seg = local.indexOf('.') !== -1 ? local.slice(0, local.indexOf('.')) : local;
    seg = seg.replace(/[0-9]+$/, ''); // retire les chiffres de fin (hugo92 -> hugo)
    var letters = (seg.match(/[a-zA-Zà-öø-ÿ]/g) || []).length;
    if (letters < 2) return null;
    var name = seg.split('-').map(function (p) {
      return p ? p.charAt(0).toUpperCase() + p.slice(1) : p;
    }).join('-');
    return name.length > 16 ? name.slice(0, 16) : name;
  }

  // Met à jour la zone d'auth du header. `email` non nul => affiché en mode connecté.
  function renderHeader(email) {
    var link = document.getElementById('auth-link');
    var emailEl = document.getElementById('auth-email');
    var logged = !!get();

    if (logged) {
      if (emailEl) {
        var name = firstName(email);
        emailEl.textContent = name ? ('Bienvenue ' + name + ' !') : truncateEmail(email || '');
        emailEl.title = email || ''; // tooltip : email complet
        emailEl.hidden = !email;
      }
      if (link) {
        link.textContent = 'Se déconnecter';
        link.setAttribute('href', '#');
        link.onclick = function (e) { e.preventDefault(); logout(); };
      }
    } else {
      if (emailEl) { emailEl.hidden = true; emailEl.textContent = ''; }
      if (link) {
        link.textContent = 'Se connecter';
        link.setAttribute('href', '/connexion');
        link.onclick = null;
      }
    }
  }

  window.LBASession = {
    KEY: KEY,
    get: get, set: set, clear: clear,
    fetchAlerts: fetchAlerts,
    truncateEmail: truncateEmail,
    renderHeader: renderHeader,
    logout: logout
  };

  // État initial du header dès le chargement (email complété plus tard par la home).
  document.addEventListener('DOMContentLoaded', function () { renderHeader(null); });
})();
