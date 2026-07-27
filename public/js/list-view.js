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

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function grid() { return document.getElementById('grid'); }
  function gridCard(id) {
    var g = grid(); if (!g) return null;
    return g.querySelector('.card[data-source-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
  }
  function catLabel(slug) { return (window.LBACat && LBACat.label) ? LBACat.label(slug) : slug; }
  function isParam(s) { return Array.isArray(s.params_schema) && s.params_schema.length > 0; }
  function isLinked(s) { return s.type === 'linked' || !!s.link_url; }

  // ── Construction d'une ligne ────────────────────────────────────────────────
  function rowHTML(s, mode) {
    var cats = Array.isArray(s.categories) ? s.categories : [];
    var catChip = cats.length
      ? '<span class="lrow-cat">' + esc(catLabel(cats[0])) + '</span>' : '';
    // Contrôle d'abonnement selon le type de source.
    var ctrl;
    if (isLinked(s)) {
      ctrl = '<a class="lrow-link" href="' + esc(s.link_url) + '" target="_blank" rel="noopener" aria-label="Configurer sur le service partenaire">Configurer →</a>';
    } else if (isParam(s)) {
      // Abonnement paramétré (département, ville…) : géré sur la carte. On y renvoie.
      ctrl = '<button type="button" class="lrow-manage" aria-label="Gérer cette alerte dans la vue cartes">Gérer →</button>';
    } else {
      var on = mode === 'connected' && !!s.subscribed;
      ctrl = '<label class="switch-row lrow-switch"><span class="switch">' +
        '<input type="checkbox"' + (on ? ' checked' : '') + ' aria-label="Basculer l\'abonnement">' +
        '<span class="track"></span><span class="thumb"></span></span></label>';
    }
    return '' +
      '<div class="lrow" data-source-id="' + esc(s.id) + '" data-cats="' + esc(cats.join(' ')) + '">' +
        '<div class="lrow-head">' +
          '<button type="button" class="lrow-main" aria-expanded="false" aria-label="Afficher la description de ' + esc(s.name) + '">' +
            '<span class="lrow-title">' + esc(s.name) + '</span>' +
            (s.subtitle ? '<span class="lrow-sub">' + esc(s.subtitle) + '</span>' : '') +
          '</button>' +
          catChip +
          '<span class="lrow-actions">' +
            '<span class="lrow-state" title="État" aria-hidden="true"><span class="dot"></span></span>' +
            '<button type="button" class="lrow-like" aria-pressed="false" aria-label="J\'aime cette alerte">♥</button>' +
            '<button type="button" class="lrow-share" aria-label="Partager">⤴</button>' +
            '<button type="button" class="lrow-info" aria-label="En savoir plus (statut)">ⓘ</button>' +
            ctrl +
          '</span>' +
        '</div>' +
        '<div class="lrow-exp" hidden></div>' +
      '</div>';
  }

  function render(sources, mode) {
    listEl = document.getElementById('list');
    if (!listEl || !Array.isArray(sources)) return;
    listEl.innerHTML = sources.map(function (s) { return rowHTML(s, mode); }).join('');
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
      row.hidden = hidden;
      if (!card) continue;
      // État actif (icône seule).
      var active = !!card.querySelector('.state.active');
      var st = row.querySelector('.lrow-state');
      if (st) { st.classList.toggle('active', active); st.setAttribute('title', active ? 'Alerte active' : 'Rien à signaler'); }
      // Cœur : reflète l'état de la carte.
      var cardLike = card.querySelector('.like-btn');
      var rowLike = row.querySelector('.lrow-like');
      if (cardLike && rowLike) {
        var liked = cardLike.classList.contains('liked');
        rowLike.classList.toggle('liked', liked);
        rowLike.setAttribute('aria-pressed', liked ? 'true' : 'false');
      }
      // Abonnement (broadcast) : reflète le switch de la carte.
      var rowSw = row.querySelector('.lrow-switch input');
      if (rowSw) {
        var subscribed = card.dataset.subscribed === '1' || (function () {
          var ci = card.querySelector('.switch-row input'); return ci && ci.checked;
        })();
        if (rowSw.checked !== subscribed) rowSw.checked = subscribed;
        var lab = row.querySelector('.lrow-switch'); if (lab) lab.classList.toggle('on', subscribed);
      }
    }
  }

  // ── Accordéon (une seule ligne ouverte) ──────────────────────────────────────
  function closeAll(except) {
    if (!listEl) return;
    listEl.querySelectorAll('.lrow.open').forEach(function (r) {
      if (r === except) return;
      r.classList.remove('open');
      var exp = r.querySelector('.lrow-exp'); if (exp) { exp.hidden = true; exp.innerHTML = ''; exp.removeAttribute('data-kind'); }
      var mainBtn = r.querySelector('.lrow-main'); if (mainBtn) mainBtn.setAttribute('aria-expanded', 'false');
    });
    if (!except) openId = null;
  }
  function expEl(row) { return row.querySelector('.lrow-exp'); }
  function openWith(row, kind, html) {
    closeAll(row);
    var exp = expEl(row);
    exp.innerHTML = html;
    exp.hidden = false;
    exp.setAttribute('data-kind', kind);
    row.classList.add('open');
    openId = row.getAttribute('data-source-id');
    var mainBtn = row.querySelector('.lrow-main');
    if (mainBtn) mainBtn.setAttribute('aria-expanded', kind === 'desc' ? 'true' : 'false');
  }
  // Bascule : si déjà ouvert sur le même kind → referme ; sinon (ré)ouvre.
  function toggleKind(row, kind, htmlOrFn) {
    var exp = expEl(row);
    if (row.classList.contains('open') && exp.getAttribute('data-kind') === kind) {
      row.classList.remove('open'); exp.hidden = true; exp.innerHTML = ''; exp.removeAttribute('data-kind');
      var mb = row.querySelector('.lrow-main'); if (mb) mb.setAttribute('aria-expanded', 'false');
      openId = null;
      return;
    }
    openWith(row, kind, typeof htmlOrFn === 'function' ? '<div class="lrow-loading">Chargement…</div>' : htmlOrFn);
    if (typeof htmlOrFn === 'function') htmlOrFn(exp);
  }

  function srcOf(id) {
    var list = (window.LBAKiosk && LBAKiosk.sources && LBAKiosk.sources()) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // « i » : contenu de la page statut (uptime + timeline), chargé en place.
  var UPTIME_LABEL = { calm: 'Calme', active: 'Alerte active', failed: 'Incident de surveillance', nodata: 'Pas de données' };
  function loadStatus(id, exp) {
    fetch('/api/sources/' + encodeURIComponent(id) + '/history', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { days: [], events: [] }; })
      .then(function (hist) {
        var days = hist.days || [];
        var bars = days.map(function (d) {
          return '<span class="uptime-bar u-' + esc(d.status) + '" title="' + esc(d.date) + ' · ' + esc(UPTIME_LABEL[d.status] || d.status) + '"></span>';
        }).join('');
        exp.innerHTML =
          '<div class="lrow-status">' +
            '<div class="lrow-status-uptime">' + (bars || '<span class="lrow-muted">Pas encore d\'historique.</span>') + '</div>' +
            '<div class="lrow-status-timeline"></div>' +
            '<a class="lrow-status-more" href="/source/' + esc(id) + '/statut">Page complète →</a>' +
          '</div>';
        var tl = exp.querySelector('.lrow-status-timeline');
        if (tl && window.LBATimeline && LBATimeline.render) LBATimeline.render(tl, hist.events || []);
      })
      .catch(function () { exp.innerHTML = '<span class="lrow-muted">Statut indisponible pour le moment.</span>'; });
  }

  function shareInline(row, s, exp) {
    var url = 'https://labonnealerte.fr/source/' + s.id + '/statut';
    if (window.LBAShare && LBAShare.optionsHTML) {
      exp.innerHTML = '<div class="lrow-share-grid share-grid">' + LBAShare.optionsHTML(s.name, url) + '</div>';
      LBAShare.bindCopy(exp, url);
    } else {
      exp.innerHTML = '<span class="lrow-muted">Partage indisponible.</span>';
    }
  }

  // ── Handlers délégués sur #list ──────────────────────────────────────────────
  function bind() {
    listEl = document.getElementById('list');
    if (!listEl || listEl.dataset.bound) return;
    listEl.dataset.bound = '1';

    listEl.addEventListener('click', function (e) {
      var row = e.target.closest('.lrow'); if (!row) return;
      var id = row.getAttribute('data-source-id');
      var s = srcOf(id) || {};

      // Cœur : FORWARD au bouton like de la carte (réutilise le handler like de site.js).
      if (e.target.closest('.lrow-like')) {
        e.preventDefault();
        var card = gridCard(id); var cl = card && card.querySelector('.like-btn');
        if (cl) { cl.click(); setTimeout(sync, 30); }
        return;
      }
      // Partage inline (remplace le contenu ouvert).
      if (e.target.closest('.lrow-share')) {
        e.preventDefault();
        toggleKind(row, 'share', function (exp) { shareInline(row, s, exp); });
        return;
      }
      // « i » : statut inline (remplace).
      if (e.target.closest('.lrow-info')) {
        e.preventDefault();
        toggleKind(row, 'info', function (exp) { loadStatus(id, exp); });
        return;
      }
      // « Gérer » (source paramétrée) : bascule en vue cartes + scroll sur la carte.
      if (e.target.closest('.lrow-manage')) {
        e.preventDefault();
        if (window.LBAViewMode) LBAViewMode.set('cards');
        var c2 = gridCard(id);
        if (c2) setTimeout(function () {
          c2.scrollIntoView({ behavior: 'smooth', block: 'center' });
          c2.classList.add('card-flash'); setTimeout(function () { c2.classList.remove('card-flash'); }, 1600);
        }, 60);
        return;
      }
      // Lien partenaire : navigation native (ne rien intercepter).
      if (e.target.closest('.lrow-link')) return;
      // Switch : géré sur 'change' (plus bas) — un clic sur le switch ne doit pas déplier.
      if (e.target.closest('.lrow-switch')) return;
      // Corps de ligne : déplie/replie la DESCRIPTION COURTE.
      if (e.target.closest('.lrow-main')) {
        toggleKind(row, 'desc', '<p class="lrow-desc">' + esc(s.description || 'Pas de description.') + '</p>');
      }
    });

    // Switch d'abonnement (broadcast) : forward vers la carte cachée.
    listEl.addEventListener('change', function (e) {
      var input = e.target.closest('.lrow-switch input'); if (!input) return;
      var row = e.target.closest('.lrow'); var id = row.getAttribute('data-source-id');
      var card = gridCard(id); if (!card) { input.checked = !input.checked; return; }
      var desired = input.checked;
      var connected = document.body.getAttribute('data-mode') === 'connected';
      if (connected) {
        // Réutilise toggleConnected via le switch réel de la carte.
        var ci = card.querySelector('.switch-row input');
        if (ci) { ci.checked = desired; ci.dispatchEvent(new Event('change', { bubbles: true })); }
        setTimeout(sync, 400);
      } else if (desired) {
        // Anonyme : collecte l'email dans l'accordéon puis pont vers submitAnon (même endpoint).
        openWith(row, 'anon-sub',
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

    // Un changement de vue vers 'list' resynchronise (au cas où l'état a bougé en vue cartes).
    document.addEventListener('lba-view-change', function (ev) {
      if (ev.detail && ev.detail.mode === 'list') sync();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  window.LBAListView = { render: render, sync: sync };
})();
