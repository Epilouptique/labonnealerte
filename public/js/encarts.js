/* encarts.js — « encarts sympas » : encarts promotionnels MAISON (jamais de vraie pub) dans
   la colonne de mini-cartes du kiosque. Au plus UN encart par affichage de page, tiré au
   hasard parmi ceux qui sont ÉLIGIBLES (actif ET dont l'alerte cible existe dans le catalogue).

   Inspiration (rythme rompu par un bloc plus grand et visuel) : les encarts « maison » de
   certains sites d'actu — l'idée, pas le code ni le style. Le texte passe PAR-DESSUS l'image
   (titre en haut sur un scrim sombre, sous-titre + bouton en bas sur un panneau beige). Aucun
   traceur, aucun appel externe, aucune statistique. Le choix n'est pas persisté (nouveau
   tirage à chaque page).

   Intégration : l'encart est un <article class="encart"> (PAS .card) → invisible pour le
   découpage colonnes de view-compare.js. Desktop : placé en colonne 2 (mini-cartes), juste
   après la 2e mini-carte, via grid-row explicite. Mobile (1 colonne) : inséré dans le DOM
   après la 3e carte. Ne s'affiche jamais en premier ni en dernier, ni s'il y a trop peu de
   cartes.

   CTA (bouton, PAS de lien) : au clic, il abonne DIRECTEMENT à l'alerte cible en RÉUTILISANT
   le contrôle d'abonnement de la carte correspondante du kiosque — on simule le clic
   utilisateur sur le switch (sources simples) ou sur « + configurer » (tâches / paramétrées).
   Aucun code d'abonnement nouveau, aucun appel API dédié, aucune navigation : exactement le
   même comportement que la carte (invite de connexion, messages d'erreur, formulaire e-mail en
   anonyme). Après succès, le bouton passe à « Abonné ✓ » (désactivé) ; il reflète en continu
   l'état data-subscribed de la carte. */
'use strict';

// Liste de données : 3 objets modifiables sans toucher à la logique. `actif:false` ou une
// `slug` absente du catalogue ⇒ l'encart n'est JAMAIS tiré (voir eligibleEncarts).
var ENCARTS = [
  {
    id: 'livraison-1e', actif: true, slug: 'leboncoin-livraison',
    titre: "La livraison à 1 € t'a encore échappé ?",
    texte: "Laisse-nous faire le guet : on te prévient dès qu'elle revient.",
    bouton: 'Me prévenir',
    alt: "Illustration : la livraison à petit prix qu'on surveille pour vous.",
  },
  {
    id: 'aurores', actif: true, slug: 'aurores-france',
    titre: "Comment ça, c'était hier, l'aurore boréale ?",
    texte: "Un ciel vert au-dessus de la France, tout le monde le savait… sauf toi.",
    bouton: 'Surveiller le ciel',
    alt: 'Illustration : un ciel nocturne teinté de vert au-dessus de la France.',
  },
  {
    id: 'echeances', actif: true, slug: 'tache-echeance-glissante',
    titre: "Ton contrôle technique, il est pour quand déjà ?",
    texte: "Tu ne sais pas ? Nous si. On te rappelle.",
    bouton: 'Créer mon rappel',
    alt: 'Illustration : un rappel d’échéance qui glisse dans le temps.',
  },
];

var REQUIRED = ['id', 'slug', 'titre', 'texte', 'bouton'];
function hasRequired(e) {
  if (!e || typeof e !== 'object') return false;
  for (var i = 0; i < REQUIRED.length; i++) {
    if (typeof e[REQUIRED[i]] !== 'string' || !e[REQUIRED[i]]) return false;
  }
  return true;
}

// Encarts éligibles : champs obligatoires présents, actif !== false, ET alerte cible
// existante (slug présent dans la liste d'ids du catalogue). PUR et testable.
function eligibleEncarts(encarts, sourceIds) {
  var ids = {};
  (sourceIds || []).forEach(function (id) { ids[id] = true; });
  return (encarts || []).filter(function (e) {
    return hasRequired(e) && e.actif !== false && !!ids[e.slug];
  });
}

// Choix : un encart forcé par son id (si présent parmi les éligibles), sinon tirage aléatoire.
// rnd injectable pour les tests (défaut Math.random). PUR.
function pickEncart(eligible, forcedId, rnd) {
  if (!eligible || !eligible.length) return null;
  if (forcedId) {
    for (var i = 0; i < eligible.length; i++) if (eligible[i].id === forcedId) return eligible[i];
    return null; // forçage d'un encart non éligible → rien (jamais d'encart « fantôme »)
  }
  var r = (typeof rnd === 'function' ? rnd() : Math.random());
  return eligible[Math.floor(r * eligible.length) % eligible.length];
}

