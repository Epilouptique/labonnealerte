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

  // En-tête commun du bloc : titre + badge.
  function topRow(s) {
    return '<div class="card-top"><h3>' + esc(s.name) + '</h3>' + badgeFor(s.badge) + '</div>';
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

  // Icône « i dans un cercle » (bouton « En savoir plus » du bloc) : même style que
  // SHARE_SVG (trait 2px, linecap round, 18×18, currentColor). Remplace le caractère
  // « ⓘ » au rendu incohérent selon les OS. Taille pilotée par .ab-toggle svg.
  var INFO_SVG = '<svg class="ic-info" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.6v.01"/></svg>';

  // A1) Cœur « j'aime » : contour (non aimé) ; le CSS le remplit quand .liked.
  var LIKE_SVG = '<svg class="ic-like" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.3l-1.45-1.32C5.4 14.36 2.5 11.7 2.5 8.5 2.5 6.08 4.42 4.2 6.8 4.2c1.36 0 2.66.63 3.5 1.64l.7.85.7-.85C12.54 4.83 13.84 4.2 15.2 4.2c2.38 0 4.3 1.88 4.3 4.3 0 3.2-2.9 5.86-8.05 10.48z"/></svg>';

  // Libellé du lien forum du verso, PARTAGÉ cartes + decks (deck-stack.js l'appelle via
  // LBACards) : « On en parle au forum (3) → ». Le compte vient de `topic_count`, porté
  // par les charges existantes (/api/sources, /api/collections, /api/favorites,
  // /api/forum/u/:pseudo/decks) — aucun fetch par carte, les routes
  // /api/forum/*/:slug/count restent volontairement non câblées.
  // STRICT : à 0, absent, ou non numérique (ancienne réponse en cache, page qui n'aurait
  // pas la colonne), le lien garde son texte d'origine — jamais de « (0) ».
  function forumLinkText(n) {
    var v = parseInt(n, 10);
    return (v > 0) ? 'On en parle au forum (' + v + ') →' : 'On en parle au forum →';
  }

  // Format compact du compteur de likes : 1240 → « 1,2 k », 12000 → « 12 k ».
  function formatCount(n) {
    n = Number(n) || 0;
    if (n < 1000) return String(n);
    var v = n / 1000;
    var s = (v >= 10 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, ''));
    return s.replace('.', ',') + ' k';
  }

  // Bouton like (recto). Non aimé au rendu ; site.js marque .liked depuis localStorage.
  // ANONYME (14/08/2026) : le like est désormais dédupliqué EN BASE par compte
  // (table source_likes) — un visiteur sans compte n'a pas d'identité à dédupliquer,
  // il ne peut donc plus voter. Le compteur reste VISIBLE (information publique) mais
  // le bouton est marqué .like-anon + aria-disabled : le clic mène à /connexion
  // (site.js), jamais un clic sans effet ni explication. Même convention que
  // .task-config-anon (action réservée aux comptes → page de connexion).
  function likeBtn(s, mode) {
    var n = Number(s.likes_count) || 0;
    var anon = mode !== 'connected';
    return '<button class="like-btn card-like' + (anon ? ' like-anon' : '') + '" type="button"' +
      ' aria-pressed="false"' + (anon ? ' aria-disabled="true"' : '') +
      ' aria-label="' + (anon ? 'Connectez-vous pour aimer cette alerte' : 'J\'aime cette alerte') + '"' +
      ' title="' + (anon ? 'Connectez-vous pour aimer cette alerte' : 'J\'aime cette alerte') + '"' +
      ' data-likes="' + n + '">' +
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

  // Config du TYPE communautaire, jointe au payload par /api/sources (champ
  // `community`, cf. publicConfig dans server/community-types.js). Le repli n'est
  // PAS une 2e configuration : c'est le filet si le serveur n'a pas encore été
  // redéployé — mêmes valeurs que chat-perdu, seul type existant avant le
  // multi-types.
  var COMMUNITY_FALLBACK = { type: 'chat-perdu', label: 'chat', radiusChoices: [10, 15, 20, 30, 50], defaultRadiusKm: 15 };
  function communityCfg(s) {
    var c = s && s.community;
    if (!c || !Array.isArray(c.radiusChoices) || !c.radiusChoices.length) return COMMUNITY_FALLBACK;
    return c;
  }

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
    var cc = communityCfg(s);
    // Rayons : liste et valeur par défaut viennent de la config du type
    // (server/community-types.js, jointe au payload par /api/sources).
    var radiusOpts = cc.radiusChoices.map(function (km) {
      var sel = (km === cc.defaultRadiusKm) ? ' selected' : '';
      return '<option value="' + esc(km) + '"' + sel + '>Visible à ' + esc(km) + ' km</option>';
    }).join('');
    return '<div class="param-row community-form" hidden>' +
        '<input type="text" class="community-ville" placeholder="' + ph + '" aria-label="Commune" autocomplete="off">' +
        '<textarea class="community-desc" placeholder="Décrivez la situation (si vous êtes le/la premier·ère à signaler pour cette commune)" aria-label="Description" rows="2"></textarea>' +
        '<input type="url" class="community-link" placeholder="Lien (facultatif, ex. i-cad.fr)" aria-label="Lien">' +
        '<select class="community-radius" aria-label="Rayon de visibilité si vous créez le signalement">' +
          radiusOpts +
        '</select>' +
        '<button type="button" class="community-submit">Envoyer le signalement</button>' +
        // CORRECTIONS 4 (C) : message dédié à CE formulaire, PAS note() (qui écrit
        // dans .card-front .card-content — invisible ici, cette face étant celle
        // affichée pendant la saisie ; note() ne pose donc jamais son message sous
        // les yeux de l'utilisateur en train de remplir le verso).
        '<div class="community-form-msg sub-msg" role="alert" hidden></div>' +
      '</div>';
  }

  // dueFr(d) réutilisée telle quelle (déjà définie plus bas pour taskItem, function
  // déclarée → hissée, donc visible ici aussi) : même vocabulaire d'échéance, aucune
  // 2e fonction de formatage de date.

  // Une ligne de la liste « Signalements en cours » — RÉUTILISÉE À L'IDENTIQUE pour le
  // recto dynamique ET la 5e face (une seule fonction, cf. renderCommunityRecto/
  // renderCommunityList dans site.js). Réutilise .task-item/.task-label/.task-due de
  // 'user-task'. Pas de croix de suppression : un signalement n'appartient pas au
  // lecteur, seul l'auteur peut le clôturer.
  //
  // Vague 2 : 3 variantes d'action selon la situation du profil (r.is_author,
  // r.spotted — tous deux calculés côté serveur, cf. GET /api/community-reports) :
  //  - déjà signalé (témoin ayant déjà cliqué)   → tag « Déjà signalé ✓ »
  //  - auteur du signalement                      → bouton « Je l'ai retrouvé »
  //    (clôture directe, POST /:id/resolve, AUCUN champ Où/Quand)
  //  - témoin, pas encore signalé                 → bouton « Je l'ai vu » qui révèle
  //    un mini-formulaire Où/Quand (OBLIGATOIRES) masqué par défaut, validé avant tout
  //    envoi (POST /:id/spot { where, when })
  // `label` : mot de l'animal pour les libellés d'ACCESSIBILITÉ uniquement (« le chat
  // de … », « ce chien à … »). Fourni par l'appelant depuis la config du type — c'était
  // le seul texte propre à chat-perdu écrit en dur dans le JS, et il était invisible à
  // l'œil (aria-label), donc facile à oublier lors de l'ajout d'un type.
  function communityReportItem(r, label) {
    var animal = label || COMMUNITY_FALLBACK.label;
    var due = dueFr(r.expires_at);
    var action;
    if (r.spotted) {
      action = '<span class="community-spotted-tag">Déjà signalé ✓</span>';
    } else if (r.is_author) {
      action = '<button type="button" class="community-found" aria-label="Marquer comme retrouvé le ' + esc(animal) + ' de ' + esc(r.commune_nom) + '">Je l\'ai retrouvé</button>';
    } else {
      action = '<button type="button" class="community-spot-toggle" aria-label="Signaler avoir vu ce ' + esc(animal) + ' à ' + esc(r.commune_nom) + '">Je l\'ai vu</button>' +
        '<div class="param-row community-spot-form" hidden>' +
          '<input type="text" class="community-spot-where" placeholder="Où ? (ex. rue de la Paix)" aria-label="Où">' +
          '<input type="text" class="community-spot-when" placeholder="Quand ? (ex. ce matin vers 9h)" aria-label="Quand">' +
          '<button type="button" class="community-spot-submit">Confirmer</button>' +
          '<div class="community-spot-msg sub-msg" role="alert" hidden></div>' +
        '</div>';
    }
    return '<div class="task-item community-item" data-report-id="' + esc(r.id) + '">' +
        '<div class="task-label">' + esc(r.commune_nom) + '</div>' +
        '<div class="community-item-desc">' + esc(r.description || '') + '</div>' +
        '<div class="task-due">' + (due ? 'Expire le ' + esc(due) : 'Expiration inconnue') + '</div>' +
        action +
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

  // ── DÉTAIL COMMUNAUTAIRE (fil #9, incrément 2) ──────────────────────────────
  // Contenu de .ab-detail pour une carte communautaire : liste des signalements actifs +
  // bouton d'ouverture du formulaire + formulaire de création/adhésion (communityFace).
  // Réservé au mode connecté (anonyme → le bouton « Signaler » de l'action mène à /connexion).
  // Mêmes classes que l'ex-5e face (communityReportsFace) → handlers site.js réutilisés tels quels.
  function communityDetail(s, mode) {
    if (mode !== 'connected') return '';
    return '' +
      '<div class="community-list" data-community-list><div class="community-loading">Chargement…</div></div>' +
      '<button type="button" class="community-report-toggle secondary">Signaler une disparition</button>' +
      communityFace(s);
  }

  // ── FORMAT BLOC (fil #9, incréments 1-2) ────────────────────────────────────
  // Familles migrées : broadcast, paramétré, linked (incrément 1) + communautaire (incrément 2).
  // Une alerte = un bloc = une ligne, SANS recto/verso ni flip. Le bloc GARDE la classe .card
  // (pipeline filtre/tri/pagination + hooks délégués de site.js) mais N'A PAS .flip/.card-inner/
  // .card-face. Le « verso » (desc longue, tags, forum ; pour le communautaire : liste +
  // formulaire) vit dans .ab-detail, dépliable par .ab-toggle (ou par « Signaler »).
  function renderBlock(s, mode) {
    var isLinked = s.type === 'linked';
    var isCommunity_ = isCommunity(s);
    var isUserTask_ = isUserTask(s);
    var hasTask = Array.isArray(s.tasks) && s.tasks.length > 0;
    var cats = Array.isArray(s.categories) ? s.categories : [];
    var dataCats = cats.map(esc).join(' ');
    var hasInstances = Array.isArray(s.instances) && s.instances.length > 0;
    // user-task : « l'abonnement EST la création de tâche » → ≥1 tâche vaut data-subscribed=1
    // (la sémantique du switch de la vue liste en dépend, cf. list-view.js sync()).
    var sub = mode === 'connected' && (!!s.subscribed || hasInstances || (isUserTask_ && hasTask)) ? '1' : '0';

    // Marqueurs de FAMILLE portés par la RACINE du bloc (jamais par une face) : data-community-type
    // alimente communityTypeOf() (routage /api/community-reports?type=…), data-card-type est lu par
    // l'hydratation eager du kiosque (community) et par la vue liste / le CSS (community, user-task).
    var comAttrs = '';
    if (isCommunity_) {
      var cc = communityCfg(s);
      comAttrs = ' data-card-type="community" data-community-type="' + esc(s.id) +
        '" data-community-label="' + esc(cc.label) + '"';
    } else if (isUserTask_) {
      comAttrs = ' data-card-type="user-task"';
    }

    // État + zone d'action, alignés sur frontFace. ORDRE : communautaire AVANT paramétré (une
    // carte communautaire a un params_schema pour la commune, mais n'est PAS un picker générique).
    var state, action;
    if (isLinked) {
      state = '<div class="state partner"><span class="dot-idle"></span> Service partenaire</div>';
      action = '<a class="link-btn" href="' + esc(s.link_url) + '" target="_blank" rel="noopener">' +
        'Configurer sur ' + esc(domainOf(s.link_url)) + ' →</a>';
    } else if (isCommunity_) {
      state = '<div class="state task"><span class="dot-idle"></span> Rien à signaler</div>';
      // « Signaler » ouvre .ab-detail + révèle le formulaire (handler .community-config, site.js).
      var reportBtn = (mode === 'connected')
        ? '<button type="button" class="community-config">Signaler</button>'
        : '<a class="task-config-anon" href="/connexion">Signaler</a>';
      action = '<div class="param-row">' + reportBtn + '</div>' +
        switchRow(mode === 'connected' && !!s.subscribed) + (mode === 'connected' ? '' : subForm());
    } else if (isUserTask_) {
      // « L'abonnement EST la création de tâche » : PAS de switch broadcast. État neutre
      // (.state.task), « + configurer » (.task-config, ouvre .ab-detail où vit la gestion), et
      // l'interrupteur de PAUSE (.param-mute-row) UNIQUEMENT s'il y a ≥1 tâche. Ce switch porte la
      // sémantique d'état (pause) lue telle quelle par list-view.js (sync : actif = ≥1 tâche ET non
      // muted). Il reste dans .ab-action (toujours visible), jamais dans une face cachée.
      state = '<div class="state task"><span class="dot-idle"></span> ' +
        (hasTask ? 'Tâche suivie' : 'Tâche personnelle') + '</div>';
      var cfg = '<div class="param-row">' + ((mode === 'connected')
        ? '<button type="button" class="task-config">+ configurer</button>'
        : '<a class="task-config-anon" href="/connexion">+ configurer</a>') + '</div>';
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
    } else if (isParam(s)) {
      state = stateFor(s.state);
      action = paramFace(s, mode);
    } else {
      state = stateFor(s.state);
      action = switchRow(mode === 'connected' && !!s.subscribed) + (mode === 'connected' ? '' : subForm());
    }

    var count = (s.subscriber_count >= 10)
      ? '<div class="sub-count">' + s.subscriber_count + ' abonnés</div>' : '';
    var subtitle = s.subtitle ? '<div class="card-subtitle">' + esc(s.subtitle) + '</div>' : '';
    var descShort = '<p class="card-static-desc"><span class="card-desc">' + esc(s.description || '') + '</span></p>';
    // Aperçu communautaire STATIQUE (Q2) : rempli par site.js (renderCommunityPreview) — dernier
    // signalement + compteur, SANS rotation ni timer. Vide/masqué s'il n'y a aucun signalement.
    var preview = isCommunity_ ? '<div class="community-preview" data-community-preview hidden></div>' : '';

    // Détail dépliable (ex-verso / ex-5e face). Mêmes classes que backFace / communityReportsFace.
    var tags = cats.length
      ? '<div class="back-tags">' + cats.map(function (c) {
          return '<button type="button" class="tag back-tag" data-cat="' + esc(c) + '">' + esc(catLabel(c)) + '</button>';
        }).join('') + '</div>'
      : '';
    var author = s.submitted_by_github
      ? '<div class="back-author">par <a href="https://github.com/' + esc(s.submitted_by_github) + '" ' +
        'target="_blank" rel="noopener">@' + esc(s.submitted_by_github) + '</a></div>'
      : '';
    var forum = s.forum_slug
      ? '<a class="back-statut back-forum" href="/forum/source/' + esc(s.forum_slug) + '">' + forumLinkText(s.topic_count) + '</a>'
      : '';
    var forumBadge = s.forum_slug
      ? '<a class="forum-slug-badge card-forum-badge" href="/source/' + esc(s.id) + '/statut">@' + esc(s.forum_slug) + '</a>'
      : '';
    var longDesc = '<p class="card-long-desc">' + esc(s.description_long || s.description || '') + '</p>';
    var detailId = 'abdet-' + esc(String(s.id));
    // user-task : la GESTION DES TÂCHES (liste + création) vit dans .ab-detail (ex-5e face),
    // ouverte par « + configurer » (.task-config) ou par ⓘ. Connecté uniquement (anonyme →
    // « + configurer » mène à /connexion). Réutilise .task-zone/.task-item/.task-create → handlers
    // site.js (task-remove, task-done) et modale user-task-form.js réutilisés tels quels.
    var tasks = Array.isArray(s.tasks) ? s.tasks : [];
    var taskZone = (isUserTask_ && mode === 'connected')
      ? '<div class="task-zone">' + tasks.map(taskItem).join('') +
        '<button type="button" class="task-create' + (hasTask ? ' secondary' : '') + '">' +
        (hasTask ? '+ une autre tâche' : 'Créer ma tâche') + '</button></div>'
      : '';
    // Communautaire → signalements ; user-task → tâches ; sinon description longue.
    var detailInner = isCommunity_
      ? (forumBadge + communityDetail(s, mode) + tags + forum)
      : isUserTask_
        ? (taskZone + forumBadge + longDesc + tags + forum)
        : (forumBadge + longDesc + tags + author + forum);

    var abToggle = '<button class="ab-toggle" type="button" aria-expanded="false" aria-controls="' + detailId +
      '" aria-label="Afficher le détail de ' + esc(s.name) + '" title="En savoir plus">' + INFO_SVG + '</button>';
    var shareBtn = '<button class="share-btn card-share" type="button" aria-label="Partager" title="Partager">' + SHARE_SVG + '</button>';

    return '' +
      '<article class="card alert-block" data-cats="' + dataCats + '" data-source-id="' + esc(s.id) + '"' + comAttrs +
        ' data-subscribed="' + sub + '" data-search="' + esc(searchText(s, cats)) + '">' +
        '<div class="ab-head">' +
          state +
          '<div class="card-icons">' + likeBtn(s, mode) + shareBtn + abToggle + '</div>' +
        '</div>' +
        '<div class="ab-body">' + topRow(s) + subtitle + preview + descShort + count + '</div>' +
        '<div class="ab-action">' + action + '</div>' +
        '<div class="ab-detail" id="' + detailId + '" hidden>' + detailInner + '</div>' +
      '</article>';
  }

  // Aiguillage (fil #9) : TOUTES les familles (broadcast, paramétré, linked, communautaire,
  // user-task) sont rendues en FORMAT BLOC. Le format carte recto/verso (renderLegacyCard) et
  // les skins ont été retirés à l'incrément 4 — plus aucune face, plus aucun flip.
  function cardHTML(s, mode) {
    return renderBlock(s, mode);
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
    formatCount: formatCount, celebrateBurst: celebrateBurst,
    normalizeSearch: normalizeSearch,
    // Libellé du lien forum du verso : UNE seule implémentation, consommée aussi par
    // deck-stack.js (même règle « rien à 0 » cartes et decks).
    forumLinkText: forumLinkText,
    // SVG partagés (réutilisés tels quels par la vue liste — pas de duplication de string).
    LIKE_SVG: LIKE_SVG, SHARE_SVG: SHARE_SVG, INFO_SVG: INFO_SVG,
    // Carte communautaire : rendu d'une ligne de la liste, réutilisé par site.js
    // pour peupler .community-list au chargement de la 5e face (fetch dédié).
    communityReportItem: communityReportItem
  };
})();
