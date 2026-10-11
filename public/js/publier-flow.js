/* publier-flow.js — LOGIQUE PURE du parcours « Publier une alerte » (LOT 9, 2 écrans).
 * Sans DOM ni réseau : enchaînement des 2 écrans, validations, suggestions de catégories
 * par mots-clés du titre (sans IA), regroupement des catégories par famille, corps des
 * requêtes vers les routes existantes (POST/PATCH/preview/submit). Utilisé par publier.js
 * (navigateur) ET par les tests node. Aucune dépendance. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PublierFlow = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Deux écrans + confirmation. L'écran 1 collecte titre + catégorie ; l'écran 2 collecte
  // type + adresse, lance l'aperçu sur place, puis valide (soumission).
  var STEPS = ['essentiel', 'details'];
  var STEP_TITLES = {
    essentiel: 'Commençons par l’essentiel !',
    details: 'Dites-nous en plus sur votre alerte',
  };
  var TYPES = {
    page: { engine: 'veille-page', label: 'Une page web', example: 'Ex. : la page des tarifs d’un service, une fiche produit.' },
    rss: { engine: 'veille-rss', label: 'Un flux d’actualités (RSS)', example: 'Ex. : le blog ou le fil d’actualité d’une organisation.' },
    agenda: { engine: 'veille-agenda', label: 'Un agenda (iCal)', example: 'Ex. : l’agenda public d’un club ou d’une salle.' },
  };

  var TITLE_MAX = 40;
  var HTTPS_RE = /^https:\/\/[^\s]{1,300}$/i;
  var ALERT_URL_RE = /^https?:\/\/[^\s]{1,500}$/i;
  var SELECTOR_RE = /^(?:[a-zA-Z][a-zA-Z0-9]{0,20})?(?:[#.][A-Za-z][\w-]{0,50})?$/;

  function isValidSelector(sel) {
    if (typeof sel !== 'string') return false;
    var s = sel.trim();
    if (!s || s.length > 64) return false;
    return SELECTOR_RE.test(s) && /[a-zA-Z]/.test(s);
  }

  function emptyDraft() {
    return { step: 'essentiel', title: '', categories: [], type: null, url: '', zone: '',
      alert_message: '', alert_url: '', preavis: 1, previewOk: false, previewExtract: null,
      previewUnstable: false, id: null, status: null, syncedUrl: null, syncedZone: null };
  }

  // ── Normalisation / mots-clés ────────────────────────────────────────────────
  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  // Mots « vides » ignorés pour la suggestion (articles, prépositions courantes).
  var STOP = { le: 1, la: 1, les: 1, de: 1, des: 1, du: 1, un: 1, une: 1, et: 1, ou: 1, aux: 1, au: 1, pour: 1, sur: 1, dans: 1, par: 1, avec: 1, mon: 1, ma: 1, mes: 1, the: 1 };
  function tokens(title) {
    return norm(title).split(/[^a-z0-9]+/).filter(function (t) { return t.length >= 3 && !STOP[t]; });
  }

  // Suggère jusqu'à 3 catégories à partir des mots-clés du titre (aucune IA) : un mot du
  // titre qui préfixe un mot du libellé ou du slug marque un point. Tri par score puis label.
  function suggestCategories(title, cats, max) {
    var list = Array.isArray(cats) ? cats : [];
    var tk = tokens(title);
    if (!tk.length) return [];
    var scored = [];
    list.forEach(function (c) {
      var words = (norm(c.label) + ' ' + norm(c.slug).replace(/-/g, ' ')).split(/[^a-z0-9]+/).filter(Boolean);
      var score = 0;
      tk.forEach(function (t) {
        for (var i = 0; i < words.length; i++) {
          if (words[i] === t || words[i].indexOf(t) === 0 || t.indexOf(words[i]) === 0) { score++; break; }
        }
      });
      if (score > 0) scored.push({ slug: c.slug, label: c.label, group: c.group, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score || String(a.label).localeCompare(String(b.label)); });
    return scored.slice(0, max || 3);
  }

  // Regroupe les catégories par famille (group) pour la liste déroulante : [{group, items:[{slug,label}]}].
  // L'ordre des familles suit leur première apparition dans la liste reçue.
  function groupedCategories(cats) {
    var list = Array.isArray(cats) ? cats : [];
    var order = [], by = {};
    list.forEach(function (c) {
      var g = c.group || 'autre';
      if (!by[g]) { by[g] = []; order.push(g); }
      by[g].push({ slug: c.slug, label: c.label });
    });
    return order.map(function (g) {
      by[g].sort(function (a, b) { return String(a.label).localeCompare(String(b.label)); });
      return { group: g, items: by[g] };
    });
  }

  // ── Validations ──────────────────────────────────────────────────────────────
  function validateTitle(title) {
    var t = String(title || '').trim();
    if (t.length < 3) return { ok: false, error: 'Donnez un titre (au moins 3 caractères).' };
    if (t.length > TITLE_MAX) return { ok: false, error: 'Titre trop long (' + TITLE_MAX + ' caractères maximum).' };
    return { ok: true };
  }

  function validateStep(step, d) {
    d = d || {};
    switch (step) {
      case 'essentiel': {
        var vt = validateTitle(d.title);
        if (!vt.ok) return vt;
        var cats = Array.isArray(d.categories) ? d.categories : [];
        if (cats.length < 1) return { ok: false, error: 'Choisissez au moins une catégorie.' };
        if (cats.length > 3) return { ok: false, error: '3 catégories au maximum.' };
        return { ok: true };
      }
      case 'details': {
        if (!TYPES[d.type]) return { ok: false, error: 'Choisissez ce que vous voulez surveiller.' };
        if (!HTTPS_RE.test(String(d.url || '').trim())) return { ok: false, error: 'Entrez une adresse https valide (max 300 caractères).' };
        if (d.zone && String(d.zone).trim()) {
          if (d.type !== 'page') return { ok: false, error: 'La zone ne s’applique qu’à une page web.' };
          if (!isValidSelector(d.zone)) return { ok: false, error: 'Zone invalide : une balise, #identifiant ou .classe simple.' };
        }
        if (d.alert_message && String(d.alert_message).length > 280) return { ok: false, error: 'Message d’alerte trop long (280 caractères max).' };
        if (d.alert_url && String(d.alert_url).trim() && !ALERT_URL_RE.test(String(d.alert_url).trim())) return { ok: false, error: 'Lien d’alerte invalide (http/https).' };
        if (d.type === 'agenda') { var p = parseInt(d.preavis, 10); if (isNaN(p) || p < 0 || p > 30) return { ok: false, error: 'Préavis entre 0 et 30 jours.' }; }
        return { ok: true };
      }
      default:
        return { ok: false, error: 'Étape inconnue.' };
    }
  }

  function canContinue(step, d) { return validateStep(step, d).ok; }
  function indexOf(step) { return STEPS.indexOf(step); }
  function nextStep(step) { var i = indexOf(step); return i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1] : step; }
  function prevStep(step) { var i = indexOf(step); return i > 0 ? STEPS[i - 1] : step; }
  function progress(step) { var i = indexOf(step); return Math.round(((i + 1) / STEPS.length) * 100); }
  function invalidatesPreview(field) { return field === 'url' || field === 'zone' || field === 'type'; }

  function mapCreateError(status, body) {
    body = body || {};
    if (status === 409 && body.existing) {
      return { message: 'Une alerte surveille déjà cette adresse.', link: body.existing.url, linkLabel: 'Voir « ' + (body.existing.name || 'l’alerte existante') + ' »' };
    }
    if (status === 409) return { message: body.error || 'Limite de publications atteinte pour votre compte.' };
    if (status === 400) return { message: body.error || 'Adresse ou champ refusé.' };
    if (status === 401) return { message: 'Connexion requise pour publier.' };
    return { message: body.error || 'Une erreur est survenue, réessayez.' };
  }

  // Corps de création : titre + catégorie + type + url envoyés DÈS la création (plus de nom
  // provisoire ; l'id public dérive du titre côté serveur).
  function createBody(d) {
    var b = { type: d.type, url: String(d.url || '').trim(),
      name: String(d.title || '').trim(), categories: (Array.isArray(d.categories) ? d.categories : []).slice(0, 3) };
    if (d.type === 'page' && d.zone && String(d.zone).trim()) b.zone = String(d.zone).trim();
    if (d.alert_message && String(d.alert_message).trim()) b.alert_message = String(d.alert_message).trim();
    if (d.alert_url && String(d.alert_url).trim()) b.alert_url = String(d.alert_url).trim();
    if (d.type === 'agenda') b.preavis = parseInt(d.preavis, 10) || 1;
    return b;
  }

  // Corps PATCH quand l'adresse/zone change après création (nouvel aperçu requis).
  function addressBody(d) {
    var b = { url: String(d.url || '').trim() };
    if (d.type === 'page') b.zone = d.zone ? String(d.zone).trim() : '';
    return b;
  }

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

  return { STEPS: STEPS, STEP_TITLES: STEP_TITLES, TYPES: TYPES, TITLE_MAX: TITLE_MAX, HTTPS_RE: HTTPS_RE,
    isValidSelector: isValidSelector, emptyDraft: emptyDraft,
    tokens: tokens, suggestCategories: suggestCategories, groupedCategories: groupedCategories,
    validateTitle: validateTitle, validateStep: validateStep, canContinue: canContinue,
    indexOf: indexOf, nextStep: nextStep, prevStep: prevStep, progress: progress,
    invalidatesPreview: invalidatesPreview, mapCreateError: mapCreateError,
    createBody: createBody, addressBody: addressBody, statusLabel: statusLabel };
});
