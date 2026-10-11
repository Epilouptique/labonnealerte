// Diffusion des événements municipaux — ENVOI (chantier « mairies », LOT C).
// Réutilise le CHEMIN D'ENVOI du poller (deliverToSubscribers : email sendPromoAlert +
// push webpush + file de veille/heures calmes) — PAS de second système d'envoi. Toute la
// décision (interrupteur, fenêtre, idempotence, plafonds, zone) est dans notify-lifecycle.js.
'use strict';

const { pool } = require('../db');
const { resolveCommuneInsee } = require('../sources/lib/commune-insee');
const nl = require('./lib/notify-lifecycle');

// Forme d'abonné attendue par deliverToSubscribers : { id, email, token, email_enabled,
// quiet_*, push_count }. Même sélection que poller.loadSubscribersForAlert.
const SUB_FIELDS = `s.id, s.email, s.token, s.email_enabled, s.ville, s.departement,
  s.quiet_start, s.quiet_end, s.quiet_disabled,
  (SELECT COUNT(*)::int FROM push_subscriptions p WHERE p.subscriber_id = s.id) AS push_count`;

// Département depuis un code INSEE (DROM/COM 97x/98x sur 3, Corse 2A/2B, sinon 2).
function deptFromInsee(insee) {
  const x = String(insee || '').toUpperCase();
  return /^9[78]/.test(x) ? x.slice(0, 3) : x.slice(0, 2);
}

