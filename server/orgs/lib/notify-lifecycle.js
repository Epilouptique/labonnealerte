// Diffusion des événements municipaux — LOGIQUE PURE DES PROTECTIONS (chantier « mairies »,
// LOT C). Hors réseau, hors base, aucun envoi. Décide : interrupteur global, fenêtre
// d'annulation, échéance, idempotence/renvoi, plafonds, éligibilité d'un événement, filtre
// de zone. Le vrai envoi est fait ailleurs (server/orgs/municipal-notify.js) en réutilisant
// le chemin du poller (deliverToSubscribers). Aucune duplication du système d'envoi.
'use strict';

// Constantes (surchargeables par l'environnement, bornées).
const SEND_DELAY_MIN = Math.max(0, parseInt(process.env.MUNICIPAL_NOTIFY_DELAY_MIN || '', 10) || 10);
const SEND_DELAY_MS = SEND_DELAY_MIN * 60_000;
const MAX_PER_ORG_DAY = Math.max(1, parseInt(process.env.MUNICIPAL_NOTIFY_MAX_PER_ORG_DAY || '', 10) || 10);
// Au-delà de ce nombre de destinataires, une validation manuelle de Hugo est exigée.
const MAX_RECIPIENTS_AUTO = Math.max(1, parseInt(process.env.MUNICIPAL_NOTIFY_MAX_RECIPIENTS || '', 10) || 500);
const MAX_RESENDS = 1; // un seul « Renvoyer la notification » explicite

// (d) Interrupteur GLOBAL. Défaut FALSE : tant qu'il est faux, on enregistre tout
// (planification, journal) mais AUCUN envoi ne part réellement.
function notifyEnabled() { return String(process.env.MUNICIPAL_NOTIFY_ENABLED || '').trim().toLowerCase() === 'true'; }

// Un événement est NOTIFIABLE s'il est publié et vivant (fin absente ou future). Un
// événement déjà terminé (expiré) ou non publié ne notifie jamais.
function isNotifiable(event, now) {
  if (!event || event.status !== 'published') return false;
  const t = now == null ? Date.now() : now;
  if (event.ends_at && new Date(event.ends_at).getTime() <= t) return false; // (5) terminé → jamais
  return true;
}

// (c) Idempotence : on ne programme un envoi que si aucun n'a encore été programmé/parti,
// OU s'il s'agit d'un renvoi explicite encore disponible (≤ MAX_RESENDS).
// Renvoie { ok, error? }.
function canSchedule(event, now, opts = {}) {
  if (!isNotifiable(event, now)) return { ok: false, error: 'Événement non publié ou déjà terminé.' };
  const resend = !!opts.resend;
  if (!resend) {
    if (event.notify_status === 'scheduled') return { ok: false, error: 'Un envoi est déjà programmé.' };
    if (event.notify_status === 'sent') return { ok: false, error: 'La notification a déjà été envoyée (utilisez « Renvoyer »).' };
    return { ok: true };
  }
  // Renvoi explicite : uniquement après un envoi parti, et dans la limite autorisée.
  if (event.notify_status !== 'sent') return { ok: false, error: 'Renvoi impossible : aucune notification initiale envoyée.' };
  if ((event.notify_resends || 0) >= MAX_RESENDS) return { ok: false, error: 'Renvoi déjà utilisé (1 maximum).' };
  return { ok: true };
}

// Instant d'envoi = maintenant + délai (fenêtre d'annulation).
function scheduledAtFrom(now) { return new Date((now == null ? Date.now() : now) + SEND_DELAY_MS); }

// (a) Fenêtre d'annulation : tant que l'instant programmé n'est pas atteint, on peut annuler.
function isWithinCancelWindow(scheduledAt, now) {
  if (!scheduledAt) return false;
  return (now == null ? Date.now() : now) < new Date(scheduledAt).getTime();
}
// L'envoi est DÛ quand l'instant programmé est atteint (et pas encore parti).
function isDue(event, now) {
  if (!event || event.notify_status !== 'scheduled' || !event.notify_scheduled_at) return false;
  return (now == null ? Date.now() : now) >= new Date(event.notify_scheduled_at).getTime();
}

// (b) Plafond par organisation et par jour.
function orgDailyCapOk(sentToday) { return (sentToday || 0) < MAX_PER_ORG_DAY; }
// (b) Validation manuelle requise si l'audience dépasse le plafond automatique.
function needsManualValidation(recipientCount) { return (recipientCount || 0) > MAX_RECIPIENTS_AUTO; }

// (2) Filtre de ZONE : ne garder que les destinataires DANS la commune de l'événement.
// Modèle actuel sans coords d'abonné : correspondance stricte par code INSEE résolu
// (une commune ⊆ tout rayon → « jamais d'abonné hors zone »). `inseeOf(sub)` fournit
// l'INSEE du profil (résolu en amont). Hook catégorie (matchesCategory) laissé ouvert.
function filterRecipients(subs, event, opts = {}) {
  const inseeOf = opts.inseeOf || ((s) => s.commune_insee || null);
  const matchesCategory = opts.matchesCategory || (() => true); // pas de préférence catégorie en base (décision ouverte)
  const target = String(event && event.commune_insee || '').toUpperCase();
  if (!target) return [];
  return (subs || []).filter((s) => {
    const insee = String(inseeOf(s) || '').toUpperCase();
    if (insee !== target) return false;          // STRICTEMENT en zone
    return matchesCategory(s, event);
  });
}

module.exports = {
  SEND_DELAY_MIN, SEND_DELAY_MS, MAX_PER_ORG_DAY, MAX_RECIPIENTS_AUTO, MAX_RESENDS,
  notifyEnabled, isNotifiable, canSchedule, scheduledAtFrom, isWithinCancelWindow, isDue,
  orgDailyCapOk, needsManualValidation, filterRecipients,
};
