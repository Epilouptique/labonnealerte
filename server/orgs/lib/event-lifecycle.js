// Cycle de vie d'un ÉVÉNEMENT MUNICIPAL (chantier « mairies », LOT B) — LOGIQUE PURE
// (hors réseau, hors base). Statuts, droits par rôle, modèles de message, validation de
// saisie (champs obligatoires, cohérence des dates). AUCUN envoi de notification dans ce
// lot : publier ne fait que rendre l'événement visible (kiosque/fiche commune).
'use strict';

// Modèles de message proposés à l'écran 1 (le texte reste libre à l'écran 2).
const TEMPLATES = ['coupure-eau', 'travaux', 'evenement', 'fermeture', 'libre'];
function isTemplate(t) { return TEMPLATES.includes(String(t || '')); }

// draft (brouillon) · review (relecture) · published (publié) · cancelled (annulé).
const EVENT_STATUSES = ['draft', 'review', 'published', 'cancelled'];
// Transitions autorisées (acteur = membre de l'organisation ; le rôle décide du droit, cf.
// roleCan). review existe pour le circuit éditeur→admin : un éditeur « soumet », un admin publie.
const EVENT_TRANSITIONS = {
  draft:     ['review', 'published', 'cancelled'],
  review:    ['published', 'draft', 'cancelled'],
  published: ['cancelled'],
  cancelled: [],
};
function canTransitionEvent(from, to) {
  if (!EVENT_STATUSES.includes(from) || !EVENT_STATUSES.includes(to)) return false;
  return (EVENT_TRANSITIONS[from] || []).includes(to);
}
// Un événement n'est modifiable qu'en brouillon ou en relecture.
function isEditable(status) { return status === 'draft' || status === 'review'; }

// ── Droits par rôle (le membre doit être ACTIF ; l'organisation VÉRIFIÉE est contrôlée
// côté route). admin : tout, y compris PUBLIER. editeur : créer/éditer/soumettre/annuler,
// mais pas publier directement (sa demande passe en relecture). ──────────────────────
function roleCan(role, action) {
  const editor = ['create', 'edit', 'submit', 'cancel'];
  const admin = editor.concat(['publish']);
  if (role === 'admin') return admin.includes(action);
  if (role === 'editeur') return editor.includes(action);
  return false;
}
function canPublish(role) { return role === 'admin'; }
// Cible de l'action « Publier » selon le rôle : un admin publie, un éditeur envoie en relecture.
function publishTargetFor(role) { return canPublish(role) ? 'published' : 'review'; }

// ── Validation de saisie ───────────────────────────────────────────────────────
const TITLE_MIN = 3, TITLE_MAX = 120, BODY_MIN = 10, BODY_MAX = 2000;
// Texte brut : on retire les caractères de contrôle MAIS on conserve les sauts de ligne.
function cleanLine(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim(); }
function cleanBody(v) {
  return String(v == null ? '' : v)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ') // contrôles sauf \n (\u000a)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function parseDate(v) {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d; // undefined = fourni mais invalide
}

// Valide la saisie d'un événement. `isValidCategory` (optionnel) teste un slug de catégorie.
// Renvoie { ok, error?, value:{ template, title, body, category, starts_at, ends_at } }.
// starts_at/ends_at sont des Date|null. Cohérence : fin > début si les deux sont fournis.
function validateEventInput(body, opts = {}) {
  const b = body || {};
  const template = String(b.template || 'libre').trim().toLowerCase();
  if (!isTemplate(template)) return { ok: false, error: 'Modèle inconnu.' };

  const title = cleanLine(b.title);
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    return { ok: false, error: `Titre requis (${TITLE_MIN} à ${TITLE_MAX} caractères).` };
  }
  const text = cleanBody(b.body);
  if (text.length < BODY_MIN || text.length > BODY_MAX) {
    return { ok: false, error: `Texte requis (${BODY_MIN} à ${BODY_MAX} caractères).` };
  }

  let category = null;
  if (b.category != null && String(b.category).trim() !== '') {
    const c = String(b.category).trim().toLowerCase();
    if (opts.isValidCategory && !opts.isValidCategory(c)) return { ok: false, error: 'Catégorie inconnue.' };
    category = c;
  }

  const starts_at = parseDate(b.starts_at);
  const ends_at = parseDate(b.ends_at);
  if (starts_at === undefined) return { ok: false, error: 'Date de début invalide.' };
  if (ends_at === undefined) return { ok: false, error: 'Date de fin invalide.' };
  if (starts_at && ends_at && ends_at.getTime() <= starts_at.getTime()) {
    return { ok: false, error: 'La date de fin doit être postérieure à la date de début.' };
  }

  return { ok: true, value: { template, title, body: text, category, starts_at: starts_at || null, ends_at: ends_at || null } };
}

// Un événement publié est « vivant » tant qu'il n'a pas de fin passée (expiration).
function isLive(row, now) {
  if (!row || row.status !== 'published') return false;
  const t = now == null ? Date.now() : now;
  if (!row.ends_at) return true;
  return new Date(row.ends_at).getTime() > t;
}

module.exports = {
  TEMPLATES, isTemplate, EVENT_STATUSES, EVENT_TRANSITIONS, canTransitionEvent, isEditable,
  roleCan, canPublish, publishTargetFor,
  TITLE_MIN, TITLE_MAX, BODY_MIN, BODY_MAX, cleanLine, cleanBody, parseDate,
  validateEventInput, isLive,
};
