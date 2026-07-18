// « Le Point » : rend la synthèse publique depuis /api/le-point. Aucun état personnel.
(function () {
  'use strict';
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // « samedi 18 juillet, 14h30 »
  function longDateTime(d) {
    return JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()] + ', ' + d.getHours() + 'h' + pad(d.getMinutes());
  }
  // Étiquette relative d'un événement à venir : Aujourd'hui / Demain / <jour> / « 15 août ».
  function whenLabel(d) {
    var now = new Date();
    var d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var d1 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.round((d1 - d0) / 86400000);
    if (diff <= 0) return "Aujourd'hui";
    if (diff === 1) return 'Demain';
    if (diff < 7) return JOURS[d.getDay()].charAt(0).toUpperCase() + JOURS[d.getDay()].slice(1);
    return d.getDate() + ' ' + MOIS[d.getMonth()];
  }

  function activeCardHTML(a) {
    if (a.kind === 'param') {
      var n = a.count || 0;
      var zones = (a.labels || []).map(esc).join(', ');
      var suffix = (a.labels && a.labels.length < n) ? '…' : '';
      var line = esc(a.name) + ' — ' + n + (n > 1 ? ' zones concernées' : ' zone concernée')
        + (zones ? ' : ' + zones + suffix : '');
      return '<a class="lp-card" href="' + esc(a.url) + '"><span class="lp-card-msg">⚠️ ' + line + '</span></a>';
    }
    return '<a class="lp-card" href="' + esc(a.url) + '"><span class="lp-card-msg">' + esc(a.message || a.name) + '</span></a>';
  }

  function render(data) {
    var gen = new Date(data.generated_at);
    var genEl = document.getElementById('lp-generated');
    if (genEl) genEl.textContent = 'Le point du ' + longDateTime(gen);

    var activeEl = document.getElementById('lp-active');
    if (!data.active || data.active.length === 0) {
      activeEl.innerHTML = '<p class="lp-calm">Tout est calme en ce moment 🍃<br><span class="lp-calm-sub">Aucune alerte active — c\'est une bonne nouvelle.</span></p>';
    } else {
      activeEl.innerHTML = data.active.map(activeCardHTML).join('');
    }

    var upEl = document.getElementById('lp-upcoming');
    if (!data.upcoming || data.upcoming.length === 0) {
      upEl.innerHTML = '<li class="lp-soon-empty">Rien de prévu dans les dix prochains jours.</li>';
    } else {
      upEl.innerHTML = data.upcoming.map(function (e) {
        var d = new Date(e.start);
        return '<li class="lp-soon-item"><a href="' + esc(e.url) + '">'
          + '<span class="lp-soon-when">' + esc(whenLabel(d)) + '</span>'
          + '<span class="lp-soon-msg">' + esc(e.message) + '</span></a></li>';
      }).join('');
    }

    document.getElementById('lp-loading').hidden = true;
    document.getElementById('lp-view').hidden = false;

    // Partage : Web Share si dispo, sinon copie du lien.
    var shareBtn = document.getElementById('lp-share');
    if (shareBtn) {
      shareBtn.hidden = false;
      var c = data.counts || {};
      var txt = 'Le Point — ' + (c.active || 0) + ' alerte' + ((c.active || 0) > 1 ? 's' : '') + ' en cours, '
        + (c.upcoming || 0) + ' événement' + ((c.upcoming || 0) > 1 ? 's' : '') + ' à venir.';
      shareBtn.addEventListener('click', function () {
        var url = 'https://labonnealerte.fr/le-point';
        if (navigator.share) { navigator.share({ title: 'Le Point — LaBonneAlerte', text: txt, url: url }).catch(function () {}); }
        else if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function () { shareBtn.textContent = 'Lien copié ✓'; setTimeout(function () { shareBtn.textContent = 'Partager'; }, 1600); });
        }
      });
    }
  }

  fetch('/api/le-point', { headers: { Accept: 'application/json' } })
    .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
    .then(render)
    .catch(function () {
      document.getElementById('lp-loading').hidden = true;
      document.getElementById('lp-error').hidden = false;
    });
})();