// ── Partie NAVIGATEUR (ignorée quand le module est requis par un test Node) ──
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  (function () {
    var ROW = 8, MARGIN = 16;           // trame masonry de #grid (cf. view-compare.js)
    var MIN_SIDE_DESKTOP = 3;           // ≥3 mini-cartes : l'encart (après la 2e) n'est jamais le dernier
    var MIN_CARDS_MOBILE = 4;           // ≥4 cartes : l'encart (après la 3e) n'est jamais le dernier
    var el = null;                      // l'élément encart courant
    var cta = null;                     // le bouton d'abonnement de l'encart
    var chosen = null;                  // l'encart tiré pour cette page (fixe : pas de re-tirage)
    var placeT = null;
    var cardMO = null;                  // observe la carte cible (reflet de data-subscribed)
    var watched = null;                 // carte actuellement observée

    function grid() { return document.getElementById('grid'); }
    function root() { return document.documentElement; }
    function isMobile() { return !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches); }

    function attrJSON(name) {
      try { return JSON.parse(root().getAttribute(name) || '{}'); } catch (e) { return {}; }
    }
    function testForcing() { return root().getAttribute('data-lba-encart-test') === '1'; }
    function forcedId() {
      if (!testForcing()) return null; // forçage honoré hors production uniquement
      var m = (window.location.search || '').match(/[?&]encart=([a-z0-9-]+)/i);
      return m ? m[1] : null;
    }

    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    // Visuel : <img> si le fichier existe réellement (liste serveur), sinon dégradé SVG de
    // remplacement (aucune requête 404). Le dégradé varie par id pour un rendu distinct.
    function mediaHTML(e) {
      var imgs = attrJSON('data-lba-encart-img');
      if (imgs[e.id]) {
        return '<span class="encart-media"><img src="' + esc(imgs[e.id]) + '" alt="' + esc(e.alt || '') +
          '" loading="lazy" decoding="async"></span>';
      }
      return '<span class="encart-media encart-media--placeholder" data-encart="' + esc(e.id) +
        '" role="img" aria-label="' + esc(e.alt || '') + '"></span>';
    }

    function render(e) {
      var g = grid(); if (!g) return null;
      var a = document.createElement('article');
      a.className = 'encart';
      a.setAttribute('aria-label', 'À découvrir');
      a.setAttribute('data-encart-id', e.id);
      // Texte PAR-DESSUS l'image : titre en haut (scrim sombre), panneau beige en bas
      // (sous-titre + bouton à droite). Plus de bloc texte séparé ni de pastille.
      a.innerHTML =
        mediaHTML(e) +
        '<strong class="encart-title">' + esc(e.titre) + '</strong>' +
        '<span class="encart-panel">' +
          '<span class="encart-text">' + esc(e.texte) + '</span>' +
          '<button type="button" class="encart-cta">' + esc(e.bouton) + '</button>' +
        '</span>';
      cta = a.querySelector('.encart-cta');
      if (cta) cta.addEventListener('click', onCtaClick);
      return a;
    }

    // Carte source réelle du kiosque pour un slug donné (jamais une tuile-deck).
    function cardForSlug(slug) {
      var g = grid(); if (!g || !slug) return null;
      return g.querySelector('.card[data-source-id="' + slug + '"]');
    }

    // La carte est-elle abonnée ? data-subscribed='1' (connecté, ou tâche configurée), OU —
    // en anonyme — ligne d'abonnement non « en attente » + switch coché + libellé « Abonné »
    // (succès du formulaire e-mail). On NE prend PAS un simple « coché » en anonyme : cocher
    // ouvre d'abord l'état « en attente », ce n'est pas encore un abonnement.
    function cardSubscribed(card) {
      if (!card) return false;
      if (card.getAttribute('data-subscribed') === '1') return true;
      var row = card.querySelector('.card-front .switch-row:not(.param-mute-row):not(.param-follow-row)');
      if (row && !row.classList.contains('pending')) {
        var sw = row.querySelector('input[type="checkbox"]');
        var lbl = row.querySelector('.switch-label');
        if (sw && sw.checked && lbl && /abonn/i.test(lbl.textContent || '')) return true;
      }
      return false;
    }

    // Reflète l'état de la carte sur le bouton de l'encart.
    function paintCta(subscribed) {
      if (!cta || !chosen) return;
      if (subscribed) {
        cta.textContent = 'Abonné ✓';
        cta.classList.add('is-subscribed');
        cta.setAttribute('disabled', 'disabled');
        cta.setAttribute('aria-disabled', 'true');
      } else {
        cta.textContent = chosen.bouton;
        cta.classList.remove('is-subscribed');
        cta.removeAttribute('disabled');
        cta.removeAttribute('aria-disabled');
      }
    }
    function syncCta() { paintCta(cardSubscribed(cardForSlug(chosen && chosen.slug))); }

    // Observe la carte cible : dès que son abonnement change (data-subscribed, classes de la
    // ligne de switch), on repeint le bouton. Ré-attache si la carte est re-rendue (nouveau nœud).
    function watchCard() {
      var card = cardForSlug(chosen && chosen.slug);
      if (card === watched) return;
      if (cardMO) { cardMO.disconnect(); cardMO = null; }
      watched = card || null;
      if (card && window.MutationObserver) {
        cardMO = new MutationObserver(syncCta);
        cardMO.observe(card, { attributes: true, attributeFilter: ['data-subscribed'] });
      }
      syncCta();
    }

    // Clic sur le bouton : on déclenche le MÊME contrôle que la carte correspondante — aucune
    // navigation, aucun appel d'abonnement nouveau. Sources simples → switch (change simulé) ;
    // tâches / cartes paramétrées → bouton « + configurer » (ouvre exactement le même flux).
    function onCtaClick(ev) {
      if (ev) {
        ev.preventDefault();
        // Le clic ne doit PAS remonter au document : site.js y annule toute carte « en
        // attente » dès qu'on clique hors d'elle — or le CTA est hors de la carte, et ce même
        // clic annulerait aussitôt le formulaire e-mail que le switch vient d'ouvrir (anonyme).
        ev.stopPropagation();
      }
      if (!chosen || (cta && cta.hasAttribute('disabled'))) return;
      var card = cardForSlug(chosen.slug);
      if (!card) return;                 // carte non rendue : rien à réutiliser (jamais de nav)
      var front = card.querySelector('.card-front') || card;
      var sw = front.querySelector('.switch-row:not(.param-mute-row):not(.param-follow-row) input[type="checkbox"]');
      if (sw) {
        if (!sw.checked) { sw.checked = true; sw.dispatchEvent(new Event('change', { bubbles: true })); }
      } else {
        // Tâche personnelle / carte paramétrée : le contrôle d'abonnement est un bouton
        // (« + configurer ») ou, en anonyme, un lien « invite de connexion ». On fait
        // EXACTEMENT ce que fait ce contrôle (clic natif) — y compris son éventuelle invite.
        var trigger = front.querySelector('.task-config, .param-follow, .task-config-anon');
        if (trigger) trigger.click();
      }
      // L'abonnement est asynchrone (fetch) : on re-synchronise quelques fois après le clic
      // pour refléter l'état final sans dépendre uniquement de l'observateur de mutations.
      var n = 0;
      var poll = setInterval(function () {
        n++; watchCard();
        if (cardSubscribed(cardForSlug(chosen.slug)) || n >= 14) clearInterval(poll);
      }, 260);
    }

    // Cartes réellement visibles de #grid (hors filtrage/pagination, hors « Proposer »/encart).
    function visibleCards() {
      var g = grid(); if (!g) return [];
      var out = [];
      for (var i = 0; i < g.children.length; i++) {
        var c = g.children[i];
        if (!c.classList || !c.classList.contains('card')) continue;
        if (c.classList.contains('add')) continue;
        if (c.classList.contains('filtered') || c.classList.contains('hidden-more')) continue;
        out.push(c);
      }
      return out;
    }

    var revealed = false;               // l'animation d'apparition (encart-in) ne joue qu'UNE fois
    function hide() { if (el) { el.style.display = 'none'; el.classList.remove('is-placed'); revealed = false; } }
    function ensureVisible() { if (el && el.style.display === 'none') el.style.display = ''; } // sans animer
    function reveal() { if (el && !revealed) { revealed = true; el.classList.add('is-placed'); } } // 1 seule fois

    function place() {
      if (!el) return;
      var g = grid(); if (!g) { hide(); return; }

      if (isMobile()) {
        // Flux 1 colonne : position = DOM, après la 3e carte. Pas de placement grille.
        el.style.gridColumn = ''; el.style.gridRowStart = ''; el.style.gridRowEnd = '';
        var cardsM = visibleCards();
        if (cardsM.length < MIN_CARDS_MOBILE) { hide(); return; }
        var anchor = cardsM[2];
        if (anchor && anchor.nextSibling !== el) g.insertBefore(el, anchor.nextSibling);
        ensureVisible(); reveal();
        watchCard();
        return;
      }

      // Desktop : colonne 2 (mini-cartes), juste après la 2e mini-carte (.vc-side), via
      // grid-row. Pour mesurer les cartes SEULES sans clignoter, on GARE l'encart très bas
      // (rangée hors de vue) au lieu de le masquer (display:none ré-animerait l'apparition à
      // chaque passe de replacement). Il reste visible ; son placement final est posé plus bas.
      ensureVisible();
      el.style.gridColumn = '2';
      el.style.gridRowStart = '9999'; el.style.gridRowEnd = '';
      var cards = visibleCards();
      var side = cards.filter(function (c) { return c.classList.contains('vc-side'); });
      if (side.length < MIN_SIDE_DESKTOP) { hide(); return; } // trop peu / jamais en dernier → masqué
      var cs = window.getComputedStyle(g);
      var gTop = g.getBoundingClientRect().top + (parseFloat(cs.paddingTop) || 0);
      // La maçonnerie « dense » ne suit pas l'ordre du DOM : on trie les mini-cartes par
      // position VERTICALE et on vise la 2e en partant du haut (= « après la 2e mini-carte »).
      var sorted = side.map(function (c) { return { el: c, rect: c.getBoundingClientRect() }; })
        .sort(function (a, b) { return a.rect.top - b.rect.top; });
      var second = sorted[1]; // 2e mini-carte visible dans la colonne
      // Rangée EXACTE juste après la 2e carte = sa rangée de début + son span. Calculer depuis
      // le span (grille) et non le bas en pixels évite l'arrondi qui, trop court, ferait
      // chevaucher la 2e carte → elle serait repoussée SOUS l'encart (bug constaté).
      var startOfSecond = Math.max(1, Math.round((second.rect.top - gTop) / ROW) + 1);
      var spanM = (second.el.style.gridRowEnd || '').match(/\d+/);
      var span = spanM ? parseInt(spanM[0], 10) : Math.max(1, Math.ceil((second.rect.height + MARGIN) / ROW));
      var startRow = startOfSecond + span;
      el.style.gridRowStart = String(startRow);   // rangée finale (remplace le parking 9999)
      var h = el.offsetHeight || 0;     // hauteur réelle (l'encart est déjà visible)
      if (h) el.style.gridRowEnd = 'span ' + Math.max(1, Math.ceil((h + MARGIN) / ROW));
      reveal();                          // animation d'apparition : une seule fois
      watchCard();                       // reflète l'état d'abonnement de la carte cible
    }

    function schedulePlace() { clearTimeout(placeT); placeT = setTimeout(place, 140); }

    function sourcesIds() {
      try {
        var src = (window.LBAKiosk && window.LBAKiosk.sources && window.LBAKiosk.sources()) || [];
        return src.map(function (s) { return s.id; });
      } catch (e) { return []; }
    }

    function init() {
      var g = grid(); if (!g) return;
      var ids = sourcesIds();
      if (!ids.length) return;                 // catalogue pas encore chargé : on réessaiera
      if (chosen === null) {
        var eligible = eligibleEncarts(ENCARTS, ids);
        chosen = pickEncart(eligible, forcedId()) || false; // false = aucun encart cette page
      }
      if (!chosen) return;
      if (!el) { el = render(chosen); if (!el) return; el.style.display = 'none'; g.appendChild(el); }
      place();
    }

    // Le catalogue est rendu de façon asynchrone par site.js : on observe #grid et on
    // (re)place après chaque changement de visibilité des cartes (recherche, catégorie,
    // « afficher plus », bascule de colonne). Débounce léger, aucune persistance.
    function bind() {
      var g = grid(); if (!g) return;
      init();
      if (window.MutationObserver) {
        var mo = new MutationObserver(function () { if (chosen === null) init(); else schedulePlace(); });
        mo.observe(g, { childList: true, subtree: false, attributes: true, attributeFilter: ['class', 'style'] });
      }
      window.addEventListener('resize', schedulePlace);
      // Le masonry (view-compare.js) pose/mesure les colonnes sur plusieurs passes différées
      // (rAF + timeouts ~300 ms) APRÈS le premier rendu. On re-place donc plusieurs fois sur
      // ~3,3 s : les dernières passes mesurent la grille stabilisée → position fiable « après
      // la 2e mini-carte ». Aucune persistance, aucun appel réseau.
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (chosen === null) init(); else place();
        if (tries >= 11) clearInterval(iv);
      }, 300);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();

    window.LBAEncarts = { ENCARTS: ENCARTS, eligibleEncarts: eligibleEncarts, pickEncart: pickEncart, _place: place };
  })();
}

// Export Node (tests hors ligne) : la liste + les fonctions pures, sans toucher au DOM.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ENCARTS: ENCARTS, eligibleEncarts: eligibleEncarts, pickEncart: pickEncart, hasRequired: hasRequired };
}
