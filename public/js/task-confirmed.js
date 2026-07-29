/* task-confirmed.js — chargé UNIQUEMENT par la page de succès de
   GET /tache/:id/confirmer/:token (server/routes/user-tasks.js).

   Rôle : si le navigateur qui a cliqué le lien email porte une session, renvoyer
   vers le kiosque pour y ouvrir la carte et rejouer l'animation de confirmation,
   au lieu de laisser l'utilisateur sur une page morte.

   Amélioration progressive : la page qui charge ce script EST déjà la réponse
   complète et correcte. Sans session, sans JS, ou si quoi que ce soit échoue ici,
   elle reste affichée telle quelle — rien n'en dépend.

   L'id de la tâche est lu dans l'URL (pas d'interpolation serveur : la CSP du site
   interdit les scripts inline, donc aucune donnée ne peut être injectée ici).
   Le token n'est jamais propagé : location.replace le sort aussi de l'historique. */
(function () {
  'use strict';
  try {
    var m = /^\/tache\/(\d+)\/confirmer\//.exec(window.location.pathname);
    if (!m) return;
    if (!localStorage.getItem('lba-token')) return; // anonyme : on reste sur la page
    window.location.replace('/?task-confirmed=' + m[1]);
  } catch (e) { /* localStorage bloqué (mode privé strict) : on reste sur la page */ }
})();
