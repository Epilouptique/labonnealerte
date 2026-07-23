/* deck-shared.js — page publique /deck/:token (deck partagé, phase 2 UGC).
   Rend les cartes du deck (via LBACards, comme le kiosque) et pilote « Adopter ce
   deck » (fork → adoption). Les interactions par carte (like, suivre, params,
   partage) sont assurées par les handlers délégués de site.js (déjà attachés) :
   ici on ne fait QUE le rendu, l'adoption groupée, le signalement et le partage.
   Le visiteur peut être connecté ou NON. Aucun email n'est jamais affiché. */

(function () {
  'use strict';

  var token = (window.location.pathname.match(/\/deck\/([A-Za-z0-9\-_]+)/) || [])[1] || '';
  var loadingEl = document.getElementById('deck-loading');
  var viewEl = document.getElementById('deck-view');
  var errorEl = document.getElementById('deck-error');
  var gridEl = document.getElementById('deck-grid');

  var DECK = null;   // { deck, sources }
  var MODE = 'anon';
  var subMap = {};   // id -> subscribed (bool)
  var mineMap = {};  // id -> { instances, state }

  var ADOPT_KEY = 'lba-adopt-deck';

  function esc(s) { return window.LBACards ? LBACards.esc(s) : String(s == null ? '' : s); }

  // Marque les cœurs déjà aimés (site.js le fait dans loadHome, court-circuité ici).
  function markLikes() {
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
    var sources = DECK.sources || [];
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
    var d = DECK.deck || {}, sources = DECK.sources || [];
    // E5) motif+teinte à la place de l'emoji.
    var em = document.getElementById('deck-emoji');
    if (em) {
      var motif = (window.LBADeckMotifs && (LBADeckMotifs[d.emoji] || LBADeckMotifs['📦'])) || '';
      em.innerHTML = '<span class="deck-thumb deck-thumb-lg tint-' + ((d.tint >= 1 && d.tint <= 11) ? d.tint : 1) +
        '"><span class="deck-motif-bg" aria-hidden="true">' + motif + '</span></span>';
    }
    document.getElementById('deck-name').textContent = d.name || '';
    document.getElementById('deck-desc').textContent = d.description || '';

    var authorEl = document.getElementById('deck-author');
    authorEl.textContent = 'Par ' + (d.author ? d.author : 'un utilisateur');

    var forkedEl = document.getElementById('deck-forked');
    if (d.forked_from_name) {
      forkedEl.textContent = 'Inspiré du deck de ' + d.forked_from_name;
      forkedEl.hidden = false;
    } else {
      forkedEl.hidden = true;
    }

    var n = sources.length;
    document.getElementById('deck-count').textContent = n + (n > 1 ? ' cartes' : ' carte');
  }

  function setAdoptMsg(text, kind) {
    var el = document.getElementById('deck-adopt-msg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.className = 'coll-adopt-msg' + (kind ? ' ' + kind : '');
  }

  // Charge session + détail, puis rend. Réappelée après adoption pour rafraîchir.
  async function load() {
    var sToken = window.LBASession && LBASession.get();
    MODE = 'anon'; subMap = {}; mineMap = {};
    var profileDept = null;

    if (sToken) {
      try {
        var s = await LBASession.fetchAlerts(sToken);
        if (s.status === 401) LBASession.clear();
        else if (s.ok && s.data) {
          MODE = 'connected';
          (s.data.sources || []).forEach(function (x) { subMap[x.id] = x.subscribed; mineMap[x.id] = x; });
          profileDept = s.data.departement || null;
          LBASession.renderHeader(s.data.email);
        }
      } catch (e) { /* réseau : anonyme */ }
    }
    window.LBADefaults = { departement: profileDept };
    document.body.setAttribute('data-mode', MODE);

    var r = await fetch('/api/decks/shared/' + encodeURIComponent(token), { headers: { Accept: 'application/json' } });
    if (!r.ok) { if (loadingEl) loadingEl.hidden = true; if (errorEl) errorEl.hidden = false; return null; }
    DECK = await r.json();
    if (loadingEl) loadingEl.hidden = true;
    if (viewEl) viewEl.hidden = false;
    fillHeader();
    renderCards();
    return DECK;
  }

  async function doAdopt() {
    var sToken = window.LBASession && LBASession.get();
    if (!sToken) {
      // Anonyme : mémorise l'intention (clé DISTINCTE de la phase 1) et envoie vers
      // la connexion. Au retour connecté, init() reprend l'adoption.
      try { localStorage.setItem(ADOPT_KEY, token); } catch (e) {}
      window.location.href = '/connexion';
      return;
    }
    var btn = document.getElementById('deck-adopt');
    if (btn) { btn.disabled = true; btn.textContent = 'Adoption…'; }
    try {
      // 1) Fork : crée une copie privée du deck chez l'utilisateur.
      var fr = await fetch('/api/decks/shared/' + encodeURIComponent(token) + '/fork', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: sToken })
      });
      if (fr.status === 401) { LBASession.clear(); try { localStorage.setItem(ADOPT_KEY, token); } catch (e) {} window.location.href = '/connexion'; return; }
      if (!fr.ok) throw new Error('http ' + fr.status);
      var forked = await fr.json();

      // 2) Adoption : abonne l'utilisateur aux sources du deck copié.
      var ar = await fetch('/api/decks/' + encodeURIComponent(forked.deck_id) + '/adopt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: sToken })
      });
      if (!ar.ok) throw new Error('http ' + ar.status);
      var d = await ar.json();

      var parts = [];
      var added = d.added || 0;
      parts.push(added + (added > 1 ? ' alertes ajoutées' : ' alerte ajoutée'));
      if (d.already > 0) parts.push(d.already + ' déjà suivie' + (d.already > 1 ? 's' : ''));
      var nNeeds = (d.needs_params && d.needs_params.length) || 0;
      if (nNeeds > 0) parts.push(nNeeds + ' à compléter');
      var msg = 'Deck copié dans vos decks · ' + parts.join(' · ') +
        '. Une copie privée est dans Mes decks.';
      setAdoptMsg(msg, 'ok');
      // E6) Deck forké + entièrement adopté → célébration autour du bouton.
      if (added > 0 && nNeeds === 0 && window.LBACards) LBACards.celebrateBurst(btn);
      await load(); // rafraîchit l'état des cartes (suivies)
    } catch (e) {
      setAdoptMsg('Réessayez dans un instant.', 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Adopter ce deck'; }
    }
  }

  async function doReport(target) {
    var label = target === 'name' ? 'le nom de ce deck' : 'ce deck';
    if (!window.confirm('Signaler ' + label + ' à la modération ?')) return;
    try {
      await fetch('/api/decks/shared/' + encodeURIComponent(token) + '/report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: target })
      });
    } catch (e) { /* réponse neutre : on confirme quand même */ }
    setAdoptMsg('Merci, signalement pris en compte.', 'info');
  }

  function bind() {
    var adopt = document.getElementById('deck-adopt');
    if (adopt) adopt.addEventListener('click', doAdopt);

    var reportBtn = document.getElementById('deck-report-btn');
    if (reportBtn) reportBtn.addEventListener('click', function () { doReport('deck'); });
    var reportName = document.getElementById('deck-report-name');
    if (reportName) reportName.addEventListener('click', function () { doReport('name'); });

    // 9) Partage en GRANDE CARTE modale (unifié avec les pages collection/source).
    var share = document.getElementById('deck-share');
    if (share) {
      share.addEventListener('click', function () {
        var url = 'https://labonnealerte.fr/deck/' + token;
        var name = (DECK && DECK.deck ? DECK.deck.name : 'La Bonne Alerte');
        if (window.LBAShare && LBAShare.openModal) LBAShare.openModal(name, url);
      });
    }
  }

  async function init() {
    if (!token) { if (loadingEl) loadingEl.hidden = true; if (errorEl) errorEl.hidden = false; return; }
    // Reprise d'adoption après connexion : consommer l'intention AVANT toute chose
    // (anti-boucle : on la retire même si l'adoption échoue).
    var intent = null;
    try { intent = localStorage.getItem(ADOPT_KEY); } catch (e) {}
    if (intent === token) { try { localStorage.removeItem(ADOPT_KEY); } catch (e) {} }

    bind();
    await load();
    if (intent === token && MODE === 'connected') doAdopt();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
