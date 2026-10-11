// Routes ÉVÉNEMENTS MUNICIPAUX (chantier « mairies », LOT B). Montées sous /api.
// Saisie réservée aux membres ACTIFS d'une organisation VÉRIFIÉE. AUCUN envoi de
// notification : « publier » rend l'événement visible (kiosque / fiche commune), rien de
// plus. Lecture publique des événements publiés et vivants d'une commune.
'use strict';

const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../sessions');
const { VALID_SLUGS } = require('../categories');
const { nameForInsee } = require('../sources/lib/commune-insee');
const ev = require('../orgs/lib/event-lifecycle');
const nl = require('../orgs/lib/notify-lifecycle');
const mn = require('../orgs/municipal-notify');

const router = express.Router();

function tokenOf(req) {
  const h = req.headers.authorization || '';
  const bearer = h.startsWith('Bearer ') ? h.slice(7) : '';
  return (req.body && req.body.token) || req.query.token || bearer || '';
}
async function requireAccount(req, res) {
  const auth = await authenticate(tokenOf(req));
  if (!auth || !auth.id) { res.status(401).json({ error: 'Compte requis : connectez-vous.' }); return null; }
  return auth;
}
const isValidCategory = (c) => VALID_SLUGS.includes(c);

// Anti-rafale par compte pour la création (fenêtre glissante en mémoire).
const EVT_WINDOW_MS = 10 * 60_000, EVT_MAX = 20, ORG_ACTIVE_MAX = 100;
const evtHits = new Map();
function evtRateOk(id) {
  const now = Date.now();
  const recent = (evtHits.get(id) || []).filter((t) => now - t < EVT_WINDOW_MS);
  if (recent.length >= EVT_MAX) return false;
  recent.push(now); evtHits.set(id, recent); return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [id, arr] of evtHits) {
    const r = arr.filter((t) => now - t < EVT_WINDOW_MS);
    if (r.length === 0) evtHits.delete(id); else evtHits.set(id, r);
  }
}, EVT_WINDOW_MS).unref();

// Membre + organisation en une requête : { role, member_status, org_status, commune_insee }.
async function loadMembership(orgId, subId) {
  const { rows } = await pool.query(
    `SELECT o.id AS org_id, o.status AS org_status, o.commune_insee,
            m.role, m.status AS member_status
       FROM organizations o
       JOIN organization_members m ON m.org_id = o.id AND m.subscriber_id = $2
      WHERE o.id = $1`,
    [orgId, subId]);
  return rows[0] || null;
}

const EVT_COLUMNS = `id, org_id, template, title, body, category, commune_insee, commune_nom,
  starts_at, ends_at, status, created_at, updated_at, published_at`;

// Garde-fou commun : membre actif d'une organisation vérifiée, autorisé pour `action`.
function guard(res, mem, action) {
  if (!mem) { res.status(404).json({ error: 'Organisation introuvable ou accès refusé.' }); return false; }
  if (mem.member_status !== 'actif') { res.status(403).json({ error: 'Adhésion non active à cette organisation.' }); return false; }
  if (mem.org_status !== 'verified') { res.status(403).json({ error: 'Organisation non vérifiée : aucune publication possible.' }); return false; }
  if (!ev.roleCan(mem.role, action)) { res.status(403).json({ error: 'Action non autorisée pour votre rôle.' }); return false; }
  return true;
}

