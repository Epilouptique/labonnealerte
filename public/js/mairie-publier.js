/* mairie-publier.js — assistant 3 écrans de publication d'un événement municipal.
   (1) modèle + titre ; (2) texte, dates, catégorie ; (3) relecture (aperçu habitant) + Publier.
   AUCUNE notification n'est envoyée (lot B) : publier rend l'événement visible (fiche commune).
   Dépend d'un compte connecté (localStorage 'lba-token') membre ACTIF d'une organisation VÉRIFIÉE. */
(function () {
  'use strict';
  var root = document.getElementById('mp-root');
  if (!root) return;

  function token() { try { return localStorage.getItem('lba-token') || ''; } catch (e) { return ''; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  var TEMPLATES = [
    { id: 'coupure-eau', label: 'Coupure d’eau', hint: 'Interruption du réseau d’eau potable.', cat: 'coupures-eau', title: 'Coupure d’eau' },
    { id: 'travaux', label: 'Travaux', hint: 'Chantier, voirie, réseau.', cat: 'travaux-voirie', title: 'Travaux' },
    { id: 'evenement', label: 'Événement', hint: 'Manifestation, fête, réunion publique.', cat: 'evenements-locaux', title: '' },
    { id: 'fermeture', label: 'Fermeture', hint: 'Service ou équipement fermé.', cat: 'mairie', title: 'Fermeture' },
    { id: 'libre', label: 'Message libre', hint: 'Tout autre type d’information.', cat: '', title: '' }
  ];
  var TPL_LABEL = {}; TEMPLATES.forEach(function (t) { TPL_LABEL[t.id] = t.label; });
  var STEPS = ['modele', 'contenu', 'relecture'];

  var state = {
    step: 'modele', orgs: [], pendingOrgs: [], suspendedOrgs: [], memberOrgs: [], org: null, loaded: false, authError: false,
    draft: { template: '', kind: 'info', title: '', body: '', category: '', starts_at: '', ends_at: '' },
    createdId: null, busy: false, err: '', ok: '',
    // Formulaire de demande d'accès (écran « Demande d'accès »).
    access: { name: '', type: 'commune', ville: '', departement: '', siren: '', role: 'admin', fonction: '', email: '', phone: '', justification: '', accept: false, website: '' },
    accessErr: '', accessBusy: false, accessSent: false
  };

  function api(method, path, body) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    var b = body ? Object.assign({}, body) : {};
    b.token = token();
    if (method !== 'GET') opts.body = JSON.stringify(b);
    var url = path + (method === 'GET' ? (path.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token()) : '');
    return fetch(url, opts).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); });
  }

  function loadOrgs() {
    return api('GET', '/api/organizations').then(function (r) {
      if (r.status === 401) { state.authError = true; return; }
      var list = (r.body && r.body.organizations) || [];
      state.memberOrgs = list;
      // Organisations VÉRIFIÉES dont l'utilisateur est membre ACTIF (peut publier).
      state.orgs = list.filter(function (o) { return o.status === 'verified' && o.my_member_status === 'actif'; });
      // Organisations liées EN ATTENTE de vérification (membre ou demandeur).
      state.pendingOrgs = list.filter(function (o) { return o.status === 'pending'; });
      // Organisations refusées/suspendues (motif affiché).
      state.suspendedOrgs = list.filter(function (o) { return o.status === 'suspended'; });
      state.org = state.orgs[0] || null;
    }).catch(function () { state.err = 'Chargement impossible.'; });
  }

  function progress() { return Math.round(((STEPS.indexOf(state.step) + 1) / STEPS.length) * 100); }

  function tplById(id) { for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i]; return null; }

  // ── Rendu des écrans ────────────────────────────────────────────────────────
  // Wrapper robuste : quelle que soit l'erreur, un écran VISIBLE est rendu (jamais de page vide).
  function render() {
    try { document.body.classList.remove('loading'); } catch (e) {}
    try { draw(); }
    catch (e) {
      try { root.innerHTML = block('<h1>Oups</h1><p>Une erreur est survenue à l’affichage de cette page. Rechargez pour réessayer.</p>'); } catch (_) {}
      try { console.error('[mairie-publier]', e); } catch (_) {}
    }
  }
  function draw() {
    if (state.authError) { root.innerHTML = block('<h1>Connexion requise</h1><p>Connectez-vous avec le compte de votre collectivité pour publier un événement.</p><p><a class="pub-btn" href="/connexion" style="display:inline-block;text-decoration:none;text-align:center">Se connecter</a></p>'); return; }
    if (!state.loaded) { root.innerHTML = block('<p>Chargement…</p>'); return; }
    if (!state.orgs.length) {
      if (state.accessSent) {
        root.innerHTML = block('<h1>Demande reçue 🙌</h1>' +
          '<p>Merci. Nous vérifions votre demande <strong>sous quelques jours</strong>&nbsp;: contrôle manuel que vous représentez bien cette structure, puis réponse par e-mail.</p>' +
          '<p><strong>Rien n’est publié</strong> tant que votre organisation n’est pas vérifiée. Vous pourrez alors revenir sur cette page pour publier vos événements.</p>');
        return;
      }
      if ((state.pendingOrgs || []).length) {
        var p = state.pendingOrgs[0];
        root.innerHTML = block('<h1>En attente de vérification</h1>' +
          '<p>Votre demande pour <strong>' + esc(p.name) + '</strong>' + (p.created_at ? ' (déposée le ' + esc(fmtDate(p.created_at)) + ')' : '') + ' est en cours d’examen. Vous serez prévenu par e-mail une fois votre organisation vérifiée.</p>' +
          '<p>Rien n’est publié avant la vérification.</p>');
        return;
      }
      if ((state.suspendedOrgs || []).length) {
        var su = state.suspendedOrgs[0];
        root.innerHTML = block('<h1>Demande non validée</h1>' +
          '<p>La demande pour <strong>' + esc(su.name) + '</strong> n’a pas été validée.</p>' +
          (su.status_reason ? '<p><strong>Motif&nbsp;:</strong> ' + esc(su.status_reason) + '</p>' : '') +
          '<p>Vous pouvez corriger et redéposer une demande ci-dessous.</p>' + accessFormHtml());
        bindAccessForm();
        return;
      }
      root.innerHTML = block(
        '<h1>Publier pour votre collectivité</h1>' +
        '<p>Vous n’êtes membre d’aucune organisation vérifiée. Déposez une demande d’accès&nbsp;: nous la vérifions avant toute publication.</p>' +
        accessFormHtml());
      bindAccessForm();
      return;
    }
    var html = '<section class="pub-step">';
    html += '<div class="pub-progress"><i style="width:' + progress() + '%"></i></div>';
    html += '<p class="pub-stepinfo">Étape ' + (STEPS.indexOf(state.step) + 1) + ' sur ' + STEPS.length + ' — ' + esc(state.org.name) + '</p>';
    if (state.step === 'modele') html += stepModele();
    else if (state.step === 'contenu') html += stepContenu();
    else html += stepRelecture();
    if (state.err) html += '<p class="pub-err">' + esc(state.err) + '</p>';
    if (state.ok) html += '<p class="pub-ok">' + esc(state.ok) + '</p>';
    html += actions();
    html += '</section>';
    root.innerHTML = html;
    wire();
  }
  function block(inner) { return '<section class="pub-step">' + inner + '</section>'; }

  // ── Écran « Demande d'accès » : vrai formulaire ───────────────────────────────
  function accessFormHtml() {
    var a = state.access;
    var typeOpt = function (v, label) { return '<option value="' + v + '"' + (a.type === v ? ' selected' : '') + '>' + label + '</option>'; };
    var roleOpt = function (v, label) { return '<option value="' + v + '"' + (a.role === v ? ' selected' : '') + '>' + label + '</option>'; };
    var commune = a.type === 'commune'
      ? '<div class="pub-row">' +
          '<label class="pub-field"><span>Commune</span><input id="mp-a-ville" type="text" maxlength="80" value="' + esc(a.ville) + '" placeholder="Ex. Gap"></label>' +
          '<label class="pub-field"><span>Département ou code postal</span><input id="mp-a-dept" type="text" maxlength="5" value="' + esc(a.departement) + '" placeholder="05 ou 05000"></label>' +
        '</div><p class="pub-hint" style="margin:-6px 0 14px">Saisissez le nom de la commune&nbsp;: le code INSEE est résolu automatiquement.</p>'
      : '<label class="pub-field"><span>SIREN de la structure</span><input id="mp-a-siren" type="text" maxlength="11" value="' + esc(a.siren) + '" placeholder="9 chiffres"></label>';
    return '<div class="pub-detailblock" style="margin-top:14px">' +
      '<label class="pub-field"><span>Nom de l’organisation</span><input id="mp-a-name" type="text" maxlength="120" value="' + esc(a.name) + '" placeholder="Ex. Mairie de Gap"><p class="pub-hint"><span id="mp-a-name-count">' + a.name.length + '</span>/120</p></label>' +
      '<label class="pub-field"><span>Type</span><select id="mp-a-type">' + typeOpt('commune', 'Commune') + typeOpt('epci', 'Intercommunalité (EPCI)') + typeOpt('autre', 'Association communale / autre') + '</select></label>' +
      commune +
      '<div class="pub-row">' +
        '<label class="pub-field"><span>Votre rôle</span><select id="mp-a-role">' + roleOpt('admin', 'Administrateur') + roleOpt('editeur', 'Éditeur') + '</select></label>' +
        '<label class="pub-field"><span>Votre fonction</span><input id="mp-a-fonction" type="text" maxlength="120" value="' + esc(a.fonction) + '" placeholder="Ex. Secrétaire de mairie"></label>' +
      '</div>' +
      '<label class="pub-field"><span>E-mail professionnel</span><input id="mp-a-email" type="email" maxlength="200" value="' + esc(a.email) + '" placeholder="prenom.nom@mairie-xxx.fr"><p class="pub-hint">Domaine&nbsp;: <strong id="mp-a-domain">' + esc(domainOf(a.email) || '—') + '</strong> — il nous aide à vérifier votre structure.</p></label>' +
      '<label class="pub-field"><span>Téléphone (facultatif)</span><input id="mp-a-phone" type="tel" maxlength="30" value="' + esc(a.phone) + '" placeholder="04 ..."></label>' +
      '<label class="pub-field"><span>En quelques mots, votre demande</span><textarea id="mp-a-just" maxlength="300" placeholder="Ex. Je suis en charge de la communication de la mairie.">' + esc(a.justification) + '</textarea><p class="pub-hint"><span id="mp-a-just-count">' + a.justification.length + '</span>/300</p></label>' +
      '<label style="display:flex;gap:10px;align-items:flex-start;margin:4px 0 2px;cursor:pointer"><input id="mp-a-accept" type="checkbox"' + (a.accept ? ' checked' : '') + ' style="width:auto;margin-top:3px"><span>J’accepte que mes informations soient utilisées pour vérifier ma demande (voir la <a href="/confidentialite">Confidentialité</a>).</span></label>' +
      // Honeypot anti-robot (invisible, non focusable).
      '<div aria-hidden="true" style="position:absolute;left:-9999px;top:auto;height:0;overflow:hidden"><label>Site web<input id="mp-a-website" type="text" tabindex="-1" autocomplete="off" value="' + esc(a.website) + '"></label></div>' +
      (state.accessErr ? '<p class="pub-err">' + esc(state.accessErr) + '</p>' : '') +
      '<div class="pub-actions"><button type="button" class="pub-btn" id="mp-a-submit"' + (state.accessBusy ? ' disabled' : '') + '>Envoyer ma demande</button></div>' +
      '</div>';
  }
  function domainOf(email) { var m = /@([^\s@]+)$/.exec(String(email || '').trim().toLowerCase()); return m ? m[1] : null; }

  function collectAccess() {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : undefined; };
    var a = state.access;
    if (g('mp-a-name') != null) a.name = g('mp-a-name');
    if (g('mp-a-type') != null) a.type = g('mp-a-type');
    if (g('mp-a-ville') != null) a.ville = g('mp-a-ville');
    if (g('mp-a-dept') != null) a.departement = g('mp-a-dept');
    if (g('mp-a-siren') != null) a.siren = g('mp-a-siren');
    if (g('mp-a-role') != null) a.role = g('mp-a-role');
    if (g('mp-a-fonction') != null) a.fonction = g('mp-a-fonction');
    if (g('mp-a-email') != null) a.email = g('mp-a-email');
    if (g('mp-a-phone') != null) a.phone = g('mp-a-phone');
    if (g('mp-a-just') != null) a.justification = g('mp-a-just');
    if (g('mp-a-website') != null) a.website = g('mp-a-website');
    var chk = document.getElementById('mp-a-accept'); if (chk) a.accept = chk.checked;
  }

  function bindAccessForm() {
    var sync = function () { collectAccess(); };
    ['mp-a-name', 'mp-a-ville', 'mp-a-dept', 'mp-a-siren', 'mp-a-role', 'mp-a-fonction', 'mp-a-phone', 'mp-a-website'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.oninput = sync;
    });
    var nameEl = document.getElementById('mp-a-name'); var nc = document.getElementById('mp-a-name-count');
    if (nameEl && nc) nameEl.addEventListener('input', function () { nc.textContent = nameEl.value.length; });
    var just = document.getElementById('mp-a-just'); var jc = document.getElementById('mp-a-just-count');
    if (just && jc) just.addEventListener('input', function () { collectAccess(); jc.textContent = just.value.length; });
    var email = document.getElementById('mp-a-email'); var dom = document.getElementById('mp-a-domain');
    if (email) email.addEventListener('input', function () { collectAccess(); if (dom) dom.textContent = domainOf(email.value) || '—'; });
    var typeEl = document.getElementById('mp-a-type'); if (typeEl) typeEl.onchange = function () { collectAccess(); render(); };
    var sub = document.getElementById('mp-a-submit'); if (sub) sub.onclick = submitAccess;
  }

  function submitAccess() {
    collectAccess();
    var a = state.access;
    state.accessErr = '';
    if (!a.name || a.name.trim().length < 3) { state.accessErr = 'Indiquez le nom de votre organisation (3 caractères min).'; return render(); }
    if (a.type === 'commune' && (!a.ville || a.ville.trim() === '')) { state.accessErr = 'Indiquez votre commune.'; return render(); }
    if (a.type !== 'commune' && !/^\d{9}$/.test(String(a.siren).replace(/\s+/g, ''))) { state.accessErr = 'Indiquez un SIREN valide (9 chiffres).'; return render(); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a.email)) { state.accessErr = 'Indiquez un e-mail professionnel valide.'; return render(); }
    if (!a.accept) { state.accessErr = 'Merci de cocher l’acceptation pour continuer.'; return render(); }

    state.accessBusy = true; render();
    var body = {
      name: a.name, type: a.type, role: a.role, fonction: a.fonction || undefined,
      email: a.email, phone: a.phone || undefined, justification: a.justification || undefined,
      website: a.website || undefined
    };
    if (a.type === 'commune') { body.ville = a.ville; body.departement = a.departement || undefined; }
    else { body.siren = String(a.siren).replace(/\s+/g, ''); }
    api('POST', '/api/organizations', body).then(function (r) {
      state.accessBusy = false;
      if (!r.ok) { state.accessErr = (r.body && r.body.error) || 'Envoi impossible, réessayez.'; return render(); }
      state.accessSent = true; render();
    }).catch(function () { state.accessBusy = false; state.accessErr = 'Envoi impossible, réessayez.'; render(); });
  }

  function orgPicker() {
    if (state.orgs.length < 2) return '';
    var opts = state.orgs.map(function (o) { return '<option value="' + o.id + '"' + (state.org && state.org.id === o.id ? ' selected' : '') + '>' + esc(o.name) + '</option>'; }).join('');
    return '<label class="pub-field"><span>Organisation</span><select id="mp-org">' + opts + '</select></label>';
  }

  function stepModele() {
    var cards = TEMPLATES.map(function (t) {
      var on = state.draft.template === t.id;
      return '<button type="button" class="pub-card" data-tpl="' + t.id + '" aria-pressed="' + (on ? 'true' : 'false') + '"><b>' + esc(t.label) + '</b><span>' + esc(t.hint) + '</span></button>';
    }).join('');
    return '<h1>Quel type d’information ?</h1>' + orgPicker() +
      '<div class="pub-cards">' + cards + '</div>' +
      '<label class="pub-field" style="margin-top:16px"><span>Titre</span><input id="mp-title" type="text" maxlength="120" value="' + esc(state.draft.title) + '" placeholder="Ex. Coupure d’eau secteur centre-ville"></label>';
  }

  function stepContenu() {
    var k = state.draft.kind || 'info';
    var kindCards =
      '<div class="pub-cards" style="grid-template-columns:1fr 1fr">' +
        '<button type="button" class="pub-card" data-kind="alerte" aria-pressed="' + (k === 'alerte' ? 'true' : 'false') + '"><b>Alerte</b><span>Prévenir les habitants maintenant (notification).</span></button>' +
        '<button type="button" class="pub-card" data-kind="info" aria-pressed="' + (k === 'info' ? 'true' : 'false') + '"><b>Information</b><span>Visible sur la fiche de la commune, sans notification.</span></button>' +
      '</div>';
    return '<div class="pub-detailblock"><h1>Le message</h1>' +
      '<label class="pub-field"><span>Type</span></label>' + kindCards +
      '<p class="pub-hint" style="margin:6px 0 14px">Alerte : prévenir les habitants maintenant. Information : visible sur la fiche, sans notification.</p>' +
      '<label class="pub-field"><span>Texte (vu par les habitants)</span><textarea id="mp-body" maxlength="2000" placeholder="Décrivez l’information : quoi, où, quand, consignes…">' + esc(state.draft.body) + '</textarea></label>' +
      '<div class="pub-row">' +
        '<label class="pub-field"><span>Début (facultatif)</span><input id="mp-start" type="datetime-local" value="' + esc(state.draft.starts_at) + '"></label>' +
        '<label class="pub-field"><span>Fin / expiration (facultatif)</span><input id="mp-end" type="datetime-local" value="' + esc(state.draft.ends_at) + '"></label>' +
      '</div>' +
      '<label class="pub-field"><span>Catégorie (facultatif)</span><input id="mp-cat" type="text" maxlength="30" value="' + esc(state.draft.category) + '" placeholder="ex. coupures-eau, travaux-voirie…"><p class="pub-hint">Laissez vide pour reprendre la catégorie du modèle.</p></label>' +
      '</div>';
  }

  function fmtDate(v) { if (!v) return ''; try { return new Date(v).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return v; } }

  function stepRelecture() {
    var d = state.draft;
    var meta = [(d.kind === 'alerte' ? 'Alerte' : 'Information'), TPL_LABEL[d.template] || '', state.org.name].filter(Boolean);
    var dates = '';
    if (d.starts_at || d.ends_at) dates = '<p class="meta">' + (d.starts_at ? 'Du ' + esc(fmtDate(d.starts_at)) : '') + (d.ends_at ? ' au ' + esc(fmtDate(d.ends_at)) : '') + '</p>';
    return '<div class="pub-detailblock"><h1>Relecture</h1>' +
      '<p class="pub-hint">Voici ce que verront les habitants de la commune. Aucune notification n’est envoyée : l’événement apparaît sur la fiche de la commune.</p>' +
      '<div class="pub-preview"><p class="meta">' + esc(meta.join(' · ')) + '</p>' +
        '<h3>' + esc(d.title) + '</h3>' + dates +
        '<p class="body">' + esc(d.body) + '</p></div></div>';
  }

  function actions() {
    var i = STEPS.indexOf(state.step);
    var back = i > 0 ? '<button type="button" class="pub-btn ghost" id="mp-back">Retour</button>' : '';
    var nextLabel = state.step === 'relecture' ? 'Publier' : 'Continuer';
    var next = '<button type="button" class="pub-btn" id="mp-next"' + (state.busy ? ' disabled' : '') + '>' + nextLabel + '</button>';
    return '<div class="pub-actions">' + back + next + '</div>';
  }

  // ── Validation côté client (le serveur reste l’autorité) ──────────────────────
  function validate(step) {
    var d = state.draft;
    if (step === 'modele') {
      if (!d.template) return 'Choisissez un modèle.';
      if (!d.title || d.title.trim().length < 3) return 'Donnez un titre (3 caractères min).';
    }
    if (step === 'contenu') {
      if (!d.body || d.body.trim().length < 10) return 'Le texte doit faire au moins 10 caractères.';
      if (d.starts_at && d.ends_at && new Date(d.ends_at) <= new Date(d.starts_at)) return 'La date de fin doit suivre la date de début.';
    }
    return '';
  }

  function collect() {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : undefined; };
    if (state.step === 'modele') { if (g('mp-title') != null) state.draft.title = g('mp-title'); if (g('mp-org') != null) { state.org = state.orgs.filter(function (o) { return String(o.id) === g('mp-org'); })[0] || state.org; } }
    if (state.step === 'contenu') { state.draft.body = g('mp-body') || ''; state.draft.starts_at = g('mp-start') || ''; state.draft.ends_at = g('mp-end') || ''; state.draft.category = (g('mp-cat') || '').trim(); }
  }

  // Crée (ou met à jour) le brouillon serveur à la sortie de l’écran 2, puis publie à l’écran 3.
  function ensureDraft() {
    var d = state.draft;
    var tpl = tplById(d.template);
    var payload = {
      template: d.template, kind: d.kind || 'info', title: d.title, body: d.body,
      category: d.category || (tpl ? tpl.cat : '') || undefined,
      starts_at: d.starts_at || undefined, ends_at: d.ends_at || undefined
    };
    if (state.createdId) {
      return api('PATCH', '/api/municipal-events/' + state.createdId, payload);
    }
    return api('POST', '/api/organizations/' + state.org.id + '/events', payload).then(function (r) {
      if (r.ok && r.body.event) state.createdId = r.body.event.id;
      return r;
    });
  }

  function goNext() {
    state.err = ''; state.ok = ''; collect();
    var v = validate(state.step);
    if (v) { state.err = v; render(); return; }
    if (state.step === 'modele') { state.step = 'contenu'; render(); return; }
    if (state.step === 'contenu') {
      state.busy = true; render();
      ensureDraft().then(function (r) {
        state.busy = false;
        if (!r.ok) { state.err = (r.body && r.body.error) || 'Enregistrement impossible.'; render(); return; }
        state.step = 'relecture'; render();
      });
      return;
    }
    // relecture → Publier
    state.busy = true; render();
    ensureDraft().then(function (r) {
      if (!r.ok) { state.busy = false; state.err = (r.body && r.body.error) || 'Enregistrement impossible.'; render(); return; }
      api('POST', '/api/municipal-events/' + state.createdId + '/publish').then(function (p) {
        state.busy = false;
        if (!p.ok) { state.err = (p.body && p.body.error) || 'Publication impossible.'; render(); return; }
        state.ok = p.body.published ? 'Publié : l’événement est visible sur la fiche de la commune.' : 'Envoyé en relecture : un administrateur de l’organisation doit le publier.';
        root.innerHTML = block('<h1>' + (p.body.published ? 'C’est publié ✅' : 'Envoyé en relecture ✅') + '</h1><p>' + esc(state.ok) + '</p><p><a class="pub-btn" href="/mairie/publier" style="display:inline-block;text-decoration:none;text-align:center">Nouvel événement</a></p>');
      });
    });
  }

  function goBack() { state.err = ''; state.ok = ''; collect(); var i = STEPS.indexOf(state.step); if (i > 0) state.step = STEPS[i - 1]; render(); }

  function wire() {
    [].forEach.call(root.querySelectorAll('.pub-card[data-tpl]'), function (b) {
      b.onclick = function () { var t = tplById(b.getAttribute('data-tpl')); state.draft.template = t.id; if (t.title && (!state.draft.title || state.draft.title.trim() === '')) state.draft.title = t.title; render(); };
    });
    [].forEach.call(root.querySelectorAll('.pub-card[data-kind]'), function (b) {
      b.onclick = function () { collect(); state.draft.kind = b.getAttribute('data-kind'); render(); };
    });
    var next = document.getElementById('mp-next'); if (next) next.onclick = goNext;
    var back = document.getElementById('mp-back'); if (back) back.onclick = goBack;
    var orgSel = document.getElementById('mp-org'); if (orgSel) orgSel.onchange = function () { state.org = state.orgs.filter(function (o) { return String(o.id) === orgSel.value; })[0] || state.org; };
  }

  // ── Démarrage ─────────────────────────────────────────────────────────────────
  if (!token()) { state.authError = true; state.loaded = true; render(); return; }
  render();
  loadOrgs().then(function () { state.loaded = true; render(); });
})();
