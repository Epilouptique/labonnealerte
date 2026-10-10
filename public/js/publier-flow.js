/* publier-flow.js — LOGIQUE PURE du parcours « Publier une alerte » (LOT 4).
 * Sans DOM ni réseau : enchaînement des étapes, validations, gating du bouton
 * « Continuer », messages d'erreur. Utilisé par publier.js (navigateur) ET par
 * scripts/test-publier-flow.js (node). Aucune dépendance. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PublierFlow = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Ordre cible (LOT 5) : un brouillon MINIMAL (type+url) est créé dès l'étape
  // « adresse », ce qui permet l'aperçu avant la présentation. La présentation
  // (nom, catégories, perso) est ensuite envoyée par PATCH.
  var STEPS = ['type', 'adresse', 'apercu', 'presentation', 'recap'];
  var STEP_TITLES = {
    type: 'Que voulez-vous surveiller ?',
    adresse: 'L’adresse à surveiller',
    apercu: 'Aperçu',
    presentation: 'Présentez votre alerte',
    recap: 'Récapitulatif',
  };
  var TYPES = {
    page: { engine: 'veille-page', label: 'Une page web', example: 'Ex. : la page des tarifs d’un service, une fiche produit.' },
    rss: { engine: 'veille-rss', label: 'Un flux d’actualités (RSS)', example: 'Ex. : le blog ou le fil d’actualité d’une organisation.' },
    agenda: { engine: 'veille-agenda', label: 'Un agenda (iCal)', example: 'Ex. : l’agenda public d’un club ou d’une salle.' },
  };

  var HTTPS_RE = /^https:\/\/[^\s]{1,300}$/i;
  var ALERT_URL_RE = /^https?:\/\/[^\s]{1,500}$/i;
  // Sélecteur simple : balise, #id, .classe, ou balise#id / balise.classe.
  var SELECTOR_RE = /^(?:[a-zA-Z][a-zA-Z0-9]{0,20})?(?:[#.][A-Za-z][\w-]{0,50})?$/;

  function isValidSelector(sel) {
    if (typeof sel !== 'string') return false;
    var s = sel.trim();
    if (!s || s.length > 64) return false;
    return SELECTOR_RE.test(s) && /[a-zA-Z]/.test(s);
  }

  function emptyDraft() {
    return { step: 'type', type: null, url: '', zone: '', previewOk: false,
      name: '', categories: [], alert_message: '', alert_url: '', preavis: 1,
      id: null, status: null };
  }

  // Valide l'étape courante. Renvoie { ok, error? }.
  function validateStep(step, d) {
    d = d || {};
    switch (step) {
      case 'type':
        return TYPES[d.type] ? { ok: true } : { ok: false, error: 'Choisissez ce que vous voulez surveiller.' };
      case 'adresse':
        if (!HTTPS_RE.test(String(d.url || '').trim())) return { ok: false, error: 'Entrez une adresse https valide (max 300 caractères).' };
        if (d.zone && String(d.zone).trim()) {
          if (d.type !== 'page') return { ok: false, error: 'La zone ne s’applique qu’à une page web.' };
          if (!isValidSelector(d.zone)) return { ok: false, error: 'Zone invalide : utilisez une balise, #identifiant ou .classe simple.' };
        }
        return { ok: true };
      case 'apercu':
        return d.previewOk ? { ok: true } : { ok: false, error: 'Lancez un aperçu réussi avant de continuer.' };
      case 'presentation': {
        var name = String(d.name || '').trim();
        if (name.length < 3 || name.length > 60) return { ok: false, error: 'Le nom doit faire de 3 à 60 caractères.' };
        if (!Array.isArray(d.categories) || d.categories.length < 1) return { ok: false, error: 'Choisissez au moins une catégorie.' };
        if (d.categories.length > 3) return { ok: false, error: '3 catégories au maximum.' };
        if (d.alert_message && String(d.alert_message).length > 280) return { ok: false, error: 'Message d’alerte trop long (280 caractères max).' };
        if (d.alert_url && String(d.alert_url).trim() && !ALERT_URL_RE.test(String(d.alert_url).trim())) return { ok: false, error: 'Lien d’alerte invalide (http/https).' };
        if (d.type === 'agenda') { var p = parseInt(d.preavis, 10); if (isNaN(p) || p < 0 || p > 30) return { ok: false, error: 'Préavis entre 0 et 30 jours.' }; }
        return { ok: true };
      }
      case 'recap':
        return { ok: true };
      default:
        return { ok: false, error: 'Étape inconnue.' };
    }
  }

  function canContinue(step, d) { return validateStep(step, d).ok; }
  function indexOf(step) { return STEPS.indexOf(step); }
  function nextStep(step) { var i = indexOf(step); return i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1] : step; }
  function prevStep(step) { var i = indexOf(step); return i > 0 ? STEPS[i - 1] : step; }
  function progress(step) { var i = indexOf(step); return Math.round(((i + 1) / STEPS.length) * 100); }

  // Modifier l'URL ou la zone invalide l'aperçu déjà obtenu.
  function invalidatesPreview(field) { return field === 'url' || field === 'zone' || field === 'type'; }

  // Traduit une erreur de création (HTTP + corps) en message clair.
  function mapCreateError(status, body) {
    body = body || {};
    if (status === 409 && body.existing) {
      return { message: 'Une source surveille déjà cette adresse.', link: body.existing.url, linkLabel: 'Voir « ' + (body.existing.name || 'la source existante') + ' »' };
    }
    if (status === 409) return { message: body.error || 'Limite de publications atteinte pour votre compte.' };
    if (status === 400) return { message: body.error || 'Adresse ou champ refusé.' };
    if (status === 401) return { message: 'Connexion requise pour publier.' };
    return { message: body.error || 'Une erreur est survenue, réessayez.' };
  }

  // Corps MINIMAL pour POST /api/community-sources (étape adresse) : type + url (+ zone page).
  function createBody(d) {
    var b = { type: d.type, url: String(d.url || '').trim() };
    if (d.type === 'page' && d.zone && String(d.zone).trim()) b.zone = String(d.zone).trim();
    return b;
  }

  // Corps PATCH pour l'étape « présentation » (nom, catégories, perso, préavis).
  function presentationBody(d) {
    var b = { name: String(d.name || '').trim(), categories: (d.categories || []).slice(),
      alert_message: d.alert_message ? String(d.alert_message).trim() : '',
      alert_url: d.alert_url ? String(d.alert_url).trim() : '' };
    if (d.type === 'agenda') b.preavis = parseInt(d.preavis, 10) || 1;
    return b;
  }

  // Corps PATCH quand l'adresse/zone change après création (étape adresse, brouillon existant).
  function addressBody(d) {
    var b = { url: String(d.url || '').trim() };
    if (d.type === 'page') b.zone = d.zone ? String(d.zone).trim() : '';
    return b;
  }

  // Libellé lisible d'un statut (page « Mes publications »).
  function statusLabel(status, reason) {
    switch (status) {
      case 'draft': return 'Brouillon';
      case 'testing': return 'À tester';
      case 'review': return 'En revue';
      case 'published': return 'Publiée';
      case 'suspended': return reason ? 'Suspendue — ' + reason : 'Suspendue';
      default: return status || '—';
    }
  }

  return { STEPS: STEPS, STEP_TITLES: STEP_TITLES, TYPES: TYPES, HTTPS_RE: HTTPS_RE,
    isValidSelector: isValidSelector, emptyDraft: emptyDraft, validateStep: validateStep,
    canContinue: canContinue, indexOf: indexOf, nextStep: nextStep, prevStep: prevStep,
    progress: progress, invalidatesPreview: invalidatesPreview, mapCreateError: mapCreateError,
    createBody: createBody, presentationBody: presentationBody, addressBody: addressBody,
    statusLabel: statusLabel };
});
