/* deck-stack.js — LBADeckStack : visuel partage d'un deck en « pile de cartes +
 * ruban ». ITERATION 2 (refonte Hugo) : la pile reutilise le MEME composant de carte
 * que le kiosque (LBACards.cardHTML), a la MEME taille (ratio 5/7, largeur de colonne).
 * Jusqu'a 3 vraies cartes (recto complet : titre, badge, sous-titre, description en
 * fondu, bloc parametre/switch) empilees en eventail resserre, entourees d'un ruban
 * teinte centre. Un seul composant, aucune variante de taille selon l'emplacement
 * (grille kiosque, Mes decks, apercu formulaire, en-tetes de detail).
 *
 * Les cartes de la pile sont un APERCU : non interactives (pointer-events:none en CSS),
 * le switch « S'abonner » est visible mais desactive. Le clic sur la tuile-deck dans
 * son ensemble navigue vers la page du deck (gere par le conteneur appelant, <a> ou
 * bouton). Il n'y a plus de feuilletage carte-par-carte a cet endroit (les cartes sont
 * en pleine taille ; la tuile entiere est la cible de navigation).
 *
 * Structure produite (a placer DANS le conteneur cliquable de l'appelant) :
 *   .deck-stack.tint-N
 *     .ds-stack                      → sizer ratio 5/7 ; cartes empilees en absolu
 *       .ds-face.ds-i0 (devant) … .ds-i2 (derriere)   → chacune = LBACards.cardHTML
 *       .ds-ribbon                   → ruban teinte centre (nom + compteur), plis lateraux
 *
 * L'appelant fournit opts.cards = tableau d'objets source COMPLETS deja resolus
 * (recent d'abord, <=3) ; deck vide → visuel generique (carte teintee + motif paquet).
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

  // Une carte de la pile = recto complet du kiosque. On NEUTRALISE les data-attributs
  // que site.js enumere sur .card[...] (tri, filtre, pagination, reco, like, prefill)
  // pour que ces cartes d'apercu, imbriquees dans la grille, n'interferent pas avec la
  // logique du kiosque. Elles sont aussi rendues non interactives via CSS.
  function faceHTML(src, idx, mode) {
    var raw = (window.LBACards && LBACards.cardHTML) ? LBACards.cardHTML(src, mode || 'anon') : '';
    raw = raw.replace(/\sdata-(cats|source-id|search|subscribed|dyn-prefill)="[^"]*"/g, '');
    return '<div class="ds-face ds-i' + idx + '">' + raw + '</div>';
  }

  // opts : { name, tint, emoji, count, cards:[srcObj,…] (recent d'abord, <=3), meta?, mode? }
  function html(opts) {
    opts = opts || {};
    var cards = (opts.cards || []).filter(Boolean).slice(0, 3);
    var count = opts.count || 0;
    var inner;
    if (!cards.length) {
      // Deck vide (0 carte) : visuel generique conserve (carte teintee + motif « paquet »).
      inner = '<div class="ds-face ds-i0 ds-empty">' +
        '<span class="deck-motif-bg" aria-hidden="true">' + motifSvg(opts.emoji) + '</span></div>';
    } else {
      inner = cards.map(function (s, i) { return faceHTML(s, i, opts.mode); }).join('');
    }
    var meta = count + (count > 1 ? ' cartes' : ' carte');
    if (opts.meta) meta += ' ' + opts.meta;
    // Nom optionnel : sur les pages de detail, le <h1> porte deja le nom (name:'').
    var nameHtml = opts.name ? '<span class="ds-ribbon-name">' + esc(opts.name) + '</span>' : '';
    // Ruban en forme de vague : la forme/les plis viennent du background CSS (.ds-ribbon),
    // plus de triangles .ds-fold en markup.
    var ribbon = '<span class="ds-ribbon">' +
        nameHtml +
        '<span class="ds-ribbon-meta">' + meta + '</span>' +
      '</span>';
    return '<div class="deck-stack ' + tintCls(opts.tint) + '" data-count="' + cards.length + '">' +
      '<div class="ds-stack">' + inner + ribbon + '</div></div>';
  }

  // Resout un tableau d'IDs de sources en objets source complets, via un index id→source.
  // Preserve l'ordre des IDs, ignore les introuvables (source desactivee/absente).
  function resolveCards(ids, index) {
    if (!Array.isArray(ids) || !index) return [];
    return ids.map(function (id) { return index[id]; }).filter(Boolean);
  }
  // Construit un index id→source depuis un tableau de sources.
  function indexSources(sources) {
    var idx = {};
    (sources || []).forEach(function (s) { if (s && s.id != null) idx[s.id] = s; });
    return idx;
  }

  window.LBADeckStack = { html: html, tintCls: tintCls, resolveCards: resolveCards, indexSources: indexSources };
})();
