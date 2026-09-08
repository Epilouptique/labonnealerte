/* collection-page.js — page /collection/:slug
   Rend les cartes du pack (via LBACards, comme le kiosque) et pilote « Adopter
   cette collection ». Les interactions par carte (like, suivre, params, partage)
   sont assurées par les handlers délégués de site.js (déjà attachés) : ici on ne
   fait QUE le rendu, le bouton d'adoption groupée et le partage de la page. */

(function () {
  'use strict';

  var slug = decodeURIComponent((window.location.pathname.match(/\/collection\/([^\/?#]+)/) || [])[1] || '');
  var loadingEl = document.getElementById('coll-loading');
  var viewEl = document.getElementById('coll-view');
  var errorEl = document.getElementById('coll-error');
  var gridEl = document.getElementById('coll-grid');

  var COLL = null;   // { collection, sources }
  var MODE = 'anon';
  var subMap = {};   // id -> subscribed (bool)
  var mineMap = {};  // id -> { instances, state }
  var favIds = [];   // favoris serveur (s.data.favorites) → cœur rempli comme au kiosque

  function esc(s) { return window.LBACards ? LBACards.esc(s) : String(s == null ? '' : s); }

  // Marque les cœurs déjà aimés. RÉUTILISE le marquage de site.js (window.LBALikes) qui
  // croise localStorage lba-likes ET les favoris serveur (favIds = s.data.favorites) → un
  // compte connecté voit rempli ce qu'il a favorisé ailleurs, comme au kiosque. Repli
  // localStorage-seul si LBALikes n'est pas là (site.js absent) — jamais de régression anonyme.
  function markLikes() {
    if (window.LBALikes && window.LBALikes.markFavorites) {
      window.LBALikes.markFavorites(gridEl, favIds);
      return;
    }
    var liked;
    try { liked = JSON.parse(localStorage.getItem('lba-likes') || '[]'); } catch (e) { liked = []; }
    if (!Array.isArray(liked)) return;
    gridEl.querySelectorAll('.card .like-btn').forEach(function (btn) {
      var card = btn.closest('.card'); if (!card) return;
      if (liked.indexOf(card.getAttribute('data-source-id')) !== -1) {
        btn.classList.add('liked'); btn.setAttribute('aria-pressed', 'true');
      }
    });
  }

  function renderCards() {
    var sources = COLL.sources || [];
    var html = sources.map(function (sc) {
      if (MODE === 'connected') {
        sc.subscribed = !!subMap[sc.id];
        var mine = mineMap[sc.id];
        if (mine && Array.isArray(sc.params_schema) && sc.params_schema.length) {
          sc.instances = mine.instances || [];
          if (sc.instances.length) { sc.state = mine.state; sc.muted = mine.muted; }
        }
      }
      return LBACards.cardHTML(sc, MODE);
    }).join('');
    gridEl.innerHTML = html;
    markLikes();
  }

  function fillHeader() {
    var c = COLL.collection, sources = COLL.sources || [];
    // E5) motif+teinte à la place de l'emoji.
    var em = document.getElementById('coll-emoji');
    if (em) {
      // Visuel de synthèse « pile + ruban » (remplace l'ancienne vignette .deck-thumb-lg).
      // LBADeckStack.html() ne reçoit PAS l'objet deck : chaque appelant ÉNUMÈRE les champs.
      // Le ruban porte donc le NOM du deck + le compteur, comme au kiosque (site.js) — un
      // name:'' laissait le ruban à « 6 cartes » seul. Aperçu = 3 dernières cartes du pack
      // (récent d'abord).
      var cards = sources.slice(-3).reverse();
      em.innerHTML = window.LBADeckStack ? ('<div class="deck-card">' + LBADeckStack.html({
        name: c.name, tint: c.tint, emoji: c.emoji, count: sources.length, cards: cards, mode: 'anon'
      }) + '</div>') : '';
    }
    document.getElementById('coll-name').textContent = c.name;
    document.getElementById('coll-desc').textContent = c.description || '';
    var n = sources.length;
    document.getElementById('coll-count').textContent = n + (n > 1 ? ' cartes' : ' carte');
    var totalLikes = sources.reduce(function (a, s) { return a + (s.likes_count || 0); }, 0);
    var likesEl = document.getElementById('coll-likes');
    likesEl.textContent = totalLikes > 0 ? ('❤ ' + (LBACards ? LBACards.formatCount(totalLikes) : totalLikes)) : '';

    // Préviens « déjà X/Y dans votre collection » en mode connecté.
    if (MODE === 'connected') {
      var have = sources.filter(function (s) { return subMap[s.id]; }).length;
      if (have > 0) setAdoptMsg('Vous suivez déjà ' + have + '/' + n + ' cartes de cette collection.', 'info');
    }
  }

  function setAdoptMsg(text, kind) {
    var el = document.getElementById('coll-adopt-msg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.className = 'coll-adopt-msg' + (kind ? ' ' + kind : '');
  }

  // Charge session + détail, puis rend. Réappelée après adoption pour rafraîchir.
  async function load() {
    var token = window.LBASession && LBASession.get();
    MODE = 'anon'; subMap = {}; mineMap = {}; favIds = [];
    var profileDept = null;

    if (token) {
      try {
        var s = await LBASession.fetchAlerts(token);
        if (s.status === 401) LBASession.clear();
        else if (s.ok && s.data) {
          MODE = 'connected';
          (s.data.sources || []).forEach(function (x) { subMap[x.id] = x.subscribed; mineMap[x.id] = x; });
          favIds = s.data.favorites || []; // favoris serveur → croisés au marquage des cœurs
          profileDept = s.data.departement || null;
          LBASession.renderHeader(s.data.email);
        }
      } catch (e) { /* réseau : anonyme */ }
    }
    window.LBADefaults = { departement: profileDept };
    document.body.setAttribute('data-mode', MODE);

    var r = await fetch('/api/collections/' + encodeURIComponent(slug), { headers: { Accept: 'application/json' } });
    if (!r.ok) { if (loadingEl) loadingEl.hidden = true; if (errorEl) errorEl.hidden = false; return null; }
    COLL = await r.json();
    if (loadingEl) loadingEl.hidden = true;
    if (viewEl) viewEl.hidden = false;
    fillHeader();
    renderCards();
    return COLL;
  }

  async function doAdopt() {
    var token = window.LBASession && LBASession.get();
    if (!token) {
      // Anonyme : mémorise l'intention et envoie vers la connexion (reprise au retour).
      try { localStorage.setItem('lba-adopt', slug); } catch (e) {}
      window.location.href = '/connexion';
      return;
    }
    var btn = document.getElementById('coll-adopt');
    if (btn) { btn.disabled = true; btn.textContent = 'Adoption…'; }
    try {
      var res = await fetch('/api/collections/' + encodeURIComponent(slug) + '/adopt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token })
      });
      if (!res.ok) throw new Error('http ' + res.status);
      var d = await res.json();
      var parts = [];
      if (d.added > 0) parts.push('✓ ' + d.added + (d.added > 1 ? ' alertes ajoutées' : ' alerte ajoutée'));
      if (d.already > 0) parts.push(d.already + ' déjà suivie' + (d.already > 1 ? 's' : ''));
      var msg = parts.join(' · ') || 'Rien à ajouter.';
      if (d.needs_params && d.needs_params.length) {
        msg += ' — ' + d.needs_params.length + ' à compléter à la main (' +
          d.needs_params.map(function (x) { return esc(x.name); }).join(', ') + ')';
      }
      setAdoptMsg(msg, 'ok');
      // E6) Collection entièrement adoptée (rien à compléter) → célébration.
      if (d.added > 0 && (!d.needs_params || !d.needs_params.length) && window.LBACards) {
        LBACards.celebrateBurst(btn);
      }
      await load(); // rafraîchit l'état des cartes (suivies) et le compteur
    } catch (e) {
      setAdoptMsg('Réessayez dans un instant.', 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Adopter ce deck'; }
    }
  }

  function bind() {
    var adopt = document.getElementById('coll-adopt');
    if (adopt) adopt.addEventListener('click', doAdopt);

    // 9) Partage en GRANDE CARTE modale (au lieu de la ligne de boutons en place).
    var share = document.getElementById('coll-share');
    if (share) {
      share.addEventListener('click', function () {
        var url = 'https://labonnealerte.fr/collection/' + slug;
        var name = (COLL && COLL.collection ? COLL.collection.name : 'La Bonne Alerte');
        if (window.LBAShare && LBAShare.openModal) LBAShare.openModal(name, url);
      });
    }
  }

  async function init() {
    if (!slug) { if (loadingEl) loadingEl.hidden = true; if (errorEl) errorEl.hidden = false; return; }
    // Reprise d'adoption après connexion : consommer l'intention AVANT toute chose
    // (anti-boucle : on la retire même si l'adoption échoue).
    var intent = null;
    try { intent = localStorage.getItem('lba-adopt'); } catch (e) {}
    if (intent === slug) { try { localStorage.removeItem('lba-adopt'); } catch (e) {} }

    bind();
    await load();
    if (intent === slug && MODE === 'connected') doAdopt();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