// Journalise un envoi/essai/annulation (best-effort, ne jette jamais).
async function logNotif(eventId, kind, actorId, count, result, detail) {
  try {
    await pool.query(
      `INSERT INTO municipal_event_notifications (event_id, kind, actor_subscriber_id, recipients_count, result, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [eventId, kind, actorId || null, count == null ? null : count, result || null, detail || null]);
  } catch (e) { console.error('[municipal-notify] journal :', e.message); }
}

// Résout les destinataires STRICTEMENT dans la commune de l'événement : abonnés confirmés
// du département de la commune, dont la ville du profil résout au même code INSEE. Coûteux
// (résolution nom→INSEE, mais cache permanent) ; borné au département. « Jamais hors zone ».
async function resolveRecipients(event) {
  const dept = deptFromInsee(event.commune_insee);
  if (!dept) return [];
  const { rows } = await pool.query(
    `SELECT ${SUB_FIELDS} FROM subscribers s
      WHERE s.confirmed = true AND s.ville IS NOT NULL AND s.departement = $1`,
    [dept]);
  const out = [];
  for (const s of rows) {
    let insee = null;
    try { const r = await resolveCommuneInsee(s.ville, s.departement); insee = r ? r.insee : null; }
    catch (e) { insee = null; }
    s.commune_insee = insee;
  }
  // Filtre de zone pur (testable) : INSEE du profil == INSEE de l'événement.
  return nl.filterRecipients(rows, event, { inseeOf: (s) => s.commune_insee });
}

// Message présenté à l'habitant (réutilise le gabarit d'alerte via deliverToSubscribers/info).
function buildInfo(event) {
  return {
    name: event.title,
    message: event.body ? String(event.body).slice(0, 280) : null,
    url: null,
    statusUrl: `https://labonnealerte.fr/commune/${encodeURIComponent(event.commune_insee)}`,
  };
}

// Compte les envois RÉELS (kind='sent', result='ok') d'une organisation aujourd'hui.
async function orgSentToday(orgId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int n FROM municipal_event_notifications mn
       JOIN municipal_events e ON e.id = mn.event_id
      WHERE e.org_id = $1 AND mn.kind = 'sent' AND mn.result = 'ok'
        AND mn.created_at >= date_trunc('day', NOW())`,
    [orgId]);
  return rows[0].n;
}

// Balaye les événements dont l'envoi est DÛ et les diffuse (si l'interrupteur est ouvert).
// Appelé par un cron du poller (inerte tant que MUNICIPAL_NOTIFY_ENABLED !== 'true').
// requireFn : injection de poller.deliverToSubscribers (évite un cycle de require au chargement).
async function dispatchDue(deliver, now) {
  if (!nl.notifyEnabled()) return { disabled: true, processed: 0 };
  const t = now == null ? Date.now() : now;
  let due;
  try {
    const { rows } = await pool.query(
      `SELECT id, org_id, title, body, commune_insee, status, ends_at, notify_status,
              notify_scheduled_at, notify_resends
         FROM municipal_events
        WHERE notify_status = 'scheduled' AND notify_scheduled_at <= to_timestamp($1 / 1000.0)
        ORDER BY notify_scheduled_at ASC LIMIT 50`,
      [t]);
    due = rows;
  } catch (e) { console.error('[municipal-notify] lecture dus :', e.message); return { error: e.message }; }

  let processed = 0;
  for (const e of due) {
    try {
      if (!nl.isNotifiable(e, t)) {
        await pool.query("UPDATE municipal_events SET notify_status = 'cancelled' WHERE id = $1 AND notify_status = 'scheduled'", [e.id]);
        await logNotif(e.id, 'skipped', null, 0, 'expired', 'Événement non publié ou terminé à l’échéance.');
        continue;
      }
      const recipients = await resolveRecipients(e);
      const count = recipients.length;
      if (nl.needsManualValidation(count)) {
        // Hors envoi auto : on retire de la file (scheduled_at NULL) et on attend Hugo.
        await pool.query("UPDATE municipal_events SET notify_scheduled_at = NULL WHERE id = $1 AND notify_status = 'scheduled'", [e.id]);
        await logNotif(e.id, 'skipped', e.notify_requested_by, count, 'needs_manual', `Audience ${count} > ${nl.MAX_RECIPIENTS_AUTO}.`);
        continue;
      }
      if (!nl.orgDailyCapOk(await orgSentToday(e.org_id))) {
        await pool.query("UPDATE municipal_events SET notify_scheduled_at = NULL WHERE id = $1 AND notify_status = 'scheduled'", [e.id]);
        await logNotif(e.id, 'skipped', e.notify_requested_by, count, 'org_daily_cap', `Plafond ${nl.MAX_PER_ORG_DAY}/jour atteint.`);
        continue;
      }
      if (count === 0) {
        await pool.query("UPDATE municipal_events SET notify_status = 'sent', notify_sent_at = NOW(), notify_count = 0 WHERE id = $1", [e.id]);
        await logNotif(e.id, 'sent', e.notify_requested_by, 0, 'no_recipients', null);
        continue;
      }
      await deliver(recipients, buildInfo(e), { sourceId: null, params: null });
      await pool.query(
        `UPDATE municipal_events
            SET notify_status = 'sent', notify_sent_at = NOW(), notify_count = $2,
                notify_resends = notify_resends + CASE WHEN notify_status = 'sent' THEN 1 ELSE 0 END
          WHERE id = $1`,
        [e.id, count]);
      await logNotif(e.id, 'sent', e.notify_requested_by, count, 'ok', null);
      processed += 1;
    } catch (err) {
      console.error(`[municipal-notify] envoi #${e.id} :`, err.message);
      await logNotif(e.id, 'skipped', null, null, 'error', err.message);
    }
  }
  return { processed, due: due.length };
}

// (e) « Test à moi seul » : envoie l'aperçu de l'événement UNIQUEMENT au compte appelant,
// immédiatement (hors heures de veille), avant publication. Autorisé même interrupteur fermé.
async function sendTest(deliver, event, actorId) {
  const { rows } = await pool.query(`SELECT ${SUB_FIELDS} FROM subscribers s WHERE s.id = $1`, [actorId]);
  if (!rows.length) return { sent: 0, error: 'Compte introuvable.' };
  const self = Object.assign({}, rows[0], { quiet_disabled: true }); // test → envoi immédiat
  const r = await deliver([self], buildInfo(event), { sourceId: null, params: null });
  await logNotif(event.id, 'test', actorId, 1, 'ok', null);
  return { sent: 1, delivery: r };
}

module.exports = { resolveRecipients, dispatchDue, sendTest, buildInfo, deptFromInsee, orgSentToday, logNotif };
