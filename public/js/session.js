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
  //
  // DÉDUPLICATION D'APPELS CONCURRENTS (perf chargement home) : au chargement, quatre
  // modules indépendants (site.js, push.js, quiet.js, profile.js) demandaient la même
  // charge en parallèle ; les quatre requêtes se sérialisaient côté serveur (jusqu'à
  // 6 s pour la dernière). Tant qu'un appel est EN VOL pour le même token, on renvoie
  // LA MÊME promesse — donc un seul aller-retour, et la rotation de jeton ci-dessous
  // ne s'exécute qu'une fois par appel réel, pas une fois par appelant.
  //
  // CE N'EST PAS UN CACHE : `inflight` retombe à null dès la résolution (succès comme
  // échec), si bien que tout appel postérieur à la fenêtre en vol refait un vrai
  // aller-retour. Un toggle d'abonnement, une mise en pause ou un achat de skin
  // relisent donc bien des données fraîches. Pour forcer explicitement un nouvel appel
  // depuis une mutation, cf. refreshAlerts() ci-dessous.
  var inflight = null;      // promesse en vol, ou null
  var inflightToken = null; // token associé à cette promesse

  function fetchAlerts(token) {
    if (inflight && inflightToken === token) return inflight;
    inflightToken = token;
    inflight = (async function () {
      var res = await fetch(API + '?token=' + encodeURIComponent(token), {
        headers: { Accept: 'application/json' }
      });
      var data = null;
      try { data = await res.json(); } catch (e) {}
      if (res.ok && data && data.token && data.token !== get()) set(data.token);
      return { status: res.status, ok: res.ok, data: data };
    })();
    // Libération dans les DEUX issues : la fenêtre de déduplication se referme à la
    // résolution. `finally` ne consomme pas le rejet — l'appelant reçoit bien l'erreur.
    var release = function () { inflight = null; inflightToken = null; };
    inflight.then(release, release);
    return inflight;
  }

  // Invalidation explicite : abandonne la fenêtre de déduplication en cours pour que
  // le PROCHAIN fetchAlerts() reparte forcément en réseau. À appeler après une
  // mutation (toggle, pause, achat) dont on veut relire l'effet immédiatement, y
  // compris si un appel initié avant la mutation est encore en vol.
  function refreshAlerts() {
    inflight = null;
    inflightToken = null;
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

  /* ---- Avatar « Mon compte » du header : initiale du pseudo dans un cercle ----
     Au survol le disque se remplit de violet puis se RETOURNE sur une roue de
     paramètres (CSS .hd-avatar / .hd-av-face). L'initiale est mise en cache local
     (INIT_KEY) : les pages qui appellent renderHeader(null) — header.js au chargement,
     avant tout fetch — affichent la bonne lettre immédiatement plutôt qu'un « ? »
     qui sauterait ensuite. */
  var INIT_KEY = 'lba-initial';
  var GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>';

  function initialFor(basis) {
    var ch = String(basis || '').trim().charAt(0);
    return ch ? ch.toUpperCase() : '';
  }
  function cachedInitial() { try { return localStorage.getItem(INIT_KEY) || ''; } catch (e) { return ''; } }

  // Pose (ou met à jour) l'initiale affichée. `name` = pseudo public si connu, sinon
  // on retombe sur le prénom déduit de l'email, puis sur l'initiale mise en cache.
  function setAvatarInitial(name) {
    var ch = initialFor(name);
    if (ch) { try { localStorage.setItem(INIT_KEY, ch); } catch (e) {} }
    else ch = cachedInitial() || '?';
    document.querySelectorAll('.hd-av-letter').forEach(function (el) { el.textContent = ch; });
    return ch;
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
        // Le libellé texte est remplacé par l'avatar à initiale (retournement → roue).
        // `aria-label` porte le sens, l'avatar est purement décoratif.
        if (!link.querySelector('.hd-avatar')) {
          link.innerHTML =
            '<span class="hd-avatar" aria-hidden="true">' +
              '<span class="hd-av-face hd-av-front"><span class="hd-av-letter"></span></span>' +
              '<span class="hd-av-face hd-av-back">' + GEAR_SVG + '</span>' +
            '</span>';
        }
        link.classList.add('hd-link', 'hd-avatar-link');
        link.setAttribute('aria-label', 'Mon compte');
        link.setAttribute('title', 'Mon compte');
        setAvatarInitial(firstName(email) || email);
        // Hors home, le panneau n'existe pas : l'ancre pointe vers /#mon-compte (la home
        // ouvre la carte au chargement). Sur la home, l'onclick bascule le panneau en place.
        link.setAttribute('href', '/#mon-compte');
        link.onclick = function (e) {
          // Le panneau « Mon compte » n'existe que sur la home. On ne bascule (et donc on ne
          // bloque la navigation) QUE s'il est présent sur la page courante : sinon
          // preventDefault tuerait le lien (openAccount no-op faute de panneau) et « Mon
          // compte » ne ferait rien depuis /favoris & co. Hors home, on laisse l'ancre
          // /#mon-compte naviguer vers la home, qui ouvre la carte au chargement.
          if (document.getElementById('account-panel') && window.LBAAccount && window.LBAAccount.toggle) {
            e.preventDefault();
            window.LBAAccount.toggle();
          }
          // Sinon (autres pages) : navigation par défaut vers /#mon-compte (pas de logout !).
        };
      }
    } else {
      if (emailEl) { emailEl.hidden = true; emailEl.textContent = ''; }
      if (link) {
        // Retour à l'état anonyme : on démonte l'avatar (le lien redevient textuel).
        link.classList.remove('hd-link', 'hd-avatar-link');
        link.removeAttribute('aria-label');
        link.removeAttribute('title');
        link.textContent = 'Se connecter';
        link.setAttribute('href', '/connexion');
        link.onclick = null;
        try { localStorage.removeItem(INIT_KEY); } catch (e) {}
      }
    }

    // Le lien « Supprimer mon compte » ne vit plus dans le footer : il a été
    // déplacé tout en bas du panneau « Mon compte » (recto), câblé par site.js.
  }

  window.LBASession = {
    KEY: KEY,
    get: get, set: set, clear: clear,
    fetchAlerts: fetchAlerts,
    refreshAlerts: refreshAlerts,
    truncateEmail: truncateEmail,
    firstName: firstName,
    renderHeader: renderHeader,
    setAvatarInitial: setAvatarInitial,
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