// POST /api/organizations/:orgId/events — crée un brouillon.
router.post('/organizations/:orgId/events', async (req, res) => {
  const auth = await requireAccount(req, res); if (!auth) return;
  const orgId = parseInt(req.params.orgId, 10);
  if (!Number.isInteger(orgId)) return res.status(400).json({ error: 'id invalide.' });
  if (!evtRateOk(auth.id)) return res.status(429).json({ error: 'Trop de créations, réessayez dans quelques minutes.' });
  try {
    const mem = await loadMembership(orgId, auth.id);
    if (!guard(res, mem, 'create')) return;

    const v = ev.validateEventInput(req.body, { isValidCategory });
    if (!v.ok) return res.status(400).json({ error: v.error });

    const act = await pool.query(
      "SELECT COUNT(*)::int n FROM municipal_events WHERE org_id = $1 AND status IN ('draft','review','published')",
      [orgId]);
    if (act.rows[0].n >= ORG_ACTIVE_MAX) return res.status(409).json({ error: `Limite atteinte : ${ORG_ACTIVE_MAX} événements non clos par organisation.` });

    const e = v.value;
    const communeNom = nameForInsee(mem.commune_insee);
    const ins = await pool.query(
      `INSERT INTO municipal_events
         (org_id, author_subscriber_id, template, title, body, category, commune_insee, commune_nom, starts_at, ends_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft')
       RETURNING ${EVT_COLUMNS}`,
      [orgId, auth.id, e.template, e.title, e.body, e.category, mem.commune_insee, communeNom, e.starts_at, e.ends_at]);
    return res.status(201).json({ event: ins.rows[0] });
  } catch (err) {
    console.error('[municipal-events] POST create :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

// Charge un événement + l'adhésion de l'appelant à son organisation.
async function loadEventForMember(eventId, subId) {
  const { rows } = await pool.query(`SELECT ${EVT_COLUMNS}, author_subscriber_id FROM municipal_events WHERE id = $1`, [eventId]);
  const e = rows[0];
  if (!e) return { event: null, mem: null };
  const mem = await loadMembership(e.org_id, subId);
  return { event: e, mem };
}

// PATCH /api/municipal-events/:id — modifie un brouillon ou un événement en relecture.
router.patch('/municipal-events/:id', async (req, res) => {
  const auth = await requireAccount(req, res); if (!auth) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide.' });
  try {
    const { event, mem } = await loadEventForMember(id, auth.id);
    if (!event) return res.status(404).json({ error: 'Événement introuvable.' });
    if (!guard(res, mem, 'edit')) return;
    if (!ev.isEditable(event.status)) return res.status(409).json({ error: `Modification impossible : statut « ${event.status} ».` });

    // Revalidation complète à partir de l'état courant fusionné avec le corps fourni.
    const merged = {
      template: req.body.template != null ? req.body.template : event.template,
      title: req.body.title != null ? req.body.title : event.title,
      body: req.body.body != null ? req.body.body : event.body,
      category: req.body.category != null ? req.body.category : event.category,
      starts_at: req.body.starts_at != null ? req.body.starts_at : event.starts_at,
      ends_at: req.body.ends_at != null ? req.body.ends_at : event.ends_at,
    };
    const v = ev.validateEventInput(merged, { isValidCategory });
    if (!v.ok) return res.status(400).json({ error: v.error });
    const e = v.value;
    const upd = await pool.query(
      `UPDATE municipal_events
          SET template = $2, title = $3, body = $4, category = $5, starts_at = $6, ends_at = $7, updated_at = NOW()
        WHERE id = $1 AND status IN ('draft','review')
        RETURNING ${EVT_COLUMNS}`,
      [id, e.template, e.title, e.body, e.category, e.starts_at, e.ends_at]);
    if (!upd.rows.length) return res.status(409).json({ error: 'Modification impossible (statut changé).' });
    return res.json({ event: upd.rows[0] });
  } catch (err) {
    console.error('[municipal-events] PATCH :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

// POST /api/municipal-events/:id/publish — « Publier ». Admin → published ; éditeur →
// relecture (soumission). AUCUNE notification (lot B). Depuis draft ou review uniquement.
router.post('/municipal-events/:id/publish', async (req, res) => {
  const auth = await requireAccount(req, res); if (!auth) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide.' });
  try {
    const { event, mem } = await loadEventForMember(id, auth.id);
    if (!event) return res.status(404).json({ error: 'Événement introuvable.' });
    if (!guard(res, mem, 'submit')) return; // soumettre = droit minimal ; publier = admin (ci-dessous)
    const target = ev.publishTargetFor(mem.role); // admin → published, editeur → review
    if (!ev.canTransitionEvent(event.status, target)) {
      return res.status(409).json({ error: `Transition impossible : « ${event.status} » → « ${target} ».` });
    }
    const upd = await pool.query(
      `UPDATE municipal_events
          SET status = $2, updated_at = NOW(),
              published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, NOW()) ELSE published_at END
        WHERE id = $1 AND status IN ('draft','review')
        RETURNING ${EVT_COLUMNS}`,
      [id, target]);
    if (!upd.rows.length) return res.status(409).json({ error: 'Transition impossible (statut changé).' });
    return res.json({ event: upd.rows[0], published: target === 'published' });
  } catch (err) {
    console.error('[municipal-events] publish :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

// POST /api/municipal-events/:id/cancel — annule (→ cancelled).
router.post('/municipal-events/:id/cancel', async (req, res) => {
  const auth = await requireAccount(req, res); if (!auth) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide.' });
  try {
    const { event, mem } = await loadEventForMember(id, auth.id);
    if (!event) return res.status(404).json({ error: 'Événement introuvable.' });
    if (!guard(res, mem, 'cancel')) return;
    if (!ev.canTransitionEvent(event.status, 'cancelled')) {
      return res.status(409).json({ error: `Annulation impossible depuis « ${event.status} ».` });
    }
    const upd = await pool.query(
      `UPDATE municipal_events SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND status <> 'cancelled' RETURNING ${EVT_COLUMNS}`,
      [id]);
    if (!upd.rows.length) return res.status(409).json({ error: 'Annulation impossible (statut changé).' });
    return res.json({ event: upd.rows[0] });
  } catch (err) {
    console.error('[municipal-events] cancel :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

// GET /api/organizations/:orgId/events — liste pour les membres de l'organisation.
router.get('/organizations/:orgId/events', async (req, res) => {
  const auth = await requireAccount(req, res); if (!auth) return;
  const orgId = parseInt(req.params.orgId, 10);
  if (!Number.isInteger(orgId)) return res.status(400).json({ error: 'id invalide.' });
  try {
    const mem = await loadMembership(orgId, auth.id);
    if (!mem) return res.status(404).json({ error: 'Organisation introuvable ou accès refusé.' });
    const { rows } = await pool.query(
      `SELECT ${EVT_COLUMNS} FROM municipal_events WHERE org_id = $1 ORDER BY created_at DESC`, [orgId]);
    return res.json({ events: rows });
  } catch (err) {
    console.error('[municipal-events] GET org list :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

// GET /api/communes/:insee/events — PUBLIC : événements publiés et vivants d'une commune
// (organisation vérifiée). Aucune auth. Expiration appliquée en SQL (ends_at NULL ou futur).
router.get('/communes/:insee/events', async (req, res) => {
  const insee = String(req.params.insee || '').toUpperCase();
  if (!/^(?:[0-9]{2}|2[AB])[0-9]{3}$/.test(insee)) return res.status(400).json({ error: 'Code INSEE invalide.' });
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.template, e.title, e.body, e.category, e.commune_insee, e.commune_nom,
              e.starts_at, e.ends_at, e.published_at
         FROM municipal_events e
         JOIN organizations o ON o.id = e.org_id
        WHERE e.commune_insee = $1 AND e.status = 'published' AND o.status = 'verified'
          AND (e.ends_at IS NULL OR e.ends_at > NOW())
        ORDER BY COALESCE(e.starts_at, e.published_at) DESC NULLS LAST
        LIMIT 100`,
      [insee]);
    return res.json({ commune_insee: insee, events: rows });
  } catch (err) {
    console.error('[municipal-events] GET commune public :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

// ── LOT C : diffusion aux abonnés de la commune, avec protections ───────────────
// Charge un événement avec ses champs de diffusion + l'adhésion de l'appelant.
async function loadEventNotify(eventId, subId) {
  const { rows } = await pool.query(
    `SELECT id, org_id, title, body, commune_insee, status, ends_at,
            notify_status, notify_scheduled_at, notify_sent_at, notify_resends, notify_count
       FROM municipal_events WHERE id = $1`, [eventId]);
  const e = rows[0];
  if (!e) return { event: null, mem: null };
  return { event: e, mem: await loadMembership(e.org_id, subId) };
}

// POST /api/municipal-events/:id/notify — PROGRAMME l'envoi différé (fenêtre d'annulation).
// Admin uniquement. body { resend?:true }. Rien ne part ici : un cron dû enverra plus tard,
// et seulement si MUNICIPAL_NOTIFY_ENABLED === 'true'.
router.post('/municipal-events/:id/notify', async (req, res) => {
  const auth = await requireAccount(req, res); if (!auth) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide.' });
  const resend = !!(req.body && req.body.resend);
  try {
    const { event, mem } = await loadEventNotify(id, auth.id);
    if (!event) return res.status(404).json({ error: 'Événement introuvable.' });
    if (!guard(res, mem, 'publish')) return; // diffusion = droit admin
    const dec = nl.canSchedule(event, Date.now(), { resend });
    if (!dec.ok) return res.status(409).json({ error: dec.error });

    const scheduledAt = nl.scheduledAtFrom(Date.now());
    const upd = await pool.query(
      `UPDATE municipal_events
          SET notify_status = 'scheduled', notify_scheduled_at = $2, notify_requested_by = $3, updated_at = NOW()
        WHERE id = $1 AND status = 'published'
        RETURNING id, notify_status, notify_scheduled_at`,
      [id, scheduledAt, auth.id]);
    if (!upd.rows.length) return res.status(409).json({ error: 'Programmation impossible (événement non publié ?).' });
    await mn.logNotif(id, 'scheduled', auth.id, null, nl.notifyEnabled() ? 'ok' : 'flag_off', resend ? 'renvoi' : null);
    return res.json({
      scheduled_at: scheduledAt, delay_min: nl.SEND_DELAY_MIN,
      cancellable_until: scheduledAt, will_send: nl.notifyEnabled(),
      note: nl.notifyEnabled()
        ? `Envoi programmé dans ${nl.SEND_DELAY_MIN} min. Vous pouvez encore l'annuler.`
        : `Programmé, mais la diffusion globale est désactivée : rien ne sera envoyé pour l'instant.`,
    });
  } catch (err) {
    console.error('[municipal-events] notify :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

// POST /api/municipal-events/:id/notify/cancel — annule l'envoi tant qu'il n'est pas parti.
// L'événement reste PUBLIÉ et visible, simplement sans notification.
router.post('/municipal-events/:id/notify/cancel', async (req, res) => {
  const auth = await requireAccount(req, res); if (!auth) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide.' });
  try {
    const { event, mem } = await loadEventNotify(id, auth.id);
    if (!event) return res.status(404).json({ error: 'Événement introuvable.' });
    if (!guard(res, mem, 'publish')) return;
    if (event.notify_status !== 'scheduled' || !nl.isWithinCancelWindow(event.notify_scheduled_at, Date.now())) {
      return res.status(409).json({ error: 'Annulation impossible : l\'envoi est déjà parti ou aucun envoi n\'est programmé.' });
    }
    const upd = await pool.query(
      "UPDATE municipal_events SET notify_status = 'none', notify_scheduled_at = NULL, updated_at = NOW() WHERE id = $1 AND notify_status = 'scheduled' RETURNING id",
      [id]);
    if (!upd.rows.length) return res.status(409).json({ error: 'Annulation impossible (statut changé).' });
    await mn.logNotif(id, 'cancelled', auth.id, null, 'ok', null);
    return res.json({ cancelled: true, message: 'Envoi annulé. L\'événement reste visible, sans notification.' });
  } catch (err) {
    console.error('[municipal-events] notify/cancel :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

// POST /api/municipal-events/:id/notify/test — « test à moi seul » : s'envoie l'aperçu.
// Autorisé même interrupteur global fermé, et avant publication. Membre actif d'org vérifiée.
router.post('/municipal-events/:id/notify/test', async (req, res) => {
  const auth = await requireAccount(req, res); if (!auth) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide.' });
  try {
    const { event, mem } = await loadEventNotify(id, auth.id);
    if (!event) return res.status(404).json({ error: 'Événement introuvable.' });
    if (!guard(res, mem, 'submit')) return;
    const deliver = require('../poller').deliverToSubscribers;
    const r = await mn.sendTest(deliver, event, auth.id);
    return res.json({ tested: true, sent: r.sent, message: 'Aperçu envoyé à votre compte uniquement.' });
  } catch (err) {
    console.error('[municipal-events] notify/test :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

module.exports = router;
