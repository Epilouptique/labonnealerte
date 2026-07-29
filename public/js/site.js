/* site.js — home LaBonneAlerte
   - toggle de thème (persisté, respecte prefers-color-scheme)
   - accueil à deux modes : anonyme (S'abonner) / connecté (toggles)
   - cartes générées via cards.js depuis GET /api/sources (+ squelettes / erreur)
   - KPI hero dynamique, recherche + catégories + pagination */

(function () {
  'use strict';

  // Normalisation de recherche partagée avec cards.js (index data-search) : sans elle,
  // l'index et la requête seraient normalisés différemment et « tache » ne trouverait rien.
  function normQ(s) {
    if (window.LBACards && LBACards.normalizeSearch) return LBACards.normalizeSearch(s);
    return String(s || '').toLowerCase();
  }

  /* ---------------- Thème ---------------- */
  var STORAGE_KEY = 'lba-theme';
  var root = document.documentElement;
  function preferredTheme() {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(preferredTheme());
  function applyTheme(t) { root.setAttribute('data-theme', t); }
  var themeDeg = 0;
  window.toggleTheme = function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    // Volet I : petite rotation rotateY du bouton (sauf reduced-motion).
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var btn = document.querySelector('.theme-btn');
    if (btn && !reduce) { themeDeg += 180; btn.style.transform = 'rotateY(' + themeDeg + 'deg)'; }
  };
  // Liaison du bouton (plus d'onclick inline — CSP script-src 'self').
  (function () { var tb = document.querySelector('.theme-btn'); if (tb) tb.addEventListener('click', window.toggleTheme); })();

  /* ---------------- Accessibilité : contrastes renforcés ----------------
     Préférence locale (pas de compte requis, pas de colonne DB). Même API que
     theme.js pour les autres pages : la home charge site.js à la place de theme.js,
     on réplique donc ici window.toggleContrast / window.isContrastOn. */
  var CONTRAST_KEY = 'lba-contrast';
  var hc = false;
  try { hc = localStorage.getItem(CONTRAST_KEY) === '1'; } catch (e) {}
  function applyContrast() { if (document.body) document.body.classList.toggle('high-contrast', hc); }
  if (document.body) applyContrast();
  else document.addEventListener('DOMContentLoaded', applyContrast);
  window.isContrastOn = function () { return hc; };
  window.toggleContrast = function () {
    hc = !hc;
    try { localStorage.setItem(CONTRAST_KEY, hc ? '1' : '0'); } catch (e) {}
    applyContrast();
    return hc;
  };

  /* ---------------- Abonnement : switch dans les deux modes ---------------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function rowOf(card) { return card.querySelector('.switch-row'); }
  function inputOf(card) { var s = card.querySelector('.switch input'); return s; }
  function setLabel(card, text, on) {
    var lbl = card.querySelector('.switch-label');
    if (!lbl) return;
    lbl.textContent = text;
    lbl.classList.toggle('on', !!on);
  }
  function note(card, text, kind) {
    var existing = card.querySelector('.sub-msg');
    if (existing) existing.remove();
    if (!text) return;
    var el = document.createElement('div');
    el.className = 'sub-msg ' + (kind || 'ok');
    el.textContent = text;
    // Disposition A : le contenu est ancré dans .card-content (au-dessus du voile) ;
    // on y insère le message pour qu'il reste lisible (repli sur .card-front si absent).
    (card.querySelector('.card-content') || card.querySelector('.card-front')).appendChild(el);
  }
  // Animation signature : ping vert + illumination verte de la carte.
  function celebrate(card) {
    var row = rowOf(card);
    if (row) row.classList.add('celebrate');
    card.classList.add('celebrate');
    setTimeout(function () {
      if (row) row.classList.remove('celebrate');
      card.classList.remove('celebrate');
    }, 700);
  }

  // Partage d'une carte — retourne la carte vers sa face « Partager » (3e face).
  document.addEventListener('click', function (e) {
    var sb = e.target.closest('.card-share');
    if (!sb) return;
    e.preventDefault(); e.stopPropagation();
    var card = sb.closest('.card');
    if (!card) return;
    // Carte de devant d'une tuile-deck : on partage LE DECK (URL /collection/:slug + nom du
    // ruban), pas la source d'apercu. Meme retournement, meme liste de partages (LBAShare).
    var deckCard = card.closest('.deck-card');
    var name, url;
    if (deckCard) {
      var dslug = decodeURIComponent((deckCard.getAttribute('data-href') || '').replace('/collection/', ''));
      var dn = deckCard.querySelector('.ds-ribbon-name');
      name = dn ? dn.textContent : 'Un deck';
      url = 'https://labonnealerte.fr/collection/' + dslug;
      deckCard.classList.add('ds-sharing'); // masque ruban + cartes du fond pendant le partage
    } else {
      var id = card.getAttribute('data-source-id');
      var h3 = card.querySelector('h3');
      name = h3 ? h3.textContent : 'La Bonne Alerte';
      url = 'https://labonnealerte.fr/source/' + id + '/statut';
    }
    var faceGrid = card.querySelector('.share-face-grid');
    if (faceGrid && window.LBAShare && !faceGrid.dataset.filled) {
      faceGrid.innerHTML = LBAShare.optionsHTML(name, url);
      LBAShare.bindCopy(faceGrid, url);
      faceGrid.dataset.filled = '1';
    }
    card.classList.add('flipped', 'face-share');
  });

  /* ---------------- A1) « J'aime » (likes) ---------------- */
  // État persistant côté client (pas de compte obligatoire) : ids aimés en localStorage.
  function likesSet() {
    try { var a = JSON.parse(localStorage.getItem('lba-likes') || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function likesSave(a) { try { localStorage.setItem('lba-likes', JSON.stringify(a)); } catch (e) {} }
  function likeAdd(id) { var s = likesSet(); if (s.indexOf(id) === -1) { s.push(id); likesSave(s); } }
  function likeRemove(id) { var s = likesSet(); var i = s.indexOf(id); if (i !== -1) { s.splice(i, 1); likesSave(s); } }

  // Favoris de DECK (le cœur de la carte de devant d'une tuile-deck) : stockes a part
  // (lba-deck-favorites, ids de collection), car un deck n'est pas une source. La page
  // /favoris les affiche en tuiles-deck (voir favoris.js).
  function deckFavSet() { try { var a = JSON.parse(localStorage.getItem('lba-deck-favorites') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function deckFavSave(a) { try { localStorage.setItem('lba-deck-favorites', JSON.stringify(a)); } catch (e) {} }
  function isDeckFav(id) { return deckFavSet().indexOf(id) !== -1; }
  function deckFavToggle(id) { var s = deckFavSet(); var i = s.indexOf(id); if (i === -1) s.push(id); else s.splice(i, 1); deckFavSave(s); return i === -1; }
  function isLiked(id) { return likesSet().indexOf(id) !== -1; }

  // D) Remontée one-shot des favoris locaux vers le serveur (une fois par session
  // d'onglet). Idempotent côté serveur ; rattrape les likes posés avant la table
  // favorites et alimente /favoris + le multi-appareils (sens montée).
  function syncFavorites(token) {
    if (!token) return;
    try { if (sessionStorage.getItem('lba-fav-synced') === '1') return; } catch (e) {}
    var ids = likesSet();
    if (!ids.length) { try { sessionStorage.setItem('lba-fav-synced', '1'); } catch (e) {} return; }
    fetch('/api/favorites/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, ids: ids })
    }).then(function () { try { sessionStorage.setItem('lba-fav-synced', '1'); } catch (e) {} })
      .catch(function () { /* réessai au prochain chargement */ });
  }

  function setLikeUI(btn, liked, count) {
    btn.classList.toggle('liked', !!liked);
    btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
    if (typeof count === 'number') {
      btn.dataset.likes = count;
      var n = btn.querySelector('.like-n');
      if (n && window.LBACards) n.textContent = LBACards.formatCount(count);
    }
  }
  // Marque les cœurs déjà aimés (au chargement / après (ré)insertion de cartes).
  // Le compteur serveur inclut déjà le like de l'utilisateur → on ne touche pas au nombre.
  function markLikes() {
    document.querySelectorAll('.card .like-btn').forEach(function (btn) {
      var card = btn.closest('.card'); if (!card) return;
      var id = card.getAttribute('data-source-id');
      if (id && isLiked(id)) setLikeUI(btn, true);
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.like-btn');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    var card = btn.closest('.card'); if (!card) return;
    // Carte de devant d'une tuile-deck : le cœur ajoute/retire LE DECK des favoris (local),
    // pas la source d'apercu. Bascule visuelle immediate.
    var deckCard = card.closest('.deck-card');
    if (deckCard) {
      var dslug = decodeURIComponent((deckCard.getAttribute('data-href') || '').replace('/collection/', ''));
      if (!dslug) return;
      setLikeUI(btn, deckFavToggle(dslug));
      return;
    }
    var id = card.getAttribute('data-source-id'); if (!id) return;
    if (btn.disabled) return;
    var liked = btn.classList.contains('liked');
    var cur = parseInt(btn.dataset.likes, 10) || 0;
    var next = liked ? Math.max(cur - 1, 0) : cur + 1;
    // Optimiste : bascule l'UI immédiatement.
    setLikeUI(btn, !liked, next);
    if (liked) likeRemove(id); else likeAdd(id);
    btn.disabled = true;
    // D) Connecté : on transmet le token → le like/unlike met aussi à jour les favoris
    // serveur. Anonyme : pas de token, les favoris restent dans lba-likes (localStorage).
    var tok = (window.LBASession && LBASession.get && LBASession.get()) || null;
    var opts = liked ? { method: 'DELETE' } : { method: 'POST' };
    var url = '/api/sources/' + encodeURIComponent(id) + '/like';
    if (tok) {
      if (liked) { url += '?token=' + encodeURIComponent(tok); }
      else { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify({ token: tok }); }
    }
    fetch(url, opts)
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (d) { if (d && typeof d.likes_count === 'number') setLikeUI(btn, !liked, d.likes_count); })
      .catch(function () {
        // Rollback complet (UI + localStorage) en cas d'échec.
        setLikeUI(btn, liked, cur);
        if (liked) likeAdd(id); else likeRemove(id);
      })
      .then(function () { btn.disabled = false; });
  });

  // A) Ensemble des recommandations REFUSÉES (par id), persisté le temps de la
  // session (survit à un rechargement dans l'onglet).
  function dismissedSet() {
    try { var a = JSON.parse(sessionStorage.getItem('lba-reco-dismissed') || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function addDismissed(id) {
    try {
      var s = dismissedSet();
      if (s.indexOf(id) === -1) { s.push(id); sessionStorage.setItem('lba-reco-dismissed', JSON.stringify(s)); }
    } catch (e) {}
  }

  // Ignorer la recommandation → elle est refusée (session) et REMPLACÉE sans
  // rechargement par la reco pertinente suivante (ou une carte normale non suivie
  // s'il n'y en a plus), pour ne jamais laisser de trou dans la grille.
  document.addEventListener('click', function (e) {
    var x = e.target.closest('.reco-x');
    if (!x) return;
    e.preventDefault(); e.stopPropagation();
    var card = x.closest('.card-reco'); // .card OU .deck-card habillee en reco
    if (!card) return;
    dismissReco(card);
  });

  // Sélectionne la meilleure source à recommander (connecté, sources non suivies,
  // hors recommandations déjà refusées dans la session).
  // Retourne l'item reco de meilleur score, en fusionnant sources ET decks dans UN SEUL
  // classement (pas de quota par type : 100% source, 100% deck ou panaché selon les scores).
  // Item generalise : { type:'source'|'deck', id, score, tiebreak } — les consommateurs
  // (applyReco/adoptReco/dismissReco) n'ont besoin que de .id, resolu via cardById.
  function pickReco(sources, subMap) {
    var dismissed = dismissedSet();
    var followedCats = {};
    sources.forEach(function (s) {
      if (subMap[s.id]) (s.categories || []).forEach(function (c) { followedCats[c] = true; });
    });
    var now = Date.now();
    var items = [];

    // --- Sources (scoring historique inchange : dept > interet > cats communes > frais > pop) ---
    var srcC = sources.filter(function (s) {
      if (s.type === 'linked' || subMap[s.id] || dismissed.indexOf(s.id) !== -1) return false;
      // B1) Jamais recommander une source désactivée (bug « vigilance Paris »).
      if (s.enabled === false || s.disabled === true) return false;
      // B2) Source géo « fixe » d'un AUTRE département que le profil : jamais recommandée.
      if (profile.departement) {
        var gd = fixedGeoDept(s);
        if (gd && String(gd) !== String(profile.departement)) return false;
      }
      return true;
    });
    var maxSub = 0;
    srcC.forEach(function (s) { maxSub = Math.max(maxSub, s.subscriber_count || 0); });
    srcC.forEach(function (s) {
      var common = (s.categories || []).filter(function (c) { return followedCats[c]; }).length;
      var recent = (s.last_activated_at && (now - new Date(s.last_activated_at).getTime()) < 30 * 86400000) ? 1 : 0;
      var pop = maxSub > 0 ? (s.subscriber_count || 0) / maxSub : 0;
      // D) Personnalisation : le département (le plus fort) puis les centres d'intérêt
      // passent devant les critères historiques.
      var dept = sourceMatchesDept(s) ? 1 : 0;
      var interest = sourceMatchesInterest(s) ? 1 : 0;
      items.push({
        type: 'source', id: s.id,
        score: 4 * dept + 3 * interest + 3 * common + 2 * recent + 1 * pop,
        tiebreak: s.subscriber_count || 0
      });
    });

    // --- Decks (officiels + perso publics) : meme esprit que computeSpecialIds — recoupement
    // categories/interets, fraicheur (created_at), popularite (adopt_count). Pas de terme geo
    // (un deck n'a pas de dimension departementale : confirme sans objet, aucun invente). Exclus :
    // deja adopte par le compte (adopted), et dismiss (par id, generique). Le prive est deja
    // filtre en amont par /api/collections (officiel + public seulement).
    var deckC = (decksData || []).filter(function (d) {
      if (!d || !d.id) return false;
      if (d.adopted === true) return false;
      if (dismissed.indexOf(d.id) !== -1) return false;
      return true;
    });
    var maxAdopt = 0;
    deckC.forEach(function (d) { maxAdopt = Math.max(maxAdopt, d.adopt_count || 0); });
    deckC.forEach(function (d) {
      var cats = Array.isArray(d.categories) ? d.categories : [];
      var common = cats.filter(function (c) { return followedCats[c]; }).length;
      var interest = (profile.interests && profile.interests.length &&
        cats.some(function (c) { return profile.interests.indexOf(c) !== -1; })) ? 1 : 0;
      var recent = (d.created_at && (now - new Date(d.created_at).getTime()) < 30 * 86400000) ? 1 : 0;
      var pop = maxAdopt > 0 ? (d.adopt_count || 0) / maxAdopt : 0;
      items.push({
        type: 'deck', id: d.id,
        score: 3 * interest + 3 * common + 2 * recent + 1 * pop,
        tiebreak: d.adopt_count || 0
      });
    });

    if (!items.length) return null;
    items.sort(function (a, b) { return b.score - a.score || b.tiebreak - a.tiebreak; });
    return items[0];
  }

  // Rebuild du tableau `cards` depuis le DOM (après un déplacement de carte). Inclut les
  // tuiles-deck (comme loadDecksIntoGrid) pour qu'elles restent dans le pipeline de filtrage.
  function refreshCards() {
    if (grid) cards = Array.prototype.slice.call(grid.querySelectorAll('.card[data-cats], .deck-card[data-deck-tile]'));
  }

  // Habille une carte existante en « recommandée » (étiquette + classe).
  function dressReco(card) {
    if (!card) return;
    card.classList.add('card-reco');
    if (!card.querySelector('.reco-label')) {
      card.insertAdjacentHTML('afterbegin',
        '<span class="reco-label">Recommandée ' +
        '<button type="button" class="reco-x" aria-label="Ignorer la recommandation">×</button></span>');
    }
  }

  // Réinsère une tuile à sa place d'origine (ordre unifié via data-order). Cartes ET
  // tuiles-deck partagent le MÊME espace de classement (les tuiles-deck portent un ordre
  // fractionnaire pose par loadDecksIntoGrid) : un seul tri, pas deux zones qui se chevauchent.
  function placeByOrder(card) {
    if (!grid) return;
    var extras = document.getElementById('static-extras');
    var order = +card.dataset.order || 0;
    var sibs = grid.querySelectorAll('.card[data-cats], .deck-card[data-deck-tile]');
    var ref = null;
    for (var i = 0; i < sibs.length; i++) {
      if (sibs[i] === card) continue;
      if ((+sibs[i].dataset.order || 0) > order) { ref = sibs[i]; break; }
    }
    grid.insertBefore(card, ref || extras || null);
  }

  // État d'abonnement courant, lu depuis le DOM (source de vérité en direct).
  function currentSubMap() {
    var m = {};
    cards.forEach(function (c) { m[c.getAttribute('data-source-id')] = c.dataset.subscribed === '1'; });
    return m;
  }

  // A) Comble l'emplacement libéré par une carte normale NON suivie (épinglée sans
  // habillage reco) : garantit que la grille ne présente jamais de trou en vue par
  // défaut. On préfère une carte actuellement masquée (entrée en fin de grille).
  function fillEmptySlot(excludeId) {
    var subMap = currentSubMap();
    var extras = document.getElementById('static-extras');
    var pick = null;
    for (var i = 0; i < sourcesData.length; i++) {
      var s = sourcesData[i];
      if (s.type === 'linked' || subMap[s.id] || s.id === excludeId) continue;
      var c = cardById(s.id);
      if (!c || c.classList.contains('card-filler') || c.classList.contains('card-reco')) continue;
      if (c.classList.contains('hidden-more')) { pick = c; break; }
      if (!pick) pick = c; // repli : n'importe quelle carte non suivie
    }
    if (pick) { pick.classList.add('card-filler'); grid.insertBefore(pick, extras || null); }
  }

  // A) Fermeture (×) d'une recommandation : elle est refusée, retirée de la grille
  // (retour à sa place naturelle) et REMPLACÉE — reco suivante pertinente si elle
  // existe, sinon une carte normale non suivie — le tout animé (FLIP).
  function dismissReco(card) {
    if (!card || !card.classList.contains('card-reco')) return;
    var id = card.getAttribute('data-source-id');
    addDismissed(id);
    var next = pickReco(sourcesData, currentSubMap());
    apply(true, function () {
      card.classList.remove('card-reco');
      stripRecoLabel(card);
      placeByOrder(card);
      var extras = document.getElementById('static-extras');
      if (next && next.id !== id) {
        var newCard = cardById(next.id);
        if (newCard) { dressReco(newCard); grid.insertBefore(newCard, extras || null); }
      } else {
        fillEmptySlot(id); // plus de reco : on comble pour éviter tout trou
      }
      refreshCards();
    });
  }

  // Retire juste l'étiquette « Recommandée » (la carte reste épinglée en place).
  function stripRecoLabel(card) {
    if (!card) return;
    var label = card.querySelector('.reco-label');
    if (label) label.remove();
  }

  // Résout l'élément tuile par son id (échappement CSS sûr). Trouve aussi bien une carte
  // source (.card[data-source-id]) qu'une tuile-deck (.deck-card[data-deck-tile][data-source-id]) :
  // les ids sources et decks sont disjoints -> au plus une correspondance.
  function cardById(id) {
    if (!grid || !id) return null;
    var sel = (window.CSS && CSS.escape) ? CSS.escape(id) : id;
    return grid.querySelector('.card[data-source-id="' + sel + '"], ' +
      '.deck-card[data-deck-tile][data-source-id="' + sel + '"]');
  }

  // B) Adoption de la recommandée : l'étiquette part, la carte reste, et une
  // nouvelle recommandation est calculée immédiatement parmi les sources non
  // suivies restantes. Aucun trou, aucun rechargement.
  function adoptReco(card) {
    if (!card || !card.classList.contains('card-reco')) return;
    // État d'abonnement courant, lu depuis le DOM (inclut la carte tout juste adoptée).
    var adoptedId = card.getAttribute('data-source-id');
    var next = pickReco(sourcesData, currentSubMap());

    if (next && next.id !== adoptedId) {
      // Relève disponible : la carte adoptée reprend sa place, la nouvelle reco
      // arrive en fin de grille avec son étiquette — le tout animé (FLIP + apparition).
      apply(true, function () {
        card.classList.remove('card-reco');
        stripRecoLabel(card);
        placeByOrder(card);
        var extras = document.getElementById('static-extras');
        var newCard = cardById(next.id);
        if (newCard) {
          dressReco(newCard);
          grid.insertBefore(newCard, extras || null); // fin de grille (Proposer masquée)
        }
        refreshCards();
      });
    } else {
      // Aucune relève : la carte reste épinglée en place, sans étiquette (grille pleine).
      apply(true, function () {
        stripRecoLabel(card);
        refreshCards();
      });
    }
  }

  // Connecté : la source recommandée n'est PAS dupliquée — sa carte unique est
  // habillée et déplacée en dernière position de la grille.
  function applyReco(reco) {
    // Appelé AVANT setupKiosk : la variable module `grid` n'est pas encore
    // affectée → on résout l'élément directement.
    var gg = grid || document.getElementById('grid');
    if (!reco || !gg) return;
    var sel = (window.CSS && CSS.escape) ? CSS.escape(reco.id) : reco.id;
    var card = gg.querySelector('.card[data-source-id="' + sel + '"]');
    if (!card) return;
    var extras = document.getElementById('static-extras');
    dressReco(card);
    gg.insertBefore(card, extras || null); // dernière position (avant Proposer masquée)
  }

  // Flip recto ⇄ verso-info ⇄ verso-partage. flip-back ramène toujours au recto.
  document.addEventListener('click', function (e) {
    var flip = e.target.closest('.flip-btn');
    if (flip) {
      e.preventDefault(); e.stopPropagation();
      var c = flip.closest('.card');
      if (c) {
        c.classList.remove('face-share');
        c.classList.add('flipped');
        // Tuile-deck : le « i » montre le DOS DU DECK. On masque le ruban + les cartes du
        // fond (meme etat propre que le partage) pour un retournement facon carte classique.
        var dcf = c.closest('.deck-card');
        if (dcf) dcf.classList.add('ds-sharing');
      }
      return;
    }
    var back = e.target.closest('.flip-back');
    if (back) {
      e.preventDefault(); e.stopPropagation();
      var c2 = back.closest('.card');
      if (c2) {
        var wasShare = c2.classList.contains('face-share');
        var wasDeck = c2.classList.contains('face-deck'); // F3
        var wasTask = c2.classList.contains('face-task'); // V3 · face « Configurer »
        c2.classList.remove('flipped');
        // Tuile-deck : reaffiche le ruban + les cartes du fond apres la rotation de retour.
        var dc = c2.closest('.deck-card');
        // Garde la face active cachant l'info pendant la rotation de retour (anti-flicker).
        // `dc` couvre AUSSI le retour du verso « i » d'une tuile-deck (ni share ni deck ni
        // task) : on doit alors reafficher le ruban + le fond (retrait de ds-sharing).
        if (wasShare || wasDeck || wasTask || dc) setTimeout(function () {
          c2.classList.remove('face-share', 'face-deck', 'face-task');
          if (dc) dc.classList.remove('ds-sharing');
        }, REDUCE ? 0 : 520);
      }
      return;
    }
  });

  /* ---- Mode anonyme : switch → « en attente » + formulaire email ---- */
  function startPending(card) {
    cancelAllPending(card);
    var row = rowOf(card);
    if (row) row.classList.add('pending');
    setLabel(card, 'En attente…', false);
    note(card, '', '');
    card.classList.add('open');
    var inp = card.querySelector('.sub-form input');
    if (inp) { inp.style.borderColor = ''; inp.focus(); }
  }
  function cancelPending(card) {
    var row = rowOf(card);
    if (row) row.classList.remove('pending');
    var input = inputOf(card);
    if (input) input.checked = false;
    setLabel(card, 'Non abonné', false);
    card.classList.remove('open');
    note(card, '', '');
  }
  function cancelAllPending(except) {
    document.querySelectorAll('.switch-row.pending').forEach(function (r) {
      var c = r.closest('.card');
      if (c && c !== except) cancelPending(c);
    });
  }
  async function submitAnon(card) {
    var input = card.querySelector('.sub-form input');
    var email = input ? input.value.trim() : '';
    if (!EMAIL_RE.test(email)) { if (input) { input.focus(); input.style.borderColor = 'var(--amber)'; } return; }
    var sourceId = card.getAttribute('data-source-id') || undefined;
    var okBtn = card.querySelector('.sub-form button');
    if (okBtn) okBtn.disabled = true;
    try {
      var payload = sourceId ? { email: email, source_id: sourceId } : { email: email };
      if (card._pendingParams) payload.params = card._pendingParams; // instance paramétrée (anonyme)
      var res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.status === 200 || res.status === 409) {
        var row = rowOf(card); if (row) row.classList.remove('pending');
        var chk = inputOf(card); if (chk) chk.checked = true;
        setLabel(card, 'Abonné', true);
        card.classList.remove('open');
        celebrate(card);
        note(card, res.status === 409 ? 'Déjà inscrit ✓' : 'Vérifie tes emails ✉️', res.status === 409 ? 'dup' : 'ok');
      } else {
        cancelPending(card);
        note(card, 'Réessaie plus tard', 'err');
      }
    } catch (e) {
      cancelPending(card);
      note(card, 'Réessaie plus tard', 'err');
    } finally {
      if (okBtn) okBtn.disabled = false;
    }
  }

  /* ---- Mode connecté : toggle optimiste + rollback ---- */
  async function toggleConnected(card, input) {
    var sourceId = card.getAttribute('data-source-id');
    var desired = input.checked;
    setLabel(card, desired ? 'Abonné' : 'Non abonné', desired);
    input.disabled = true;
    try {
      var res = await fetch('/api/my-alerts/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: LBASession.get(), source_id: sourceId, subscribed: desired })
      });
      if (!res.ok) throw new Error('http ' + res.status);
      // Succès : on met à jour l'appartenance interne + tout ce qui en dépend.
      card.dataset.subscribed = desired ? '1' : '0';
      refreshMineDependent();
      if (desired) {
        celebrate(card); // célébration seulement à l'abonnement
        // Carte recommandée adoptée : après la célébration, l'étiquette part et une
        // nouvelle recommandation est calculée immédiatement (voir adoptReco).
        if (card.classList.contains('card-reco')) {
          setTimeout(function () { adoptReco(card); }, 800);
        }
      }
    } catch (e) {
      input.checked = !desired; // rollback du switch
      setLabel(card, !desired ? 'Abonné' : 'Non abonné', !desired);
      // data-subscribed n'est modifié qu'en cas de succès : rien à annuler ici,
      // on resynchronise par sûreté (compteur/KPI/état interne cohérents).
      card.dataset.subscribed = card.dataset.subscribed === '1' ? '1' : '0';
      refreshMineDependent();
    } finally {
      input.disabled = false;
    }
  }

  // Aiguillage du switch selon le mode de la page.
  document.addEventListener('change', function (e) {
    var input = e.target.closest('.switch input');
    if (!input) return;
    if (input.closest('.deck-card')) return; // switch d'une tuile-deck : géré par bindDeckSwitches (abonne tout le deck)
    if (input.classList.contains('param-mute')) return; // F2 : géré séparément (pause)
    if (input.classList.contains('param-follow-cb')) return; // abonnement paramétré : géré séparément
    var card = input.closest('.card');
    if (!card) return;
    if (document.body.getAttribute('data-mode') === 'connected') {
      toggleConnected(card, input);
    } else if (input.checked) {
      startPending(card);
    } else {
      cancelPending(card);
    }
  });

  // F2) Interrupteur pause/reprise des cartes paramétrées abonnées : décoché = en
  // pause (muted, sans perdre les paramètres) ; coché = alerte active. Optimiste + rollback.
  async function toggleMute(card, input) {
    var muted = !input.checked; // décoché = en pause
    var sourceId = card.getAttribute('data-source-id');
    var lbl = card.querySelector('.param-mute-row .switch-label');
    function paint(m) { if (lbl) { lbl.textContent = m ? 'En pause' : 'Abonné'; lbl.classList.toggle('on', !m); } }
    paint(muted);
    input.disabled = true;
    try {
      var res = await fetch('/api/my-alerts/toggle-mute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: LBASession.get(), source_id: sourceId, muted: muted })
      });
      if (!res.ok) throw new Error('http ' + res.status);
    } catch (e) {
      input.checked = !input.checked; paint(!input.checked); // rollback
    } finally {
      input.disabled = false;
      if (window.LBAListView) LBAListView.sync(); // reflète pause/reprise sur le switch de la vue liste
    }
  }
  document.addEventListener('change', function (e) {
    var m = e.target.closest('.param-mute');
    if (!m) return;
    var card = m.closest('.card'); if (!card) return;
    if (document.body.getAttribute('data-mode') === 'connected') toggleMute(card, m);
  });

  // Soumission du formulaire email (mode anonyme).
  document.addEventListener('click', function (e) {
    var ok = e.target.closest('.sub-form button');
    if (ok) { e.preventDefault(); submitAnon(ok.closest('.card')); }
  });

  /* ---- V3 · « Configurer » : ouvre la 5e face (gestion des tâches) ---- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('button.task-config');
    if (!btn) return;
    if (btn.closest('.deck-card')) return; // aperçus de deck : non interactifs
    e.preventDefault(); e.stopPropagation();
    var card = btn.closest('.card'); if (!card) return;
    // Même geste que openDeckFace : rotation + désignation de la face arrière visible.
    card.classList.remove('face-share', 'face-deck');
    card.classList.add('flipped', 'face-task');
  });

  /* ---- V3 · suppression d'une tâche (croix) ----
     Calqué sur removeParam() : aucune confirmation, appel API, retrait du DOM au
     succès. Soft delete côté serveur (active = false) : rien n'est perdu en base. */
  document.addEventListener('click', async function (e) {
    var x = e.target.closest('.task-remove');
    if (!x) return;
    if (x.closest('.deck-card')) return;
    e.preventDefault(); e.stopPropagation();
    var item = x.closest('.task-item'); if (!item) return;
    var id = item.getAttribute('data-task-id'); if (!id) return;
    var card = item.closest('.card');
    x.disabled = true;
    try {
      var res = await fetch('/api/user-tasks/' + encodeURIComponent(id), {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: LBASession.get() })
      });
      if (!res.ok) throw new Error('http ' + res.status);
      var data = await res.json().catch(function () { return null; });
      var zone = item.parentNode;
      item.remove();
      // Plus aucune tâche : le bouton redevient « Créer ma tâche », l'interrupteur de
      // pause disparaît (rien à mettre en pause) et le recto repasse en « Tâche
      // personnelle ». Le serveur a aussi retiré la ligne subscriptions (pas d'état
      // fantôme) → data.subscribed === false, on reflète le désabonnement.
      if (zone && !zone.querySelector('.task-item')) {
        var create = zone.querySelector('.task-create');
        if (create) { create.textContent = 'Créer ma tâche'; create.classList.remove('secondary'); }
        if (card) {
          var mute = card.querySelector('.card-task-face .param-mute-row');
          if (mute) mute.remove();
          var st = card.querySelector('.card-front .state.task');
          if (st) st.innerHTML = '<span class="dot-idle"></span> Tâche personnelle';
          if (!data || data.subscribed === false) {
            card.dataset.subscribed = '0';
            if (typeof refreshMineDependent === 'function') refreshMineDependent();
          }
        }
      }
    } catch (err) {
      x.disabled = false;
      var due = item.querySelector('.task-due');
      if (due) due.textContent = 'Suppression impossible — réessayez';
    }
  });

  // Pulse « tâche confirmée ». PARTAGÉE par le bouton in-app et le retour depuis le
  // lien email (?task-confirmed=<id>) : une seule définition de l'animation.
  function markTaskDone(item) {
    if (!item) return;
    var btn = item.querySelector('.task-done');
    item.classList.add('task-just-done');
    if (btn && window.LBACards && LBACards.celebrateBurst) LBACards.celebrateBurst(btn);
    setTimeout(function () { item.classList.remove('task-just-done'); }, 1200);
  }

  /* ---- V3 · « C'est fait » in-app (zone tâche, verso des cartes user-task) ----
     Même porte que le lien email (GET /tache/:id/confirmer/:token), autre chemin :
     ici la session est en corps JSON, comme toutes les routes du projet. */
  document.addEventListener('click', async function (e) {
    var btn = e.target.closest('.task-done');
    if (!btn) return;
    // Aperçus de deck : cartes non interactives (déjà pointer-events:none en CSS),
    // même garde de sécurité que les handlers switch/like.
    if (btn.closest('.deck-card')) return;
    var item = btn.closest('.task-item'); if (!item) return;
    var id = item.getAttribute('data-task-id'); if (!id) return;

    e.preventDefault();
    btn.disabled = true;
    var due = item.querySelector('.task-due');
    try {
      var res = await fetch('/api/user-tasks/' + encodeURIComponent(id) + '/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: LBASession.get() })
      });
      var data = await res.json().catch(function () { return null; });
      if (!res.ok) throw new Error((data && data.error) || 'http');
      // Mise à jour du DOM sans reload : seule la ligne d'échéance change.
      if (due && data && data.next_due) {
        var d = new Date(data.next_due);
        due.textContent = isNaN(d.getTime()) ? 'Échéance mise à jour'
          : 'Échéance : ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      }
      markTaskDone(item);
    } catch (err) {
      if (due) due.textContent = 'Échec — réessayez dans un instant';
    } finally {
      btn.disabled = false;
    }
  });

  /* ---- Abonnement paramétré (OpenAlert v2) : select + instances ---- */
  var escP = LBACards.esc;
  function ensureAddBtn(card) {
    if (card.querySelector('.param-add')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'param-add'; b.textContent = '+ ajouter';
    var form = card.querySelector('.param-form');
    if (form) form.parentNode.insertBefore(b, form);
  }
  function chipsContainer(card) {
    var c = card.querySelector('.param-chips');
    if (!c) {
      c = document.createElement('div'); c.className = 'param-chips';
      var form = card.querySelector('.param-form');
      if (form) form.parentNode.insertBefore(c, form);
    }
    return c;
  }
  function addChip(card, params, label) {
    var c = chipsContainer(card);
    var key = JSON.stringify(params);
    var dup = [].some.call(c.querySelectorAll('.param-chip'), function (ch) { return ch.getAttribute('data-params') === key; });
    if (!dup) {
      var span = document.createElement('span');
      span.className = 'param-chip'; span.setAttribute('data-params', key);
      span.innerHTML = '<span class="pc-dot"></span>' + escP(label) +
        '<button type="button" class="param-remove" aria-label="Se désabonner">✕</button>';
      c.appendChild(span);
    }
    ensureAddBtn(card);
  }
  function togglePicker(card, show) {
    var f = card.querySelector('.param-form'); if (f) f.hidden = !show;
    // Point 7 : « + ajouter » masqué tant que le picker est ouvert (sinon une ligne
    // en trop reste affichée), réaffiché à la fermeture (validation ou annulation).
    var add = card.querySelector('.param-add'); if (add) add.hidden = show;
    // À l'ouverture, le switch « S'abonner » repart TOUJOURS de OFF (rien de pré-activé).
    if (show) { var cb = card.querySelector('.param-follow-cb'); if (cb) cb.checked = false; }
  }
  // H) Maintient l'indicateur « Abonné / Non abonné » d'une carte paramétrée.
  function setParamStatus(card, on) {
    var l = card.querySelector('.param-status .switch-label');
    if (!l) return;
    l.textContent = on ? 'Abonné' : 'Non abonné';
    l.classList.toggle('on', !!on);
  }
  // Fait apparaître IMMÉDIATEMENT l'interrupteur pause/reprise après un premier abonnement
  // (sans attendre un re-rendu). Remplace le libellé « Non abonné » (non-géo) ou s'ajoute
  // après la rangée de params (géo). Permet de mettre en pause SANS perdre le paramètre.
  function ensureMuteSwitch(card) {
    if (card.querySelector('.param-mute-row')) return;
    var html = '<label class="switch-row param-mute-row">' +
        '<span class="switch"><input type="checkbox" class="param-mute" checked aria-label="Activer ou mettre en pause cette alerte">' +
          '<span class="track"></span><span class="thumb"></span></span>' +
        '<span class="switch-label on">Abonné</span>' +
      '</label>';
    var status = card.querySelector('.param-status');
    if (status) { status.outerHTML = html; }
    else { var row = card.querySelector('.param-row'); if (row) row.insertAdjacentHTML('afterend', html); }
  }

  // Lit le contrôle de saisie (select enum OU input string/number) et valide
  // le format côté client (attribut pattern). Retourne { params, label } ou null.
  // Collecte la valeur de CHAQUE champ du picker (v2 multi-champs) et valide chacun selon
  // son type/pattern. Retourne { params, label } SEULEMENT si TOUS les champs sont remplis et
  // valides (sinon null → l'auto-abonnement non-géo attend que tout soit saisi).
  // Rétrocompat : un picker à 1 seul contrôle se comporte exactement comme avant.
  function readParam(card) {
    var form = card.querySelector('.param-form') || card;
    var ctrls = form.querySelectorAll('.param-select, .param-input');
    if (!ctrls.length) return null;
    var params = {};
    var labels = [];
    for (var i = 0; i < ctrls.length; i++) {
      var ctrl = ctrls[i];
      var val = ctrl.value;
      // Champ FACULTATIF laissé vide : on l'OMET, on n'invalide pas tout le formulaire.
      // Sans ça, un second paramètre facultatif resté sur son placeholder bloquait
      // l'abonnement entier — y compris le champ géo du premier paramètre, pourtant
      // pré-rempli et prêt (régression constatée sur pollens après l'ajout de `taxon`).
      // Le serveur applique alors son défaut (params.js n'exige que les champs requis).
      var optional = ctrl.getAttribute('data-optional') === '1';
      if (optional && !String(val || '').trim()) continue;
      if (ctrl.tagName === 'INPUT') {
        val = String(val || '').trim();
        var ok = !!val;
        var pat = ctrl.getAttribute('pattern');
        if (ok && pat) { try { ok = new RegExp(pat, 'i').test(val); } catch (e) { ok = true; } }
        if (!ok) { ctrl.focus(); ctrl.style.borderColor = 'var(--amber)'; return null; }
        ctrl.style.borderColor = '';
      } else if (!val) { // SELECT REQUIS sans choix (placeholder « Choisir… »)
        return null;
      }
      params[ctrl.getAttribute('data-key')] = val;
      labels.push((ctrl.tagName === 'SELECT' && ctrl.options[ctrl.selectedIndex]) ? ctrl.options[ctrl.selectedIndex].text : val);
    }
    // Tous les champs étaient facultatifs et vides → rien à soumettre (le serveur
    // refuserait « aucun paramètre fourni »). On reste silencieux, comme avant.
    if (!labels.length) return null;
    return { params: params, label: labels.join(' · ') };
  }

  async function followParamConnected(card) {
    var r = readParam(card); if (!r) return;
    var params = r.params, label = r.label;
    var btn = card.querySelector('.param-follow'); if (btn) btn.disabled = true;
    try {
      var res = await fetch('/api/my-alerts/toggle-param', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: LBASession.get(), source_id: card.getAttribute('data-source-id'), params: params, subscribed: true })
      });
      if (!res.ok) throw new Error('http');
      var data = await res.json();
      addChip(card, data.params || params, data.label || label);
      card.dataset.subscribed = '1';
      setParamStatus(card, true);
      ensureMuteSwitch(card); // interrupteur pause/reprise disponible tout de suite
      // Doublon corrigé : une fois abonné, l'interrupteur pause/reprise du bas est LE
      // contrôle d'abonnement. On masque le switch « S'abonner » du picker pour qu'il ne
      // réapparaisse pas inline à côté des chips lors d'un « + ajouter ». L'ajout d'une
      // instance supplémentaire passera par l'activation automatique au change/saisie.
      var followRow = card.querySelector('.param-follow-row');
      if (followRow) { followRow.hidden = true; var fcb = followRow.querySelector('.param-follow-cb'); if (fcb) fcb.checked = false; }
      togglePicker(card, false);
      // C5) Réinitialise TOUS les contrôles du picker pour un éventuel ajout suivant.
      var ctrls0 = card.querySelectorAll('.param-form .param-select, .param-form .param-input');
      for (var ci = 0; ci < ctrls0.length; ci++) ctrls0[ci].value = '';
      // Combobox dynamic-enum : vider aussi le champ de recherche VISIBLE, fermer la liste
      // et remettre l'état de recherche (l'input caché .dyn-value a déjà été vidé ci-dessus).
      var dynW = card.querySelectorAll('.param-form .dyn-enum');
      for (var dwi = 0; dwi < dynW.length; dwi++) {
        var dS = dynW[dwi].querySelector('.dyn-search');
        if (dS) { dS.value = ''; dS.setAttribute('aria-expanded', 'false'); dS.removeAttribute('aria-activedescendant'); }
        dynW[dwi].removeAttribute('data-selected');
        var dStat = dynW[dwi].querySelector('.dyn-status'); if (dStat) dStat.textContent = '';
        var dLb = dynW[dwi].querySelector('.dyn-listbox'); if (dLb) { dLb.hidden = true; dLb.innerHTML = ''; }
      }
      celebrate(card);
      refreshMineDependent();
      if (window.LBAListView) LBAListView.sync(); // reflète l'abonnement sur le switch de la vue liste
      // Carte recommandée adoptée : l'étiquette part, une nouvelle reco est calculée.
      if (card.classList.contains('card-reco')) setTimeout(function () { adoptReco(card); }, 800);
    } catch (e) { note(card, 'Réessaie plus tard', 'err'); }
    finally { if (btn) btn.disabled = false; }
  }

  async function removeParam(card, chip) {
    var params;
    try { params = JSON.parse(chip.getAttribute('data-params')); } catch (e) { return; }
    try {
      var res = await fetch('/api/my-alerts/toggle-param', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: LBASession.get(), source_id: card.getAttribute('data-source-id'), params: params, subscribed: false })
      });
      if (!res.ok) throw new Error('http');
      chip.remove();
      var c = card.querySelector('.param-chips');
      if (c && !c.querySelector('.param-chip')) {
        card.dataset.subscribed = '0';
        // Désabonnement TOTAL : on retire l'interrupteur pause/reprise et on rétablit
        // l'état « non abonné » (libellé pour les non-géo ; le switch S'abonner du picker
        // suffit pour les géo).
        var mute = card.querySelector('.param-mute-row'); if (mute) mute.remove();
        var add = card.querySelector('.param-add'); if (add) add.remove();
        // Désabonnement TOTAL : on rétablit l'état « premier abonnement » → le switch
        // « S'abonner » du picker redevient visible (il avait été masqué à l'abonnement),
        // seul moyen de re-souscrire une valeur géo pré-remplie sans la re-sélectionner.
        var followRow = card.querySelector('.param-follow-row');
        if (followRow) { followRow.hidden = false; var fcb = followRow.querySelector('.param-follow-cb'); if (fcb) fcb.checked = false; }
        // Le picker (contrôle + switch S'abonner) redevient l'état « non abonné » pour
        // les deux familles → plus de libellé « Non abonné » séparé à recréer.
        togglePicker(card, true);
      }
      refreshMineDependent();
      if (window.LBAListView) LBAListView.sync(); // reflète le désabonnement d'instance sur la vue liste
    } catch (e) { /* silencieux */ }
  }

  function followParamAnon(card) {
    var r = readParam(card); if (!r) return;
    card._pendingParams = r.params;
    var sf = card.querySelector('.param-subform');
    if (sf) { sf.style.display = 'flex'; var i = sf.querySelector('input'); if (i) i.focus(); }
  }

  document.addEventListener('click', function (e) {
    var card = e.target.closest('.card'); if (!card) return;
    if (e.target.closest('.param-follow')) {
      e.preventDefault();
      if (document.body.getAttribute('data-mode') === 'connected') followParamConnected(card);
      else followParamAnon(card);
    } else if (e.target.closest('.param-remove')) {
      e.preventDefault();
      removeParam(card, e.target.closest('.param-chip'));
    } else if (e.target.closest('.param-add')) {
      e.preventDefault();
      // Ouvre le picker (et masque « + ajouter » — point 7).
      togglePicker(card, true);
      // Combobox dynamic-enum : focus sur le champ VISIBLE (.dyn-search), pas l'input caché.
      var ctrl = card.querySelector('.dyn-search, .param-select, .param-input');
      if (ctrl) ctrl.focus();
    }
  });

  // Activation d'une combinaison paramétrée = basculement EXPLICITE du switch « S'abonner »
  // (remplace l'ancienne activation-au-change/à-la-saisie). Le pré-remplissage du contrôle
  // n'abonne donc JAMAIS tout seul. On lit la valeur courante du contrôle (pré-remplie ou
  // modifiée par l'utilisateur) : si vide/invalide, on annule le switch et on focalise.
  document.addEventListener('change', function (e) {
    var cb = e.target.closest('.param-follow-cb');
    if (!cb || cb.disabled) return; // non-géo disabled : activation via saisie, pas ce switch
    var card = cb.closest('.card'); if (!card) return;
    if (!cb.checked) return; // re-décocher avant abonnement : rien à faire
    var ctrl = card.querySelector('.param-select, .param-input');
    var emptySel = ctrl && ctrl.tagName === 'SELECT' && !ctrl.value;
    if (emptySel || !readParam(card)) { // readParam valide aussi le pattern des champs libres
      cb.checked = false;
      if (ctrl) { ctrl.focus(); if (ctrl.tagName !== 'SELECT') ctrl.style.borderColor = 'var(--amber)'; }
      return;
    }
    if (document.body.getAttribute('data-mode') === 'connected') followParamConnected(card);
    else followParamAnon(card);
  });

  // Activation IMMÉDIATE au choix (select) ou à la saisie debouncée (input) pour TOUTES
  // les cartes paramétrées, géo comme non-géo. Le switch « S'abonner » (.param-follow-cb)
  // reste un chemin explicite possible (son propre handler, bloc ci-dessus), mais n'est
  // plus l'unique déclencheur pour les géo.
  // Un CHOIX ACTIF de l'utilisateur (change select, saisie debouncée, sélection dyn-enum,
  // Entrée) abonne DIRECTEMENT — géo comme non-géo, sans passer par le switch. Aucun blocage
  // géo : le garde-fou anti-abonnement-au-prefill ne repose PAS sur ce verrou mais sur le fait
  // que le pré-remplissage profil pose sa valeur via des attributs HTML (`selected`, `value=`)
  // qui ne déclenchent NI `change` NI `input` → ces handlers ne s'exécutent que sur une vraie
  // interaction. (Confirmé : aucun dispatch synthétique de change/input ne vise .param-select
  // /.param-input ; le prefill dyn-enum dispatche un `input` sur .dyn-search, pas sur le champ
  // abonnant.) Fonction conservée comme point d'extension unique si un blocage redevenait utile.
  function autoBlocked(card) { return false; }
  document.addEventListener('change', function (e) {
    var sel = e.target.closest('.param-select');
    if (!sel || !sel.value) return; // ignore le placeholder « Choisir… »
    var card = sel.closest('.card'); if (!card || autoBlocked(card)) return;
    if (document.body.getAttribute('data-mode') === 'connected') followParamConnected(card);
    else followParamAnon(card);
  });
  var paramInputTimers = new WeakMap();
  document.addEventListener('input', function (e) {
    var inp = e.target.closest('.param-input');
    if (!inp) return;
    var card = inp.closest('.card'); if (!card || autoBlocked(card)) return;
    var prev = paramInputTimers.get(inp); if (prev) clearTimeout(prev);
    paramInputTimers.set(inp, setTimeout(function () {
      if (!(inp.value || '').trim()) return;
      // readParam (dans follow*) valide le pattern : une saisie invalide est ignorée.
      if (document.body.getAttribute('data-mode') === 'connected') followParamConnected(card);
      else followParamAnon(card);
    }, 700));
  });
  // Champ 'dynamic-enum' : COMBOBOX autocomplete (un seul champ visuel). Recherche debouncée →
  // /api/param-lookup/<source> → liste ARIA de propositions. Générique (aucun code spécifique à
  // une source). La SÉLECTION d'une option affiche le libellé, pose l'URL dans l'input caché
  // (.dyn-value) et déclenche l'abonnement (carte non-géo) comme l'ancien change du select.
  var dynSearchTimers = new WeakMap();
  function dynWrap(el) { return el.closest('.dyn-enum'); }
  function setDynStatus(wrap, msg) { var s = wrap.querySelector('.dyn-status'); if (s) s.textContent = msg || ''; }
  function dynListbox(wrap) { return wrap.querySelector('.dyn-listbox'); }
  function dynSearch(wrap) { return wrap.querySelector('.dyn-search'); }
  function dynOptions(wrap) { return Array.prototype.slice.call(wrap.querySelectorAll('.dyn-option')); }
  function closeDynList(wrap) {
    var lb = dynListbox(wrap); if (lb) { lb.hidden = true; lb.innerHTML = ''; }
    var input = dynSearch(wrap);
    if (input) { input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  }
  function setActiveOption(wrap, opt) {
    var input = dynSearch(wrap);
    dynOptions(wrap).forEach(function (o) { o.classList.remove('active'); o.setAttribute('aria-selected', 'false'); });
    if (opt && input) {
      opt.classList.add('active'); opt.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', opt.id);
      if (opt.scrollIntoView) opt.scrollIntoView({ block: 'nearest' });
    } else if (input) { input.removeAttribute('aria-activedescendant'); }
  }
  // Commit d'une sélection : le champ affiche le libellé, l'input caché reçoit l'URL, puis
  // auto-abonnement (sauf carte géo, où l'abonnement passe par le switch S'abonner).
  function selectDynOption(wrap, opt) {
    var input = dynSearch(wrap); var hidden = wrap.querySelector('.dyn-value');
    if (!input || !hidden || !opt) return;
    hidden.value = opt.getAttribute('data-value') || '';
    input.value = opt.getAttribute('data-label') || input.value;
    wrap.setAttribute('data-selected', '1');
    closeDynList(wrap);
    setDynStatus(wrap, 'Sélection : ' + input.value);
    var card = input.closest('.card'); if (!card || autoBlocked(card)) return;
    if (document.body.getAttribute('data-mode') === 'connected') followParamConnected(card);
    else followParamAnon(card);
  }
  async function runDynLookup(input) {
    var wrap = dynWrap(input); if (!wrap) return;
    var card = input.closest('.card'); if (!card) return;
    var lb = dynListbox(wrap); if (!lb) return;
    var q = (input.value || '').trim();
    if (q.length < 2) { closeDynList(wrap); setDynStatus(wrap, ''); return; }
    setDynStatus(wrap, 'Recherche…');
    try {
      // Désambiguïsation (B bonus) : on transmet le département du profil s'il existe (biais
      // générique, non spécifique PanneauPocket) ; le serveur ne l'utilise que s'il est valide.
      var dept = (window.LBADefaults && window.LBADefaults.departement) || '';
      var url = '/api/param-lookup/' + encodeURIComponent(card.getAttribute('data-source-id')) +
        '?q=' + encodeURIComponent(q) + (dept ? '&dept=' + encodeURIComponent(dept) : '');
      var res = await fetch(url);
      if (!res.ok) throw new Error('http');
      var data = await res.json();
      var options = (data && data.options) || [];
      if (!options.length) { closeDynList(wrap); setDynStatus(wrap, 'Aucune collectivité trouvée pour cette ville.'); return; }
      // Peuplement par DOM API (label/value viennent du serveur → jamais d'injection HTML).
      lb.innerHTML = '';
      for (var i = 0; i < options.length; i++) {
        var li = document.createElement('li');
        li.className = 'dyn-option'; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', 'false');
        li.id = lb.id + '-opt-' + i;
        li.setAttribute('data-value', options[i].value);
        li.setAttribute('data-label', options[i].label);
        li.textContent = options[i].label;
        lb.appendChild(li);
      }
      lb.hidden = false; input.setAttribute('aria-expanded', 'true'); setActiveOption(wrap, null);
      setDynStatus(wrap, options.length + (options.length > 1 ? ' collectivités trouvées, flèches pour choisir.' : ' collectivité trouvée.'));
    } catch (e) {
      closeDynList(wrap);
      setDynStatus(wrap, 'Recherche indisponible, réessayez plus tard.');
    }
  }
  // Frappe : recherche debouncée ET invalidation de toute sélection antérieure (le libellé
  // affiché n'est plus garanti → l'URL soumise doit être re-choisie).
  document.addEventListener('input', function (e) {
    var input = e.target.closest('.dyn-search'); if (!input) return;
    var wrap = dynWrap(input);
    if (wrap && wrap.getAttribute('data-selected')) {
      wrap.removeAttribute('data-selected');
      var hidden = wrap.querySelector('.dyn-value'); if (hidden) hidden.value = '';
    }
    var prev = dynSearchTimers.get(input); if (prev) clearTimeout(prev);
    dynSearchTimers.set(input, setTimeout(function () { runDynLookup(input); }, 350));
  });
  // Navigation clavier ARIA : flèches (parcours), Entrée (sélection), Échap (fermeture).
  document.addEventListener('keydown', function (e) {
    var input = e.target.closest('.dyn-search'); if (!input) return;
    var wrap = dynWrap(input); if (!wrap) return;
    var opts = dynOptions(wrap);
    var current = wrap.querySelector('.dyn-option.active');
    var idx = current ? opts.indexOf(current) : -1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (input.getAttribute('aria-expanded') !== 'true') { runDynLookup(input); return; }
      if (opts.length) setActiveOption(wrap, opts[Math.min(idx + 1, opts.length - 1)]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (opts.length) setActiveOption(wrap, opts[Math.max(idx - 1, 0)]);
    } else if (e.key === 'Enter') {
      if (current) { e.preventDefault(); e.stopImmediatePropagation(); selectDynOption(wrap, current); }
    } else if (e.key === 'Escape') {
      if (input.getAttribute('aria-expanded') === 'true') { e.preventDefault(); e.stopImmediatePropagation(); closeDynList(wrap); }
    }
  });
  // Clic sur une proposition = sélection.
  document.addEventListener('click', function (e) {
    var opt = e.target.closest('.dyn-option'); if (!opt) return;
    var wrap = dynWrap(opt); if (!wrap) return;
    e.preventDefault(); selectDynOption(wrap, opt);
  });
  // Clic hors d'un combobox ouvert → fermeture de sa liste.
  document.addEventListener('click', function (e) {
    if (e.target.closest('.dyn-enum')) return;
    var open = document.querySelectorAll('.dyn-search[aria-expanded="true"]');
    for (var i = 0; i < open.length; i++) closeDynList(dynWrap(open[i]));
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches('.sub-form input')) {
      e.preventDefault();
      submitAnon(e.target.closest('.card'));
    }
    // Entrée sur le switch le bascule (Espace est natif).
    if (e.key === 'Enter' && e.target.matches('.switch input')) {
      e.preventDefault();
      e.target.checked = !e.target.checked;
      e.target.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Entrée dans un champ paramétré (.param-input) = valider MAINTENANT, équivalent immédiat
    // de ce que ferait le debounce de saisie à cet instant, quel que soit l'état d'abonnement.
    if (e.key === 'Enter' && e.target.matches('.param-input')) {
      e.preventDefault();
      var pcard = e.target.closest('.card');
      if (pcard) {
        var t = paramInputTimers.get(e.target);
        if (t) { clearTimeout(t); paramInputTimers.delete(e.target); } // pas de double déclenchement
        if ((e.target.value || '').trim()) {
          // Entrée = choix actif → abonnement immédiat (géo comme non-géo), équivalent au
          // debounce déclenché maintenant. readParam (dans follow*) valide le pattern.
          if (document.body.getAttribute('data-mode') === 'connected') followParamConnected(pcard);
          else followParamAnon(pcard);
        }
      }
    }
    if (e.key === 'Escape') cancelAllPending(null);
  });
  // Clic hors d'une carte « en attente » → annulation.
  document.addEventListener('click', function (e) {
    var pendingRows = document.querySelectorAll('.switch-row.pending');
    if (!pendingRows.length) return;
    pendingRows.forEach(function (r) {
      var c = r.closest('.card');
      if (c && !c.contains(e.target)) cancelPending(c);
    });
  });

  /* ---------------- KPI hero ---------------- */
  // Met à jour le nombre compact (toujours visible) du compteur d'alertes.
  function setKpiNum(n) {
    var num = document.getElementById('kpi-num');
    if (num) num.textContent = n;
  }
  function updateKPI(sources) {
    var dot = document.getElementById('kpi-dot');
    var txt = document.getElementById('kpi-text');
    if (!dot || !txt) return;
    if (!sources) { dot.className = 'dot-idle'; txt.textContent = ''; setKpiNum(''); return; }
    var n = sources.filter(function (s) { return s.state === 'active'; }).length;
    dot.className = n > 0 ? 'dot-live' : 'dot-idle';
    // F2) Nombre exposé sur le conteneur → forme compacte (icône + X) sur PC étroit.
    if (dot.parentElement) { dot.parentElement.dataset.n = n; dot.parentElement.dataset.active = n > 0; }
    setKpiNum(n);
    var full = n === 0
      ? 'Tout est calme'
      : (n === 1 ? '1 alerte active' : n + ' alertes actives');
    // A11y : le libellé complet (avec le nombre) reste lisible par lecteur d'écran.
    if (dot.parentElement) dot.parentElement.setAttribute('aria-label', full);
    // L'overlay de survol suit le « ● N » compact déjà visible → on retire le nombre
    // en tête pour éviter de l'afficher deux fois.
    txt.textContent = full.replace(/^\d+\s*/, '');
  }

  // KPI personnalisé (connecté) : alertes actives PARMI les abonnements.
  function updateKPIMine(n) {
    var dot = document.getElementById('kpi-dot');
    var txt = document.getElementById('kpi-text');
    if (!dot || !txt) return;
    dot.className = n > 0 ? 'dot-live' : 'dot-idle';
    if (dot.parentElement) { dot.parentElement.dataset.n = n; dot.parentElement.dataset.active = n > 0; }
    setKpiNum(n);
    var full = n === 0
      ? 'Tout est calme'
      : (n === 1 ? '1 de vos alertes est active' : n + ' de vos alertes sont actives');
    if (dot.parentElement) dot.parentElement.setAttribute('aria-label', full);
    txt.textContent = full.replace(/^\d+\s*/, '');
  }

  // Une carte est-elle « active » (source déclenchée) ? (état rendu dans .state)
  function cardIsActive(c) {
    var st = c.querySelector('.state');
    return !!(st && st.classList.contains('active'));
  }

  // Recalcule tout ce qui dépend de la liste des abonnements, sans rechargement :
  // compteur du chip « Mes alertes », KPI perso, et re-filtrage si « mine » actif.
  function refreshMineDependent() {
    var mineCount = cards.filter(function (c) { return c.dataset.subscribed === '1'; }).length;
    var mineChipN = document.querySelector('.chip-f[data-cat="mine"] .n');
    if (mineChipN) mineChipN.textContent = mineCount;

    // Panneau « Mon compte » : nombre de cartes dans la collection de l'utilisateur.
    var collCountEl = document.getElementById('acct-collection-count');
    if (collCountEl) {
      collCountEl.textContent = mineCount > 0
        ? (mineCount + (mineCount > 1 ? ' cartes dans ma collection' : ' carte dans ma collection'))
        : 'Aucune carte dans ma collection pour l\'instant';
      collCountEl.hidden = false;
    }

    var mineActive = cards.filter(function (c) {
      return c.dataset.subscribed === '1' && cardIsActive(c);
    }).length;
    updateKPIMine(mineActive);

    // Sur le filtre « Mes alertes », la carte désabonnée doit sortir (FLIP).
    if (cat === 'mine') apply(true);
  }

  /* ---------------- Kiosque : recherche + catégories + pagination ---------------- */
  var esc = LBACards.esc;
  // A3) Icônes SVG (même famille que SHARE_SVG/INFO_SVG : trait 2px, linecap round,
  // 16px, currentColor) pour remplacer les emoji 🆕/✨ des puces spéciales.
  var ICON_NOUVEAUTES = '<svg class="chip-ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2l1.7 4L18 8.9l-4.3 1.7L12 14.9l-1.7-4.3L6 8.9l4.3-1.7z"/><path d="M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg>';
  var ICON_SELECTION = '<svg class="chip-ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5h11a1 1 0 0 1 1 1V20l-6.5-4.2L5.5 20V4.5a1 1 0 0 1 1-1z"/></svg>';
  // Seuil de pagination par défaut : anonyme 6 (+ carte Proposer), connecté 8
  // cartes normales (+ la carte recommandée épinglée en 9e = 9 visibles).
  var INITIAL_ANON = 5, INITIAL_CONNECTED = 8, STEP = 9;
  var cat = 'all', visibleLimit = INITIAL_ANON, secondaryOpen = false, currentMode = 'anon';
  var accountEmail = null; // email de la session connectée (pour le panneau compte)
  var accountDisplayName = null; // pseudo unifié (auto-rempli à la 1re connexion) — pilote « Bonjour » + avatar
  // (j) Vue LISTE + onglet « Toutes » + connecté : 16 par défaut (au lieu de 8).
  // Uniquement ce cas : cartes, onglets spéciaux, autres catégories et vue anonyme
  // gardent INITIAL_CONNECTED=8 / INITIAL_ANON=5 inchangés.
  var INITIAL_LIST_ALL_CONNECTED = 16;
  function isListView() { return document.documentElement.getAttribute('data-view') === 'list'; }
  function initialLimit() {
    if (currentMode === 'connected' && cat === 'all' && isListView()) return INITIAL_LIST_ALL_CONNECTED;
    return currentMode === 'connected' ? INITIAL_CONNECTED : INITIAL_ANON;
  }
  var cards = [], moreBtn = null, qInput = null, grid = null, addCard = null;
  var sourcesData = []; // liste des sources (pour recalculer une recommandation à l'adoption)
  var decksData = [];   // tuiles-deck du kiosque (officiels + perso publics) — modes spéciaux
  // Exposition lecture seule pour la vue liste (list-view.js) : données + mode. La liste
  // reste une PROJECTION ; les cartes de #grid demeurent la source de vérité par-source.
  // filter(slug) : point d'entrée public du MÊME filtrage que les puces de catégorie
  // (réutilise selectChip, hoisté). Utilisé par la vue liste (clic sur .lrow-cat).
  window.LBAKiosk = {
    sources: function () { return sourcesData; },
    mode: function () { return currentMode; },
    filter: function (slug) { if (slug) selectChip(slug); }
  };
  // D) Personnalisation (connecté) : renseignée depuis /api/my-alerts au chargement.
  var profile = { country: null, departement: null, region: null, ville: null, interests: [] };
  // Une source est-elle géolocalisée sur le département choisi ? Signal simple et
  // lisible : son id se termine par « -<dept> » (vigilance-meteo-05, vigicrues-05…).
  function sourceMatchesDept(s) {
    if (!profile.departement) return false;
    // 1) source géo « fixe » : son id se termine par « -<dept> » (vigilance-meteo-05…)
    if (new RegExp('-' + profile.departement + '$').test(s.id || '')) return true;
    // 2) B) source PARAMÉTRÉE : une valeur enum de son schéma correspond au département
    //    profil (ex. vigilance météo paramétrée par département) → même boost.
    if (Array.isArray(s.params_schema)) {
      return s.params_schema.some(function (sch) {
        return sch && sch.type === 'enum' && (sch.values || []).some(function (v) {
          return String(v.value) === String(profile.departement);
        });
      });
    }
    return false;
  }
  // B) Une source est-elle géolocalisée « en dur » (id suffixé par un département) ?
  //    Sert à écarter de la reco une source géo d'un AUTRE département que le profil.
  function fixedGeoDept(s) {
    var m = String(s.id || '').match(/-(\d{2,3}|2[ab])$/i);
    return m ? m[1] : null;
  }
  // Une catégorie de la source figure-t-elle dans les centres d'intérêt ?
  function sourceMatchesInterest(s) {
    if (!profile.interests || !profile.interests.length) return false;
    return (s.categories || []).some(function (c) { return profile.interests.indexOf(c) !== -1; });
  }
  function hasPersonalization() {
    return !!profile.departement || (profile.interests && profile.interests.length > 0);
  }
  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function catsOf(c) { return (c.dataset.cats || '').split(' ').filter(Boolean); }
  function isShown(c) { return !c.classList.contains('filtered') && !c.classList.contains('hidden-more'); }

  // A4/A5) Modes spéciaux : ensembles d'ids calculés (6 sources), pas un filtre par
  // catégorie. `specialIds` = map { id: true } courant, ou null hors mode spécial.
  var specialIds = null;
  function isSpecial(slug) { return slug === 'nouveautes' || slug === 'selection'; }

  // A4) « Nouveautés » : 6 sources les plus récentes (created_at desc).
  // « Les plus populaires » (slug interne 'selection', conservé pour la compat des liens
  //   ?mode=selection) : les ~12 cartes les plus likées de TOUT le site (likes_count desc,
  //   départage par display_order croissant), IDENTIQUE pour tous — connectés comme
  //   anonymes. La personnalisation ne pilote PLUS ce filtre (elle continue de piloter la
  //   recommandation et le tri général, inchangés).
  // Les tuiles-deck (decksData) entrent dans le calcul aux côtés des cartes, mais sont
  // PLAFONNÉES pour ne pas noyer les cartes : 2 decks max en Nouveautés (sur 6), 4 max en
  // Populaires (sur 12). L'id d'un deck (data-source-id de la tuile) rejoint la map → la
  // même fonction matches() les affiche/masque sans logique parallèle.
  function computeSpecialIds(mode) {
    var cardsL = (sourcesData || []).filter(function (s) { return s.type !== 'linked'; });
    var decksL = (decksData || []).slice();
    var ids = {};
    if (mode === 'nouveautes') {
      var TAKE = 6, DECK_CAP = 2;
      // Fusion cartes+decks triée par created_at desc ; on prend 6 au plus, ≤2 decks.
      var merged = cardsL.map(function (s) { return { id: s.id, t: new Date(s.created_at || 0).getTime(), deck: false }; })
        .concat(decksL.map(function (d) { return { id: d.id, t: new Date(d.created_at || 0).getTime(), deck: true }; }))
        .sort(function (a, b) { return b.t - a.t; });
      var nDeck = 0, n = 0;
      for (var i = 0; i < merged.length && n < TAKE; i++) {
        if (merged[i].deck) { if (nDeck >= DECK_CAP) continue; nDeck++; }
        ids[merged[i].id] = true; n++;
      }
    } else { // 'selection' = Les plus populaires
      var TOTAL = 12, DECK_MAX = 4;
      // Decks par nombre d'adoptions (desc, >0 seulement), plafonnés ; le reste = cartes par likes.
      var topDecks = decksL.filter(function (d) { return (d.adopt_count || 0) > 0; })
        .sort(function (a, b) { return (b.adopt_count || 0) - (a.adopt_count || 0); })
        .slice(0, DECK_MAX);
      topDecks.forEach(function (d) { ids[d.id] = true; });
      cardsL.slice().sort(function (a, b) {
        var d = (b.likes_count || 0) - (a.likes_count || 0);
        if (d !== 0) return d;
        return (a.display_order || 0) - (b.display_order || 0); // départage ex æquo
      }).slice(0, TOTAL - topDecks.length).forEach(function (s) { ids[s.id] = true; });
    }
    return ids;
  }

  function matches(c, q) {
    var okCat;
    if (cat === 'all') okCat = true;
    else if (cat === 'mine') okCat = c.dataset.subscribed === '1';
    else if (isSpecial(cat)) okCat = !!(specialIds && specialIds[c.getAttribute('data-source-id')]);
    else okCat = catsOf(c).indexOf(cat) !== -1;
    var okQ = !q || (c.dataset.search || '').indexOf(q) !== -1;
    return okCat && okQ;
  }

  // Puces : [Toutes] [Mes alertes si connecté] [3-4 catégories les + peuplées] [+ 2e ligne].
  function renderChips(mode) {
    var chipsEl = document.getElementById('chips');
    if (!chipsEl) return;
    // Sous recherche : les puces ne décrivent QUE les résultats — comptes calculés sur les
    // cartes qui matchent la requête (indépendamment de la catégorie active) et catégories
    // sans résultat retirées. Cliquer une puce affine donc toujours vers du non-vide.
    var q = qInput ? normQ(qInput.value) : '';
    var pool = q ? cards.filter(function (c) { return (c.dataset.search || '').indexOf(q) !== -1; }) : cards;
    var counts = {};
    pool.forEach(function (c) { catsOf(c).forEach(function (s) { counts[s] = (counts[s] || 0) + 1; }); });
    var slugs = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || LBACat.label(a).localeCompare(LBACat.label(b));
    });
    // A1) Expose la liste des catégories du kiosque pour la face « Catégories » du
    // menu mobile (header.js la lit à l'ouverture ; mêmes catégories que ce rail).
    window.LBAKioskCats = slugs.map(function (s) { return { slug: s, label: LBACat.label(s), count: counts[s] }; });
    // Mobile (≤720px) : rail horizontal unique — TOUTES les catégories dans la 1re
    // ligne (pas de « + » ni de 2e ligne). Desktop : 7 puces visibles ≥1024px (sinon 5)
    // avant le « + ». Total visible = Toutes [+ Mes alertes] + primary.
    var mobile = !!(window.matchMedia && window.matchMedia('(max-width: 720px)').matches);
    var wide = !!(window.matchMedia && window.matchMedia('(min-width: 1024px)').matches);
    var primaryN = mobile ? slugs.length : (mode === 'connected' ? (wide ? 5 : 3) : (wide ? 6 : 4));
    var primary = slugs.slice(0, primaryN);
    var secondary = mobile ? [] : slugs.slice(primaryN, primaryN + 8);
    var mineCount = pool.filter(function (c) { return c.dataset.subscribed === '1'; }).length;

    function chip(slug, label, count) {
      return '<button class="chip-f" type="button" data-cat="' + esc(slug) + '">' +
        esc(label) + ' <span class="n">' + count + '</span></button>';
    }
    var prim = '<button class="chip-f on" type="button" data-cat="all">Toutes <span class="n">' + pool.length + '</span></button>';
    if (mode === 'connected' && (!q || mineCount)) prim += chip('mine', 'Ma collection', mineCount);
    // A6) Puces spéciales « Nouveautés » / « Les plus populaires » en tête (après Toutes/Mes alertes).
    // Masquées sous recherche : elles ignorent la requête (top-N global), donc elles ne
    // décriraient pas les résultats affichés.
    if (!q) {
      prim += '<button class="chip-f chip-special" type="button" data-cat="nouveautes">' + ICON_NOUVEAUTES + ' Nouveautés</button>';
      prim += '<button class="chip-f chip-special" type="button" data-cat="selection">' + ICON_SELECTION + ' Les plus populaires</button>';
    }
    primary.forEach(function (s) { prim += chip(s, LBACat.label(s), counts[s]); });
    if (secondary.length) prim += '<button class="chip-f chip-more-toggle" type="button" aria-label="Plus de catégories">+</button>';

    var sec = secondary.map(function (s) { return chip(s, LBACat.label(s), counts[s]); }).join('');
    // La 2e ligne est fermée par défaut (CSS max-height:0), ouverte via .open.
    // Elle est rendue HORS de .toolbar pour ne pas décaler la barre de recherche (I).
    secondaryOpen = false;
    chipsEl.innerHTML = '<div class="chips-row" id="chips-primary">' + prim + '</div>';
    var secWrap = document.getElementById('chips-secondary-wrap');
    if (secWrap) secWrap.innerHTML = secondary.length
      ? '<div class="chips-row chips-more" id="chips-secondary">' + sec + '</div>' : '';
  }

  function computeShow() {
    var q = normQ(qInput.value);
    var searching = q.length > 0 || cat !== 'all';
    var idx = 0, hiddenMore = 0;
    cards.forEach(function (c) {
      var elig = matches(c, q);
      // Épinglées (ne consomment pas de créneau) : la reco, la carte de comblement, et les
      // tuiles-deck (elles ne comptent pas dans la pagination des alertes).
      var isReco = c.classList.contains('card-reco') || c.classList.contains('card-filler')
        || c.classList.contains('deck-card');
      var show;
      if (!elig) show = false;
      else if (searching) show = true;      // sous filtre/recherche : comme les autres cartes
      else if (isReco) show = true;         // vue par défaut : épinglée, ne consomme pas de créneau
      else { show = idx < visibleLimit; if (!show) hiddenMore++; idx++; }
      c._elig = elig; c._show = show;
    });
    return { searching: searching, hiddenMore: hiddenMore };
  }
  function setClasses() {
    cards.forEach(function (c) {
      c.classList.toggle('filtered', !c._elig);
      c.classList.toggle('hidden-more', c._elig && !c._show);
    });
  }
  function updateMore(info) {
    if (!moreBtn) return;
    // A) Plus de compteur « (+X) » : le bouton dit simplement « Afficher plus d'alertes ».
    moreBtn.style.display = (info.searching || info.hiddenMore === 0) ? 'none' : '';
  }
  function snapshot(list) { var m = new Map(); list.forEach(function (c) { m.set(c, c.getBoundingClientRect()); }); return m; }

  // Cartes participant au placement : cartes filtrables affichées + carte « Proposer » (G).
  function positionedShown() {
    var list = cards.filter(isShown);
    if (addCard) list.push(addCard);
    return list;
  }

  // Empty-state du filtre « mine » (aucune alerte suivie).
  function updateMineEmpty() {
    var el = document.getElementById('mine-empty');
    if (!el || !grid) return;
    var anyElig = cards.some(function (c) { return c._elig; });
    var show = (cat === 'mine') && !anyElig;
    el.hidden = !show;
    grid.style.display = show ? 'none' : '';
  }

  // « Afficher plus » : re-impose la position de scroll y le temps de la reveal + de
  // l'animation de hauteur (~380ms), pour neutraliser le scroll-anchoring du navigateur
  // (qui, pres du bas, decale scrollY pour garder le contenu du bas immobile). Restauration
  // INSTANTANEE (scroll-behavior:auto force) : sinon le html{scroll-behavior:smooth} global
  // animerait la correction en un « redescendre puis remonter » visible.
  //
  // Libere le verrou des qu'un VRAI geste utilisateur est detecte (molette / tactile /
  // touche de defilement) : c'est le signal fiable d'une intention deliberee. On ne se fie
  // PAS a la distance de scrollY : la correction d'anchoring qu'on contre est elle-meme
  // grande (mesuree ~1250px), donc un seuil de distance se declencherait sur l'anchoring.
  function holdScroll(y) {
    var de = document.documentElement;
    var prevBehav = de.style.scrollBehavior;
    de.style.scrollBehavior = 'auto';
    function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
    var t0 = now(), released = false;
    var SCROLL_KEYS = { ArrowUp: 1, ArrowDown: 1, PageUp: 1, PageDown: 1, Home: 1, End: 1, ' ': 1, Spacebar: 1 };
    function release() {
      if (released) return; released = true;
      de.style.scrollBehavior = prevBehav;
      window.removeEventListener('wheel', release);
      window.removeEventListener('touchmove', release);
      window.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (SCROLL_KEYS[e.key]) release(); } // seules les touches de defilement liberent
    window.addEventListener('wheel', release, { passive: true });
    window.addEventListener('touchmove', release, { passive: true });
    window.addEventListener('keydown', onKey);
    function hold() {
      if (released) return;
      if ((window.pageYOffset || 0) !== y) window.scrollTo(0, y);
      if (now() - t0 < 380) requestAnimationFrame(hold);
      else release();
    }
    hold();
  }

  // Volet E : anime la hauteur du conteneur pour éviter tout saut de la section suivante.
  function animateGridHeight(fromH) {
    if (!grid) return;
    var toH = grid.offsetHeight;
    if (Math.abs(toH - fromH) < 2) return;
    grid.style.height = fromH + 'px';
    grid.getBoundingClientRect();
    grid.style.transition = 'height .3s ease-out';
    grid.style.height = toH + 'px';
    var clr = function () { grid.style.transition = ''; grid.style.height = ''; grid.removeEventListener('transitionend', clr); };
    grid.addEventListener('transitionend', clr);
  }

  // Volet F/G/A : movers glissent (FLIP) ; la carte Proposer anime aussi sa HAUTEUR
  // (mesurée, car height:auto issu du stretch n'est pas transitionnable) dans les deux sens.
  // grow = chemin « afficher plus » (pagination). Sur ce chemin, les cartes DEJA
  // affichees ne doivent PAS glisser : sinon les cartes de queue (Proposer, tuile-deck
  // en debordement) se retrouvent poussees de ~1 page vers le bas et balaient tout
  // l'ecran (« trait blanc »). On annule leur translate (elles se replacent d'un coup) ;
  // seules les NOUVELLES cartes animent leur entree (branche else). En reagencement
  // (grow absent : chips/recherche), le FLIP reste normal QUELLE QUE SOIT la distance
  // — un seuil fixe/relatif couperait a tort les gros deplacements legitimes (mobile 1
  // colonne : un mover peut remonter de plusieurs rangs, cf. mesure).
  function flipMoves(first, fromAddH, grow) {
    if (!grid.offsetHeight) return;
    var movers = positionedShown();
    var enterIdx = 0;
    movers.forEach(function (c, i) {
      var isAdd = (c === addCard);
      var f = first.get(c);
      var last = c.getBoundingClientRect();
      if (f) {
        var dx = grow ? 0 : f.left - last.left, dy = grow ? 0 : f.top - last.top;
        var dh = isAdd ? Math.abs(last.height - fromAddH) : 0;
        if (dx || dy || dh > 2) {
          c.style.transition = 'none';
          c.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
          if (isAdd && dh > 2) c.style.height = fromAddH + 'px';
          c.getBoundingClientRect();
          requestAnimationFrame(function () {
            c.style.transition = (isAdd && dh > 2) ? 'transform .3s ease-out, height .3s ease-out' : 'transform .3s ease-out';
            c.style.transform = '';
            if (isAdd && dh > 2) c.style.height = last.height + 'px';
          });
          (function (card) {
            var clr = function (ev) {
              if (ev && ev.propertyName && ev.propertyName !== 'transform' && ev.propertyName !== 'height') return;
              card.style.transition = ''; card.style.transform = ''; card.style.height = '';
              card.removeEventListener('transitionend', clr);
            };
            card.addEventListener('transitionend', clr);
          })(c);
        }
      } else {
        var dir = (i % 2 === 0) ? 1 : -1;
        var delay = enterIdx * 30; enterIdx++;
        c.style.transition = 'none';
        c.style.transform = 'translateX(' + (24 * dir) + 'px) scale(.97)';
        c.style.opacity = '0';
        c.getBoundingClientRect();
        requestAnimationFrame(function () {
          c.style.transition = 'transform .28s ease-out ' + delay + 'ms, opacity .28s ease-out ' + delay + 'ms';
          c.style.transform = ''; c.style.opacity = '';
        });
        (function (card) {
          var clr = function () { card.style.transition = ''; card.style.transform = ''; card.style.opacity = ''; card.removeEventListener('transitionend', clr); };
          card.addEventListener('transitionend', clr);
        })(c);
      }
    });
  }

  function apply(animate, mutate, grow) {
    if (!grid || !qInput) return;
    // « Afficher plus » (grow) ne doit JAMAIS deplacer le scroll : on memorise la position
    // AVANT toute mutation pour la re-imposer ensuite (cf. holdScroll dans commit). Le saut
    // vient du scroll-anchoring du navigateur qui, pres du bas, decale scrollY pour garder le
    // contenu du bas immobile quand la grille grandit au-dessus.
    var pinY = grow ? (window.pageYOffset || 0) : null;
    var doAnim = animate && !REDUCE;
    var beforeVisible = cards.filter(isShown);
    var first = doAnim ? snapshot(positionedShown()) : null;
    var fromH = grid.offsetHeight;
    var fromAddH = (doAnim && addCard) ? addCard.getBoundingClientRect().height : 0;
    // Mutation DOM éventuelle (ré-ordonnancement) APRÈS le snapshot → animée par FLIP.
    if (mutate) mutate();
    var info = computeShow();
    var leaving = doAnim ? beforeVisible.filter(function (c) { return !c._show; }) : [];

    function commit() {
      setClasses();
      updateMore(info);
      updateMineEmpty();
      if (doAnim) { flipMoves(first, fromAddH, grow); animateGridHeight(fromH); }
      if (pinY !== null) holdScroll(pinY); // grow : verrouille la position de scroll
      // Vue liste : recopie visibilité (filtre/recherche/pagination) + état carte→ligne.
      if (window.LBAListView) LBAListView.sync();
    }

    if (doAnim && leaving.length) {
      // Sortie : déplacement latéral inverse + fade, puis retrait effectif.
      leaving.forEach(function (c, i) {
        var dir = (i % 2 === 0) ? -1 : 1;
        c.style.transition = 'transform .2s ease, opacity .2s ease';
        c.style.transform = 'translateX(' + (24 * dir) + 'px) scale(.97)';
        c.style.opacity = '0';
      });
      setTimeout(function () {
        leaving.forEach(function (c) { c.style.transition = ''; c.style.transform = ''; c.style.opacity = ''; });
        commit();
      }, 210);
    } else {
      commit();
    }
  }

  function selectChip(slug) {
    cat = slug;
    updateShelfVisibility(); // E4) étagère decks visible uniquement sur « Toutes »
    setHeroTitle(titleForMode(slug), true); // D) titre animé selon le mode (connecté)
    // A4/A5) Recalcule l'ensemble des 6 ids en entrant dans un mode spécial.
    specialIds = isSpecial(slug) ? computeSpecialIds(slug) : null;
    visibleLimit = initialLimit();
    markActiveChip(slug);
    apply(true);
  }

  // Marque la puce active (extrait de selectChip : re-rendre les puces après une
  // recherche perd la classe .on, il faut la reposer sans relancer un apply()).
  function markActiveChip(slug) {
    document.querySelectorAll('.chip-f').forEach(function (x) {
      if (!x.classList.contains('chip-more-toggle')) x.classList.remove('on');
    });
    var active = document.querySelector('.chip-f[data-cat="' + slug + '"]');
    if (active) {
      active.classList.add('on');
      if (active.closest('#chips-secondary')) {
        var sec = document.getElementById('chips-secondary');
        var tgl = document.querySelector('.chip-more-toggle');
        if (sec) { setSecOpen(sec, true); secondaryOpen = true; if (tgl) { tgl.textContent = '−'; tgl.classList.add('on'); } }
      }
    }
  }

  // Ouverture/fermeture fluide de la 2e ligne de catégories : on anime la
  // max-height depuis la hauteur RÉELLE du contenu (scrollHeight) et non depuis
  // une valeur fixe — sinon la fin du repli se fait d'un coup (effet saccadé).
  function setSecOpen(sec, open) {
    if (open) {
      sec.classList.add('open');
      sec.style.maxHeight = sec.scrollHeight + 'px';
    } else {
      // Fige la hauteur courante, force un reflow, puis anime vers 0.
      sec.style.maxHeight = sec.scrollHeight + 'px';
      void sec.offsetHeight;
      sec.classList.remove('open');
      sec.style.maxHeight = '0px';
    }
  }

  function scrollToGrid() {
    var main = document.getElementById('alertes');
    if (!main) return;
    var top = main.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.4) main.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // V3) Retour depuis le lien email de confirmation (?task-confirmed=<id>, posé par
  // task-confirmed.js) : ouvre la carte sur son verso, l'amène à l'écran et rejoue la
  // MÊME pulse que le bouton in-app. L'URL est nettoyée aussitôt (pas de ré-animation
  // au rechargement ni au partage du lien) — même geste que showFarewellIfNeeded()
  // dans session.js.
  function applyTaskConfirmed() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    var id = params.get('task-confirmed');
    if (!id || !/^\d+$/.test(id)) return;
    params.delete('task-confirmed'); // les autres paramètres (?q=, ?cat=) sont préservés
    var qs = params.toString();
    try {
      history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
    } catch (e) { /* non bloquant */ }
    // Absent si la session a expiré entre-temps (kiosque rendu en anonyme) : on ne
    // fait rien, la confirmation a de toute façon déjà eu lieu côté serveur.
    var item = document.querySelector('.task-item[data-task-id="' + id + '"]');
    if (!item) return;
    var card = item.closest('.card'); if (!card) return;
    card.classList.remove('face-share', 'face-deck');
    card.classList.add('flipped');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    markTaskDone(item);
  }

  // Lot 5) Applique les paramètres d'URL au chargement de la home : la recherche des
  // autres pages redirige vers /?q=<terme>, et le menu vers /?mode=<mode>.
  function applyUrlParams() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    var q = params.get('q');
    var mode = params.get('mode');
    var did = false;
    if (q && qInput) {
      qInput.value = q;
      var clr = document.querySelector('.search .search-clear');
      if (clr) clr.hidden = !q.length;
      did = true;
      renderChips(currentMode); // ?q= depuis une autre page : puces limitées aux résultats
      markActiveChip(cat);
    }
    var catParam = params.get('cat'); // A1) filtre catégorie depuis le menu d'une autre page
    if (mode === 'nouveautes' || mode === 'selection' || mode === 'mine') {
      selectChip(mode); // applique déjà le filtre (avec la recherche courante)
    } else if (catParam) {
      selectChip(catParam);
    } else if (did) {
      apply(true);
    }
  }

  function setupKiosk(mode) {
    grid = document.getElementById('grid');
    moreBtn = document.getElementById('moreBtn');
    qInput = document.getElementById('q');
    if (!grid || !moreBtn || !qInput) return;
    cards = Array.prototype.slice.call(grid.querySelectorAll('.card[data-cats]'));
    addCard = grid.querySelector('.card.add:not(.reco-hidden)'); // Proposer masquée en mode connecté
    visibleLimit = initialLimit(); // 6 (anon) ou 8 (connecté, + reco épinglée)
    renderChips(mode);

    var meb = document.getElementById('mine-empty-btn');
    if (meb) meb.addEventListener('click', function () { if (qInput) qInput.value = ''; selectChip('all'); });

    // Point 3 : header identique en tout contexte → si le panneau compte est ouvert,
    // toute interaction avec la recherche/les catégories du header revient à la grille.
    function backToGridIfAccount() {
      var panel = document.getElementById('account-panel');
      if (panel && !panel.hidden && window.LBAAccount && LBAAccount.close) LBAAccount.close();
    }

    // B5) Croix d'effacement : visible seulement quand le champ n'est pas vide.
    var clearBtn = document.querySelector('.search .search-clear');
    function syncClear() { if (clearBtn) clearBtn.hidden = !(qInput.value && qInput.value.length); }
    syncClear();
    if (clearBtn) clearBtn.addEventListener('click', function () {
      qInput.value = '';
      syncClear();
      apply(true);      // affiche tout
      qInput.focus();   // garde le focus dans le champ
    });

    var searchTimer = null;
    // La recherche porte sur TOUT le kiosque : une nouvelle saisie non vide remet le
    // filtre sur « Toutes » (selectChip applique déjà). Sélectionner une catégorie
    // ENSUITE affine les résultats (la requête reste dans le champ). Champ vidé →
    // on ne touche pas à la catégorie courante.
    function runSearch() {
      var want = normQ(qInput.value) ? 'all' : cat; // nouvelle recherche → retour à « Toutes »
      renderChips(mode);                            // puces limitées aux catégories des résultats
      if (cat !== want) selectChip(want);           // applique déjà (et remarque la puce)
      else { markActiveChip(cat); apply(true); }
    }
    qInput.addEventListener('input', function () {
      backToGridIfAccount();
      syncClear();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 120);
    });
    // Point 6 : bouton de recherche (déclencheur explicite, la recherche reste
    // instantanée à la frappe). Applique immédiatement le filtre courant.
    var searchGo = document.querySelector('.search .search-go');
    if (searchGo) searchGo.addEventListener('click', function () {
      clearTimeout(searchTimer);
      runSearch();
      qInput.focus();
    });

    function onChipClick(e) {
      backToGridIfAccount();
      var toggle = e.target.closest('.chip-more-toggle');
      if (toggle) {
        var sec = document.getElementById('chips-secondary');
        if (sec) { secondaryOpen = !secondaryOpen; setSecOpen(sec, secondaryOpen); toggle.textContent = secondaryOpen ? '−' : '+'; toggle.classList.toggle('on', secondaryOpen); }
        return;
      }
      var b = e.target.closest('.chip-f');
      if (!b || b.classList.contains('chip-more-toggle')) return;
      selectChip(b.dataset.cat);
    }
    document.getElementById('chips').addEventListener('click', onChipClick);
    var secWrap = document.getElementById('chips-secondary-wrap');
    if (secWrap) secWrap.addEventListener('click', onChipClick);

    moreBtn.addEventListener('click', function () { visibleLimit += STEP; apply(true, null, true); });

    apply(false); // initial : pagination sans animation
    markLikes();  // A1) marque les cœurs déjà aimés (localStorage)
  }

  // Tags du verso cliquables → re-flip recto + filtre la catégorie.
  document.addEventListener('click', function (e) {
    var tag = e.target.closest('.back-tag');
    if (!tag) return;
    e.preventDefault(); e.stopPropagation();
    var card = tag.closest('.card'); if (card) card.classList.remove('flipped');
    selectChip(tag.getAttribute('data-cat'));
    scrollToGrid();
  });

  // (j) La limite initiale « Toutes » connecté diffère entre liste (16) et cartes (8) :
  // au changement de vue, on recalcule la pagination (les deux vues partagent le même
  // état ; une seule est visible à la fois, donc aucun impact visuel sur l'autre).
  document.addEventListener('lba-view-change', function () {
    if (!grid || !qInput) return;
    visibleLimit = initialLimit();
    apply(false);
  });

  // Lien « Mes alertes » : connecté → filtre sur place ; anonyme → /connexion.
  function bindMineLinks() {
    document.querySelectorAll('.mine-link').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (currentMode === 'connected') {
          e.preventDefault();
          // C) Si le panneau compte est ouvert, on le ferme d'abord, puis on
          // applique le comportement normal (filtre « mine » + scroll).
          if (window.LBAAccount && window.LBAAccount.close) window.LBAAccount.close();
          selectChip('mine');
          scrollToGrid();
        }
      });
    });
  }

  /* ---------------- Bloc stats marketing (A) ---------------- */
  function fmtFR(n) { return Number(n).toLocaleString('fr-FR'); } // espace fine insécable

  // Compte chaque grand chiffre de 0 à sa valeur (ease-out ~1,2s) ; le « 0 » ne
  // compte pas mais fait un pop quand les autres finissent. Une seule fois.
  function animateCounts() {
    var tile = document.getElementById('stats-tile');
    if (!tile) return;
    var counters = Array.prototype.slice.call(tile.querySelectorAll('.stat-count'));
    var zero = tile.querySelector('.stat-spam .zero');
    if (REDUCE) {
      counters.forEach(function (el) { el.textContent = fmtFR(el.dataset.target || 0); });
      return; // pas de comptage ni de pop
    }
    var DUR = 1200, start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / DUR);
      var e = 1 - Math.pow(1 - t, 3); // ease-out cubic (décélère en approchant)
      counters.forEach(function (el) {
        el.textContent = fmtFR(Math.round((Number(el.dataset.target) || 0) * e));
      });
      if (t < 1) requestAnimationFrame(frame);
      else {
        counters.forEach(function (el) { el.textContent = fmtFR(el.dataset.target || 0); });
        if (zero) zero.classList.add('pop'); // petit pop final du « 0 »
      }
    }
    requestAnimationFrame(frame);
  }

  function setupStatsCounter() {
    var tile = document.getElementById('stats-tile');
    if (!tile) return;
    if (!('IntersectionObserver' in window)) { animateCounts(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { io.disconnect(); animateCounts(); } });
    }, { threshold: 0.35 });
    io.observe(tile);
  }

  async function loadStats() {
    var lines = document.getElementById('stats-lines');
    if (!lines) return;
    try {
      var r = await fetch('/api/stats', { headers: { Accept: 'application/json' } });
      if (!r.ok) return;
      var d = await r.json();
      var checks = Number(d.checks_this_month || 0);
      var alerts = Number(d.alerts_this_month || 0);
      lines.innerHTML =
        '<div class="stat-big stat-count" data-target="' + checks + '">0</div>' +
        '<div class="stat-cap">vérifications effectuées</div>' +
        '<div class="stat-mid"><span class="stat-count" data-target="' + alerts + '">0</span> <span class="stat-cap-inline">alertes déclenchées</span></div>' +
        '<div class="stat-spam"><span class="zero">0</span> <span class="spam-cap">spam, comme promis</span></div>';
      // TODO : quand emails_this_month sera significatif, ajouter ici une ligne
      //        '<div class="stat-mid stat-count" data-target="..."> notifications envoyées</div>' (d.emails_this_month).
      setupStatsCounter();
    } catch (e) { /* silencieux */ }
  }

  /* ---------------- Historique connecté (verso du panneau compte) ---------------- */
  async function loadHistory(token) {
    var devs = document.getElementById('openalert');
    if (devs) devs.hidden = true;      // masque « // pour les développeurs » en connecté
    var tl = document.getElementById('history-timeline');
    var empty = document.getElementById('history-empty');
    if (!tl) return;
    try {
      var r = await fetch('/api/my-alerts/history?token=' + encodeURIComponent(token), { headers: { Accept: 'application/json' } });
      var d = r.ok ? await r.json() : { events: [] };
      var events = d.events || [];
      if (events.length === 0) { if (empty) empty.hidden = false; if (tl) tl.innerHTML = ''; }
      else { if (empty) empty.hidden = true; if (window.LBATimeline) LBATimeline.render(tl, events); }
    } catch (e) {
      if (empty) empty.hidden = false;
    }
  }

  /* ---------------- Chargement de l'accueil ---------------- */
  function removeSkeletons(g) {
    g.querySelectorAll('.card.skeleton').forEach(function (n) { n.remove(); });
  }
  function showGridError(g, extras) {
    removeSkeletons(g);
    var el = document.createElement('div');
    el.className = 'grid-error';
    el.textContent = 'Impossible de charger les alertes, réessayez.';
    if (extras) extras.insertAdjacentElement('beforebegin', el);
    else g.appendChild(el);
  }

  async function loadHome() {
    var g = document.getElementById('grid');
    if (!g) return;
    var extras = document.getElementById('static-extras');
    g.classList.add('grid-loading'); // I) halo de chargement (retiré au rendu)

    // I) Perf : les 3 requêtes initiales (catégories, sources, /my-alerts) ne dépendent
    // pas les unes des autres → on les lance EN PARALLÈLE au lieu de les enchaîner.
    var token = LBASession.get();
    var catP = LBACat.load();
    var srcP = fetch('/api/sources', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
    var alertP = token ? LBASession.fetchAlerts(token).catch(function () { return null; }) : Promise.resolve(null);

    await catP; // labels + recherche par catégorie (requis avant le rendu)

    var sources;
    try {
      sources = await srcP;
      if (!Array.isArray(sources)) throw new Error('format');
    } catch (e) {
      g.classList.remove('grid-loading');
      document.body.classList.remove('loading'); // erreur : le reste de la page reste utilisable
      showGridError(g, extras);
      updateKPI(null);
      return;
    }

    // Session : mode connecté si token valide.
    var mode = 'anon', subMap = {}, mineMap = {}, email = null, accountViewMode = null;
    if (token) {
      try {
        var s = await alertP;
        if (s && s.status === 401) LBASession.clear();
        else if (s && s.ok && s.data) {
          mode = 'connected';
          email = s.data.email;
          (s.data.sources || []).forEach(function (x) { subMap[x.id] = x.subscribed; mineMap[x.id] = x; });
          profile.country = s.data.country || null;
          profile.departement = s.data.departement || null;
          profile.region = s.data.region || null;
          profile.ville = s.data.ville || null;
          profile.interests = s.data.interests || [];
          accountDisplayName = s.data.display_name || null;
          accountViewMode = s.data.view_mode || 'cards'; // préférence de compte (sync multi-appareils)
          // Phase 3 : skin dashboard equipe (prive) -> classe sur la grille, cascade
          // sur toutes les cartes source. Token CSS placeholder (asset_ref) ou null.
          if (s.data.dashboard_skin) g.classList.add(s.data.dashboard_skin);
        }
      } catch (e) { /* réseau : on reste anonyme */ }
    }
    currentMode = mode;
    // Valeurs de pré-remplissage des contrôles paramétrés (par clé de schéma : pays /
    // region / departement / ville). paramControl ne pré-sélectionne QUE si la valeur est
    // une valeur valide du schéma → région/pays/ville sans source ne remplissent rien.
    window.LBADefaults = {
      pays: profile.country || null,
      region: profile.region || null,
      departement: profile.departement || null,
      ville: profile.ville || null,
    };

    // D) Ordre personnalisé (connecté) : les sources matchant département/intérêts
    // remontent, tri secondaire STABLE sur l'ordre serveur (display_order). Si aucun
    // champ n'est renseigné, l'ordre reste STRICTEMENT celui du serveur.
    if (mode === 'connected' && hasPersonalization()) {
      sources = sources
        .map(function (s, i) {
          var score = (sourceMatchesDept(s) ? 2 : 0) + (sourceMatchesInterest(s) ? 1 : 0);
          return { s: s, i: i, score: score };
        })
        .sort(function (a, b) { return b.score - a.score || a.i - b.i; })
        .map(function (x) { return x.s; });
    }

    sourcesData = sources; // conservé pour recalculer une reco à l'adoption

    var html = sources.map(function (sc) {
      if (mode === 'connected') {
        sc.subscribed = !!subMap[sc.id];
        // Source paramétrée : instances suivies + état (le pire) depuis /my-alerts.
        var mine = mineMap[sc.id];
        if (mine && Array.isArray(sc.params_schema) && sc.params_schema.length) {
          sc.instances = mine.instances || [];
          if (sc.instances.length) { sc.state = mine.state; sc.muted = mine.muted; }
        }
        // V3 : tâches à échéance (privées, issues de /my-alerts uniquement).
        if (mine && sc.type === 'user-task') {
          sc.tasks = mine.tasks || [];
          sc.muted = mine.muted === true; // pause globale des relances (recto)
        }
      }
      return LBACards.cardHTML(sc, mode);
    }).join('');

    removeSkeletons(g);
    g.classList.remove('grid-loading'); // I) fin du chargement
    document.body.classList.remove('loading'); // révèle carte « Proposer » + OpenAlert
    if (extras) extras.insertAdjacentHTML('beforebegin', html);
    // Mémorise l'ordre source de chaque carte (pour restaurer sa position après reco).
    g.querySelectorAll('.card[data-cats]').forEach(function (c, i) { c.dataset.order = i; });

    // B) Pré-remplissage profil des combobox dynamic-enum : la ville du profil amorce la
    // RECHERCHE (propositions affichées), sans jamais pré-sélectionner d'entité. Déclenché via
    // un 'input' synthétique → la délégation debouncée lance le lookup (aucun appel inter-scope).
    g.querySelectorAll('.dyn-search[data-dyn-prefill]').forEach(function (inp) {
      inp.removeAttribute('data-dyn-prefill');
      if ((inp.value || '').trim().length >= 2) inp.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Connecté : Proposer masquée ; la source recommandée est HABILLÉE (jamais
    // dupliquée) et déplacée en dernière position — une source = une seule carte.
    if (mode === 'connected') {
      if (extras) extras.classList.add('reco-hidden');
      applyReco(pickReco(sources, subMap));
    }

    document.body.setAttribute('data-mode', mode);
    if (mode === 'connected') {
      // D) KPI personnalisé : actives parmi les abonnements.
      var mineActive = sources.filter(function (s) { return subMap[s.id] && s.state === 'active'; }).length;
      updateKPIMine(mineActive);
      // Salutation à la place du h1 : « Bonjour <prénom en accent> ».
      // D) Titre dynamique animé : initialise « Bonjour <prénom> » (sans animation
      // au chargement) ; les changements de filtre l'animent ensuite (selectChip).
      // Pseudo unifié : le display_name (auto-rempli) prime ; repli sur le prénom déduit de l'email.
      heroName = accountDisplayName || (LBASession.firstName ? LBASession.firstName(email) : null);
      setHeroTitle(titleForMode('all'), true); // animer dès le 1er affichage du titre
    } else {
      updateKPI(sources);
    }
    accountEmail = (mode === 'connected') ? email : null;
    if (mode === 'connected') syncFavorites(token); // D) remontée one-shot des favoris locaux
    LBASession.renderHeader(email);
    setupKiosk(mode);
    // Vue liste : projection des cartes, rendue APRÈS setupKiosk pour que sync() lise le
    // filtrage/pagination initial. adoptAccount fait primer la préférence de COMPTE
    // (connecté) sur l'affichage initial issu du localStorage (anonyme = localStorage seul).
    if (window.LBAListView) LBAListView.render(sourcesData, mode);
    if (window.LBAViewMode && accountViewMode) LBAViewMode.adoptAccount(accountViewMode);
    if (mode === 'connected') refreshMineDependent(); // initialise le compteur « Ma collection » (chip + panneau)
    applyUrlParams(); // Lot 5) ?q=<terme> et ?mode=nouveautes|selection|mine depuis les autres pages
    applyTaskConfirmed(); // V3) retour depuis le lien email de confirmation d'échéance
    bindMineLinks();
    bindBrandTop();
    if (mode === 'connected') bindAccount();
    // Point 4 : arrivée depuis une autre page via « Mon compte » (lien /#mon-compte) →
    // ouvre la carte « Mon compte » au chargement, puis nettoie le hash (pas de ré-ouverture
    // au rechargement ni au partage du lien). Ignoré si non connecté (le panneau n'existe pas).
    if (mode === 'connected' && location.hash === '#mon-compte') {
      openAccount();
      if (window.history && history.replaceState) history.replaceState(null, '', location.pathname + location.search);
    }

    loadStats();
    loadDecksIntoGrid(); // iteration 2 : tuiles-deck injectees dans la grille (plus d'etagere)
    if (mode === 'connected') loadHistory(token);
  }

  /* ---------------- Tuiles-deck dans la grille (iteration 2) ---------------- */
  // Les decks (collections officielles) deviennent des tuiles PLEINE TAILLE melangees
  // aux cartes d'alerte dans #grid, via LBADeckStack (pile de 3 vraies cartes + ruban).
  // Aperçu = 3 dernieres cartes (ids du champ preview) resolues depuis le catalogue deja
  // charge (sourcesData). Pas de regroupement ni de position privilegiee ; logique de
  // categorie/reco specifique aux decks = evolution future.
  async function loadDecksIntoGrid() {
    var g = document.getElementById('grid');
    if (!g || !window.LBADeckStack || !window.LBACards) return;
    var data;
    // Token (si connecté) : alimente `adopted` par deck -> la reco exclut les decks
    // deja adoptes. Anonyme : pas de token, adopted=false partout (sans effet reco).
    var deckTok = window.LBASession && LBASession.get ? LBASession.get() : null;
    var url = '/api/collections' + (deckTok ? ('?token=' + encodeURIComponent(deckTok)) : '');
    try {
      var r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) return;
      data = await r.json();
    } catch (e) { return; }
    var list = (data && data.collections) || [];
    if (!list.length) return;
    decksData = list; // conservé pour les modes spéciaux (Nouveautés / Populaires) et la reco
    var index = LBADeckStack.indexSources(sourcesData || []);
    var tiles = list.map(function (c) {
      var cards = LBADeckStack.resolveCards(c.preview || [], index);
      // Ruban meta : badge Top 20 (phase 2, auteur classe <= 20) puis compteur de likes.
      var meta = '';
      if (c.author_top20) meta += '<span class="deck-badge-top20">Top 20</span>';
      if (c.total_likes > 0) meta += (meta ? ' ' : '') + '<span class="ds-ribbon-likes">❤ ' + esc(LBACards.formatCount(c.total_likes)) + '</span>';
      var cats = Array.isArray(c.categories) ? c.categories : [];
      // href calcule AVANT le rendu : il alimente le verso « i » du deck (description +
      // categories + « Plus d'infos → » vers la page du deck), en plus de la navigation.
      var href = c.href || ('/collection/' + encodeURIComponent(c.id));
      var stack = LBADeckStack.html({
        name: c.name, tint: c.tint, emoji: c.emoji, count: c.card_count || 0,
        cards: cards, meta: meta, cats: cats, mode: 'anon',
        description: c.description, href: href
      });
      // Data-attributs IDENTIQUES aux cartes → matches()/catsOf()/modes spéciaux
      // fonctionnent sans logique parallèle. data-source-id = id du deck (distinct des
      // ids de sources) → computeSpecialIds peut inclure les decks. data-deck-id = id du
      // deck pour l'adoption (POST /api/collections/:id/adopt, officiel OU perso public).
      // data-href = navigation (/collection/:id ou /deck/:token selon le type).
      var searchTxt = normQ((c.name || '') + ' ' + cats.map(function (s) {
        return (window.LBACat && LBACat.label) ? LBACat.label(s) : s;
      }).join(' '));
      // La tuile est un <div> (PAS un <a>) : les vraies cartes contiennent des <button>
      // (like/partage/i), interdits dans un <a>. La navigation se fait au clic via data-href.
      // Phase 3 : skin de deck equipe (public) -> classe additionnelle sur la tuile.
      var skinCls = c.deck_skin ? ' ' + esc(c.deck_skin) : '';
      return '<div class="deck-card' + skinCls + '" data-deck-tile role="link" tabindex="0"' +
        ' data-cats="' + esc(cats.join(' ')) + '"' +
        ' data-source-id="' + esc(c.id) + '"' +
        ' data-deck-id="' + esc(c.id) + '"' +
        ' data-search="' + esc(searchTxt) + '"' +
        ' data-href="' + esc(href) + '">' + stack + '</div>';
    });
    // Insertion à intervalles réguliers parmi les cartes VISIBLES (hors pagination cachée).
    // EXCLUT les cartes epinglees en fin de grille (reco deplacee en dernier, filler) : sinon
    // ref = visible[...] peut TOMBER sur la carte reco et y coller une tuile juste avant elle
    // → tuile figee avant-derniere, independamment de la pagination (bug « deck montagne »).
    var visible = g.querySelectorAll('.card[data-cats]:not(.hidden-more):not(.card-reco):not(.card-filler)');
    var extras = document.getElementById('static-extras');
    // Debordement (plus de tuiles que de creneaux visibles) : on insere AVANT le bloc
    // hidden-more (fin du bloc visible), et NON avant Proposer (qui est apres tout le
    // bloc cache). Sinon la tuile resterait la toute derniere carte et « afficher plus »
    // ferait apparaitre les nouvelles cartes AVANT elle (bug d'ordre). Ainsi placee, le
    // demasquage ajoute bien les cartes APRES la tuile, a la vraie fin (avant Proposer).
    var firstHidden = g.querySelector('.card[data-cats].hidden-more');
    var step = Math.max(2, Math.floor(visible.length / (tiles.length + 1)));
    tiles.forEach(function (tileHTML, i) {
      var ref = visible[(i + 1) * step];
      if (ref) ref.insertAdjacentHTML('beforebegin', tileHTML);
      else if (firstHidden) firstHidden.insertAdjacentHTML('beforebegin', tileHTML);
      else if (extras) extras.insertAdjacentHTML('beforebegin', tileHTML);
      else g.insertAdjacentHTML('beforeend', tileHTML);
    });
    // Navigation de la tuile (div role=link) : clic n'importe où → page du deck.
    g.querySelectorAll('.deck-card[data-href]').forEach(function (t) {
      if (t.dataset.bound) return; t.dataset.bound = '1';
      t.addEventListener('click', function (e) {
        // Un clic sur un controle actif de la carte de devant (switch, cœur, partager,
        // retour, face de partage) NE navigue PAS : il laisse bulle jusqu'aux handlers
        // delegues (abonnement / favori / partage). Le reste de la tuile navigue.
        // .reco-label / .reco-x : l'etiquette « Recommandee » et sa croix (×) ne naviguent
        // pas — la croix doit ignorer la reco (handler delegue), pas ouvrir la page du deck.
        // .ds-i0 .flip-btn + .ds-i0 .card-back : le « i » retourne la tuile sur le verso deck,
        // et le verso (tags, « Plus d'infos », retour) gere ses propres clics — pas de nav tuile.
        if (e.target.closest('.ds-i0 .switch-row, .ds-i0 .card-like, .ds-i0 .card-share, .ds-i0 .flip-btn, .ds-i0 .flip-back, .ds-i0 .card-share-face, .ds-i0 .card-back, .reco-label')) return;
        window.location.href = t.getAttribute('data-href');
      });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target === t) { window.location.href = t.getAttribute('data-href'); }
      });
    });
    // Les tuiles-deck rejoignent la collection `cards` du kiosque → elles suivent EXACTEMENT
    // le meme pipeline de filtrage/animation que les cartes (apparition/disparition, FLIP) au
    // changement de categorie. matches() les masque hors « Toutes » (pas de data-cats), et
    // computeShow() les epingle (isReco) pour qu'elles ne comptent pas dans la pagination.
    cards = Array.prototype.slice.call(g.querySelectorAll('.card[data-cats], .deck-card[data-deck-tile]'));
    bindDeckSwitches();
    // Ordre unifie cartes+decks : les cartes portent deja un data-order (entier, pose au
    // rendu). On donne aux tuiles-deck un ordre FRACTIONNAIRE (ordre de la carte precedente
    // + 0.5) pour qu'elles s'inserent a leur place naturelle via placeByOrder si une reco-deck
    // est ensuite ignoree/adoptee. On NE reecrit PAS l'ordre des cartes (preserve le retour a
    // la place d'origine de la carte-reco source deja deplacee en fin de grille).
    var lastOrder = -1;
    g.querySelectorAll('.card[data-cats], .deck-card[data-deck-tile]').forEach(function (c) {
      if (c.classList.contains('deck-card')) { c.dataset.order = String(lastOrder + 0.5); }
      else { lastOrder = +c.dataset.order || 0; }
    });
    // Les decks arrivent en async : si on est deja dans un mode special (arrivee via
    // ?mode=nouveautes|selection), on recalcule l'ensemble pour les y inclure.
    if (isSpecial(cat)) specialIds = computeSpecialIds(cat);
    apply(false); // synchronise l'etat filtre (tuiles masquees si on n'est pas sur « Toutes »)

    // (b) 2e passage reco : au 1er rendu, pickReco n'avait que les sources (decksData vide).
    // Maintenant que les decks sont charges, un deck peut surclasser la source recommandee.
    // On reconcilie l'UNIQUE reco du kiosque, sans bloquer/retarder l'affichage initial.
    if (document.body.getAttribute('data-mode') === 'connected') reconcileReco();
  }

  // Recalcule l'unique reco (sources + decks fusionnes) et remplace celle affichee si un
  // meilleur candidat existe. Idempotent : ne fait rien si la reco courante est deja la meilleure.
  function reconcileReco() {
    if (!grid) return;
    var best = pickReco(sourcesData, currentSubMap());
    var current = grid.querySelector('.card-reco');
    var curId = current ? current.getAttribute('data-source-id') : null;
    if (!best || best.id === curId) return; // deja optimal (ou plus aucun candidat)
    apply(true, function () {
      if (current) { current.classList.remove('card-reco'); stripRecoLabel(current); placeByOrder(current); }
      var newCard = cardById(best.id);
      var extras = document.getElementById('static-extras');
      if (newCard) { dressReco(newCard); grid.insertBefore(newCard, extras || null); }
      refreshCards();
    });
  }

  // Conserve le nom historique (selectChip l'appelle) : la visibilite des tuiles-deck est
  // desormais geree par le pipeline `apply`/matches (comme les cartes), plus par du display.
  function updateShelfVisibility() {}

  // Le switch de la carte de DEVANT (.ds-i0) d'une tuile-deck est actif : il abonne /
  // desabonne l'utilisateur a TOUT le deck (POST/DELETE /api/collections/:slug/adopt),
  // au lieu d'etre un simple apercu inerte. Les autres cartes de la pile restent inertes.
  function bindDeckSwitches() {
    var g = document.getElementById('grid'); if (!g) return;
    g.querySelectorAll('.deck-card[data-deck-tile]').forEach(function (tile) {
      if (tile.dataset.switchBound) return; tile.dataset.switchBound = '1';
      var front = tile.querySelector('.ds-i0'); if (!front) return;
      var cb = front.querySelector('.switch-row input[type="checkbox"]'); if (!cb) return;
      cb.removeAttribute('disabled'); // un switch de param non-geo est disabled par defaut → on l'active ici
      var row = cb.closest('.switch-row');
      var label = row ? row.querySelector('.switch-label') : null;
      // Adoption par ID de collection (officiel OU deck perso public) : POST /api/collections/:id/adopt.
      var slug = tile.getAttribute('data-deck-id')
        || decodeURIComponent((tile.getAttribute('data-href') || '').replace('/collection/', ''));
      // Cœur : reflete l'etat « favori » du deck (localStorage) au montage.
      var like = front.querySelector('.like-btn');
      if (like && isDeckFav(slug)) setLikeUI(like, true);
      function paint(on) { if (label) { label.textContent = on ? 'Abonné' : 'Non abonné'; label.classList.toggle('on', on); } }
      cb.addEventListener('change', function (e) {
        e.stopPropagation();
        var token = LBASession.get();
        if (!token) { cb.checked = false; window.location.href = '/connexion'; return; }
        if (!slug) { cb.checked = false; return; }
        var want = cb.checked;
        cb.disabled = true; paint(want); // optimiste
        // Confettis IMMEDIATS a l'abonnement (comme l'optimisme du switch), sans attendre
        // la reponse reseau (sinon effet retarde).
        if (want && window.LBACards && LBACards.celebrateBurst) LBACards.celebrateBurst(cb.closest('.switch'));
        fetch('/api/collections/' + encodeURIComponent(slug) + '/adopt', {
          method: want ? 'POST' : 'DELETE',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ token: token })
        }).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
          .then(function () {
            // Tient decksData a jour (adopted) : la reco n'ira jamais reproposer un deck
            // qu'on vient d'adopter (et redevient candidat apres desabonnement).
            var d = (decksData || []).filter(function (x) { return x && x.id === slug; })[0];
            if (d) d.adopted = want;
            // Tuile-deck recommandee ADOPTEE : comme une carte source, l'etiquette part apres
            // la celebration et une nouvelle reco (source ou deck) est calculee (adoptReco).
            if (want && tile.classList.contains('card-reco')) setTimeout(function () { adoptReco(tile); }, 800);
          })
          .catch(function () { cb.checked = !want; paint(cb.checked); }) // rollback
          .finally(function () { cb.disabled = false; });
      });
    });
  }

  /* ====================================================================================
     ETAGERE CARROUSEL DECK — DESACTIVEE le 2026-07-25 (chantier deck-stack, iteration 2).
     Code conserve (commente, isole) pour reactivation eventuelle sans reecriture : rendu
     carrousel infini en tete de kiosque. Remplace par loadDecksIntoGrid() ci-dessus + le
     bloc HTML #collections-shelf commente dans index.html. A re-tester plus tard.
     ------------------------------------------------------------------------------------
  async function loadCollections() {
    var shelf = document.getElementById('collections-shelf');
    var row = document.getElementById('shelf-row');
    if (!shelf || !row) return;
    var data;
    try {
      var r = await fetch('/api/collections', { headers: { Accept: 'application/json' } });
      if (!r.ok) return;
      data = await r.json();
    } catch (e) { return; }
    var list = (data && data.collections) || [];
    if (!list.length) return;
    row.innerHTML = list.map(function (c) {
      // Visuel « pile de cartes + ruban » partagé (LBADeckStack) ; les ❤ vont dans le
      // sous-titre du ruban. Aperçu = 3 dernières cartes (champ preview de l'API).
      var meta = (c.total_likes > 0)
        ? '<span class="ds-ribbon-likes">❤ ' + esc(LBACards.formatCount(c.total_likes)) + '</span>' : '';
      var stack = window.LBADeckStack ? LBADeckStack.html({
        name: c.name, tint: c.tint, emoji: c.emoji, count: c.card_count || 0,
        preview: c.preview, size: 'shelf', meta: meta
      }) : '';
      return '<a class="pack" role="listitem" href="/collection/' + encodeURIComponent(c.id) + '">' +
        stack + '</a>';
    }).join('');
    shelf.hidden = false;
    updateShelfVisibility();   // E4 : respecte le filtre courant (cat)
    setupShelfAutoScroll(row); // E2 : défilement doux desktop
  }

  // E4) L'étagère n'apparaît que sur « Toutes » (transition fluide via .shelf-hidden).
  function updateShelfVisibility() {
    var shelf = document.getElementById('collections-shelf');
    if (!shelf) return;
    shelf.classList.toggle('shelf-hidden', cat !== 'all');
  }

  // B) Carrousel INFINI, PC ET mobile : défilement continu et lent, en boucle sans
  // couture. Le contenu est dupliqué une fois et scrollLeft est rebouclé modulo la
  // demi-largeur → aussi bien pour l'auto-défilement que pour la glisse tactile (drag
  // natif, plus de blocage en bout de liste, boucle dans les deux sens). Au survol PC,
  // on RALENTIT (au lieu de figer) pour garder l'effet carrousel tout en laissant le
  // deck survolé confortablement cliquable. reduced-motion : statique (glisse seule).
  function setupShelfAutoScroll(row) {
    if (REDUCE) return;
    if (row.dataset.autoscroll === '1') return; // déjà armé
    // La mesure de débordement peut être 0 tant que la mise en page n'est pas prête
    // (étagère fraîchement affichée) → on réessaie quelques frames avant d'abandonner.
    var tries = 0;
    (function arm() {
      if (row.scrollWidth <= row.clientWidth + 4) {
        if (tries++ < 30) requestAnimationFrame(arm); // pas encore débordé : réessai
        return;
      }
      start();
    })();

    function start() {
      row.dataset.autoscroll = '1';
      // Duplique le contenu une fois → boucle sans couture.
      Array.prototype.slice.call(row.children).forEach(function (el) {
        var clone = el.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true'); clone.tabIndex = -1;
        row.appendChild(clone);
      });
      row.style.scrollSnapType = 'none';
      var half = row.scrollWidth / 2;
      var factor = 1;   // 1 = normal ; ralenti au survol
      // BUG corrigé : incrémenter directement scrollLeft de 0,4 était perdu (le
      // navigateur arrondit scrollLeft, la sous-pixellisation ne s'accumulait jamais →
      // carrousel figé). On accumule dans un flottant `pos` et on l'assigne.
      var pos = row.scrollLeft || 0;
      var self = false; // true pendant notre écriture (pour ignorer notre propre 'scroll')
      function step() {
        pos += 0.5 * factor;
        if (pos >= half) pos -= half;
        else if (pos < 0) pos += half;
        self = true; row.scrollLeft = pos; self = false;
        requestAnimationFrame(step);
      }
      row.addEventListener('mouseenter', function () { factor = 0.12; });
      row.addEventListener('mouseleave', function () { factor = 1; });
      // Glisse tactile / molette : on resynchronise `pos` sur la position réelle
      // (rebouclage continu, infini dans les deux sens).
      row.addEventListener('scroll', function () {
        if (self) return;
        pos = row.scrollLeft;
        if (pos >= half) pos -= half; else if (pos < 0) pos += half;
      }, { passive: true });
      window.addEventListener('resize', function () { half = row.scrollWidth / 2; });
      requestAnimationFrame(step);
    }
  }
  ==================================================================================== */

  /* ---------------- D) Titre du dashboard animé (connecté uniquement) ---------------- */
  // Le H1 change selon le mode/filtre actif, avec un effet « lettres qui se
  // retournent comme des cartes » (flip 3D par caractère, décalage en vague).
  // Anonyme : le H1 de la home n'est jamais touché. reduced-motion : texte instantané.
  var heroName = null;
  function titleForMode(slug) {
    if (slug === 'nouveautes') return 'Les nouvelles';
    if (slug === 'selection') return 'Les plus populaires';
    if (slug === 'mine') return 'Ma collection';
    if (slug === 'all' || !slug) return heroName ? ('Bonjour ' + heroName) : 'Bonjour';
    return (window.LBACat && LBACat.label) ? LBACat.label(slug) : slug; // catégorie normale
  }
  // C) Bicoloration : 1er mot en --ink, le reste en violet (.hl). Partagée par le rendu
  // animé (par lettre) et le rendu instantané (reduced-motion / non animé).
  function bicolorHTML(text) {
    var i = String(text).indexOf(' ');
    if (i === -1) return esc(text);
    return esc(text.slice(0, i)) + ' <span class="hl">' + esc(text.slice(i + 1)) + '</span>';
  }
  function renderHeroLetters(el, text) {
    el.textContent = '';
    var frag = document.createDocumentFragment();
    var arr = Array.from(text);
    var firstSpace = arr.indexOf(' ');
    arr.forEach(function (ch, i) {
      var sp = document.createElement('span');
      sp.className = 'hero-letter' + (firstSpace !== -1 && i > firstSpace ? ' hl' : '');
      sp.textContent = ch === ' ' ? ' ' : ch;
      sp.style.animationDelay = (i * 28) + 'ms';
      frag.appendChild(sp);
    });
    el.appendChild(frag);
  }
  function setHeroTitle(text, animate) {
    if (currentMode !== 'connected') return; // dashboard connecté uniquement
    var h1 = document.querySelector('.hero h1');
    if (!h1 || h1.dataset.current === text) return;
    h1.dataset.current = text;
    if (!animate || REDUCE) { h1.innerHTML = bicolorHTML(text); return; }
    renderHeroLetters(h1, text); // la vague de flip rejoue à chaque rendu, bicolore
  }

  /* ---------------- Panneau « Mon compte » ---------------- */
  // En-tête du recto : prénom déduit (même logique que le hero) + email complet.
  function fillAccountHeader() {
    var nameEl = document.getElementById('acct-name');
    var emailEl = document.getElementById('acct-email');
    // Pseudo unifié : display_name d'abord, puis prénom déduit de l'email.
    var nm = accountDisplayName || ((LBASession.firstName && accountEmail) ? LBASession.firstName(accountEmail) : null);
    if (nameEl) nameEl.textContent = nm ? 'Bonjour ' + nm : 'Mon compte';
    if (emailEl) emailEl.textContent = accountEmail || '';
    renderAvatar(nm);
  }

  // Avatar à initiale : première lettre du pseudo (sinon de l'email), teinte violette
  // stable de la charte. Propre dans les deux thèmes (CSS .acct-avatar).
  function renderAvatar(nm) {
    var av = document.getElementById('acct-avatar');
    if (!av) return;
    var basis = nm || accountEmail || '';
    var ch = (basis.trim().charAt(0) || '?').toUpperCase();
    av.textContent = ch;
  }

  // Rafraîchit le pseudo affiché après un changement dans « Mon compte » (profile.js).
  function refreshName(name) {
    accountDisplayName = name || accountDisplayName;
    heroName = accountDisplayName || (LBASession.firstName ? LBASession.firstName(accountEmail) : null);
    if (currentMode === 'connected') setHeroTitle(titleForMode(cat || 'all'), false);
    fillAccountHeader();
  }

  // Échange animé (fondu) entre deux blocs plein-largeur.
  function swap(hideEl, showEl) {
    if (REDUCE) { hideEl.hidden = true; showEl.hidden = false; return; }
    hideEl.style.transition = 'opacity .18s ease';
    hideEl.style.opacity = '0';
    setTimeout(function () {
      hideEl.hidden = true; hideEl.style.opacity = ''; hideEl.style.transition = '';
      showEl.hidden = false;
      showEl.style.transition = 'none'; showEl.style.opacity = '0'; showEl.style.transform = 'translateY(8px)';
      showEl.getBoundingClientRect();
      requestAnimationFrame(function () {
        showEl.style.transition = 'opacity .22s ease, transform .22s ease';
        showEl.style.opacity = '1'; showEl.style.transform = '';
      });
      var clr = function () {
        showEl.style.transition = ''; showEl.style.transform = ''; showEl.style.opacity = '';
        showEl.removeEventListener('transitionend', clr);
      };
      showEl.addEventListener('transitionend', clr);
    }, 180);
  }

  // B2) Le label fixe du panneau suit la face affichée (recto / historique / soutenir).
  function setAccountLabel(text) {
    var lbl = document.getElementById('acct-panel-label');
    if (lbl) lbl.textContent = text || 'Mon compte';
  }
  // Point 6/7 : remonte la page en haut du panneau (respecte reduced-motion).
  function scrollAcctTop() {
    window.scrollTo({ top: 0, behavior: REDUCE ? 'auto' : 'smooth' });
  }

  function openAccount() {
    var main = document.getElementById('alertes');
    var panel = document.getElementById('account-panel');
    if (!main || !panel || currentMode !== 'connected' || !panel.hidden) return;
    fillAccountHeader();
    var card = document.getElementById('acct-card');
    if (card) card.classList.remove('flipped', 'acct-face-support'); // toujours ouvrir sur le recto
    setAccountLabel('Mon compte');
    document.body.classList.add('account-open');
    swap(main, panel);
  }

  function closeAccount() {
    var main = document.getElementById('alertes');
    var panel = document.getElementById('account-panel');
    if (!main || !panel || panel.hidden) return;
    var card = document.getElementById('acct-card');
    if (card) card.classList.remove('flipped', 'acct-face-support');
    setAccountLabel('Mon compte');
    document.body.classList.remove('account-open');
    swap(panel, main);
  }

  function bindAccount() {
    var card = document.getElementById('acct-card');
    var toHist = document.getElementById('acct-to-history');
    // Point 6 : « Mon historique » → flip + remontée en haut de page (voir le début).
    if (toHist && card) toHist.addEventListener('click', function () {
      card.classList.remove('acct-face-support');
      card.classList.add('flipped');
      setAccountLabel('Mon historique');
      scrollAcctTop();
    });
    // Point 7 : « Toutes les façons d'aider » → 3e face « Nous soutenir » (flip).
    var toSupport = document.getElementById('acct-to-support');
    if (toSupport && card) toSupport.addEventListener('click', function () {
      card.classList.add('flipped', 'acct-face-support');
      setAccountLabel('Nous soutenir');
      scrollAcctTop();
    });
    // Le ↩ de chaque face est géré par le handler global .flip-back (retour au recto) :
    // on remet le label sur « Mon compte » et on retire la 3e face (après la rotation,
    // pour éviter tout flicker de la face historique).
    if (card) card.querySelectorAll('.flip-back').forEach(function (fb) {
      fb.addEventListener('click', function () {
        setAccountLabel('Mon compte');
        setTimeout(function () { card.classList.remove('acct-face-support'); }, REDUCE ? 0 : 520);
      });
    });
    var close = document.getElementById('acct-close');
    if (close) close.addEventListener('click', closeAccount);
    var backGrid = document.getElementById('acct-back-grid');
    if (backGrid) backGrid.addEventListener('click', closeAccount);
    var lo = document.getElementById('acct-logout');
    if (lo) lo.addEventListener('click', function () { LBASession.logout(); });
    // E) Suppression de compte, désormais dans le panneau (recto).
    var del = document.getElementById('acct-delete-link');
    if (del) del.addEventListener('click', function () { LBASession.deleteAccount(); });
    // G) Charge « Mes sources » (espace développeur embryonnaire).
    loadMySources();
  }

  /* ---------------- G) Mes sources (recto du panneau compte) ---------------- */
  async function loadMySources() {
    var section = document.getElementById('acct-sources');
    var list = document.getElementById('acct-src-list');
    if (!section || !list) return;
    var token = LBASession.get();
    if (!token) return;
    var sources = [];
    try {
      var r = await fetch('/api/my-alerts/sources?token=' + encodeURIComponent(token), { headers: { Accept: 'application/json' } });
      if (r.ok) { var d = await r.json(); sources = (d && d.sources) || []; }
    } catch (e) { /* réseau : on n'affiche rien */ }

    // « Proposer une source » est désormais une entrée permanente du panneau (B) ;
    // la rubrique « Mes sources » n'apparaît que si l'utilisateur a soumis une source.
    if (!sources.length) {
      section.hidden = true;
      return;
    }

    list.innerHTML = sources.map(function (s) {
      var published = !!s.enabled;
      var statut = published
        ? '<span class="acct-src-status ok">Publiée ✓</span>'
        : '<span class="acct-src-status pending">En examen</span>';
      var badgeIc = LBACards && LBACards.badgeFor ? LBACards.badgeFor(s.badge) : '';
      var inner =
        '<span class="acct-src-name">' + esc(s.name || s.id) + '</span>' +
        badgeIc + statut;
      if (published) {
        var sel = encodeURIComponent(s.id);
        return '<li class="acct-src-item"><a class="acct-src-link" href="/source/' + sel + '/statut">' + inner + '</a></li>';
      }
      return '<li class="acct-src-item">' + inner + '</li>';
    }).join('');
    section.hidden = false;
  }

  // C) Depuis le header : « Mon compte » bascule (ouvre / ferme) le panneau.
  function toggleAccount() {
    var panel = document.getElementById('account-panel');
    if (panel && !panel.hidden) closeAccount();
    else openAccount();
  }

  window.LBAAccount = { open: openAccount, close: closeAccount, toggle: toggleAccount, refreshName: refreshName };

  // Volet J : sur la home, le logo remonte en haut sans recharger + reset des filtres.
  function bindBrandTop() {
    var brand = document.querySelector('.brand');
    if (!brand) return;
    brand.addEventListener('click', function (e) {
      e.preventDefault();
      closeAccount(); // si le panneau compte est ouvert, on revient à la grille
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (qInput) qInput.value = '';
      selectChip('all');
    });
  }

  document.addEventListener('DOMContentLoaded', loadHome);
})();
