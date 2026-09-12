/* boutique.js — page /boutique (phase 3, squelette skins cosmetiques).
   Liste les skins actifs, gere l'achat (points) et l'equipement du skin dashboard.
   Les skins de type 'deck' s'equipent PAR deck depuis la gestion des decks (hors
   de cette grille) : ici on permet l'achat, l'etat « Possede » suffit.
   RENDU : chaque skin est une VRAIE carte (LBACards.cardHTML, aucun markup duplique)
   habillee du skin, posee dans une boite d'apercu de DIMENSIONS FIXES identiques pour
   tous les skins, le CTA etant TOUJOURS sous la boite. */

(function () {
  'use strict';

  var S = window.LBASession;
  var token = (S && S.get && S.get()) || null;

  var loadingEl = document.getElementById('shop-loading');
  var anonEl = document.getElementById('shop-anon');
  var viewEl = document.getElementById('shop-view');
  var gridEl = document.getElementById('shop-grid');
  var gridDeckEl = document.getElementById('shop-grid-deck');
  var secDashEl = document.getElementById('shop-sec-dashboard');
  var secDeckEl = document.getElementById('shop-sec-deck');
  var balanceEl = document.getElementById('shop-balance');
  var msgEl = document.getElementById('shop-msg');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var msgTimer = null;
  function flash(text, ok) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = 'coll-adopt-msg' + (ok ? ' ok' : ' err');
    msgEl.hidden = false;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { msgEl.hidden = true; }, 2200);
  }

  function done() {
    document.body.classList.remove('loading');
    if (loadingEl) loadingEl.hidden = true;
  }

  // previewCards : 3 sources quelconques du catalogue public, alimentant l'apercu
  // « pile de cartes » des skins de deck. Vide si /api/sources est indisponible.
  var STATE = { balance: 0, equippedDashboard: null, skins: [], previewCards: [] };

  function typeLabel(t) { return t === 'deck' ? 'Skin de deck' : 'Skin de carte'; }

  // APERCU = LA VRAIE CARTE. La boutique ne redessine plus une copie du recto : elle
  // appelle LBACards.cardHTML sur une source de demonstration. C'est LA correction de
  // fond du 06/09 : la copie locale avait derive (coeur sans SVG, « partage » rendu par
  // le caractere ⊞, .card-static-desc / .card-foot / .card-edition absents), donc les
  // skins structures — dont les grid-template-areas visent CE markup — se disloquaient.
  // mode 'connected' + subscribed : rangee d'icones complete (coeur / partage / + deck /
  // i) et switch d'abonnement, exactement comme au kiosque.
  function previewSource(sk) {
    return {
      id: 'skin-preview-' + sk.id,
      name: sk.name,
      subtitle: typeLabel(sk.type),
      description: 'Un aperçu de vos alertes, habillées par ce skin.',
      badge: 'official',
      categories: [],
      state: 'active',
      subscribed: true,
      likes_count: sk.cost,
    };
  }

  // Deux chemins d'apercu, POUR UNE SEULE BOITE de dimensions fixes (cf. site.css) :
  //  - .has-card       : teintes (base + fullart-*). Recolorations pures -> la carte est
  //                      rendue directement A LA TAILLE de la boite (mini carte, ratio 2/3).
  //  - .has-card-full  : structures. Leur CSS est calibre sur la geometrie NATURELLE de la
  //                      carte -> rendue a 300px puis reduite par transform:scale dans une
  //                      boite de la TAILLE SCALEE (jamais la boite pleine taille centree,
  //                      qui debordait). Le CTA est hors de la boite : aucune grid-area
  //                      « foot » de skin ne peut plus l'avaler.
  var STRUCT_REFS = {
    'skin-ecole-classique': 1, 'skin-arcane': 1, 'skin-assemblee': 1, 'skin-dresseur': 1,
  };
  function previewMode(ref) { return STRUCT_REFS[ref] ? 'has-card-full' : 'has-card'; }

  // Skin de BASE (cout 0) : possede par tout le monde, et equipe des que le compte
  // n'a aucun skin explicite. Son etat en base est `equipped_dashboard_skin_id = NULL`
  // (le rendu par defaut = absence de classe de skin) : l'equiper revient donc a
  // DESEQUIPER, on n'ecrit jamais son id dans la colonne.
  function isBase(sk) { return sk.cost === 0; }

  function isEquipped(sk) {
    if (sk.type !== 'dashboard') return false;
    if (isBase(sk)) return STATE.equippedDashboard === null;
    return STATE.equippedDashboard === sk.id;
  }

  function actionHTML(sk) {
    var isDash = sk.type === 'dashboard';
    var equipped = isEquipped(sk);

    if (!sk.owned) {
      return '<button type="button" class="sup-btn primary shop-buy" data-id="' + esc(sk.id) + '">'
        + 'Acheter · ' + esc(String(sk.cost)) + ' pts</button>';
    }
    // Equipe = simple indicateur. Pas de « Retirer » : revenir au rendu d'origine se
    // fait en equipant le skin « Par defaut », qui est au catalogue comme les autres.
    if (equipped) return '<button type="button" class="sup-btn" disabled>Équipé ✓</button>';
    if (isDash) {
      // Equiper la base = revenir au defaut, c'est-a-dire desequiper (skin_id null).
      var cls = isBase(sk) ? 'shop-unequip' : 'shop-equip';
      return '<button type="button" class="sup-btn primary ' + cls + '" data-id="' + esc(sk.id) + '">Équiper</button>';
    }
    // Skin de deck possede : l'equipement est PAR DECK (un skin de deck n'a pas d'etat
    // « equipe » global), il se fait donc dans le detail du deck, sur /mes-decks.
    return '<a class="sup-btn primary shop-godecks" href="/mes-decks">Équiper sur un deck</a>';
  }

  // Une tuile = une boite d'apercu de DIMENSIONS FIXES (identiques pour les 10 skins)
  // surmontant un CTA toujours au meme endroit, SOUS la carte. Le wrapper de scene porte
  // .grid (tout le CSS carte est scope « .grid .card-* ») + la classe de skin (asset_ref),
  // exactement comme le kiosque pose le skin sur #grid.
  function skinCard(sk) {
    var ref = sk.asset_ref || '';
    var card = window.LBACards
      ? LBACards.cardHTML(previewSource(sk), 'connected')
      : '';
    return '<div class="shop-item shop-card-item' + (isEquipped(sk) ? ' is-equipped' : '') + '">'
      + '<div class="shop-preview ' + previewMode(ref) + '" aria-hidden="true">'
        + '<div class="shop-stage grid ' + esc(ref) + '">' + card + '</div>'
      + '</div>'
      + '<div class="switch-row shop-act">' + actionHTML(sk) + '</div>'
      + '</div>';
  }

  // Apercu d'un skin de DECK. Le rendu d'un skin de deck EST le lisere --skin-accent
  // pose sur la tuile (.deck-card[class*="skin-"]) — pas la couleur du ruban, qui vient
  // de la teinte tint-N choisie par l'auteur du deck et reste independante du skin.
  // On montre donc une VRAIE tuile-deck (LBADeckStack : pile de 3 cartes + ruban), a
  // teinte FIXE, pour que la seule difference visible d'un skin a l'autre soit le sien.
  var PREVIEW_TINT = 1;
  function skinDeck(sk) {
    // Pas de tuile possible (LBADeckStack absent ou /api/sources KO) : on retombe sur la
    // presentation « carte » plutot que sur un trou.
    if (!window.LBADeckStack || !STATE.previewCards.length) return skinCard(sk);
    // MEME wrapper .grid que les skins de carte : toutes les regles « .grid .deck-card … »
    // (largeur de la carte de devant, geometrie de l'eventail, ancrage du ruban) jouent
    // alors telles quelles. Aucun CSS specifique a la boutique — c'est la tuile du kiosque.
    return '<div class="grid shop-item' + (isEquipped(sk) ? ' is-equipped' : '') + '">'
      + '<div class="deck-card ' + esc(sk.asset_ref || '') + '">' + LBADeckStack.html({
        name: sk.name, tint: PREVIEW_TINT, emoji: '📦',
        count: STATE.previewCards.length, cards: STATE.previewCards, mode: 'anon',
      }) + '</div></div>';
  }

  // Le bouton d'achat/equipement prend la place du switch d'abonnement, comme sur les
  // skins de carte. La pile est produite par LBADeckStack (structure du kiosque, non
  // dupliquee ici) : on substitue donc APRES coup, dans le .card-action de la carte de
  // devant. Les cartes du fond gardent leur switch inerte, comme partout ailleurs.
  function injectDeckActions(deckSkins) {
    if (!gridDeckEl) return;
    var items = gridDeckEl.querySelectorAll('.shop-item');
    for (var i = 0; i < items.length && i < deckSkins.length; i++) {
      var slot = items[i].querySelector('.ds-i0 .card-action');
      if (slot) slot.innerHTML = '<div class="switch-row shop-act">' + actionHTML(deckSkins[i]) + '</div>';
    }
  }

  function render() {
    if (balanceEl) balanceEl.textContent = String(STATE.balance);
    var dash = STATE.skins.filter(function (s) { return s.type !== 'deck'; });
    var deck = STATE.skins.filter(function (s) { return s.type === 'deck'; });
    gridEl.innerHTML = dash.map(skinCard).join('');
    if (gridDeckEl) { gridDeckEl.innerHTML = deck.map(skinDeck).join(''); injectDeckActions(deck); }
    // Une section vide n'a pas de titre orphelin.
    if (secDashEl) secDashEl.hidden = !dash.length;
    if (secDeckEl) secDeckEl.hidden = !deck.length;
    bind();
  }

  async function post(path, payload) {
    var res = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ token: token }, payload)),
    });
    var d = null;
    try { d = await res.json(); } catch (e) { /* pas de corps */ }
    return { ok: res.ok, status: res.status, data: d };
  }

  function setOwned(id) {
    for (var i = 0; i < STATE.skins.length; i++) {
      if (STATE.skins[i].id === id) { STATE.skins[i].owned = true; break; }
    }
  }

  async function buy(id) {
    var r = await post('/api/skins/buy', { skin_id: id });
    if (r.ok && r.data) {
      // Le solde de points vit aussi dans /api/my-alerts : invalide la fenêtre de
      // déduplication pour que la prochaine lecture reparte en réseau.
      if (window.LBASession && LBASession.refreshAlerts) LBASession.refreshAlerts();
      STATE.balance = r.data.balance;
      setOwned(id);
      flash('Skin débloqué ✓', true);
      render();
    } else {
      flash((r.data && r.data.error) || 'Achat impossible', false);
    }
  }

  async function equip(id) {
    var r = await post('/api/skins/equip', { skin_id: id });
    if (r.ok && r.data) {
      STATE.equippedDashboard = r.data.equipped_dashboard_skin_id || null;
      flash('Skin équipé ✓', true);
      render();
    } else {
      flash((r.data && r.data.error) || 'Équipement impossible', false);
    }
  }

  // skin_id null = retour au rendu par defaut. Deux libelles pour UNE action : « Retirer »
  // depuis un skin equipe, « Équiper » depuis la tuile du skin de base.
  async function unequip(toBase) {
    var r = await post('/api/skins/equip', { skin_id: null });
    if (r.ok && r.data) {
      STATE.equippedDashboard = r.data.equipped_dashboard_skin_id || null;
      flash(toBase ? 'Skin équipé ✓' : 'Skin retiré', true);
      render();
    } else {
      flash((r.data && r.data.error) || 'Action impossible', false);
    }
  }

  function bind() {
    [gridEl, gridDeckEl].forEach(function (root) {
      if (!root) return;
      root.querySelectorAll('.shop-buy').forEach(function (b) {
        b.addEventListener('click', function () { buy(b.getAttribute('data-id')); });
      });
      root.querySelectorAll('.shop-equip').forEach(function (b) {
        b.addEventListener('click', function () { equip(b.getAttribute('data-id')); });
      });
      root.querySelectorAll('.shop-unequip').forEach(function (b) {
        var toBase = b.textContent.indexOf('Retirer') === -1;
        b.addEventListener('click', function () { unequip(toBase); });
      });
    });
  }

  // 3 sources quelconques pour la pile d'apercu des skins de deck. Best-effort :
  // un echec laisse previewCards vide et la boutique retombe sur l'apercu « carte ».
  async function loadPreviewCards() {
    if (!window.LBADeckStack || !window.LBACards) return;
    try {
      var r = await fetch('/api/sources', { headers: { Accept: 'application/json' } });
      if (!r.ok) return;
      var list = await r.json();
      if (Array.isArray(list)) STATE.previewCards = list.slice(0, 3);
    } catch (e) { /* apercu deck indisponible, pas bloquant */ }
  }

  (async function init() {
    if (!token) { done(); if (anonEl) anonEl.hidden = false; return; }
    try {
      var res = await LBASession.authFetch('/api/skins', token, { headers: { Accept: 'application/json' } });
      if (res.status === 401) { S.clear && S.clear(); done(); if (anonEl) anonEl.hidden = false; return; }
      var d = await res.json();
      STATE.balance = d.balance || 0;
      STATE.equippedDashboard = d.equipped_dashboard_skin_id || null;
      STATE.skins = Array.isArray(d.skins) ? d.skins : [];
      if (STATE.skins.some(function (s) { return s.type === 'deck'; })) await loadPreviewCards();
      done();
      if (viewEl) viewEl.hidden = false;
      render();
    } catch (e) {
      done();
      if (viewEl) { viewEl.hidden = false; }
      flash('Chargement impossible', false);
    }
  })();
})();
