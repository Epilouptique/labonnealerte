/* profile-decks.js — page profil publique /u/:pseudo : rend les decks publics du membre en
 * VRAIES tuiles-deck (LBADeckStack), STRICTEMENT identiques à celles du kiosque (même
 * composant, mêmes classes, même style). Aucune variante « carte simple ».
 *
 * Source des données : GET /api/forum/u/<pseudo>/decks (métadonnées + ids d'aperçu) résolus
 * contre le catalogue public GET /api/sources (mêmes objets source que le kiosque). Le rendu
 * réutilise LBADeckStack.html (cards.js + deck-motifs.js chargés en amont par forumShell).
 *
 * Grille RÉUTILISÉE de /favoris : `<div class="grid" id="fav-grid">` + tuiles `.deck-card`
 * (mêmes classes, même taille, même responsive). Spécifique au profil : une seule ligne
 * affichée par défaut (4 decks max), le reste en `.hidden-more` révélé par le bouton
 * `.more-btn` (pattern du kiosque). Navigation au clic sur la tuile (data-href) + clavier ;
 * retournement « i » géré localement (site.js n'est pas chargé ici). Les liens du verso
 * (forum, auteur) sont de vraies ancres → laissées au comportement natif.
 */
(function () {
  'use strict';

  var VISIBLE = 4; // tuiles affichées avant « Plus de decks »

  function esc(s) {
    return (window.LBACards && LBACards.esc)
      ? LBACards.esc(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
  }

  // Une tuile-deck = strictement le markup du kiosque (loadDecksIntoGrid) : <div.deck-card>
  // contenant LBADeckStack.html(...). Pas de badge Top20 (contexte profil). data-href porte
  // la navigation ; role/tabindex pour l'accessibilité clavier.
  function tileHTML(c, index) {
    var cards = LBADeckStack.resolveCards(c.preview || [], index);
    var meta = (c.total_likes > 0)
      ? '<span class="ds-ribbon-likes">❤ ' + esc(LBACards.formatCount(c.total_likes)) + '</span>' : '';
    var cats = Array.isArray(c.categories) ? c.categories : [];
    var href = c.href || ('/deck/' + encodeURIComponent(c.share_token || ''));
    var stack = LBADeckStack.html({
      name: c.name, tint: c.tint, emoji: c.emoji, count: c.card_count || 0,
      cards: cards, meta: meta, cats: cats, mode: 'anon',
      description: c.description, href: href, author: c.author,
      author_pseudo: c.author_pseudo, forum_slug: c.forum_slug
    });
    var skin = c.deck_skin ? ' ' + esc(c.deck_skin) : '';
    // Markup identique aux tuiles-deck de /favoris et du kiosque (.deck-card + LBADeckStack).
    return '<div class="deck-card' + skin + '" data-deck-tile role="link" tabindex="0"' +
      ' data-href="' + esc(href) + '">' + stack + '</div>';
  }

  // Navigation + retournement « i », délégués sur la grille (site.js absent sur cette page).
  function bindNav(grid) {
    grid.addEventListener('click', function (e) {
      if (e.target.closest('a')) return; // liens du verso : comportement natif
      var card = e.target.closest('.deck-card[data-deck-tile]');
      if (!card) return;
      if (e.target.closest('.flip-btn')) {
        var cf = e.target.closest('.card'); if (cf) cf.classList.add('flipped'); return;
      }
      if (e.target.closest('.flip-back')) {
        var cb = e.target.closest('.card'); if (cb) cb.classList.remove('flipped'); return;
      }
      if (e.target.closest('button, input, label')) return; // autres contrôles (like/partage) : inertes
      var href = card.getAttribute('data-href');
      if (href) window.location.href = href;
    });
    grid.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest('.deck-card[data-deck-tile]');
      if (!card || e.target !== card) return;
      e.preventDefault();
      var href = card.getAttribute('data-href');
      if (href) window.location.href = href;
    });
  }

  async function init() {
    var root = document.getElementById('profile-decks');
    if (!root || !window.LBADeckStack || !window.LBACards) return;
    var pseudo = root.getAttribute('data-pseudo');
    if (!pseudo) return;
    var grid = root.querySelector('.grid');
    var moreBtn = root.querySelector('.more-btn');

    var sources, decks;
    try {
      var r = await Promise.all([
        fetch('/api/sources', { headers: { Accept: 'application/json' } })
          .then(function (x) { return x.ok ? x.json() : []; }),
        fetch('/api/forum/u/' + encodeURIComponent(pseudo) + '/decks', { headers: { Accept: 'application/json' } })
          .then(function (x) { return x.ok ? x.json() : { decks: [] }; })
      ]);
      sources = r[0];
      decks = (r[1] && r[1].decks) || [];
    } catch (e) { return; }

    if (!decks.length) return; // section reste masquée ; l'état « aucun contenu » (serveur) demeure

    var index = LBADeckStack.indexSources(sources || []);
    grid.innerHTML = decks.map(function (c) { return tileHTML(c, index); }).join('');
    root.hidden = false;
    var empty = document.getElementById('profile-empty');
    if (empty) empty.hidden = true; // des decks existent → plus « aucun contenu public »

    // Une seule ligne par défaut : les tuiles au-delà de la 4e passent en .hidden-more
    // (classe de pagination existante : .deck-card.hidden-more { display:none }). Le bouton
    // .more-btn (masqué via style inline, pattern du kiosque) révèle le reste.
    var tiles = grid.querySelectorAll('.deck-card');
    if (tiles.length > VISIBLE && moreBtn) {
      for (var i = VISIBLE; i < tiles.length; i++) tiles[i].classList.add('hidden-more');
      moreBtn.style.display = '';
      moreBtn.addEventListener('click', function () {
        grid.querySelectorAll('.deck-card.hidden-more').forEach(function (t) {
          t.classList.remove('hidden-more');
        });
        moreBtn.style.display = 'none';
      });
    }
    bindNav(grid);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
