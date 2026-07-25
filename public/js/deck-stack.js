/* deck-stack.js — LBADeckStack : rendu partage du visuel d'un deck en « pile de
 * cartes + ruban », commun a TOUS les emplacements (etagere home, tuiles Mes decks,
 * apercu du formulaire, en-tetes de detail). Un seul composant, un seul mecanisme
 * de feuilletage (survol desktop + tap mobile), pour ne pas diverger d'une page a
 * l'autre.
 *
 * Structure produite (a placer DANS le conteneur cliquable existant .pack/.deck-tile
 * ou un wrapper) :
 *   .deck-stack.ds-<size>.tint-N
 *     .ds-pile                      → jusqu'a 3 mini-rectos 5/7 en eventail
 *       .ds-card.ds-i0 (devant) … .ds-i2 (derriere)
 *     .ds-ribbon                    → ruban teinte centre (nom + compteur), plis lateraux
 *
 * Feuilletage : survoler (desktop, via CSS) ou taper (mobile, via ce handler) une
 * carte de la pile qui n'est pas au premier plan la fait passer devant (.ds-lift).
 * Le clic sur une carte du fond NE navigue PAS (stopPropagation) ; le clic ailleurs
 * (carte de devant, ruban) laisse le conteneur naviguer normalement.
 * prefers-reduced-motion : gere en CSS (transitions neutralisees).
 */
(function () {
  'use strict';

  function esc(s) {
    return (window.LBACards && LBACards.esc)
      ? LBACards.esc(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
  }
  function tintCls(t) { return 'tint-' + ((t >= 1 && t <= 11) ? t : 1); }
  function motifSvg(emoji) {
    return (window.LBADeckMotifs && (LBADeckMotifs[emoji] || LBADeckMotifs['📦'])) || '';
  }

  // Un mini-recto de la pile. idx 0 = devant (carte la plus recemment ajoutee).
  // Les cartes du fond (idx>0) sont focusables/tapables pour le feuilletage.
  function cardHTML(name, idx) {
    var back = idx > 0;
    return '<span class="ds-card ds-i' + idx + '"' +
      (back ? ' tabindex="0" role="button" aria-label="Feuilleter : ' + esc(name) + '"' : '') + '>' +
      '<span class="ds-card-t">' + esc(name) + '</span>' +
      '</span>';
  }

  // opts : { name, tint, emoji, count, preview:[nom,…] (recent d'abord), meta?, size? }
  // size : 'shelf' | 'tile' | 'preview' | 'detail' | 'thumb' (defaut 'tile').
  function html(opts) {
    opts = opts || {};
    var size = opts.size || 'tile';
    var names = (opts.preview || []).filter(Boolean).slice(0, 3);
    var count = opts.count || 0;
    var pile;
    if (!names.length) {
      // Deck vide (0 carte) : on conserve le visuel generique (carte teintee + motif « paquet »).
      pile = '<span class="ds-card ds-i0 ds-empty">' +
        '<span class="deck-motif-bg" aria-hidden="true">' + motifSvg(opts.emoji) + '</span></span>';
    } else {
      pile = names.map(function (nm, i) { return cardHTML(nm, i); }).join('');
    }
    // Meta ruban : « N cartes » (+ complement libre eventuel : ❤, badge Partage…).
    var meta = count + (count > 1 ? ' cartes' : ' carte');
    if (opts.meta) meta += ' ' + opts.meta;
    // Nom optionnel : sur les pages de détail, le <h1> porte déjà le nom → on passe
    // name:'' pour ne pas le dupliquer (le ruban n'affiche alors que le compteur).
    var nameHtml = opts.name ? '<span class="ds-ribbon-name">' + esc(opts.name) + '</span>' : '';
    var ribbon = '<span class="ds-ribbon">' +
        '<span class="ds-fold ds-fold-l" aria-hidden="true"></span>' +
        '<span class="ds-fold ds-fold-r" aria-hidden="true"></span>' +
        nameHtml +
        '<span class="ds-ribbon-meta">' + meta + '</span>' +
      '</span>';
    return '<span class="deck-stack ds-' + size + ' ' + tintCls(opts.tint) + '" data-count="' + names.length + '">' +
      '<span class="ds-pile">' + pile + '</span>' + ribbon + '</span>';
  }

  // Amene une carte du fond au premier plan (et repose les autres de la meme pile).
  function lift(card) {
    var pile = card.parentNode;
    if (!pile) return;
    pile.querySelectorAll('.ds-card.ds-lift').forEach(function (c) {
      if (c !== card) c.classList.remove('ds-lift');
    });
    card.classList.toggle('ds-lift');
  }

  // Delegation unique : tap/clic sur une carte du fond → feuilletage (pas de navigation).
  function onActivate(e) {
    var card = e.target.closest ? e.target.closest('.ds-card') : null;
    if (!card || card.classList.contains('ds-i0') || card.classList.contains('ds-empty')) return;
    e.preventDefault();
    e.stopPropagation();
    lift(card);
  }
  document.addEventListener('click', onActivate);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var card = e.target && e.target.classList && e.target.classList.contains('ds-card') ? e.target : null;
    if (!card || card.classList.contains('ds-i0') || card.classList.contains('ds-empty')) return;
    e.preventDefault();
    e.stopPropagation();
    lift(card);
  });

  window.LBADeckStack = { html: html, tintCls: tintCls };
})();
