/* cards.js — rendu partagé des cartes du kiosque (recto/verso).
   RECTO : grand public (titre, sous-titre, description, état, switch/lien).
   VERSO : dev/curieux (même en-tête, tags cliquables, auteur, lien proposer).
   Le switch est présent dans les DEUX modes. Les 'linked' gardent leur lien.
   Labels de catégories via window.LBACat. Expose window.LBACards. */

(function () {
  'use strict';

  // Libellés affichés des badges (les valeurs DB et les classes CSS ne changent pas).
  var BADGE_LABEL = { official: 'vérifié', verified: 'vérifié', community: 'communauté' };

  function catLabel(slug) {
    return (window.LBACat && window.LBACat.label) ? window.LBACat.label(slug) : slug;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var BADGE_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M8.4 12.4l2.3 2.3 4.9-4.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Classe normalisee du badge (official/verified/community), reutilisee par la
  // pastille-mana neutre de card-icons (skin L'Assemblee).
  function badgeClassOf(badge) {
    var b = (badge || 'community').toLowerCase();
    return (b === 'official' || b === 'verified') ? b : 'community';
  }

  // Badge = icône compacte (coche cerclée). official/verified → accent ; community → muted.
  function badgeFor(badge) {
    var b = (badge || 'community').toLowerCase();
    if (b !== 'official' && b !== 'verified' && b !== 'community') b = 'community';
    var title = (b === 'community') ? 'Source communautaire' : 'Source vérifiée';
    return '<span class="badge-ic ' + b + '" title="' + title + '" role="img" aria-label="' + title + '">' + BADGE_ICON + '</span>';
  }

  function stateFor(state) {
    if (state === 'active') {
      return '<div class="state active"><span class="dot-live"></span> Active</div>';
    }
    return '<div class="state idle"><span class="dot-idle"></span> Rien à signaler</div>';
  }

  function domainOf(url) {
    var s = String(url || '').replace(/^https?:\/\//, '').replace(/^www\./, '');
    return s.split('/')[0];
  }

  // En-tête commun recto/verso : titre + badge.
  function topRow(s) {
    // .card-seal x2 : marques generiques (display:none par defaut) reutilisees par les
    // skins structures (sceaux de cout de l'Assemblee, sceau « ! » de l'Ecole, index
    // d'angle de l'Arcane). Aucun effet sur le rendu par defaut (hors flux).
    return '<div class="card-top"><h3>' + esc(s.name) + '</h3>' + badgeFor(s.badge) +
      '<span class="card-seal" aria-hidden="true"></span>' +
      '<span class="card-seal" aria-hidden="true"></span></div>';
  }

  function switchRow(on) {
    return '' +
      '<label class="switch-row">' +
        '<span class="switch">' +
          '<input type="checkbox"' + (on ? ' checked' : '') + ' aria-label="Basculer l\'abonnement">' +
          '<span class="track"></span><span class="thumb"></span>' +
        '</span>' +
        '<span class="switch-label' + (on ? ' on' : '') + '">' + (on ? 'Abonné' : 'Non abonné') + '</span>' +
      '</label>';
  }

  function subForm() {
    return '<div class="sub-form"><input type="email" placeholder="votre@email.fr" aria-label="Adresse email">' +
      '<button type="button">OK</button></div>';
  }

  var SHARE_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';

  // Flèche « retour » (identique au rendu PC de « ↩ ») : rendu cohérent sur tous
  // les OS/navigateurs (iOS/Firefox tombaient sur un glyphe système, Android/Chrome
  // l'écrasait). Taille pilotée par le CSS (.flip-back svg / .src-back svg).
  var BACK_SVG = '<svg class="ic-back" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v3"/></svg>';

  // Icône « i dans un cercle » (recto, bouton « En savoir plus ») : même style que
  // SHARE_SVG/BACK_SVG (trait 2px, linecap round, 18×18, currentColor). Remplace le
  // caractère « ⓘ » au rendu incohérent selon les OS. Taille pilotée par .flip-btn svg.
  var INFO_SVG = '<svg class="ic-info" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.6v.01"/></svg>';

  // Icône « + » (recto) : « Ajouter à un deck ». Même famille que INFO_SVG/SHARE_SVG
  // (trait 2px, linecap round, 18×18, currentColor). Placée juste à gauche du « i ».
  var PLUS_SVG = '<svg class="ic-plus" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';

  // A1) Cœur « j'aime » : contour (non aimé) ; le CSS le remplit quand .liked.
  var LIKE_SVG = '<svg class="ic-like" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.3l-1.45-1.32C5.4 14.36 2.5 11.7 2.5 8.5 2.5 6.08 4.42 4.2 6.8 4.2c1.36 0 2.66.63 3.5 1.64l.7.85.7-.85C12.54 4.83 13.84 4.2 15.2 4.2c2.38 0 4.3 1.88 4.3 4.3 0 3.2-2.9 5.86-8.05 10.48z"/></svg>';

  // Motif de fond « full-art » (disposition A). UN SEUL motif générique pour toutes les
  // cartes pour l'instant (cercles concentriques + point vert + ligne sismique + points
  // épars), repris du modèle de référence. Couleurs pilotées par le CSS (currentColor +
  // classes .tc-*) → suivent le thème jour/nuit. Bloc ISOLÉ et facilement remplaçable :
  // la substitution future par catégorie n'aura qu'à faire varier ce SVG (ou son injection).
  var FULLART_SVG = '<span class="fullart" aria-hidden="true">' +
    '<svg viewBox="0 0 280 420" fill="none" stroke="currentColor" stroke-linecap="round" preserveAspectRatio="xMidYMid slice">' +
      // fa-c1..fa-c4 (cercles) + fa-dot (point) = cibles de l'animation « radar calme »
      // de l'état actif (voir CSS, bloc disposition A). La ligne sismique et les points
      // épars ne portent pas ces classes → ils ne bougent jamais.
      '<g class="tc-rings">' +
        '<circle class="fa-c1" cx="140" cy="128" r="34" stroke-width="2"/>' +
        '<circle class="fa-c2" cx="140" cy="128" r="64" stroke-width="1.6" opacity=".6"/>' +
        '<circle class="fa-c3" cx="140" cy="128" r="98" stroke-width="1.4" opacity=".35"/>' +
        '<circle class="fa-c4" cx="140" cy="128" r="136" stroke-width="1.2" opacity=".2"/>' +
      '</g>' +
      '<circle class="tc-dot fa-dot" cx="140" cy="128" r="8" stroke="none"/>' +
      '<path class="tc-line" d="M-10 296 L70 232 L120 268 L180 216 L236 264 L300 226" stroke-width="4"/>' +
      '<g class="tc-stars" stroke="none" fill="currentColor">' +
        '<circle cx="52" cy="58" r="1.8"/><circle cx="228" cy="42" r="1.5"/>' +
        '<circle cx="200" cy="90" r="1.3"/><circle cx="60" cy="176" r="1.4"/>' +
      '</g>' +
    '</svg></span>';

  // Format compact du compteur de likes : 1240 → « 1,2 k », 12000 → « 12 k ».
  function formatCount(n) {
    n = Number(n) || 0;
    if (n < 1000) return String(n);
    var v = n / 1000;
    var s = (v >= 10 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, ''));
    return s.replace('.', ',') + ' k';
  }

  // Bouton like (recto). Non aimé au rendu ; site.js marque .liked depuis localStorage.
  function likeBtn(s) {
    var n = Number(s.likes_count) || 0;
    return '<button class="like-btn card-like" type="button" aria-pressed="false"' +
      ' aria-label="J\'aime cette alerte" data-likes="' + n + '">' +
      LIKE_SVG + '<span class="like-n">' + formatCount(n) + '</span></button>';
  }

  // Source paramétrée (OpenAlert v2) : schéma plat à au moins un paramètre.
  function isParam(s) { return Array.isArray(s.params_schema) && s.params_schema.length > 0; }

  // V3 · carte « tâche à échéance glissante » : elle n'a ni veille, ni abonnement
  // broadcast. Sa souscription EST la création d'une tâche, qui se fait au VERSO
  // (taskFace). Le recto ne doit donc porter aucun contrôle d'abonnement.
  function isUserTask(s) { return s.type === 'user-task'; }

  // Carte COMMUNAUTAIRE (ex. « Chat perdu ») : ligne virtuelle de catalogue, jamais
  // d'état propre (pas de source_states). Son recto n'est PAS le picker générique
  // (paramFace/paramControl, pensé pour un filtre par abonné) : la commune saisie
  // détermine côté serveur (POST /api/community-reports) si on CRÉE une instance
  // (1re pour cette commune → description/lien requis) ou si on REJOINT une
  // instance existante (serveur seul juge — le client n'a pas de pré-check dédié,
  // les champs Description/Lien restent donc toujours visibles ; s'ils sont
  // inutiles côté serveur — instance déjà existante — ils sont simplement ignorés).
  function isCommunity(s) { return s.type === 'community'; }

  // Séquence d'ids uniques pour les listbox des combobox dynamic-enum (aria-controls).
  var dynSeq = 0;

  // Bloc d'abonnement paramétré : instances suivies (mode connecté) + sélecteur
  // générique construit depuis le schéma enum. Aucun code spécifique vigilance.
  // Contrôle de saisie générique selon le type du paramètre : enum → select,
  // string/number → input (avec placeholder/pattern éventuels).
  function paramControl(schema, def) {
    if (schema.type === 'dynamic-enum') {
      // COMBOBOX autocomplete générique (un seul champ visuel). Aucun code spécifique à une
      // source : la recherche passe par /api/param-lookup/<slug> (câblage dans site.js).
      //  · .dyn-search  = champ visible (role=combobox), NON collecté. Affiche le libellé après
      //                   sélection ; le modifier invalide la sélection (retour en recherche).
      //  · .dyn-value   = input caché (.param-input, porte data-key) → SEULE valeur soumise =
      //                   l'URL de l'option choisie (contrat serveur inchangé). pattern honoré
      //                   par readParam (validation de format côté client).
      //  · .dyn-listbox = liste ARIA des propositions ; .dyn-status = zone aria-live.
      // Pré-remplissage profil (B) : `def` = ville du profil → amorce la RECHERCHE (jamais une
      // pré-sélection), marquée data-dyn-prefill pour déclenchement au montage (site.js).
      var ph = schema.placeholder ? ' placeholder="' + esc(schema.placeholder) + '"' : '';
      var pat = schema.pattern ? ' pattern="' + esc(schema.pattern) + '"' : '';
      var lbId = 'dynlb-' + esc(schema.key) + '-' + (dynSeq++);
      var pre = (def != null && String(def)) ? String(def) : '';
      var preAttr = pre ? ' value="' + esc(pre) + '" data-dyn-prefill="1"' : '';
      return '<div class="dyn-enum">' +
        '<input type="text" class="dyn-search" role="combobox" aria-expanded="false"' +
          ' aria-controls="' + lbId + '" aria-autocomplete="list" aria-haspopup="listbox"' +
          preAttr + ph + ' aria-label="' + esc(schema.label) + '"' +
          ' autocomplete="off" autocapitalize="off" spellcheck="false">' +
        '<input type="hidden" class="param-input dyn-value" data-key="' + esc(schema.key) + '"' + pat + '>' +
        '<ul class="dyn-listbox" id="' + lbId + '" role="listbox" aria-label="' + esc(schema.label) + '" hidden></ul>' +
        '<div class="dyn-status" role="status" aria-live="polite"></div>' +
      '</div>';
    }
    if (schema.type === 'enum') {
      // Pré-remplissage : si le profil fournit une valeur VALIDE du schéma, on la
      // pré-sélectionne. Pré-sélectionner via l'attribut `selected` NE déclenche AUCUN
      // « change » → aucune activation (l'abonnement passe par le switch S'abonner). Sinon
      // placeholder « Choisir… ». L'activation ne dépend plus du change (voir site.js).
      var values = schema.values || [];
      var hasDef = def != null && values.some(function (v) { return String(v.value) === String(def); });
      var opts = '<option value="" disabled' + (hasDef ? '' : ' selected') +
        '>Choisir ' + esc((schema.label || '').toLowerCase()) + '…</option>';
      opts += values.map(function (v) {
        var sel = (hasDef && String(v.value) === String(def)) ? ' selected' : '';
        return '<option value="' + esc(v.value) + '"' + sel + '>' + esc(v.label) + '</option>';
      }).join('');
      // data-optional : un champ facultatif laissé vide ne doit pas invalider tout le
      // formulaire (cf. readParam dans site.js) — il est simplement omis, et le serveur
      // applique son défaut.
      var optAttr = schema.required === false ? ' data-optional="1"' : '';
      return '<select class="param-select" data-key="' + esc(schema.key) + '"' + optAttr + ' aria-label="' + esc(schema.label) + '">' + opts + '</select>';
    }
    var type = schema.type === 'number' ? 'number' : 'text';
    var ph = schema.placeholder ? ' placeholder="' + esc(schema.placeholder) + '"' : '';
    var pat = schema.pattern ? ' pattern="' + esc(schema.pattern) + '"' : '';
    var val = def != null ? ' value="' + esc(def) + '"' : '';
    var optIn = schema.required === false ? ' data-optional="1"' : '';
    return '<input class="param-input" type="' + type + '" data-key="' + esc(schema.key) + '"' +
      ph + pat + val + optIn + ' aria-label="' + esc(schema.label) + '">';
  }

  // Switch « S'abonner » (OFF), présent dès le 1er rendu sur TOUTE carte paramétrée.
  //  · GÉO (param-follow-geo) : cliquable → l'abonnement part au clic explicite (site.js).
  //  · NON-GÉO (param-follow-auto) : DISABLED tant que non abonné → un clic sur du vide
  //    n'active rien ; l'abonnement part automatiquement à la saisie/au choix d'une valeur
  //    (site.js), puis l'interrupteur pause/reprise prend le relais. Le switch non-géo est
  //    donc un repère visuel cohérent, pas une action sur du vide.
  //  · hidden : quand la carte est DÉJÀ abonnée (≥1 instance), le switch du picker est
  //    masqué → on ne le voit pas réapparaître inline à côté des chips lors d'un
  //    « + ajouter » (il ferait doublon avec l'interrupteur pause/reprise du bas). Dans ce
  //    cas, l'ajout d'une instance supplémentaire passe par l'activation automatique au
  //    change/saisie (site.js), sûre car on choisit forcément une NOUVELLE valeur.
  function followSwitch(isGeo, hidden) {
    var cls = isGeo ? 'param-follow-cb param-follow-geo' : 'param-follow-cb param-follow-auto';
    var dis = isGeo ? '' : ' disabled';
    return '<label class="switch-row param-follow-row"' + (hidden ? ' hidden' : '') + '>' +
        '<span class="switch"><input type="checkbox" class="' + cls + '"' + dis + ' aria-label="S\'abonner">' +
          '<span class="track"></span><span class="thumb"></span></span>' +
        '<span class="switch-label">S\'abonner</span>' +
      '</label>';
  }

  // Clés de schéma « géographiques » : seules ces cartes ont le comportement switch OFF +
  // pré-remplissage profil. Les autres (carburant, releases, vigieau…) gardent l'activation
  // immédiate au choix/saisie.
  var GEO_KEYS = { departement: 1, region: 1, pays: 1, ville: 1 };
  // Le type 'commune' (vague ville) est géo : switch cliquable + pré-remplissage profil.
  function isGeoSchema(schema) { return !!(schema && (GEO_KEYS[schema.key] || schema.type === 'commune')); }

  // Sous-formulaire « Chat perdu » (et famille communautaire à venir) : commune +
  // description + lien facultatif, soumis en un seul POST /api/community-reports
  // (câblage dans site.js, .community-submit). REFONTE : ne vit plus en permanence
  // sur le recto — déplacé dans la 5e face (communityReportsFace, ci-dessous),
  // masqué par défaut (hidden), révélé par le bouton « Signaler une disparition »
  // (.community-report-toggle, site.js). Appelé uniquement en mode connecté (la
  // 5e face elle-même ne se rend pas sinon), donc pas de variante anonyme ici.
  function communityFace(s) {
    var field = (Array.isArray(s.params_schema) && s.params_schema[0]) || {};
    var ph = esc(field.placeholder || 'Votre commune');
    return '<div class="param-row community-form" hidden>' +
        '<input type="text" class="community-ville" placeholder="' + ph + '" aria-label="Commune" autocomplete="off">' +
        '<textarea class="community-desc" placeholder="Décrivez la situation (si vous êtes le/la premier·ère à signaler pour cette commune)" aria-label="Description" rows="2"></textarea>' +
        '<input type="url" class="community-link" placeholder="Lien (facultatif, ex. i-cad.fr)" aria-label="Lien">' +
        '<select class="community-radius" aria-label="Rayon de visibilité si vous créez le signalement">' +
          '<option value="10">Visible à 10 km</option>' +
          '<option value="15" selected>Visible à 15 km</option>' +
          '<option value="20">Visible à 20 km</option>' +
          '<option value="30">Visible à 30 km</option>' +
          '<option value="50">Visible à 50 km</option>' +
        '</select>' +
        '<button type="button" class="community-submit">Envoyer le signalement</button>' +
      '</div>';
  }

  // dueFr(d) réutilisée telle quelle (déjà définie plus bas pour taskItem, function
  // déclarée → hissée, donc visible ici aussi) : même vocabulaire d'échéance, aucune
  // 2e fonction de formatage de date.

  // Une ligne de la liste « Signalements en cours » (5e face). Réutilise les classes
  // .task-item/.task-label/.task-due de 'user-task' (même vocabulaire visuel). Pas de
  // croix de suppression (contrairement à une tâche personnelle) : un signalement
  // n'appartient pas au lecteur, seul l'auteur peut le clôturer (hors périmètre ici).
  function communityReportItem(r) {
    var due = dueFr(r.expires_at);
    var action = r.spotted
      ? '<span class="community-spotted-tag">Déjà signalé ✓</span>'
      : '<button type="button" class="community-spot" aria-label="Signaler avoir vu ce chat à ' + esc(r.commune_nom) + '">Je l\'ai vu</button>';
    return '<div class="task-item community-item" data-report-id="' + esc(r.id) + '">' +
        '<div class="task-label">' + esc(r.commune_nom) + '</div>' +
        '<div class="community-item-desc">' + esc(r.description || '') + '</div>' +
        '<div class="task-due">' + (due ? 'Expire le ' + esc(due) : 'Expiration inconnue') + '</div>' +
        action +
      '</div>';
  }

  // 5e face « Signaler » : LISTE des instances communautaires actives visibles pour ce
  // profil (chargée à l'ouverture via GET /api/community-reports, site.js) + bouton de
  // création/adhésion en bas. Structure calquée À L'IDENTIQUE sur la 5e face 'user-task'
  // (.card-task-face/.tf-title/.task-zone réutilisées telles quelles) : REFONTE demandée
  // pour remplacer le formulaire en permanence sur le recto par ce patron. Connecté
  // uniquement, comme taskFace().
  function communityReportsFace(s, mode) {
    if (!isCommunity(s) || mode !== 'connected') return '';
    return '' +
      '<div class="card-face card-task-face">' +
        '<button class="flip-back" type="button" aria-label="Retour" title="Retour">' + BACK_SVG + '</button>' +
        '<div class="tf-title">Signalements en cours</div>' +
        '<div class="task-zone">' +
          '<div class="community-list" data-community-list><div class="community-loading">Chargement…</div></div>' +
          // PAS .task-create (ce nom de classe est câblé dans user-task-form.js à
          // l'ouverture d'une MODALE de création de tâche — l'emprunter ouvrirait la
          // mauvaise UI). Classe dédiée .community-report-toggle ; même rendu visuel
          // que .task-create via un sélecteur groupé (site.css), pas une classe partagée.
          '<button type="button" class="community-report-toggle secondary">Signaler une disparition</button>' +
          communityFace(s) +
        '</div>' +
      '</div>';
  }

  function paramFace(s, mode) {
    // v2 multi-champs : params_schema est un TABLEAU ; on rend UN contrôle PAR champ.
    // (Rétrocompat : un schéma à 1 champ produit exactement le même rendu qu'avant.)
    var fields = Array.isArray(s.params_schema) ? s.params_schema : [];
    var instances = Array.isArray(s.instances) ? s.instances : [];
    // Carte « géo » si AU MOINS un champ est géographique (switch cliquable + pré-remplissage
    // profil). Pour un schéma à 1 champ, identique à l'ancien isGeoSchema(schema[0]).
    var isGeo = fields.some(isGeoSchema);
    // Valeur pré-remplie PAR CHAMP : pré-remplissage géo depuis le profil (window.LBADefaults) ;
    // valeur par défaut éventuelle pour les champs libres (string/number non-enum).
    function defFor(field) {
      // dynamic-enum (B) : la ville du profil amorce la RECHERCHE (jamais une pré-sélection
      // d'entité). Uniquement au 1er abonnement (picker visible) ; en anon, LBADefaults.ville
      // est null → champ vide (comportement actuel préservé).
      if (field.type === 'dynamic-enum') {
        if (instances.length) return null;
        return (window.LBADefaults && window.LBADefaults.ville) || null;
      }
      if (isGeoSchema(field)) {
        var d = (window.LBADefaults && window.LBADefaults[field.key]) || null;
        // Champ commune : pré-rempli avec le NOM de ville du profil (résolu en INSEE au serveur).
        if (d == null && field.type === 'commune') d = (window.LBADefaults && window.LBADefaults.ville) || null;
        // Déjà suivie ? on ne pré-remplit pas (le picker sert à en ajouter une AUTRE).
        if (d != null && instances.some(function (inst) {
          return inst.params && String(inst.params[field.key]) === String(d);
        })) d = null;
        return d;
      }
      // Enum NON géo : on ne pré-sélectionne QUE si le champ est FACULTATIF
      // (required === false) et porte un défaut valide.
      // Pourquoi cette restriction : un champ REQUIS doit rester un choix explicite
      // de l'utilisateur (carburant, rappel-conso, jours-feries, fin-de-vie-logicielle
      // ont un défaut mais sont requis → comportement inchangé, ils continuent
      // d'afficher « Choisir… »).
      // Pourquoi c'est nécessaire : readParam() refuse TOUT le formulaire dès qu'un
      // <select> est vide (site.js). Un champ facultatif laissé sur son placeholder
      // bloquait donc l'abonnement ENTIER — y compris le champ géo pré-rempli du
      // premier paramètre, qui semblait pourtant prêt. C'est la régression constatée
      // sur pollens après l'ajout de `taxon` (et le même défaut existait sur
      // veille-agenda avec `preavis`).
      if (field.type === 'enum') {
        if (field.required !== false) return null;
        var dv = field.default;
        var valid = dv != null && (field.values || []).some(function (v) { return String(v.value) === String(dv); });
        return valid ? dv : null;
      }
      return field.default || null;
    }

    var chips = instances.length
      ? '<div class="param-chips">' + instances.map(function (inst) {
          return '<span class="param-chip" data-params="' + esc(JSON.stringify(inst.params)) + '">' +
            '<span class="pc-dot' + (inst.state === 'active' ? ' on' : '') + '"></span>' +
            esc(inst.label) +
            '<button type="button" class="param-remove" aria-label="Se désabonner de ' + esc(inst.label) + '">✕</button>' +
          '</span>';
        }).join('') + '</div>'
      : '';
    var addBtn = instances.length
      ? '<button type="button" class="param-add">+ ajouter</button>' : '';

    // Picker = contrôle + switch « S'abonner » (présent dès le 1er rendu, géo ET non-géo).
    // Géo : switch cliquable, abonnement au clic. Non-géo : switch disabled, abonnement à
    // la saisie/au choix (comportement d'origine). Voir followSwitch().
    // Un contrôle par champ (select pour enum, input pour string/number), empilés dans le picker.
    var controls = fields.map(function (f) { return paramControl(f, defFor(f)); }).join('');
    var picker =
      '<div class="param-form"' + (instances.length ? ' hidden' : '') + '>' +
        controls +
      '</div>';
    // Parcours anonyme : email (réutilise .sub-form), les params sont joints au submit.
    var anon = (mode !== 'connected')
      ? '<div class="sub-form param-subform"><input type="email" placeholder="votre@email.fr" aria-label="Adresse email"><button type="button">OK</button></div>'
      : '';
    // C4) Indicateur d'abonnement EN BAS de la carte (même place que le toggle des
    // cartes simples). F2) En mode connecté abonné (≥1 instance), on affiche un
    // vrai interrupteur pause/reprise (met en sourdine SANS retirer les paramètres) ;
    // sinon un simple libellé « Non abonné ».
    var on = instances.length > 0;
    var muted = !!s.muted; // toutes les instances en sourdine
    var status;
    if (mode !== 'connected') {
      status = '';
    } else if (on) {
      // Interrupteur : coché = alerte active ; décoché = en pause (muted).
      status = '<label class="switch-row param-mute-row">' +
          '<span class="switch"><input type="checkbox" class="param-mute"' + (muted ? '' : ' checked') +
            ' aria-label="Activer ou mettre en pause cette alerte">' +
            '<span class="track"></span><span class="thumb"></span></span>' +
          '<span class="switch-label' + (muted ? '' : ' on') + '">' + (muted ? 'En pause' : 'Abonné') + '</span>' +
        '</label>';
    } else {
      // Non abonné (géo ou non-géo) : le switch « S'abonner » du picker EST l'indicateur
      // → pas de label séparé.
      status = '';
    }
    // F1) instances + « + ajouter » + picker (contrôle + switch S'abonner) groupés dans
    // une rangée inline (flux des chips, retour à la ligne naturel).
    var row = '<div class="param-row">' + chips + addBtn + picker + '</div>';
    // Switch « S'abonner » SUR SA PROPRE LIGNE en bas de carte (même place que le toggle
    // des cartes simples), plus dans le picker. Masqué d'emblée si déjà abonné (évite le
    // doublon avec l'interrupteur pause/reprise du bas quand on rouvre le picker via
    // « + ajouter »).
    var follow = followSwitch(isGeo, on);
    return row + anon + follow + status;
  }

  // Bloc « attaques » du skin structure « Le Dresseur » (display:none par defaut →
  // aucun effet hors de ce skin). CONTENU REEL de la source (structure unique, pas de
  // branche de rendu) : une SEULE rangee — nom neutre « Signal », effet = la VRAIE
  // description de la carte, « degats » = nombre de likes (decoratif mais reel, masque
  // si 0). Les 3 billes .card-pip portent l'animation « la charge ». Aucune chaine
  // specifique aux seismes. Le .card-desc reel reste dans le DOM (sr-only en Dresseur,
  // cf. CSS) pour l'accessibilite ; ce bloc en est l'echo visuel (aria-hidden).
  function attacksHTML(s) {
    var eff = esc(s.description || s.subtitle || '');
    var n = Number(s.likes_count) || 0;
    var dmg = n > 0 ? '<span class="card-dmg">' + esc(formatCount(n)) + '</span>' : '';
    return '<div class="card-attacks" aria-hidden="true">' +
        '<div class="card-atk">' +
          '<span class="card-en"><span class="card-pip p1"></span>' +
            '<span class="card-pip p2"></span><span class="card-pip p3"></span></span>' +
          '<span class="card-atkbody"><span class="card-atkname">Signal</span>' +
            '<span class="card-atkeff">' + eff + '</span></span>' +
          dmg +
        '</div>' +
      '</div>';
  }
  // Pied « faiblesse / resistance » du Dresseur (la retraite accueille le switch, cf. CSS).
  // display:none par defaut -> inerte hors de ce skin (structure unique, pixel-safe).
  var FOOT_HTML =
    '<div class="card-foot" aria-hidden="true">' +
      '<span>faiblesse<br><b>le silence</b></span>' +
      '<span>résistance<br><b>le spam ✕2</b></span>' +
      '<span>retraite<br><b>1 signal</b></span>' +
    '</div>';

  function frontFace(s, mode, isLinked) {
    var state, action;
    if (isLinked) {
      state = '<div class="state partner"><span class="dot-idle"></span> Service partenaire</div>';
      action = '<a class="link-btn" href="' + esc(s.link_url) + '" target="_blank" rel="noopener">' +
        'Configurer sur ' + esc(domainOf(s.link_url)) + ' →</a>';
    } else if (isUserTask(s)) {
      // Même patron que les cartes 'linked' : on remplace À LA FOIS l'état et
      // l'action, et le rendu est IDENTIQUE en anonyme et en connecté.
      //
      // État : troisième vocabulaire neutre (.state.task, muted), PAS .state.active
      // même quand une tâche est suivie. « active » a un sens précis dans ce projet
      // (une alerte se déclenche en ce moment) : il anime le motif full-art
      // (.card-front:has(.state.active)) et alimente le KPI « mes alertes actives »
      // via cardIsActive(). Une échéance suivie n'est pas une alerte en cours.
      // Les deux libellés sont un indicateur BINAIRE d'adoption (même signal que
      // hasTask au verso), jamais un résumé d'échéance : ni date, ni compte.
      //
      var hasTask = Array.isArray(s.tasks) && s.tasks.length > 0;
      state = '<div class="state task"><span class="dot-idle"></span> ' +
        (hasTask ? 'Tâche suivie' : 'Tâche personnelle') + '</div>';
      // MÊME STRUCTURE DE RECTO que les cartes v2 paramétrées : bloc d'action
      // (pastille, style de « + ajouter ») PUIS interrupteur pause/reprise, les deux
      // sur le recto. Rien de spécifique à ce type de carte ne s'en écarte.
      // Le ⓘ garde son rôle habituel (verso classique) ; « Configurer » ouvre la 5e
      // face, où vivent la liste des tâches, les croix et les « C'est fait ✓ ».
      // La classe .task-config n'est PAS .param-add : cette dernière est câblée à un
      // handler de site.js qui ouvre le picker et masque le bouton (add.hidden = true)
      // — l'emprunter ferait disparaître « Configurer » au premier clic. Le style est
      // partagé par un sélecteur groupé côté CSS.
      // Le bouton vit dans la MÊME .param-row que « + ajouter » des cartes v2 : même
      // conteneur, même position dans le flux (margin-top:auto), même point d'accroche
      // pour les futurs skins. Seule la classe du bouton distingue les deux briques.
      var cfg = '<div class="param-row">' + ((mode === 'connected')
        ? '<button type="button" class="task-config">+ configurer</button>'
        : '<a class="task-config-anon" href="/connexion">+ configurer</a>') + '</div>';
      // Pause globale : seulement s'il y a quelque chose à mettre en pause. Markup
      // identique aux cartes paramétrées → repris tel quel par toggleMute() (site.js),
      // qui cible .param-mute-row .switch-label pour repeindre le libellé.
      var muted = !!s.muted;
      var mute = hasTask
        ? '<label class="switch-row param-mute-row">' +
            '<span class="switch"><input type="checkbox" class="param-mute"' + (muted ? '' : ' checked') +
              ' aria-label="Activer ou mettre en pause les relances de vos tâches">' +
              '<span class="track"></span><span class="thumb"></span></span>' +
            '<span class="switch-label' + (muted ? '' : ' on') + '">' + (muted ? 'En pause' : 'Abonné') + '</span>' +
          '</label>'
        : '';
      action = cfg + mute;
    } else if (isCommunity(s)) {
      // REFONTE : cette carte n'a PAS de mécanisme d'abonnement à elle — c'est une
      // carte broadcast CLASSIQUE (source_id='chat-perdu', sans params), exactement
      // comme n'importe quelle autre carte simple du catalogue : le switch standard
      // (switchRow/toggleConnected, POST /api/my-alerts/toggle) EST la matérialisation
      // de « être alerté ». Vocabulaire neutre .state.task, même raison que 'user-task' :
      // ce n'est pas une alerte en cours, pas de sens à animer le motif full-art .state.active.
      state = '<div class="state task"><span class="dot-idle"></span> Rien à signaler</div>';
      // MÊME STRUCTURE DE RECTO que 'user-task' : bloc d'action (bouton, style
      // « + configurer ») PUIS switch, tous deux sur le recto. Le bouton « Signaler »
      // réutilise LA MÊME classe .task-config que 'user-task' (+ .community-config en
      // second marqueur, pour le fetch dédié de la liste) → même handler générique de
      // flip déjà câblé dans site.js (aucun câblage spécifique à ajouter pour l'ouverture
      // de la 5e face), même mécanique visuelle strictement.
      var reportBtn = (mode === 'connected')
        ? '<button type="button" class="task-config community-config">Signaler</button>'
        : '<a class="task-config-anon" href="/connexion">Signaler</a>';
      action = '<div class="param-row">' + reportBtn + '</div>' +
        switchRow(mode === 'connected' && !!s.subscribed) + (mode === 'connected' ? '' : subForm());
    } else if (isParam(s)) {
      state = stateFor(s.state); // état de la/les instance(s) de l'utilisateur (le pire), sinon neutre
      action = paramFace(s, mode);
    } else {
      state = stateFor(s.state);
      action = switchRow(mode === 'connected' && !!s.subscribed) + (mode === 'connected' ? '' : subForm());
    }
    // Compteur d'abonnés discret (seulement à partir de 10).
    var count = (s.subscriber_count >= 10)
      ? '<div class="sub-count">' + s.subscriber_count + ' abonnés</div>' : '';
    // « Ajouter à un deck » : icône « + » sur le recto, à gauche du « i », en mode
    // connecté uniquement (pas de teasing pour les anonymes). Ouvre le menu flottant
    // deck-add.js. La classe has-add décale partage/❤ pour laisser la place au « + ».
    var showAdd = mode === 'connected' && !isLinked;
    var addBtn = showAdd
      ? '<button class="add-deck-btn card-add-deck" type="button" data-source-id="' + esc(s.id) +
        '" aria-label="Ajouter à un deck" title="Ajouter à un deck">' + PLUS_SVG + '</button>'
      : '';
    // Disposition A : full-art (motif) + voile de lisibilité + double liseré en fond ;
    // rangée haute (état à gauche, contrôles à droite dans l'ordre ♥·partage·+deck·i) ;
    // contenu ancré en bas sur le voile. Toutes les classes interactives sont conservées
    // (card-share, card-like, card-add-deck, flip-btn, state, switch, param-*) → aucun
    // handler ni comportement modifié, seul le markup/les classes changent.
    return '' +
      '<div class="card-face card-front' + (showAdd ? ' has-add' : '') + '">' +
        // .card-art enveloppe motif + voile. Defaut : display:contents → fullart/veil
        // restent positionnes exactement comme avant (containing block = .card-front).
        // Les skins « en cadre » basculent .card-art en boite (fenetre d'art / medaillon).
        '<div class="card-art">' + FULLART_SVG +
          '<span class="card-veil" aria-hidden="true"></span></div>' +
        '<span class="card-edge" aria-hidden="true"></span>' +
        // C1) Rangée du haut : état (.state, pastille verre) à gauche, icônes à droite.
        '<div class="card-toprow">' +
          state +
          '<div class="card-icons">' +
            likeBtn(s) +
            '<button class="share-btn card-share" type="button" aria-label="Partager" title="Partager">' + SHARE_SVG + '</button>' +
            addBtn +
            '<button class="flip-btn" type="button" aria-label="En savoir plus" title="En savoir plus">' + INFO_SVG + '</button>' +
          '</div>' +
        '</div>' +
        // Contenu bas (titre + coche, sous-titre, description, compteur, abonnement).
        '<div class="card-content">' +
          topRow(s) +
          // .card-edition : badge (officiel/verifie/communaute) DUPLIQUE en fin de sous-titre,
          // display:none par defaut -> seul L'Assemblee l'affiche (symbole d'edition/rarete a
          // l'extreme droite de la ligne de type). Rendu full-art/teintes INCHANGE (hors flux).
          (s.subtitle ? '<div class="card-subtitle">' + esc(s.subtitle) +
            '<span class="card-edition ' + badgeClassOf(s.badge) + '" aria-hidden="true">' + BADGE_ICON + '</span></div>' : '') +
          // Description encapsulée dans .card-desc pour que la troncature
          // -webkit-line-clamp s'applique (inerte sur le <p> lui-même). .card-stat :
          // 2e AFFICHAGE (decoratif) du compteur de likes, display:none par defaut ->
          // L'Assemblee en fait l'encart force/endurance chevauchant. Hors flux ailleurs.
          // .card-textbox : conteneur unique « boite de texte » regroupant la description
          // (.card-desc) ET la zone d'action (.card-action), pour que les skins structures
          // (ex. L'Assemblee = .frame-text-box) puissent styler cette boite d'un seul bloc.
          // Defaut : .card-textbox = display:contents -> ses enfants restent des enfants
          // effectifs de .card-content (rendu full-art/teintes INCHANGE ; en grille de skin,
          // p/card-action restent des items de la grid via la chaine display:contents).
          '<div class="card-textbox">' +
            '<p><span class="card-desc">' + esc(s.description || '') + '</span>' +
              '<span class="card-stat" aria-hidden="true">' + formatCount(Number(s.likes_count) || 0) + '</span></p>' +
            attacksHTML(s) +
            count +
            // Zone d'action ENVELOPPEE (switch, chips, « + ajouter », select/form des
            // paramétrées, etc.). Defaut : .card-action = display:contents -> ces elements
            // restent des enfants effectifs de .card-content (rendu full-art/teintes INCHANGE).
            // Les skins structures en font UNE grid-area a flux vertical -> plus d'empilement.
            '<div class="card-action">' + action + '</div>' +
          '</div>' +
          FOOT_HTML +
          // .card-fineprint : fine ligne d'info technique (bas de boite), display:none par
          // defaut -> seul L'Assemblee l'affiche (mention decorative, univers du site).
          '<div class="card-fineprint" aria-hidden="true">Vigie citoyenne · LaBonneAlerte</div>' +
        '</div>' +
      '</div>';
  }

  // ── V3 · TÂCHE À ÉCHÉANCE GLISSANTE ────────────────────────────────────────
  // Zone PROPRE à ce type de carte, ajoutée en BAS du verso. Ne touche à aucun
  // élément du tronc commun : les 4 boutons ronds du recto (.card-icons) restent
  // rigoureusement identiques sur toutes les cartes, y compris celle-ci. Rendue
  // uniquement en mode connecté, pour une carte 'user-task' portant au moins une
  // tâche de l'utilisateur (s.tasks vient de /api/my-alerts, route authentifiée —
  // ces données ne transitent JAMAIS par /api/sources, qui est publique).
  function dueFr(d) {
    if (!d) return null;
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return null;
    return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function taskItem(t) {
    // Croix de suppression (coin haut-droit) : même geste que le ✕ d'un chip de deck
    // — clic = suppression immédiate, sans confirmation. Côté serveur c'est un soft
    // delete (active = false), donc rien n'est réellement perdu en base.
    var rm = '<button type="button" class="task-remove" aria-label="Supprimer « ' +
      esc(t.label) + ' »">✕</button>';
    // Mode 'counter' : état de lecture seule, PAS de bouton « c'est fait » (aucune
    // UI de relevé à ce stade). Robustesse : ne casse pas si une ligne existe déjà.
    if (t.tracking_mode !== 'time') {
      var lu = (t.counter_current != null && t.counter_unit)
        ? esc(String(t.counter_current) + ' ' + t.counter_unit) : '—';
      return '<div class="task-item" data-task-id="' + esc(t.id) + '">' +
          rm +
          '<div class="task-label">' + esc(t.label) + '</div>' +
          '<div class="task-due">Suivi au compteur · dernier relevé : ' + lu + '</div>' +
        '</div>';
    }
    var d = dueFr(t.next_due);
    return '<div class="task-item" data-task-id="' + esc(t.id) + '">' +
        rm +
        '<div class="task-label">' + esc(t.label) + '</div>' +
        '<div class="task-due">' + (d ? 'Échéance : ' + esc(d) : 'Échéance non calculée') + '</div>' +
        '<button type="button" class="task-done" aria-label="Marquer « ' + esc(t.label) + ' » comme fait">' +
          "C'est fait ✓</button>" +
      '</div>';
  }

  // 5e face « Configurer » : gestion des instances utilisateur de la carte. Ouverte
  // par le bouton .task-config du RECTO — pas par le ⓘ, qui garde son rôle habituel
  // (verso classique : description, tags, infos). Même mécanique de flip que les
  // faces partage/deck : .face-task désigne la face arrière visible.
  // Nommage volontairement générique (.card-task-face, .task-*) : la structure
  // « recto minimal + Configurer + face de gestion » est destinée à d'autres cartes
  // à instances utilisateur. Connecté uniquement : sans compte, rien à gérer.
  function taskFace(s, mode) {
    if (s.type !== 'user-task' || mode !== 'connected') return '';
    var tasks = Array.isArray(s.tasks) ? s.tasks : [];
    var hasTask = tasks.length > 0;
    // L'interrupteur de pause vit sur le RECTO (comme les cartes v2 paramétrées),
    // pas ici : cette face ne porte que la gestion des tâches elles-mêmes.
    var create = '<button type="button" class="task-create' + (hasTask ? ' secondary' : '') + '">' +
      (hasTask ? '+ une autre tâche' : 'Créer ma tâche') + '</button>';
    return '' +
      // .card-usertask-face = marqueur ADDITIF (la structure et les classes de la 5e
      // face restent strictement identiques, skins compris). Il sert uniquement à
      // distinguer CETTE face de celle des cartes 'community', qui réutilise le même
      // .card-task-face : la vue liste dévoile la face des tâches dans son volet et
      // ne doit pas dévoiler celle des signalements, dont le parcours liste n'est
      // pas traité par ce fil.
      '<div class="card-face card-task-face card-usertask-face">' +
        '<button class="flip-back" type="button" aria-label="Retour" title="Retour">' + BACK_SVG + '</button>' +
        '<div class="tf-title">Mes échéances</div>' +
        '<div class="task-zone">' + tasks.map(taskItem).join('') + create + '</div>' +
      '</div>';
  }

  function backFace(s, cats, isLinked, mode) {
    // Tags cliquables → filtre la catégorie sur la home.
    var tags = (cats.length)
      ? '<div class="back-tags">' + cats.map(function (c) {
          return '<button type="button" class="tag back-tag" data-cat="' + esc(c) + '">' + esc(catLabel(c)) + '</button>';
        }).join('') + '</div>'
      : '';

    var author = s.submitted_by_github
      ? '<div class="back-author">par <a href="https://github.com/' + esc(s.submitted_by_github) + '" ' +
        'target="_blank" rel="noopener">@' + esc(s.submitted_by_github) + '</a></div>'
      : '';

    // « Plus d'infos → » (lien statut) retiré : le badge @forum_slug (haut-gauche du verso)
    // fait désormais office de lien « en savoir plus » vers la source.

    // Lien discret vers les discussions forum de cette source (jamais de contenu
    // utilisateur dans la carte, juste un lien de sortie). Toujours visible dès qu'un
    // forum_slug existe (la liste vide invite à créer le 1er sujet). Résolution slug-ou-id
    // gérée côté serveur (/forum/source/:slug). Même token visuel que .back-statut.
    var forum = s.forum_slug
      ? '<a class="back-statut back-forum" href="/forum/source/' + esc(s.forum_slug) + '">On en parle au forum →</a>'
      : '';

    // « i » (verso) : description LONGUE si presente, sinon la courte (jamais de vide).
    // Visible sur toutes tailles d'ecran (le retournement fait office de popup partout).
    var longDesc = '<p class="card-long-desc">' + esc(s.description_long || s.description || '') + '</p>';

    // Badge @forum_slug ancré en haut-GAUCHE du verso, à la hauteur de flip-back (qui reste
    // en haut-droite) : les deux se font face sur la même ligne. Réutilise .forum-slug-badge
    // (identité forum, pastille violette). Mène à la FICHE de la source (page statut), PAS
    // à la liste des sujets forum : le badge @slug est l'identifiant public de l'objet, il
    // conduit partout à l'objet lui-même (même règle que le badge posé sur un sujet forum,
    // cf. slugBadge() dans server/routes/forum.js). Le lien « On en parle au forum → »
    // ci-dessus reste la seule sortie vers les discussions. Absent sans forum_slug.
    var forumBadge = s.forum_slug
      ? '<a class="forum-slug-badge card-forum-badge" href="/source/' + esc(s.id) + '/statut' +
        '">@' + esc(s.forum_slug) + '</a>'
      : '';

    return '' +
      '<div class="card-face card-back">' +
        '<button class="flip-back" type="button" aria-label="Retour" title="Retour">' + BACK_SVG + '</button>' +
        forumBadge +
        topRow(s) +
        longDesc +
        tags + author + forum +
      '</div>';
  }

  // F3) 4e face : « Ajouter à un deck ». Vide au rendu ; deck-add.js la remplit (liste
  // des decks / création du premier deck inline) puis retourne la carte au clic sur « + ».
  function deckFace() {
    return '' +
      '<div class="card-face card-deck-face">' +
        '<button class="flip-back" type="button" aria-label="Retour" title="Retour">' + BACK_SVG + '</button>' +
        '<div class="cdf-title">Ajouter à un deck</div>' +
        '<div class="cdf-body"></div>' +
      '</div>';
  }

  // 3e face : partage (grille remplie à la volée par site.js via LBAShare.optionsHTML).
  function shareFace() {
    return '' +
      '<div class="card-face card-share-face">' +
        '<button class="flip-back" type="button" aria-label="Retour" title="Retour">' + BACK_SVG + '</button>' +
        '<div class="share-face-title">Partager</div>' +
        '<div class="share-grid share-face-grid"></div>' +
      '</div>';
  }

  // Texte de recherche : nom + sous-titre + description + slugs & labels des catégories.
  function searchText(s, cats) {
    var parts = [s.name || '', s.subtitle || '', s.description || ''];
    cats.forEach(function (c) { parts.push(c); parts.push(catLabel(c)); });
    return normalizeSearch(parts.join(' '));
  }

  // Normalisation de recherche : minuscules, accents retirés (NFD + suppression des
  // diacritiques) et caractères non alphanumériques ramenés à un espace. Appliquée
  // IDENTIQUEMENT à l'index (data-search) et à la requête → « tache » trouve « tâche »,
  // « l'eau » trouve « l eau ». Exposée pour site.js (index des tuiles-deck + filtrage).
  function normalizeSearch(str) {
    var s = String(str || '').toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.replace(/[^a-z0-9]+/g, ' ').replace(/^ | $/g, '');
  }

  // s : source complète ; mode : 'anon' | 'connected'
  function cardHTML(s, mode) {
    var cats = Array.isArray(s.categories) ? s.categories : [];
    var dataCats = cats.map(esc).join(' ');
    var isLinked = s.type === 'linked';
    // Abonné = broadcast souscrit OU au moins une instance paramétrée.
    var hasInstances = Array.isArray(s.instances) && s.instances.length > 0;
    var sub = mode === 'connected' && (!!s.subscribed || hasInstances) ? '1' : '0';
    // F3) La 4e face « deck » n'existe que là où le « + » existe (connecté, non lié).
    var showAdd = mode === 'connected' && !isLinked;
    return '' +
      '<div class="card flip" data-cats="' + dataCats + '" data-source-id="' + esc(s.id) + '"' +
        ' data-subscribed="' + sub + '" data-search="' + esc(searchText(s, cats)) + '">' +
        '<div class="card-inner">' +
          frontFace(s, mode, isLinked) +
          backFace(s, cats, isLinked, mode) +
          shareFace() +
          taskFace(s, mode) + // 5e face : '' pour toute carte non user-task
          communityReportsFace(s, mode) + // 5e face : '' pour toute carte non 'community'
          (showAdd ? deckFace() : '') +
        '</div>' +
      '</div>';
  }

  // E6) Salve de célébration autour d'un bouton (pack/deck entièrement adopté).
  // Petites particules violet/vert/ambre qui émergent puis se dispersent (~1,4s,
  // une fois). reduced-motion : simple lueur du bouton, pas de particules.
  function celebrateBurst(btn) {
    if (!btn) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { btn.classList.add('celebrated'); setTimeout(function () { btn.classList.remove('celebrated'); }, 900); return; }
    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
    var wrap = document.createElement('span');
    wrap.className = 'celebrate-burst'; wrap.setAttribute('aria-hidden', 'true');
    var N = 10;
    for (var i = 0; i < N; i++) {
      var p = document.createElement('span');
      p.className = 'cb-star';
      var ang = (i / N) * 2 * Math.PI;
      var dist = 26 + (i % 3) * 9;
      p.style.setProperty('--tx', (Math.cos(ang) * dist).toFixed(1) + 'px');
      p.style.setProperty('--ty', (Math.sin(ang) * dist).toFixed(1) + 'px');
      p.style.animationDelay = (i * 20) + 'ms';
      wrap.appendChild(p);
    }
    btn.appendChild(wrap);
    setTimeout(function () { wrap.remove(); }, 1500);
  }

  window.LBACards = {
    esc: esc, badgeFor: badgeFor, stateFor: stateFor, domainOf: domainOf, cardHTML: cardHTML, catLabel: catLabel,
    BACK_SVG: BACK_SVG, formatCount: formatCount, celebrateBurst: celebrateBurst,
    normalizeSearch: normalizeSearch,
    // SVG partagés (réutilisés tels quels par la vue liste — pas de duplication de string).
    LIKE_SVG: LIKE_SVG, SHARE_SVG: SHARE_SVG, INFO_SVG: INFO_SVG,
    // Carte communautaire : rendu d'une ligne de la liste, réutilisé par site.js
    // pour peupler .community-list au chargement de la 5e face (fetch dédié).
    communityReportItem: communityReportItem
  };
})();
