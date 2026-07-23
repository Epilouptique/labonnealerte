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
  // Persiste automatiquement le token de session renvoyé (rotation : échange d'un
  // magic token, ou simple confirmation). -> { status, ok, data }
  async function fetchAlerts(token) {
    var res = await fetch(API + '?token=' + encodeURIComponent(token), {
      headers: { Accept: 'application/json' }
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (res.ok && data && data.token && data.token !== get()) set(data.token);
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
    var t = get();
    var done = function () { clear(); window.location.reload(); };
    try {
      fetch('/api/logout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t })
      }).then(done, done);
    } catch (e) { done(); }
  }

  // Droit à l'effacement (RGPD) : supprime définitivement le compte, purge le
  // stockage local, puis renvoie sur l'accueil anonyme avec un message d'adieu.
  function deleteAccount() {
    if (!window.confirm('Votre compte, vos abonnements et votre historique seront définitivement supprimés.')) return;
    var t = get();
    var done = function () {
      clear();
      window.location.href = '/?compte=supprime';
    };
    try {
      fetch('/api/my-alerts/account', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t })
      }).then(done, done);
    } catch (e) { done(); }
  }

  // Bandeau discret d'adieu après suppression de compte (accueil anonyme).
  function showFarewellIfNeeded() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('compte') !== 'supprime') return;
    history.replaceState(null, '', window.location.pathname);
    var el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.textContent = 'Compte supprimé. À bientôt peut-être.';
    el.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:9999;'
      + 'background:var(--surface,#fff);color:var(--ink,#222);border-radius:999px;'
      + 'padding:11px 20px;font-weight:600;font-size:14px;box-shadow:0 4px 24px rgba(30,20,50,.16);';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 6000);
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

    // B) Lien « OpenAlert » masqué en mode connecté (expérience 100% consommateur).
    var oa = document.getElementById('nav-openalert');
    if (oa) oa.hidden = logged;
    // D) Lien « Mes alertes » masqué tant que l'utilisateur n'est pas connecté.
    document.querySelectorAll('.mine-link').forEach(function (el) { el.hidden = !logged; });

    if (logged) {
      // La salutation « Bonjour <prénom> » s'affiche désormais dans le hero (à la
      // place du h1), gérée par site.js — le header ne l'affiche plus.
      if (emailEl) { emailEl.hidden = true; emailEl.textContent = ''; }
      if (link) {
        // « Mon compte » ouvre le panneau (défini par site.js sur la home).
        // La déconnexion vit désormais dans ce panneau.
        link.textContent = 'Mon compte';
        // Hors home, le panneau n'existe pas : l'ancre pointe vers /#mon-compte (la home
        // ouvre la carte au chargement). Sur la home, l'onclick bascule le panneau en place.
        link.setAttribute('href', '/#mon-compte');
        link.onclick = function (e) {
          // « Mon compte » bascule le panneau (ouvre s'il est fermé, ferme s'il est ouvert).
          if (window.LBAAccount && window.LBAAccount.toggle) {
            e.preventDefault();
            window.LBAAccount.toggle();
          }
          // Sinon (autres pages) : navigation par défaut vers /#mon-compte (pas de logout !).
        };
      }
    } else {
      if (emailEl) { emailEl.hidden = true; emailEl.textContent = ''; }
      if (link) {
        link.textContent = 'Se connecter';
        link.setAttribute('href', '/connexion');
        link.onclick = null;
      }
    }

    // Le lien « Supprimer mon compte » ne vit plus dans le footer : il a été
    // déplacé tout en bas du panneau « Mon compte » (recto), câblé par site.js.
  }

  window.LBASession = {
    KEY: KEY,
    get: get, set: set, clear: clear,
    fetchAlerts: fetchAlerts,
    truncateEmail: truncateEmail,
    firstName: firstName,
    renderHeader: renderHeader,
    logout: logout,
    deleteAccount: deleteAccount
  };

  // Adoption de collection différée après connexion : si un utilisateur anonyme a
  // cliqué « Adopter » puis s'est connecté, il atterrit sur l'accueil. On le renvoie
  // alors vers la page de la collection, qui finalise l'adoption (et purge l'intention).
  // Anti-boucle : la page collection consomme l'intention au chargement.
  function resumeAdoptIntent() {
    var slug;
    try { slug = localStorage.getItem('lba-adopt'); } catch (e) { slug = null; }
    if (!slug || !get()) return;
    if (!/^[a-z0-9-]{1,64}$/.test(slug)) { try { localStorage.removeItem('lba-adopt'); } catch (e) {} return; }
    var target = '/collection/' + slug;
    if (window.location.pathname !== target) window.location.replace(target);
  }

  // État initial du header dès le chargement (email complété plus tard par la home).
  document.addEventListener('DOMContentLoaded', function () {
    renderHeader(null);
    showFarewellIfNeeded();
    resumeAdoptIntent();
  });
})();
