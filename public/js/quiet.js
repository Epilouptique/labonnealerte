/* quiet.js — « Heures de veille » (panneau Mon compte, mode connecté).
   Plage silencieuse des notifications : par défaut aucune notif entre 23h et 8h,
   les alertes de la nuit sont envoyées groupées au réveil. Toggle + 2 selects
   d'heures, auto-sauvegarde au changement (même esprit que profile.js). */

(function () {
  'use strict';

  var S = window.LBASession;
  var mount = document.getElementById('quiet-mount');
  if (!mount || !S) return;
  var token = S.get();
  if (!token) return; // anonyme : pas de réglage

  var state = { disabled: false, start: 23, end: 8 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var flashTimer = null;
  function flash(msg, ok) {
    var el = document.getElementById('quiet-feedback');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('err', !ok);
    el.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { el.classList.remove('show'); }, 1600);
  }

  function hourOptions(selected) {
    var html = '';
    for (var h = 0; h < 24; h++) {
      var sel = h === selected ? ' selected' : '';
      html += '<option value="' + h + '"' + sel + '>' + (h < 10 ? '0' + h : h) + 'h</option>';
    }
    return html;
  }

  async function save() {
    var payload = { token: token, disabled: state.disabled, start: state.start, end: state.end };
    try {
      var res = await fetch('/api/my-alerts/quiet-hours', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('http ' + res.status);
      var d = await res.json();
      state.disabled = d.quiet_disabled === true;
      state.start = d.quiet_start;
      state.end = d.quiet_end;
      flash('Enregistré ✓', true);
    } catch (e) {
      flash('Échec de l\'enregistrement', false);
    }
  }

  function syncDisabled() {
    var hoursRow = document.getElementById('quiet-hours-row');
    if (hoursRow) hoursRow.hidden = state.disabled;
    var tog = document.getElementById('quiet-toggle');
    if (tog) tog.classList.toggle('on', !state.disabled);
  }

  function render() {
    mount.innerHTML =
      '<div class="acct-subhead">Heures de veille <span id="quiet-feedback" class="pref-feedback" role="status"></span></div>' +
      '<div class="notif-card">' +
      '  <div class="notif-row">' +
      '    <div class="notif-txt"><strong>Ne pas me déranger la nuit</strong>' +
      '      <span class="notif-sub">Les alertes reçues pendant cette plage vous seront envoyées groupées au réveil.</span></div>' +
      '    <button type="button" id="quiet-toggle" class="notif-toggle" role="switch" aria-label="Activer les heures de veille"></button>' +
      '  </div>' +
      '  <div class="notif-row" id="quiet-hours-row">' +
      '    <div class="notif-txt"><strong>Plage silencieuse</strong><span class="notif-sub">Aucune notification pendant ces heures</span></div>' +
      '    <div class="quiet-range">' +
      '      <label>De <select id="quiet-start" class="pref-select" aria-label="Début de la veille">' + hourOptions(state.start) + '</select></label>' +
      '      <label>à <select id="quiet-end" class="pref-select" aria-label="Fin de la veille">' + hourOptions(state.end) + '</select></label>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    syncDisabled();

    document.getElementById('quiet-toggle').addEventListener('click', function () {
      state.disabled = !state.disabled;
      syncDisabled();
      save();
    });
    document.getElementById('quiet-start').addEventListener('change', function (e) {
      state.start = parseInt(e.target.value, 10);
      if (state.start === state.end) { flash('Début et fin identiques', false); return; }
      save();
    });
    document.getElementById('quiet-end').addEventListener('change', function (e) {
      state.end = parseInt(e.target.value, 10);
      if (state.start === state.end) { flash('Début et fin identiques', false); return; }
      save();
    });
  }

  (async function initQuiet() {
    try {
      var me = await fetch('/api/my-alerts?token=' + encodeURIComponent(token), {
        headers: { Accept: 'application/json' },
      }).then(function (r) { return r.status === 401 ? null : r.json(); });
      if (me === null) return;
      if (typeof me.quiet_start === 'number') state.start = me.quiet_start;
      if (typeof me.quiet_end === 'number') state.end = me.quiet_end;
      state.disabled = me.quiet_disabled === true;
      render();
    } catch (e) { /* silencieux : bonus non bloquant */ }
  })();
})();
