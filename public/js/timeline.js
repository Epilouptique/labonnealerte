/* timeline.js — timeline verticale réutilisable (page statut + home historique).
   window.LBATimeline.render(el, events) où events = [{ event, message, created_at }]. */

(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(d) {
    try {
      return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return d.toISOString(); }
  }

  function meta(ev) {
    if (ev === 'activated') return { cls: 'act', title: 'Alerte déclenchée' };
    if (ev === 'deactivated') return { cls: 'calm', title: 'Retour au calme' };
    return { cls: 'fail', title: 'Incident de surveillance' };
  }

  // options : { sourceName } pour préfixer l'entrée (home multi-sources).
  function render(el, events, options) {
    if (!el) return;
    options = options || {};
    if (!events || !events.length) {
      el.innerHTML = '<p class="tl-empty">Aucun événement pour l\'instant.</p>';
      return;
    }
    var html = '<ul class="tl">' + events.map(function (ev) {
      var m = meta(ev.event);
      var when = fmt(new Date(ev.created_at));
      var srcName = ev.source_name || options.sourceName;
      var src = srcName ? '<span class="tl-src">' + esc(srcName) + '</span> — ' : '';
      var quote = (ev.event === 'activated' && ev.message)
        ? '<div class="tl-quote">« ' + esc(ev.message) + ' »</div>' : '';
      return '<li class="tl-item ' + m.cls + '"><span class="tl-dot"></span>' +
        '<div class="tl-body"><div class="tl-head">' + src + m.title +
        ' <span class="tl-when">' + when + '</span></div>' + quote + '</div></li>';
    }).join('') + '</ul>';
    el.innerHTML = html;
  }

  window.LBATimeline = { render: render };
})();
