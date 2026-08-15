/* combo.js — BASE PARTAGÉE des comboboxes filtrables du forum (vanilla, sans dépendance).
   Expose window.LBACombo.create(opts) → { open, close, isOpen, setItems, items }.

   POURQUOI CE FICHIER : le combobox du tag source/deck (/forum/nouveau) et l'autocomplétion
   de mention @slug dans les textareas partagent EXACTEMENT le même vocabulaire ARIA et le
   même clavier ; seuls diffèrent la source des données et ce qu'on fait de la sélection.
   Écrire un 2e combobox à côté aurait garanti la divergence à la première correction.

   CE QUI EST ICI (identique aux deux, déjà en prod depuis le combobox de tag) :
     · aria-expanded / aria-controls / aria-activedescendant sur l'input (role=combobox)
     · listbox role=listbox, options role=option + aria-selected, en-têtes role=presentation
     · ↓ ↑ (parcours), Entrée (commit), Échap (fermeture), clic sur option, clic extérieur
     · zone role=status aria-live="polite" annonçant le nombre de résultats
     · rendu par API DOM uniquement (jamais innerHTML : les libellés viennent de la base)

   CE QUI RESTE À L'APPELANT (paramètres) :
     · input, listbox, status : les éléments (déjà dans le DOM, server-rendus ou créés)
     · items()      : () => [{ label, group, ...libre }] — LISTE COMPLÈTE, déjà chargée.
                      Le filtrage est CLIENT (cf. match), aucun appel réseau par frappe.
     · match(it, q) : prédicat de filtre (q est déjà normalisé par le normaliseur fourni)
     · norm(str)    : normalisation (accents/casse) — partagée avec l'appelant
     · groups       : [{ key, label }] ordre et intitulé des en-têtes de groupe
     · onCommit(it) : QUE FAIRE de l'option choisie (champ caché, insertion au caret…)
     · emptyMsg     : message aria-live quand rien ne correspond
     · idPrefix     : préfixe des id d'options (aria-activedescendant)
     · scope        : élément dont un clic extérieur ferme la liste

   Les classes CSS restent .tag-listbox/.tag-option/.tag-group : DÉLIBÉRÉMENT distinctes
   des .dyn-* du kiosque, dont les handlers sont délégués sur `document` (cf. site.js). */

(function () {
  'use strict';

  function create(opts) {
    var input = opts.input;
    var listbox = opts.listbox;
    var status = opts.status || null;
    var groups = opts.groups || [];
    var idPrefix = opts.idPrefix || 'combo';
    var scope = opts.scope || null;
    var options = [];   // <li role=option> actuellement rendus (en-têtes exclus)

    if (!input || !listbox) return null;

    function say(msg) { if (status) status.textContent = msg || ''; }

    function close() {
      listbox.hidden = true;
      listbox.innerHTML = '';
      options = [];
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    function isOpen() { return input.getAttribute('aria-expanded') === 'true'; }

    // aria-activedescendant + défilement : le lecteur d'écran annonce l'option courante
    // sans que le focus quitte l'input.
    function setActive(li) {
      options.forEach(function (o) { o.classList.remove('active'); o.setAttribute('aria-selected', 'false'); });
      if (li) {
        li.classList.add('active');
        li.setAttribute('aria-selected', 'true');
        input.setAttribute('aria-activedescendant', li.id);
        if (li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    function commit(li) {
      if (!li) return;
      var it = li._item;
      close();
      if (opts.onCommit) opts.onCommit(it, li);
    }

    // q est BRUT ici : on le normalise via le normaliseur de l'appelant, pour que
    // l'index et la requête subissent le même traitement (« gemin » trouve « Géminides »).
    function open(rawQuery) {
      var q = opts.norm ? opts.norm(rawQuery || '') : String(rawQuery || '').toLowerCase();
      var all = (opts.items ? opts.items() : []) || [];
      listbox.innerHTML = '';
      options = [];
      var n = 0;
      var list = groups.length ? groups : [{ key: null, label: null }];
      list.forEach(function (g) {
        var sel = all.filter(function (it) {
          var inGroup = (g.key == null) || it.group === g.key;
          return inGroup && (!opts.match || opts.match(it, q));
        });
        if (!sel.length) return;
        if (g.label) {
          var head = document.createElement('li');
          head.className = 'tag-group';
          head.setAttribute('role', 'presentation'); // en-tête NON sélectionnable
          head.textContent = g.label;
          listbox.appendChild(head);
        }
        sel.forEach(function (it) {
          var li = document.createElement('li');
          li.className = 'tag-option';
          li.setAttribute('role', 'option');
          li.setAttribute('aria-selected', 'false');
          li.id = idPrefix + '-opt-' + (n++);
          li.textContent = it.label;
          li._item = it;                   // référence directe : pas de re-résolution par data-*
          listbox.appendChild(li);
          options.push(li);
        });
      });
      if (!options.length) {
        close();
        say(opts.emptyMsg || 'Aucun résultat.');
        return;
      }
      listbox.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      setActive(null);
      say(options.length + (options.length > 1 ? ' résultats, flèches pour choisir.' : ' résultat.'));
    }

    input.addEventListener('keydown', function (e) {
      var current = listbox.querySelector('.tag-option.active');
      var idx = current ? options.indexOf(current) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen()) { if (opts.onArrowDownClosed) opts.onArrowDownClosed(); return; }
        if (options.length) setActive(options[Math.min(idx + 1, options.length - 1)]);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (options.length) setActive(options[Math.max(idx - 1, 0)]);
      } else if (e.key === 'Enter') {
        // Entrée sur une option = sélection, JAMAIS soumission du formulaire.
        if (current) { e.preventDefault(); commit(current); }
      } else if (e.key === 'Escape') {
        if (isOpen()) { e.preventDefault(); close(); }
      }
    });

    listbox.addEventListener('click', function (e) {
      var li = e.target.closest('.tag-option');
      if (li) { e.preventDefault(); commit(li); }
    });

    // Clic hors du composant → fermeture. `scope` borne la délégation à CE combobox.
    document.addEventListener('click', function (e) {
      if (!scope) return;
      if (!scope.contains(e.target)) close();
    });

    return { open: open, close: close, isOpen: isOpen, say: say };
  }

  window.LBACombo = { create: create };
})();
