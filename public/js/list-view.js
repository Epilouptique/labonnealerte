/* list-view.js — VUE LISTE dense du kiosque (alternative aux cartes, pas un
   remplacement). Les lignes sont une PROJECTION des cartes de #grid : celles-ci
   restent la SOURCE DE VÉRITÉ par-source. Aucune logique métier dupliquée —
   cœur/abonnement sont FORWARDÉS à la carte cachée correspondante (mêmes handlers,
   mêmes endpoints via site.js) ; partage et « i » réutilisent LBAShare et
   /api/sources/:id/history comme la page statut.

   · Tuiles-deck : jamais rendues ici (les lignes viennent de /api/sources, qui ne
     contient pas les decks ; #grid est masqué en vue liste par le CSS).
   · Filtres / recherche / pagination : pilotés par site.js sur les cartes ; sync()
     recopie visibilité (.filtered/.hidden-more) et état (abonné/aimé/actif) carte→ligne.
   · Accordéon : une seule ligne ouverte dans toute la liste ; « i » et « partage »
     remplacent la description courte déjà ouverte. */

(function () {
  'use strict';

  var listEl = null;         // conteneur #list
  var openId = null;         // data-source-id de la ligne actuellement dépliée
  var built = false;
  // (f/g) B1 : quand une ligne paramétrée est dépliée, la VRAIE carte de #grid est
  // déplacée (même nœud DOM, pas une copie) dans son volet lrow-exp. On mémorise sa
  // position d'origine pour la remettre exactement à sa place à la fermeture.
  var parkedCard = null;     // { card, parent, next } ou null
  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function grid() { return document.getElementById('grid'); }
  function gridCard(id) {
    // La carte peut être temporairement déplacée dans un lrow-exp (B1) : on la retrouve
    // quand même pour que sync() ne la croie pas disparue.
    if (parkedCard && parkedCard.card.getAttribute('data-source-id') === id) return parkedCard.card;
    var g = grid(); if (!g) return null;
    return g.querySelector('.card[data-source-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
  }
  function catLabel(slug) { return (window.LBACat && LBACat.label) ? LBACat.label(slug) : slug; }
  function isParam(s) { return Array.isArray(s.params_schema) && s.params_schema.length > 0; }
  // Discriminant aligné sur cards.js (frontFace) : SEUL `type === 'linked'` fait une source
  // partenaire. On n'utilise PAS `link_url` comme critère : une source convertie en paramétrée
  // (ex. doomname, linked → external) garde un `link_url` résiduel non effacé — s'y fier
  // afficherait « Configurer → » au lieu du switch, en divergence avec la vue cartes.
  function isLinked(s) { return s.type === 'linked'; }
  // V3 · « tâche à échéance glissante » : pas de params_schema, donc isParam() est faux,
  // mais la SÉMANTIQUE du contrôle est celle d'une carte paramétrée (des instances qu'on
  // ajoute/retire + une pause globale), pas celle d'un abonnement broadcast. On l'aligne
  // donc sur le patron paramétré partout où c'est la sémantique qui compte : switch de la
  // ligne fermée, sync(), ouverture du volet. Voir hasBlocks() ci-dessous.
  function isUserTask(s) { return s.type === 'user-task'; }
  // Familles dont le corps de ligne déplie la VRAIE carte (B1) au lieu d'une description,
  // et dont le switch signifie « actif » (≥1 instance ET non en pause) et non « abonné ».
  function hasBlocks(s) { return isParam(s) || isUserTask(s); }
  // 'community' (ex. chat-perdu) : le corps de ligne doit LUI AUSSI déplier la vraie
  // carte (B1) — sa 5e face porte la liste des signalements, comme la 5e face de
  // user-task porte la liste des tâches. MAIS le switch de la carte 'community' reste
  // un abonnement broadcast CLASSIQUE (switchRow/s.subscribed, cf. cards.js frontFace) :
  // pas d'instances/tâches, pas de pause. isCommunity() n'entre donc PAS dans
  // hasBlocks() (qui piloterait à tort le switch via la branche instance/pause) — elle
  // n'est utilisée qu'au point d'ouverture du volet (openParams), où switch et corps de
  // ligne sont déjà traités séparément.
  function isCommunity(s) { return s.type === 'community'; }

  // SVG partagés avec les cartes (aucune duplication de string : exposés par LBACards).
  function ic(name) { return (window.LBACards && LBACards[name]) || ''; }

  // ── Construction d'une ligne ────────────────────────────────────────────────
  function rowHTML(s, mode) {
    var cats = Array.isArray(s.categories) ? s.categories : [];
    // (c) Catégorie cliquable → même filtrage que la puce du header (LBAKiosk.filter).
    var catChip = cats.length
      ? '<button type="button" class="lrow-cat" data-cat="' + esc(cats[0]) + '" aria-label="Filtrer sur ' + esc(catLabel(cats[0])) + '">' + esc(catLabel(cats[0])) + '</button>' : '';
    // Contrôle d'abonnement selon le type de source.
    var ctrl;
    if (isLinked(s)) {
      ctrl = '<a class="lrow-link" href="' + esc(s.link_url) + '" target="_blank" rel="noopener" aria-label="Configurer sur le service partenaire">Configurer →</a>';
    } else {
      // Broadcast ET paramétré : MÊME switch (même classe/markup) sur la ligne fermée.
      //  · broadcast → coché = abonné.
      //  · paramétré → coché = ACTIF (au moins une instance ET non en pause). Refléter
      //    « actif » (et non « abonné ») est nécessaire pour que OFF=pause ne rebondisse
      //    pas au sync suivant. Le détail (choix de valeur, ajout/retrait d'instances) se
      //    gère dans le volet déplié (carte réelle).
      var on;
      if (isUserTask(s)) {
        // Même règle, autre porteur d'instances : `tasks` au lieu de `instances`.
        on = mode === 'connected' && Array.isArray(s.tasks) && s.tasks.length > 0 && !s.muted;
      } else if (isParam(s)) {
        on = mode === 'connected' && Array.isArray(s.instances) && s.instances.length > 0 && !s.muted;
      } else {
        on = mode === 'connected' && !!s.subscribed;
      }
      ctrl = '<label class="switch-row lrow-switch"><span class="switch">' +
        '<input type="checkbox"' + (on ? ' checked' : '') + ' aria-label="Basculer l\'abonnement">' +
        '<span class="track"></span><span class="thumb"></span></span></label>';
    }
    // (a) Icônes cœur/partage/i : mêmes classes ET mêmes SVG que les cartes.
    // (d) Le sous-titre n'est plus dans .lrow-main : il est injecté en tête du volet
    //     déplié (fillExp) au moment de l'ouverture.
    return '' +
      '<div class="lrow" data-source-id="' + esc(s.id) + '" data-cats="' + esc(cats.join(' ')) + '">' +
        '<div class="lrow-head">' +
          '<button type="button" class="lrow-main" aria-expanded="false" aria-label="Afficher le détail de ' + esc(s.name) + '">' +
            '<span class="lrow-title">' + esc(s.name) + '</span>' +
          '</button>' +
          catChip +
          '<span class="lrow-actions">' +
            '<span class="lrow-state" title="État" aria-hidden="true"><span class="dot"></span></span>' +
            // Anonyme : même marquage que la carte (cf. likeBtn de cards.js). Le clic est
            // de toute façon FORWARDÉ au cœur de la carte, qui porte la redirection vers
            // /connexion — ceci n'ajoute que la cohérence visuelle de la vue liste.
            '<button type="button" class="like-btn card-like' + (mode === 'connected' ? '' : ' like-anon') +
              '" aria-pressed="false"' + (mode === 'connected' ? '' : ' aria-disabled="true"') +
              ' aria-label="' + (mode === 'connected' ? 'J\'aime cette alerte' : 'Connectez-vous pour aimer cette alerte') +
              '">' + ic('LIKE_SVG') + '</button>' +
            '<button type="button" class="share-btn card-share" aria-label="Partager" title="Partager">' + ic('SHARE_SVG') + '</button>' +
            '<button type="button" class="flip-btn" aria-label="En savoir plus (statut)" title="En savoir plus">' + ic('INFO_SVG') + '</button>' +
            ctrl +
          '</span>' +
        '</div>' +
        '<div class="lrow-exp" hidden></div>' +
      '</div>';
  }

  function render(sources, mode) {
    listEl = document.getElementById('list');
    if (!listEl || !Array.isArray(sources)) return;
    unparkCard(); // sécurité : rend une carte éventuellement déplacée à #grid avant qu'il soit reconstruit
    // Tri ALPHABÉTIQUE propre à la vue liste (nom, insensible casse/accents, français).
    // On trie une COPIE : `sources` est le tableau PARTAGÉ avec les cartes — le muter
    // changerait l'ordre des cartes. Le tri n'affecte que l'ORDRE des lignes ; la
    // pagination/filtrage restent pilotés par les cartes (sync() apparie par
    // data-source-id, sans dépendre de l'ordre) → les cartes sont inchangées.
    var ordered = sources.slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' });
    });
    listEl.innerHTML = ordered.map(function (s) { return rowHTML(s, mode); }).join('');
    built = true;
    openId = null;
    sync();
  }

  // ── Sync depuis les cartes (source de vérité) ────────────────────────────────
  function sync() {
    if (!listEl) listEl = document.getElementById('list');
    if (!listEl) return;
    var rows = listEl.querySelectorAll('.lrow');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var id = row.getAttribute('data-source-id');
      var card = gridCard(id);
      // Visibilité : miroir exact du filtrage/pagination des cartes.
      var hidden = !card || card.classList.contains('filtered') || card.classList.contains('hidden-more');
      var wasHidden = row.hidden;
      row.hidden = hidden;
      // (h) Apparition animée (mêmes durée/easing que les cartes) quand une ligne
      // redevient visible (filtrage catégorie, adoption, retrait reco).
      if (!hidden && wasHidden && !REDUCE) {
        row.classList.remove('lrow-in'); void row.offsetWidth; row.classList.add('lrow-in');
      }
      if (!card) continue;
      // État actif (icône seule).
      var active = !!card.querySelector('.state.active');
      var st = row.querySelector('.lrow-state');
      if (st) { st.classList.toggle('active', active); st.setAttribute('title', active ? 'Alerte active' : 'Rien à signaler'); }
      // Cœur : reflète l'état de la carte (bouton de la barre d'actions de la ligne,
      // scopé à .lrow-actions pour ne jamais viser le cœur caché d'une carte déplacée).
      var cardLike = card.querySelector('.like-btn');
      var rowLike = row.querySelector('.lrow-actions .like-btn');
      if (cardLike && rowLike) {
        var liked = cardLike.classList.contains('liked');
        rowLike.classList.toggle('liked', liked);
        rowLike.setAttribute('aria-pressed', liked ? 'true' : 'false');
      }
      // Abonnement : reflète l'état de la carte (source de vérité).
      var rowSw = row.querySelector('.lrow-switch input');
      if (rowSw) {
        var src = srcOf(id) || {};
        var on;
        if (hasBlocks(src)) {
          // Paramétré ET user-task : ACTIF = abonné (≥1 instance / ≥1 tâche) ET non en
          // pause (param-mute coché). Pour user-task le .param-mute vit sur le recto et
          // n'existe QUE s'il y a au moins une tâche — l'absence de case vaut donc « pas
          // en pause », exactement comme pour une carte paramétrée sans contrôle de pause.
          var sub = card.dataset.subscribed === '1';
          var muteCb = card.querySelector('.param-mute');
          on = sub && (!muteCb || muteCb.checked);
        } else {
          // Broadcast : coché = abonné.
          on = card.dataset.subscribed === '1' || (function () {
            var ci = card.querySelector('.switch-row input'); return ci && ci.checked;
          })();
        }
        if (rowSw.checked !== on) rowSw.checked = on;
        var lab = row.querySelector('.lrow-switch'); if (lab) lab.classList.toggle('on', on);
      }
    }
  }

  // ── Déplacement de la vraie carte (B1) ───────────────────────────────────────
  // (f/g) Déplace le MÊME nœud DOM de la carte dans le volet → tous les handlers,
  // le prefill géo et l'état restent natifs (c'est la carte réelle, pas une copie).
  // Le prefill dyn-enum a déjà été déclenché par site.js au rendu du grid ; le nœud
  // conservant son état, aucun re-déclenchement n'est nécessaire ici.
  // La carte parquée est mutée par SES PROPRES handlers (site.js : ajout/retrait
  // d'instance, pause, création/suppression de tâche, « C'est fait ✓ »), y compris de
  // façon asynchrone et hors de #list (la modale de création vit sur <body>). Plutôt
  // que de deviner un délai, on observe le nœud parqué : toute mutation resynchronise
  // le switch de la ligne. sync() n'écrit QUE dans la ligne (jamais dans la carte) →
  // aucune boucle possible.
  var parkObserver = null;
  function watchParked(card) {
    if (!window.MutationObserver) return;
    parkObserver = new MutationObserver(function () { sync(); });
    parkObserver.observe(card, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['data-subscribed', 'checked', 'class'] });
  }
  function parkCardInto(id, body) {
    var card = gridCard(id); if (!card) return false;
    parkedCard = { card: card, parent: card.parentNode, next: card.nextSibling };
    card.classList.add('in-list-exp');
    body.appendChild(card);
    watchParked(card);
    return true;
  }
  function unparkCard() {
    if (parkObserver) { parkObserver.disconnect(); parkObserver = null; }
    if (!parkedCard) return;
    var p = parkedCard; parkedCard = null;
    // La carte retourne à la grille sur son RECTO : sans ça, une carte quittée alors
    // que la 5e face était ouverte réapparaîtrait dans #grid en mode « Mes échéances ».
    p.card.classList.remove('flipped', 'face-task', 'face-share', 'face-deck');
    p.card.classList.remove('in-list-exp');
    // CORRECTIF 3 : remet à l'état FERMÉ le sous-formulaire communautaire si la carte
    // en a un — sinon .community-report-toggle/.community-form/.community-list
    // pouvaient rester gravés dans l'état où le volet les a laissés (formulaire ouvert
    // suite à un clic sur .community-report-toggle pendant le parking), invisible tant
    // que la 5e face est masquée mais surprenant à la prochaine ouverture. Pas de
    // recalcul is_author ici (pas nécessaire) : la prochaine ouverture le refera via
    // CORRECTIF 2 (vue liste) ou le chargement eager/.community-config (vue carte).
    if (p.card.querySelector('.card-community-face')) {
      var cForm = p.card.querySelector('.community-form'); if (cForm) cForm.hidden = true;
      var cToggle = p.card.querySelector('.community-report-toggle'); if (cToggle) cToggle.hidden = false;
      var cList = p.card.querySelector('.community-list'); if (cList) cList.hidden = false;
    }
    if (!p.parent) return;
    // Remise EXACTE à sa position d'origine ; si le repère a disparu (grille reconstruite
    // entre-temps), on retombe sur un append sans jamais lever d'exception.
    if (p.next && p.next.parentNode === p.parent) p.parent.insertBefore(p.card, p.next);
    else p.parent.appendChild(p.card);
  }

  // ── Accordéon (une seule ligne ouverte) ──────────────────────────────────────
  function expEl(row) { return row.querySelector('.lrow-exp'); }
  function clearRow(row) {
    // Restaure une éventuelle carte déplacée AVANT de vider (sinon le nœud est détruit).
    unparkCard();
    row.classList.remove('open');
    var exp = expEl(row);
    if (exp) { exp.hidden = true; exp.innerHTML = ''; exp.removeAttribute('data-kind'); }
    var mb = row.querySelector('.lrow-main'); if (mb) mb.setAttribute('aria-expanded', 'false');
  }
  function closeAll(except) {
    if (!listEl) return;
    listEl.querySelectorAll('.lrow.open').forEach(function (r) {
      if (r === except) return;
      clearRow(r);
    });
    if (!except) openId = null;
  }
  // (d) Sous-titre en tête du volet, puis un corps rempli par le `filler` (string ou fn(body)).
  function fillExp(row, kind, filler) {
    // Restaure une carte éventuellement déplacée (y compris dans CE volet : changer de
    // « kind » sur la même ligne réécrit exp.innerHTML et détruirait le nœud sinon).
    unparkCard();
    closeAll(row);
    var s = srcOf(row.getAttribute('data-source-id')) || {};
    var exp = expEl(row);
    var sub = s.subtitle ? '<div class="lrow-exp-sub">' + esc(s.subtitle) + '</div>' : '';
    exp.innerHTML = sub + '<div class="lrow-exp-body"></div>';
    var body = exp.querySelector('.lrow-exp-body');
    if (typeof filler === 'function') filler(body); else body.innerHTML = filler;
    exp.hidden = false;
    exp.setAttribute('data-kind', kind);
    row.classList.add('open');
    openId = row.getAttribute('data-source-id');
    var mainBtn = row.querySelector('.lrow-main');
    if (mainBtn) mainBtn.setAttribute('aria-expanded', kind === 'desc' ? 'true' : 'false');
  }
  // Bascule : si déjà ouvert sur le même kind → referme ; sinon (ré)ouvre.
  function toggleKind(row, kind, filler) {
    var exp = expEl(row);
    if (row.classList.contains('open') && exp.getAttribute('data-kind') === kind) {
      clearRow(row); openId = null; return;
    }
    fillExp(row, kind, typeof filler === 'function'
      ? function (body) { body.innerHTML = '<div class="lrow-loading">Chargement…</div>'; filler(body); }
      : filler);
  }

  function srcOf(id) {
    var list = (window.LBAKiosk && LBAKiosk.sources && LBAKiosk.sources()) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // (e) « i » : contenu COMPLET de la page statut = description + uptime + timeline.
  // Uptime rendu par le helper partagé (LBATimeline.uptimeBars) → aucune duplication.
  function loadStatus(id, body) {
    var s = srcOf(id) || {};
    var desc = s.description_long || s.description || '';
    var descHtml = desc ? '<p class="lrow-status-desc">' + esc(desc) + '</p>' : '';
    fetch('/api/sources/' + encodeURIComponent(id) + '/history', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { days: [], events: [] }; })
      .then(function (hist) {
        var bars = (window.LBATimeline && LBATimeline.uptimeBars) ? LBATimeline.uptimeBars(hist.days || []) : '';
        body.innerHTML =
          '<div class="lrow-status">' +
            descHtml +
            '<div class="lrow-status-uptime">' + (bars || '<span class="lrow-muted">Pas encore d\'historique.</span>') + '</div>' +
            '<div class="lrow-status-timeline"></div>' +
            '<a class="lrow-status-more" href="/source/' + esc(id) + '/statut">Page complète →</a>' +
          '</div>';
        var tl = body.querySelector('.lrow-status-timeline');
        if (tl && window.LBATimeline && LBATimeline.render) LBATimeline.render(tl, hist.events || []);
      })
      .catch(function () { body.innerHTML = descHtml + '<span class="lrow-muted">Statut indisponible pour le moment.</span>'; });
  }

  function shareInline(row, s, body) {
    var url = 'https://labonnealerte.fr/source/' + s.id + '/statut';
    if (window.LBAShare && LBAShare.optionsHTML) {
      body.innerHTML = '<div class="lrow-share-grid share-grid">' + LBAShare.optionsHTML(s.name, url) + '</div>';
      LBAShare.bindCopy(body, url);
    } else {
      body.innerHTML = '<span class="lrow-muted">Partage indisponible.</span>';
    }
  }

  // ── Handlers délégués sur #list ──────────────────────────────────────────────
  function bind() {
    listEl = document.getElementById('list');
    if (!listEl || listEl.dataset.bound) return;
    listEl.dataset.bound = '1';

    // (f/g) Déplie une ligne paramétrée en y déplaçant la vraie carte (B1).
    function openParams(row, id) {
      toggleKind(row, 'params', function (body) {
        body.innerHTML = '';
        if (!parkCardInto(id, body)) {
          body.innerHTML = '<span class="lrow-muted">Carte indisponible.</span>';
          return;
        }
        // user-task : ce qui est actionnable vit sur la 5e face, pas sur le recto (qui ne
        // porte que « + configurer »). On l'ouvre d'emblée — même classe .face-task que la
        // vue cartes, donc même CSS, et le .flip-back de la face ramène au recto — pour
        // que le volet montre directement les échéances, comme un volet paramétré montre
        // directement ses chips. Ne concerne QUE user-task : .card-usertask-face est la
        // seule 5e face dévoilée en vue liste.
        // Garde-fou : en anonyme taskFace()/communityReportsFace() ne rendent RIEN — sans
        // ce test, .face-task masquerait le recto pour ne dévoiler aucune face (volet
        // vide). L'anonyme reste donc sur le recto et son lien « + configurer »/« Signaler »
        // → /connexion. Même classe .face-task pour les deux familles (même mécanique de
        // flip côté site.js) ; .card-usertask-face / .card-community-face (marqueurs
        // additifs posés dans cards.js) disent laquelle des deux est réellement présente.
        var c = gridCard(id);
        if (c && c.querySelector('.card-usertask-face')) {
          c.classList.add('face-task');
        } else if (c && c.querySelector('.card-community-face')) {
          c.classList.add('face-task');
          // CORRECTIF 2 : la vue cartes refetch à CHAQUE ouverture de la 5e face
          // (.community-config, site.js) — sans cet appel, le volet affichait
          // l'instantané figé au chargement initial de la page (eager load de
          // loadHome()), jamais rafraîchi tant que l'utilisateur ne repassait pas par
          // la vue cartes. Même fonction, même comportement, juste un second point
          // d'appel (exposée par site.js via window.LBACommunity.load).
          if (window.LBACommunity && window.LBACommunity.load) window.LBACommunity.load(c);
        }
      });
    }

    listEl.addEventListener('click', function (e) {
      // (c) Catégorie cliquable : même filtrage que la puce du header (mécanisme partagé).
      var catBtn = e.target.closest('.lrow-cat');
      if (catBtn) {
        e.preventDefault();
        if (window.LBAKiosk && LBAKiosk.filter) LBAKiosk.filter(catBtn.getAttribute('data-cat'));
        return;
      }
      var row = e.target.closest('.lrow'); if (!row) return;
      var id = row.getAttribute('data-source-id');
      var s = srcOf(id) || {};

      // Cœur : FORWARD au bouton like de la carte (réutilise le handler like de site.js).
      if (e.target.closest('.like-btn')) {
        e.preventDefault();
        var card = gridCard(id); var cl = card && card.querySelector('.like-btn');
        if (cl) { cl.click(); setTimeout(sync, 30); }
        return;
      }
      // Partage inline (remplace le contenu ouvert).
      if (e.target.closest('.card-share')) {
        e.preventDefault();
        toggleKind(row, 'share', function (body) { shareInline(row, s, body); });
        return;
      }
      // « i » : statut complet inline (description + uptime + timeline).
      if (e.target.closest('.flip-btn')) {
        e.preventDefault();
        toggleKind(row, 'info', function (body) { loadStatus(id, body); });
        return;
      }
      // Lien partenaire : navigation native (ne rien intercepter).
      if (e.target.closest('.lrow-link')) return;
      // Switch : géré sur 'change' (plus bas) — un clic sur le switch ne doit pas déplier.
      if (e.target.closest('.lrow-switch')) return;
      // Clic à l'intérieur de la carte déplacée (contrôles param) : ne rien intercepter,
      // ses propres handlers (délégués sur document via .card) s'en chargent.
      if (e.target.closest('.in-list-exp')) return;
      // Corps de ligne : paramétrée/user-task/community → volet avec la vraie carte (B1) ;
      // sinon description courte. isCommunity() volontairement séparée de hasBlocks() :
      // seul le CORPS de ligne se comporte pareil, le switch reste géré à part (broadcast).
      if (e.target.closest('.lrow-main')) {
        if (hasBlocks(s) || isCommunity(s)) openParams(row, id);
        else toggleKind(row, 'desc', '<p class="lrow-desc">' + esc(s.description || 'Pas de description.') + '</p>');
      }
    });

    // Switch d'abonnement (broadcast) : forward vers la carte cachée.
    listEl.addEventListener('change', function (e) {
      var input = e.target.closest('.lrow-switch input'); if (!input) return;
      var row = e.target.closest('.lrow'); var id = row.getAttribute('data-source-id');
      var card = gridCard(id); if (!card) { input.checked = !input.checked; return; }

      // Source PARAMÉTRÉE : pas d'abonnement binaire à l'aveugle.
      //  · ON depuis « pas abonné »  → déplie le volet (picker) pour choisir une valeur.
      //  · ON depuis « en pause »     → reprise (unmute) via .param-mute de la carte réelle.
      //  · OFF depuis « actif »       → pause (mute all), non destructif (jamais un retrait
      //                                 d'instance ; le vrai désabonnement reste via les ✕).
      var srcP = srcOf(id) || {};
      if (hasBlocks(srcP)) {
        if (document.body.getAttribute('data-mode') !== 'connected') {
          input.checked = false; openParams(row, id); return; // anonyme : passe par le picker
        }
        var subscribedP = card.dataset.subscribed === '1';
        var muteCb = card.querySelector('.param-mute');
        var activeP = subscribedP && (!muteCb || muteCb.checked);
        if (input.checked && !activeP) {
          if (subscribedP && muteCb) {
            muteCb.checked = true; muteCb.dispatchEvent(new Event('change', { bubbles: true }));
            setTimeout(sync, 400);
          } else {
            input.checked = false; // pas abonné : on ne peut pas abonner sans valeur → déplier
            openParams(row, id);
            setTimeout(function () {
              var c = gridCard(id); if (!c) return;
              // user-task : « abonner » n'a de sens qu'avec une échéance. On ouvre donc
              // LA MÊME modale que la vue cartes (user-task-form.js), sur la carte réelle
              // parquée dans le volet — aucun formulaire de liste à maintenir en parallèle.
              if (isUserTask(srcP)) {
                if (window.LBATaskForm && LBATaskForm.open) LBATaskForm.open(c);
                return;
              }
              var ctrl = c.querySelector('.dyn-search, .param-select, .param-input');
              if (ctrl) ctrl.focus();
            }, 80);
          }
        } else if (!input.checked && activeP) {
          if (muteCb) { muteCb.checked = false; muteCb.dispatchEvent(new Event('change', { bubbles: true })); setTimeout(sync, 400); }
          else input.checked = true; // sécurité : aucun contrôle de pause → on annule
        } else {
          input.checked = activeP; // réaligne sur l'état réel
        }
        return;
      }

      var desired = input.checked;
      var connected = document.body.getAttribute('data-mode') === 'connected';
      if (connected) {
        // Réutilise toggleConnected via le switch réel de la carte.
        var ci = card.querySelector('.switch-row input');
        if (ci) { ci.checked = desired; ci.dispatchEvent(new Event('change', { bubbles: true })); }
        setTimeout(sync, 400);
      } else if (desired) {
        // Anonyme : collecte l'email dans l'accordéon puis pont vers submitAnon (même endpoint).
        fillExp(row, 'anon-sub',
          '<form class="lrow-anon"><input type="email" placeholder="votre@email.fr" aria-label="Adresse email" required>' +
          '<button type="submit">Recevoir l\'alerte</button>' +
          '<span class="lrow-anon-note" role="status"></span></form>');
        input.checked = false; // pas encore abonné : l'email valide l'abonnement
        var form = row.querySelector('.lrow-anon');
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var email = (form.querySelector('input').value || '').trim();
          var cardInput = card.querySelector('.sub-form input');
          var cardBtn = card.querySelector('.sub-form button');
          if (!cardInput || !cardBtn) { form.querySelector('.lrow-anon-note').textContent = 'Indisponible.'; return; }
          // Pont : on remplit le formulaire de la carte et on déclenche submitAnon (site.js).
          var cardSwitch = card.querySelector('.switch-row input');
          if (cardSwitch && !cardSwitch.checked) { cardSwitch.checked = true; cardSwitch.dispatchEvent(new Event('change', { bubbles: true })); }
          cardInput.value = email;
          cardBtn.click();
          form.querySelector('.lrow-anon-note').textContent = 'Vérifie tes emails ✉️';
          setTimeout(function () { sync(); }, 600);
        });
      } else {
        // Anonyme, décoche : annule un éventuel pending de la carte.
        var cs = card.querySelector('.switch-row input');
        if (cs && cs.checked) { cs.checked = false; cs.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    });

    // (h) Nettoyage de la classe d'apparition une fois l'animation terminée
    // (permet de la rejouer au prochain passage hidden→visible).
    listEl.addEventListener('animationend', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('lrow-in')) {
        e.target.classList.remove('lrow-in');
      }
    });

    // Un changement de vue vers 'list' resynchronise (au cas où l'état a bougé en vue cartes).
    document.addEventListener('lba-view-change', function (ev) {
      if (ev.detail && ev.detail.mode === 'list') sync();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  window.LBAListView = { render: render, sync: sync };
})();
