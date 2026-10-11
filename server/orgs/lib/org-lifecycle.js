// Cycle de vie d'une ORGANISATION (mairie / EPCI / autre) — LOGIQUE PURE (hors réseau,
// hors base), importée par la route /api/organizations, le script d'administration et les
// tests. Statuts, rôles, transitions, quotas et validations y sont testables unitairement.
// Aucune publication d'événement ici : une organisation non vérifiée ne peut rien émettre
// (cf. rapports/mairies-faisabilite-2026-10-11.md, lot A).
'use strict';

// ── Organisations ────────────────────────────────────────────────────────────
const ORG_TYPES = ['commune', 'epci', 'autre'];
const ORG_STATUSES = ['pending', 'verified', 'suspended'];

// Transitions RÉSERVÉES À L'ADMIN (acteur unique de ce lot ; le demandeur ne fait que créer).
//   pending  → verified  (vérification)
//   pending  → suspended (refus, motif obligatoire)
//   verified → suspended (suspension, motif obligatoire)
//   suspended→ verified  (réhabilitation)
const ORG_TRANSITIONS = {
  pending:   { verified: 'admin', suspended: 'admin' },
  verified:  { suspended: 'admin' },
  suspended: { verified: 'admin' },
};
function canTransitionOrg(from, to, actor) {
  if (!ORG_STATUSES.includes(from) || !ORG_STATUSES.includes(to)) return false;
  const allowed = ORG_TRANSITIONS[from] && ORG_TRANSITIONS[from][to];
  return allowed ? allowed === actor : false;
}
// Un refus/suspension exige un motif ; une vérification n'en demande pas.
function transitionNeedsReason(to) { return to === 'suspended'; }

// ── Membres ──────────────────────────────────────────────────────────────────
const MEMBER_ROLES = ['admin', 'editeur'];
const MEMBER_STATUSES = ['invite', 'actif'];
function isValidRole(r) { return MEMBER_ROLES.includes(String(r || '')); }
// Seul un membre ADMIN et ACTIF peut gérer l'organisation (inviter, éditer les membres).
function canManageMembers(member) {
  return !!member && member.role === 'admin' && member.status === 'actif';
}

// ── Quotas & fréquence ─────────────────────────────────────────────────────────
// Un compte ne peut pas ouvrir une infinité de demandes : plafond de demandes non closes
// (pending/verified) qu'il a lui-même créées, et fenêtre anti-rafale.
const MAX_ORGS_PER_ACCOUNT = Math.max(1, parseInt(process.env.ORG_MAX_PER_ACCOUNT || '', 10) || 3);
const CREATE_WINDOW_MS = Math.max(1000, parseInt(process.env.ORG_CREATE_WINDOW_MS || '', 10) || 10 * 60_000);
const CREATE_MAX = Math.max(1, parseInt(process.env.ORG_CREATE_MAX || '', 10) || 3);
function checkOrgQuota({ activeCount }) {
  if ((activeCount || 0) >= MAX_ORGS_PER_ACCOUNT) {
    return { ok: false, error: `Limite atteinte : ${MAX_ORGS_PER_ACCOUNT} organisations maximum par compte.` };
  }
  return { ok: true };
}

// ── Identifiants officiels ─────────────────────────────────────────────────────
const INSEE_RE = /^(?:[0-9]{2}|2[AB])[0-9]{3}$/i;        // commune (Corse 2A/2B)
function isInsee(s) { return INSEE_RE.test(String(s == null ? '' : s).trim()); }
const SIREN_RE = /^[0-9]{9}$/;                            // EPIC/autre : SIREN à 9 chiffres
function isSiren(s) { return SIREN_RE.test(String(s == null ? '' : s).replace(/\s+/g, '')); }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function emailDomain(email) {
  const m = /@([^\s@]+)$/.exec(String(email || '').trim().toLowerCase());
  return m ? m[1] : null;
}

function cleanText(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim(); }

// Valide une demande de création. `inseeResolved` est le code INSEE déjà résolu par la route
// (commune → liste INSEE existante) ; null si non résolu. Renvoie { ok, error?, value? }.
// value = { name, type, commune_insee, siren, email, justification, role }.
function validateCreate(body, inseeResolved) {
  const b = body || {};
  const name = cleanText(b.name);
  if (name.length < 3 || name.length > 120) return { ok: false, error: 'Nom de la structure requis (3 à 120 caractères).' };

  const type = String(b.type || '').trim().toLowerCase();
  if (!ORG_TYPES.includes(type)) return { ok: false, error: 'Type requis : commune, epci ou autre.' };

  let commune_insee = null, siren = null;
  if (type === 'commune') {
    const insee = inseeResolved != null ? String(inseeResolved).toUpperCase() : '';
    if (!isInsee(insee)) return { ok: false, error: 'Commune introuvable — choisissez une commune de la liste.' };
    commune_insee = insee;
  } else {
    const s = String(b.siren || '').replace(/\s+/g, '');
    if (!isSiren(s)) return { ok: false, error: 'SIREN requis (9 chiffres) pour une EPCI ou une autre structure.' };
    siren = s;
  }

  const role = String(b.role || '').trim().toLowerCase();
  if (!isValidRole(role)) return { ok: false, error: 'Rôle du demandeur requis : admin ou editeur.' };

  const email = String(b.email || '').trim();
  if (!EMAIL_RE.test(email) || email.length > 200) return { ok: false, error: 'E-mail professionnel valide requis.' };

  let justification = null;
  if (b.justification != null && String(b.justification).trim() !== '') {
    const j = cleanText(b.justification);
    if (j.length > 500) return { ok: false, error: 'Justificatif trop long (500 caractères max).' };
    justification = j;
  }

  return { ok: true, value: { name, type, commune_insee, siren, email, justification, role } };
}

module.exports = {
  ORG_TYPES, ORG_STATUSES, ORG_TRANSITIONS, canTransitionOrg, transitionNeedsReason,
  MEMBER_ROLES, MEMBER_STATUSES, isValidRole, canManageMembers,
  MAX_ORGS_PER_ACCOUNT, CREATE_WINDOW_MS, CREATE_MAX, checkOrgQuota,
  isInsee, isSiren, EMAIL_RE, emailDomain, cleanText, validateCreate,
};
