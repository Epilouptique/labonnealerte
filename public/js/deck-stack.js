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
  function catLabel(slug) { return (window.LBACat && LBACat.label) ? LBACat.label(slug) : slug; }
  // Catégories auto du deck (top-3, LECTURE SEULE) rendues au style des tags de carte
  // (.tag), jamais cliquables ici : elles décrivent le deck, elles ne filtrent pas.
  function catsHTML(cats) {
    if (!Array.isArray(cats) || !cats.length) return '';
    return '<span class="ds-ribbon-cats">' + cats.slice(0, 3).map(function (c) {
      return '<span class="tag ds-cat-tag">' + esc(catLabel(c)) + '</span>';
    }).join('') + '</span>';
  }

  // Verso « i » du DECK (carte de devant seulement) : MEME structure/CSS/animation que le
  // verso d'une carte classique (backFace de cards.js) — .card-back + .card-long-desc +
  // categories en .tag + « Plus d'infos → ». Contenu = la description du deck (pas de la
  // source d'apercu), ses categories auto (top-3), et un lien vers la page du deck. Pas de
  // .card-top (comme le verso classique, ou le titre est masque quand la carte est retournee).
  function deckBackHTML(opts) {
    var back = (window.LBACards && LBACards.BACK_SVG) || '';
    var desc = '<p class="card-long-desc">' + esc(opts.description || '') + '</p>';
    var cats = '';
    if (Array.isArray(opts.cats) && opts.cats.length) {
      cats = '<div class="back-tags">' + opts.cats.slice(0, 3).map(function (c) {
        return '<span class="tag">' + esc(catLabel(c)) + '</span>';
      }).join('') + '</div>';
    }
    // Auteur/createur du deck (meme place et meme style que .back-author d'une carte) :
    // le pseudo public du createur, prefixe « @ ». Absent pour un deck officiel (author null).
    // Cliquable vers la page profil /u/<pseudo> quand author_pseudo est fourni ; sinon
    // texte simple (compte sans pseudo, ex. avant backfill).
    var authorName = opts.author
      ? (opts.author_pseudo
          ? '<a class="back-author-name" href="/u/' + esc(opts.author_pseudo) + '">@' + esc(opts.author) + '</a>'
          : '<span class="back-author-name">@' + esc(opts.author) + '</span>')
      : '';
    var author = opts.author
      ? '<div class="back-author">par ' + authorName + '</div>' : '';
    // « Plus d'infos → » (lien vers la page du deck) retiré : le badge @forum_slug
    // (haut-gauche du verso, symétrique des cartes) fait office de lien « en savoir plus ».
    // Lien discret vers les discussions forum de ce deck (même logique que le verso carte :
    // lien de sortie seul, toujours visible dès qu'un forum_slug existe). /forum/deck/:slug
    // gère la résolution slug-ou-id côté serveur. Même token visuel que .back-statut.
    // Libellé (et compte de discussions) via LBACards.forumLinkText : MÊME fonction que
    // les cartes, pas de variante ici. Repli sur le texte nu si cards.js n'est pas chargé.
    var forumLabel = (window.LBACards && LBACards.forumLinkText)
      ? LBACards.forumLinkText(opts.topic_count) : 'On en parle au forum →';
    var forum = opts.forum_slug
      ? '<a class="back-statut back-forum" href="/forum/deck/' + esc(opts.forum_slug) + '">'
        + forumLabel + '</a>'
      : '';
    // Badge @forum_slug en haut-GAUCHE du verso, à hauteur de flip-back — EXACTEMENT le même
    // pattern que les cartes (.card-forum-badge, structure DOM identique : card-back en
    // position absolue, flip-back en haut-droite). Mène a la PAGE DU DECK (opts.href, deja
    // calcule par l'appelant : /collection/:id ou /deck/:token), PAS a la liste des sujets
    // forum — meme regle que les cartes et que slugBadge() cote serveur : le badge @slug
    // conduit toujours a l'objet lui-meme. Le lien « On en parle au forum → » ci-dessus
    // reste la seule sortie vers les discussions. Absent sans forum_slug.
    var forumBadge = (opts.forum_slug && opts.href)
      ? '<a class="forum-slug-badge card-forum-badge" href="' + esc(opts.href) +
        '">@' + esc(opts.forum_slug) + '</a>'
      : '';
    return '<div class="card-face card-back">' +
      '<button class="flip-back" type="button" aria-label="Retour" title="Retour">' + back + '</button>' +
      forumBadge +
      desc + cats + author + forum +
    '</div>';
  }

  // Une carte de la pile = recto complet du kiosque. On NEUTRALISE les data-attributs
  // que site.js enumere sur .card[...] (tri, filtre, pagination, reco, like, prefill)
  // pour que ces cartes d'apercu, imbriquees dans la grille, n'interferent pas avec la
  // logique du kiosque. Elles sont aussi rendues non interactives via CSS.
  // deckBack (carte de DEVANT uniquement) : si fourni, on remplace le VERSO de la source
  // d'apercu par le verso du DECK (le « i » retourne alors la tuile sur les infos du deck).
  // Le remplacement borne le .card-back de la source jusqu'au debut de sa .card-share-face
  // (ordre stable de cardHTML : front → back → share) — robuste aux div imbriquees du dos.
  function faceHTML(src, idx, mode, deckBack) {
    var raw = (window.LBACards && LBACards.cardHTML) ? LBACards.cardHTML(src, mode || 'anon') : '';
    raw = raw.replace(/\sdata-(cats|source-id|search|subscribed|dyn-prefill)="[^"]*"/g, '');
    if (idx === 0 && deckBack) {
      raw = raw.replace(
        /<div class="card-face card-back">[\s\S]*?(?=<div class="card-face card-share-face">)/,
        deckBack
      );
    }
    return '<div class="ds-face ds-i' + idx + '">' + raw + '</div>';
  }

  // opts : { name, tint, emoji, count, cards:[srcObj,…] (recent d'abord, <=3), meta?, mode?,
  //          cats?, description?, href?, backHTML? }
  // backHTML (prioritaire) OU description+href activent le VERSO DECK sur la carte de devant :
  //  - backHTML : verso arbitraire fourni par l'appelant (ex. verso proprietaire /mes-decks) ;
  //  - href     : verso public auto (description + categories + « Plus d'infos → »), kiosque.
  // Sans ni l'un ni l'autre, la carte de devant garde le verso de la source d'apercu (inerte).
  function html(opts) {
    opts = opts || {};
    var cards = (opts.cards || []).filter(Boolean).slice(0, 3);
    var count = opts.count || 0;
    var inner;
    // Verso de la carte de DEVANT, par priorite :
    //  1) opts.backHTML  : verso fourni tel quel par l'appelant (ex. /mes-decks = verso
    //     PROPRIETAIRE avec actions S'abonner/Partager/Modifier/Supprimer/Apparence) ;
    //  2) opts.href      : verso PUBLIC auto (description + categories + « Plus d'infos »),
    //     tuiles-deck du kiosque ;
    //  3) sinon          : verso de la source d'apercu conserve (« i » inerte via CSS).
    var deckBack = opts.backHTML || (opts.href ? deckBackHTML(opts) : '');
    if (!cards.length) {
      // Deck vide (0 carte) : visuel generique conserve (carte teintee + motif « paquet »).
      inner = '<div class="ds-face ds-i0 ds-empty">' +
        '<span class="deck-motif-bg" aria-hidden="true">' + motifSvg(opts.emoji) + '</span></div>';
    } else {
      inner = cards.map(function (s, i) { return faceHTML(s, i, opts.mode, i === 0 ? deckBack : ''); }).join('');
    }
    var meta = count + (count > 1 ? ' cartes' : ' carte');
    if (opts.meta) meta += ' ' + opts.meta;
    // Nom optionnel : sur les pages de detail, le <h1> porte deja le nom (name:'').
    var nameHtml = opts.name ? '<span class="ds-ribbon-name">' + esc(opts.name) + '</span>' : '';
    // Ruban en forme de vague : la forme/les plis viennent du background CSS (.ds-ribbon),
    // plus de triangles .ds-fold en markup. Le MOTIF (dessin choisi) et la TEINTE (couleur)
    // ne s'appliquent QU'ICI, sur le ruban : couche motif discrete derriere le texte.
    var ribbon = '<span class="ds-ribbon">' +
        '<span class="ds-ribbon-motif" aria-hidden="true">' + motifSvg(opts.emoji) + '</span>' +
        nameHtml +
        '<span class="ds-ribbon-meta">' + meta + '</span>' +
        catsHTML(opts.cats) +
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
