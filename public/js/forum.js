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

  /* ---------- Combobox filtrable du tag source/deck (/forum/nouveau) ----------
     ~300 cibles : le <select> natif était impraticable au clavier. Le jeu de données
     arrive ENTIER en un appel (/api/forum/taggables) et ne bouge pas de la session →
     filtrage 100 % CLIENT, aucune requête par frappe. C'est la différence de fond avec
     le combobox `dynamic-enum` du kiosque (cards.js/site.js), qui interroge
     /api/param-lookup à chaque saisie : on lui emprunte son VOCABULAIRE ARIA et son
     clavier, pas son mécanisme. Ses handlers étant délégués sur `document` et liés aux
     classes .dyn-*, on utilise ici des classes .tag-* : partager les classes brancherait
     runDynLookup/selectDynOption sur ce formulaire, qui n'a ni carte ni lookup serveur.

     Normalisation de recherche : on réutilise LBACards.normalizeSearch quand elle est là.
     ⚠️ cards.js N'EST PAS chargé par le forumShell aujourd'hui (seul /u/:pseudo le
     demande via opts.scripts) — d'où le repli local ci-dessous, STRICTEMENT équivalent
     (minuscules + NFD sans diacritiques + non-alphanumériques → espace). Si cards.js est
     un jour ajouté à cette page pour une autre raison, la version partagée reprend la
     main automatiquement : ne pas laisser les deux diverger, corriger les DEUX ou
     supprimer le repli. */
  function normTag(str) {
    if (window.LBACards && LBACards.normalizeSearch) return LBACards.normalizeSearch(str);
    let s = String(str || '').toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.replace(/[^a-z0-9]+/g, ' ').replace(/^ | $/g, '');
  }

  // Modèle : suggestMatch() de decks.js — index et requête normalisés IDENTIQUEMENT,
  // sinon « geminides » ne trouverait pas « Géminides ». Le slug est indexé aussi :
  // on arrive souvent ici depuis un badge @slug.
  function tagMatch(it, q) {
    if (!q) return true;
    return normTag([it.name, it.forum_slug, it.id].join(' ')).indexOf(q) !== -1;
  }

  // Rebranché sur LBACombo (public/js/combo.js) le 14/08 : le vocabulaire ARIA/clavier,
  // le rendu de la listbox et la fermeture au clic extérieur vivent désormais dans la base
  // partagée avec l'autocomplétion de mention. NE RESTE ICI que ce qui est propre au
  // formulaire de création : le champ caché "source:<id>"/"deck:<id>" (contrat POST),
  // l'invalidation à la re-frappe, et le pré-remplissage ?source=/?deck=.
  function bindTagCombo(form) {
    const combo = document.getElementById('new-tag-combo');
    const input = document.getElementById('new-tag-search');
    const hidden = document.getElementById('new-tag');   // porte "source:<id>" / "deck:<id>"
    const listbox = document.getElementById('new-tag-listbox');
    const status = combo && combo.querySelector('.tag-status');
    if (!combo || !input || !hidden || !listbox || !window.LBACombo) return null;

    let items = [];        // [{ value:"type:id", label, name, forum_slug, id, group }]

    const cb = LBACombo.create({
      input: input, listbox: listbox, status: status, scope: combo,
      idPrefix: 'new-tag-listbox',
      items: function () { return items; },
      match: tagMatch,
      norm: normTag,
      groups: [{ key: 'source', label: 'Sources' }, { key: 'deck', label: 'Decks' }],
      emptyMsg: 'Aucune source ni deck ne correspond.',
      onArrowDownClosed: function () { cb.open(input.value); },
      // Commit : le champ visible affiche le libellé, le champ CACHÉ reçoit "type:id"
      // — exactement la valeur que produisait <option value>. Contrat POST intact.
      onCommit: function (it) {
        hidden.value = it.value;
        input.value = it.label;
        combo.setAttribute('data-selected', '1');
        cb.say('Sélection : ' + input.value);
      },
    });

    // Frappe : filtre, et INVALIDE toute sélection antérieure (le libellé affiché ne
    // garantit plus la valeur cachée → il faut re-choisir, sinon on posterait un tag
    // que l'utilisateur croit avoir remplacé).
    input.addEventListener('input', function () {
      if (combo.getAttribute('data-selected')) {
        combo.removeAttribute('data-selected');
        hidden.value = '';
      }
      cb.open(input.value);
    });

    // Champ vide au focus/clic → liste complète (le combobox reste explorable sans
    // rien taper, comme l'était le <select>).
    input.addEventListener('focus', function () {
      if (!combo.getAttribute('data-selected')) cb.open(input.value);
    });

    // Champ vidé à la main = aucun tag (le « — Aucun — » de l'ancien <select>).
    input.addEventListener('blur', function () {
      if (!input.value.trim()) { hidden.value = ''; combo.removeAttribute('data-selected'); }
    });

    return {
      fill: function (data, preSource, preDeck) {
        function add(list, type) {
          (list || []).forEach(function (it) {
            items.push({
              value: type + ':' + it.id,   // format INCHANGÉ (cf. submit ci-dessous)
              label: it.name, name: it.name, forum_slug: it.forum_slug, id: it.id, group: type,
            });
          });
        }
        add(data.sources, 'source');
        add(data.decks, 'deck');
        // Pré-remplissage ?source= / ?deck= : MÊME résolution qu'avant (slug OU id),
        // mais il n'y a plus d'<option selected> → on pose nous-mêmes le libellé dans
        // le champ visible ET la valeur dans le champ caché (sélection réelle, pas une
        // simple amorce de recherche : l'utilisateur arrive depuis la page de l'objet).
        const pre = items.find(function (it) {
          if (it.group === 'source' && preSource) return it.forum_slug === preSource || it.id === preSource;
          if (it.group === 'deck' && preDeck) return it.forum_slug === preDeck || it.id === preDeck;
          return false;
        });
        if (pre) {
          hidden.value = pre.value;
          input.value = pre.label;
          combo.setAttribute('data-selected', '1');
          cb.say('Sélection : ' + pre.label);
        }
      },
    };
  }

  /* ---------- Mentions @slug dans un textarea (sujet + réponse) ----------------
     Même base ARIA/clavier que le combobox de tag (LBACombo), mais la mécanique de
     SAISIE est différente : il n'y a pas de champ dédié ni de champ caché — on détecte
     un « @ » en cours de frappe DEVANT LE CURSEUR, on ouvre la liste sous le textarea,
     et le commit INSÈRE le slug à l'emplacement du caret.
     Ce qui est stocké est le texte brut « @slug » : les slugs (forum_slug, pseudo) sont
     STABLES par construction (jamais régénérés), la résolution se fait donc au RENDU
     côté serveur (linkifyMentions) — jamais un lien figé à la saisie. */

  // Fragment de mention en cours devant le curseur : « @ » précédé d'un début de ligne
  // ou d'un blanc (jamais au milieu d'un mot, ni dans une adresse email), suivi de
  // caractères de slug. Renvoie { start, query } ou null.
  function mentionAt(textarea) {
    const pos = textarea.selectionStart;
    if (pos !== textarea.selectionEnd) return null;      // sélection en cours → pas de suggestion
    const before = textarea.value.slice(0, pos);
    const m = before.match(/(^|\s)@([a-zA-Z0-9]{0,64})$/);
    if (!m) return null;
    return { start: pos - m[2].length - 1, query: m[2] };
  }

  function bindMentions(textarea, getItems) {
    if (!textarea || !window.LBACombo) return;
    // Coquille créée en JS (le textarea est server-rendu ; on l'enveloppe pour ancrer
    // la listbox en absolu, exactement comme .tag-combo du formulaire de tag).
    const wrap = document.createElement('div');
    wrap.className = 'tag-combo mention-combo';
    textarea.parentNode.insertBefore(wrap, textarea);
    wrap.appendChild(textarea);
    const listbox = document.createElement('ul');
    listbox.className = 'tag-listbox';
    listbox.id = 'mention-lb-' + (textarea.id || Math.random().toString(36).slice(2));
    listbox.setAttribute('role', 'listbox');
    listbox.setAttribute('aria-label', 'Mentions');
    listbox.hidden = true;
    const status = document.createElement('div');
    status.className = 'tag-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    wrap.appendChild(listbox);
    wrap.appendChild(status);
    // Le textarea DEVIENT le combobox (role sur l'élément qui a le focus, comme l'input
    // du combobox de tag) : aria-controls/expanded y sont posés par LBACombo.
    textarea.setAttribute('role', 'combobox');
    textarea.setAttribute('aria-expanded', 'false');
    textarea.setAttribute('aria-controls', listbox.id);
    textarea.setAttribute('aria-autocomplete', 'list');
    textarea.setAttribute('aria-haspopup', 'listbox');

    let frag = null;   // fragment courant { start, query }

    const cb = LBACombo.create({
      input: textarea, listbox: listbox, status: status, scope: wrap,
      idPrefix: listbox.id,
      items: getItems,
      match: function (it, q) { return !q || normTag(it.slug).indexOf(q) === 0 || tagMatch(it, q); },
      norm: normTag,
      groups: [
        { key: 'member', label: 'Membres' },
        { key: 'source', label: 'Sources' },
        { key: 'deck', label: 'Decks' },
      ],
      emptyMsg: 'Aucune mention ne correspond.',
      // Insertion à l'emplacement du caret : on remplace le fragment « @xxx » en cours
      // par « @slug » + une espace, et on repositionne le curseur juste après.
      onCommit: function (it) {
        if (!frag) return;
        const v = textarea.value;
        const insert = '@' + it.slug + ' ';
        textarea.value = v.slice(0, frag.start) + insert + v.slice(textarea.selectionStart);
        const caret = frag.start + insert.length;
        textarea.setSelectionRange(caret, caret);
        textarea.focus();
        frag = null;
        // Le compteur de caractères écoute `input` : la valeur a changé par script,
        // l'événement n'est pas émis tout seul.
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      },
    });

    function refresh() {
      frag = mentionAt(textarea);
      if (!frag) { cb.close(); return; }
      cb.open(frag.query);
    }
    textarea.addEventListener('input', refresh);
    textarea.addEventListener('click', refresh);   // déplacement du caret à la souris
    textarea.addEventListener('keyup', function (e) {
      // Flèches ← → ↑ ↓ : le caret bouge, le fragment courant change. ↑↓ sont déjà
      // interceptés par LBACombo quand la liste est ouverte (navigation d'options).
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') refresh();
    });
  }

  // Jeu de mentions, chargé UNE fois par page et partagé par tous les textareas
  // (création + réponse). Membres = uniquement ceux DÉJÀ publics (cf. l'endpoint).
  let mentionItems = [];
  let mentionLoaded = null;
  function loadMentionables() {
    if (mentionLoaded) return mentionLoaded;
    mentionLoaded = fetch('/api/forum/mentionables', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { members: [], sources: [], decks: [] }; })
      .then(function (d) {
        function add(list, group) {
          (list || []).forEach(function (it) {
            if (!it.slug) return;
            mentionItems.push({
              slug: it.slug, label: '@' + it.slug + ' · ' + it.name,
              name: it.name, forum_slug: it.slug, id: it.slug, group: group,
            });
          });
        }
        add(d.members, 'member');
        add(d.sources, 'source');
        add(d.decks, 'deck');
        return mentionItems;
      })
      .catch(function () { return mentionItems; });
    return mentionLoaded;
  }
  function bindMentionsOn(textarea) {
    if (!textarea) return;
    bindMentions(textarea, function () { return mentionItems; });
    loadMentionables();   // les items arrivent en tâche de fond ; la liste s'ouvre dès qu'ils sont là
  }

  // Formulaire de création d'un sujet (/forum/nouveau).
  async function bindCreateForm() {
    const form = document.getElementById('forum-create-form');
    if (!form) return;
    gateByAuth('#forum-create-form', '.forum-login-invite');

    // Tag source/deck : combobox filtrable alimenté par /api/forum/taggables (un seul
    // appel, filtrage client). tagSel reste #new-tag — devenu un input caché portant
    // la même valeur "type:id" qu'avant, donc le submit plus bas est inchangé.
    const tagSel = document.getElementById('new-tag');
    const preSource = form.getAttribute('data-pre-source') || '';
    const preDeck = form.getAttribute('data-pre-deck') || '';
    const combo = bindTagCombo(form);
    if (combo) {
      try {
        const res = await fetch('/api/forum/taggables', { headers: { Accept: 'application/json' } });
        const d = res.ok ? await res.json() : { sources: [], decks: [] };
        combo.fill(d, preSource, preDeck);
      } catch (e) { /* liste indisponible : le tag reste optionnel */ }
    }
    bindMentionsOn(document.getElementById('new-body'));

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
    bindMentionsOn(document.getElementById('reply-body'));
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
