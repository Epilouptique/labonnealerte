/* view-mode.js — SOURCE DE VÉRITÉ unique du mode d'affichage du kiosque :
   'cards' (défaut, #grid) ou 'list' (#list, vue dense).

   Persistance :
     · Anonyme       → localStorage 'lba-view' uniquement (comme le thème).
     · Connecté      → colonne subscribers.view_mode (POST /api/my-alerts/view-mode)
                       + cache localStorage pour un affichage immédiat au rechargement.
       La valeur du COMPTE prime : site.js appelle adoptAccount(view_mode) une fois
       /api/my-alerts reçu, ce qui écrase l'affichage initial issu du localStorage.

   Le toggle de la toolbar ET le contrôle « Apparence » de Mon compte passent tous
   les deux par set() → un seul état, jamais deux qui divergent. Tout changement émet
   l'événement 'lba-view-change' (écouté par list-view.js et appearance.js). */

(function () {
  'use strict';

  var KEY = 'lba-view';
  var root = document.documentElement;

  function valid(m) { return m === 'cards' || m === 'list'; }
  function stored() { try { var v = localStorage.getItem(KEY); return valid(v) ? v : null; } catch (e) { return null; } }
  function connected() { return !!(window.LBASession && LBASession.get && LBASession.get()); }

  // Applique l'attribut le PLUS TÔT possible (avant même le DOM complet) pour éviter
  // tout flash de la mauvaise vue : défaut 'cards' si rien de stocké.
  var current = stored() || 'cards';
  root.setAttribute('data-view', current);

  function emit() {
    try { document.dispatchEvent(new CustomEvent('lba-view-change', { detail: { mode: current } })); }
    catch (e) { /* CustomEvent absent : les contrôles se resynchronisent au clic */ }
  }

  // Persiste côté compte (best-effort, non bloquant) ; le localStorage sert de cache.
  function persist(mode) {
    try { localStorage.setItem(KEY, mode); } catch (e) {}
    var tok = connected() ? LBASession.get() : null;
    if (!tok) return;
    fetch('/api/my-alerts/view-mode', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tok, view_mode: mode })
    }).catch(function () { /* réseau : le cache local garde la valeur, resync au prochain /my-alerts */ });
  }

  function apply(mode) {
    if (!valid(mode)) return;
    current = mode;
    root.setAttribute('data-view', mode);
    emit();
  }

  // Changement explicite par l'utilisateur (toggle toolbar OU contrôle compte) : applique + persiste.
  function set(mode) {
    if (!valid(mode) || mode === current) { if (mode === current) emit(); return; }
    apply(mode);
    persist(mode);
  }

  function toggle() { set(current === 'list' ? 'cards' : 'list'); }

  // Appelé par site.js quand /api/my-alerts est connu : la préférence de COMPTE prime
  // sur l'affichage initial (localStorage). N'écrit PAS côté serveur (c'est déjà la
  // valeur serveur) ; met juste à jour l'affichage + le cache local + notifie.
  function adoptAccount(mode) {
    if (!valid(mode)) return;
    try { localStorage.setItem(KEY, mode); } catch (e) {}
    if (mode !== current) apply(mode);
  }

  // Bouton de bascule dans la toolbar (libellé/icône reflètent la CIBLE du clic).
  function bindToolbarButton() {
    var btn = document.getElementById('view-toggle');
    if (!btn) return;
    function paint() {
      var toList = current === 'cards';
      btn.setAttribute('aria-pressed', current === 'list' ? 'true' : 'false');
      btn.setAttribute('title', toList ? 'Vue liste' : 'Vue cartes');
      btn.setAttribute('aria-label', toList ? 'Passer en vue liste' : 'Passer en vue cartes');
      btn.classList.toggle('is-list', current === 'list');
    }
    btn.addEventListener('click', toggle);
    document.addEventListener('lba-view-change', paint);
    paint();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindToolbarButton);
  else bindToolbarButton();

  window.LBAViewMode = { get: function () { return current; }, set: set, toggle: toggle, adoptAccount: adoptAccount };
})();
