/* user-task-form.js — V3 · modale de création d'une tâche à échéance glissante.
   Réutilise le gabarit de modale de share.js (.share-modal-backdrop/.share-modal-card) :
   même overlay, même carte, même fermeture (croix, clic sur le fond, Échap), même
   focus initial. Aucun nouveau composant, aucune feuille de style parallèle.
   Mode 'time' UNIQUEMENT : le mode 'counter' n'a pas d'UI de relevé à ce stade
   (le serveur fixe tracking_mode='time', le client ne le transmet jamais). */
(function () {
  'use strict';

  var backdrop = null, escHandler = null;

  function esc(s) { return window.LBACards ? LBACards.esc(s) : String(s == null ? '' : s); }

  // Suggestions = LIBELLÉS SEULS. Elles ne pré-remplissent QUE le champ texte.
  // Elles ne portent AUCUNE durée : la périodicité d'un contrôle technique, d'une
  // vidange ou d'un détartrage dépend du véhicule, du modèle, de l'usage et de la
  // réglementation en vigueur — on ne l'invente pas, l'utilisateur la saisit.
  var SUGGESTIONS = ['Contrôle technique', 'Vidange', 'Détartrage chaudière', 'Vaccin animal'];

  var UNITS = [
    { v: 'day', l: 'jour(s)' }, { v: 'week', l: 'semaine(s)' },
    // 'mois' présélectionné : unité de loin la plus courante pour ce type de tâche.
    // C'est un défaut d'UNITÉ, jamais de DURÉE — le nombre reste vide et obligatoire.
    { v: 'month', l: 'mois', sel: true }, { v: 'year', l: 'an(s)' }
  ];

  function close() {
    if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
    if (backdrop) { backdrop.remove(); backdrop = null; }
  }

  function formHTML() {
    var sugg = SUGGESTIONS.map(function (s) {
      return '<button type="button" class="utf-sugg">' + esc(s) + '</button>';
    }).join('');
    var units = UNITS.map(function (u) {
      return '<option value="' + u.v + '"' + (u.sel ? ' selected' : '') + '>' + u.l + '</option>';
    }).join('');
    return '' +
      '<button type="button" class="share-modal-close" aria-label="Fermer">✕</button>' +
      '<div class="share-modal-title">Créer ma tâche</div>' +
      '<form class="utf-form" novalidate>' +
        '<label class="utf-field"><span class="utf-lbl">Libellé</span>' +
          '<div class="utf-suggs">' + sugg + '</div>' +
          '<input type="text" class="utf-label" maxlength="80" required ' +
            'placeholder="Ex. Vidange voiture" autocomplete="off">' +
        '</label>' +
        '<label class="utf-field"><span class="utf-lbl">Dernière réalisation</span>' +
          '<input type="date" class="utf-anchor" required>' +
        '</label>' +
        '<fieldset class="utf-field utf-period">' +
          '<legend class="utf-lbl">Tous les…</legend>' +
          '<input type="number" class="utf-value" min="1" step="1" required ' +
            'inputmode="numeric" placeholder="ex : 6" aria-label="Nombre">' +
          '<select class="utf-unit" required aria-label="Unité">' +
            units +
          '</select>' +
        '</fieldset>' +
        '<label class="utf-field"><span class="utf-lbl">Préavis (facultatif)</span>' +
          '<input type="number" class="utf-announce" min="0" step="1" value="7" inputmode="numeric">' +
          '<span class="utf-hint">Nombre de jours avant l\'échéance pour être prévenu.</span>' +
        '</label>' +
        '<div class="utf-error" role="alert" hidden></div>' +
        '<button type="submit" class="utf-submit">Créer la tâche</button>' +
      '</form>';
  }

  function open(card) {
    close(); // un seul à la fois
    backdrop = document.createElement('div');
    backdrop.className = 'share-modal-backdrop';
    var box = document.createElement('div');
    box.className = 'share-modal-card utf-card';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Créer ma tâche');
    box.innerHTML = formHTML();
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    // Le sélecteur de date ne propose jamais une date future : une « dernière
    // réalisation » à venir n'a pas de sens (le serveur la refuse également).
    var anchor = box.querySelector('.utf-anchor');
    anchor.max = new Date().toISOString().slice(0, 10);
    // Date pré-remplie à AUJOURD'HUI : défaut ergonomique neutre (on crée sa tâche
    // le jour où on vient de la faire), librement modifiable, jamais dans le futur.
    // À ne pas confondre avec une périodicité : le NOMBRE de la période reste vide,
    // aucune durée n'est jamais devinée (règle anti-hallucination de la brique).
    anchor.value = anchor.max;

    box.querySelector('.share-modal-close').addEventListener('click', close);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    escHandler = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escHandler);

    // Suggestion → remplit UNIQUEMENT le libellé, jamais la périodicité.
    box.querySelectorAll('.utf-sugg').forEach(function (b) {
      b.addEventListener('click', function () {
        var input = box.querySelector('.utf-label');
        input.value = b.textContent; input.focus();
      });
    });

    box.querySelector('.utf-form').addEventListener('submit', function (e) {
      e.preventDefault(); submit(box, card);
    });
    box.querySelector('.utf-label').focus();
  }

  function showError(box, msg) {
    var el = box.querySelector('.utf-error');
    el.textContent = msg; el.hidden = false;
  }

  async function submit(box, card) {
    var btn = box.querySelector('.utf-submit');
    box.querySelector('.utf-error').hidden = true;
    var announceRaw = box.querySelector('.utf-announce').value;
    // Garde-fou client : le <form> porte novalidate, donc `required` ne bloque PAS
    // la soumission. Sans ce test, un champ vide partirait en NaN → null → 400. Le
    // serveur le rejetterait correctement, mais autant le dire tout de suite et sans
    // aller-retour réseau. Le placeholder « ex : 6 » n'est JAMAIS une valeur.
    var rawValue = box.querySelector('.utf-value').value.trim();
    if (rawValue === '') return showError(box, 'Indiquez la périodicité (par exemple 6 mois).');
    var payload = {
      token: LBASession.get(),
      label: box.querySelector('.utf-label').value,
      anchor_date: box.querySelector('.utf-anchor').value,
      periodicity_value: parseInt(rawValue, 10),
      periodicity_unit: box.querySelector('.utf-unit').value,
      announce_days: announceRaw === '' ? null : parseInt(announceRaw, 10)
    };
    btn.disabled = true;
    try {
      var res = await fetch('/api/user-tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function () { return null; });
      // Message serveur affiché tel quel : les validateurs renvoient du français
      // lisible (ugc.validateTaskLabel & co), jamais du JSON brut ni une erreur PG.
      if (!res.ok) return showError(box, (data && data.error) || 'Création impossible pour le moment.');
      appendTask(card, data.task);
      close();
    } catch (e2) {
      showError(box, 'Réseau indisponible. Réessayez dans un instant.');
    } finally {
      btn.disabled = false;
    }
  }

  // Rafraîchit le verso SANS reload : la nouvelle tâche est injectée dans la zone
  // existante, juste avant le bouton de création (qui devient « + une autre »).
  function appendTask(card, task) {
    if (!card || !task) return;
    var zone = card.querySelector('.card-back .task-zone');
    if (!zone) return;
    var due = task.next_due
      ? new Date(task.next_due).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;
    var item = document.createElement('div');
    item.className = 'task-item';
    item.setAttribute('data-task-id', task.id);
    item.innerHTML =
      '<div class="task-label">' + esc(task.label) + '</div>' +
      '<div class="task-due">' + (due ? 'Échéance : ' + esc(due) : 'Échéance non calculée') + '</div>' +
      '<button type="button" class="task-done" aria-label="Marquer « ' + esc(task.label) +
        ' » comme fait">C\'est fait ✓</button>';
    var create = zone.querySelector('.task-create');
    zone.insertBefore(item, create || null);
    if (create) { create.textContent = '+ une autre tâche'; create.classList.add('secondary'); }
    card.dataset.subscribed = '1'; // une tâche vaut adoption (cf. myalerts.js)
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('button.task-create');
    if (!btn) return;                        // le <a> anonyme suit son href normalement
    if (btn.closest('.deck-card')) return;   // aperçus de deck : non interactifs
    e.preventDefault();
    open(btn.closest('.card'));
  });

  window.LBATaskForm = { open: open, close: close };
})();
