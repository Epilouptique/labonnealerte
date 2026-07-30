/* forum.js — interactions client des pages /forum (vanilla, aucune dépendance
   framework). Chargé uniquement par les pages forum (server-rendu par
   server/routes/forum.js). Le token de session est lu via LBASession.get()
   (même mécanisme que le reste du site) et joint au corps des POST. */

(function () {
  'use strict';

  function token() {
    return (window.LBASession && LBASession.get && LBASession.get()) || null;
  }
  function connected() { return !!token(); }

  // POST JSON avec token de session ; renvoie { ok, status, data }.
  async function postJson(url, payload) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ token: token() }, payload || {})),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* réponse non-JSON */ }
    return { ok: res.ok, status: res.status, data: data || {} };
  }

  function showMsg(el, text) {
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
  }

  // Compteurs de caractères « N / max » (input + textarea marqués data-for).
  function bindCounters() {
    document.querySelectorAll('.forum-counter[data-for]').forEach(function (counter) {
      const field = document.getElementById(counter.getAttribute('data-for'));
      if (!field) return;
      const max = field.getAttribute('maxlength');
      function paint() { counter.textContent = (field.value.length) + (max ? ' / ' + max : ''); }
      field.addEventListener('input', paint);
      paint();
    });
  }

  // Bascule formulaire ↔ invitation à se connecter selon l'état de session.
  function gateByAuth(formSel, inviteSel) {
    const form = document.querySelector(formSel);
    const invite = document.querySelector(inviteSel);
    if (!form || !invite) return;
    if (connected()) { form.hidden = false; invite.hidden = true; }
    else { form.hidden = true; invite.hidden = false; }
  }

  // Formulaire de création d'un sujet (/forum/nouveau).
  async function bindCreateForm() {
    const form = document.getElementById('forum-create-form');
    if (!form) return;
    gateByAuth('#forum-create-form', '.forum-login-invite');

    // Peuple le <select> de tag (sources + decks) via /api/forum/taggables.
    const tagSel = document.getElementById('new-tag');
    const preSource = form.getAttribute('data-pre-source') || '';
    const preDeck = form.getAttribute('data-pre-deck') || '';
    if (tagSel) {
      try {
        const res = await fetch('/api/forum/taggables', { headers: { Accept: 'application/json' } });
        const d = res.ok ? await res.json() : { sources: [], decks: [] };
        function addGroup(label, items, type) {
          if (!items || !items.length) return;
          const og = document.createElement('optgroup');
          og.label = label;
          items.forEach(function (it) {
            const o = document.createElement('option');
            // value = "type:id" → déterministe, pas de résolution floue de nom.
            o.value = type + ':' + it.id;
            o.textContent = it.name;
            // Pré-sélection si on vient d'une page source/deck (?source=/?deck=slug).
            if ((type === 'source' && preSource && (it.forum_slug === preSource || it.id === preSource)) ||
                (type === 'deck' && preDeck && (it.forum_slug === preDeck || it.id === preDeck))) {
              o.selected = true;
            }
            og.appendChild(o);
          });
          tagSel.appendChild(og);
        }
        addGroup('Sources', d.sources, 'source');
        addGroup('Decks', d.decks, 'deck');
      } catch (e) { /* liste indisponible : le tag reste optionnel */ }
    }

    const msg = form.querySelector('.forum-form-msg');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!connected()) { showMsg(msg, 'Connectez-vous pour publier.'); return; }
      const btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      showMsg(msg, '');
      const payload = {
        category: (document.getElementById('new-cat') || {}).value || '',
        title: (document.getElementById('new-title') || {}).value || '',
        body: (document.getElementById('new-body') || {}).value || '',
      };
      const tag = tagSel ? tagSel.value : '';
      if (tag.indexOf('source:') === 0) payload.source_id = tag.slice(7);
      else if (tag.indexOf('deck:') === 0) payload.deck_id = tag.slice(5);
      try {
        const r = await postJson('/forum/t', payload);
        if (r.status === 201 && r.data.url) { window.location.href = r.data.url; return; }
        if (r.status === 401) { showMsg(msg, 'Session expirée. Reconnectez-vous.'); }
        else { showMsg(msg, r.data.error || 'Publication impossible, réessayez.'); }
      } catch (err) {
        showMsg(msg, 'Erreur réseau, réessayez.');
      } finally { if (btn) btn.disabled = false; }
    });
  }

  // Formulaire de réponse (/forum/t/:slug).
  function bindReplyForm() {
    const form = document.getElementById('forum-reply-form');
    if (!form) return; // sujet verrouillé : pas de formulaire
    gateByAuth('#forum-reply-form', '.forum-login-invite');
    const msg = form.querySelector('.forum-form-msg');
    const topicId = form.getAttribute('data-topic-id');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!connected()) { showMsg(msg, 'Connectez-vous pour répondre.'); return; }
      const ta = document.getElementById('reply-body');
      const btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      showMsg(msg, '');
      try {
        const r = await postJson('/forum/t/' + encodeURIComponent(topicId) + '/reply',
          { body: (ta || {}).value || '' });
        if (r.status === 201) { window.location.reload(); return; }
        if (r.status === 401) showMsg(msg, 'Session expirée. Reconnectez-vous.');
        else if (r.status === 409) showMsg(msg, 'Ce sujet est verrouillé.');
        else showMsg(msg, r.data.error || 'Réponse impossible, réessayez.');
      } catch (err) {
        showMsg(msg, 'Erreur réseau, réessayez.');
      } finally { if (btn) btn.disabled = false; }
    });
  }

  // Boutons « Signaler » (délégation ; confirm() natif suffit — pas de modal custom).
  function bindReports() {
    document.addEventListener('click', async function (e) {
      const btn = e.target.closest('.forum-report');
      if (!btn) return;
      e.preventDefault();
      if (!connected()) { alert('Connectez-vous pour signaler un message.'); return; }
      if (!window.confirm('Signaler ce message à la modération ?')) return;
      btn.disabled = true;
      try {
        const r = await postJson('/forum/post/' + encodeURIComponent(btn.getAttribute('data-post-id')) + '/report', {});
        if (r.ok) {
          btn.classList.add('reported');
          btn.title = r.data && r.data.duplicate ? 'Déjà signalé' : 'Signalé, merci';
        } else {
          alert((r.data && r.data.error) || 'Signalement impossible.');
          btn.disabled = false;
        }
      } catch (err) { alert('Erreur réseau.'); btn.disabled = false; }
    });
  }

  function init() {
    bindCounters();
    bindCreateForm();
    bindReplyForm();
    bindReports();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
