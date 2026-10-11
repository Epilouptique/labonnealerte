// Routes ORGANISATIONS (chantier « Publier pour les mairies et com-com », LOT A).
// Montées sous /api. COMPTE REQUIS. Une demande de création passe en 'pending' et n'est
// visible que de son demandeur. La vérification/refus/suspension se fait HORS LIGNE par
// Hugo (scripts/org-admin.js) — aucune route admin ici. AUCUNE publication d'événement :
// une organisation non vérifiée ne peut rien émettre (ce lot ne crée pas d'émission).
'use strict';

const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../sessions');
const { resolveCommuneInsee } = require('../sources/lib/commune-insee');
const ol = require('../orgs/lib/org-lifecycle');

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

// Anti-rafale par compte pour la création (fenêtre glissante en mémoire).
const createHits = new Map(); // subscriberId -> [timestamps]
function createRateOk(id) {
  const now = Date.now();
  const recent = (createHits.get(id) || []).filter((t) => now - t < ol.CREATE_WINDOW_MS);
  if (recent.length >= ol.CREATE_MAX) return false;
  recent.push(now); createHits.set(id, recent); return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [id, arr] of createHits) {
    const r = arr.filter((t) => now - t < ol.CREATE_WINDOW_MS);
    if (r.length === 0) createHits.delete(id); else createHits.set(id, r);
  }
}, ol.CREATE_WINDOW_MS).unref();

const ORG_COLUMNS = `id, name, type, commune_insee, siren, email, justification,
  status, status_reason, created_at, updated_at`;

// GET /api/organizations — les organisations DU demandeur (toutes visibilités), plus
// celles où il est membre. Un demandeur ne voit jamais la demande d'un autre.
router.get('/organizations', async (req, res) => {
  const auth = await requireAccount(req, res); if (!auth) return;
  try {
    const { rows } = await pool.query(
      `SELECT ${ORG_COLUMNS},
              (o.requester_subscriber_id = $1) AS is_requester,
              (SELECT m.role FROM organization_members m
                WHERE m.org_id = o.id AND m.subscriber_id = $1) AS my_role,
              (SELECT m.status FROM organization_members m
                WHERE m.org_id = o.id AND m.subscriber_id = $1) AS my_member_status
         FROM organizations o
        WHERE o.requester_subscriber_id = $1
           OR EXISTS (SELECT 1 FROM organization_members m
                       WHERE m.org_id = o.id AND m.subscriber_id = $1)
        ORDER BY o.created_at DESC`,
      [auth.id]);
    return res.json({ organizations: rows });
  } catch (err) {
    console.error('[organizations] GET / :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

// POST /api/organizations — dépose une demande (statut 'pending'). Corps :
// { token, name, type, ville?/commune_insee?(commune), siren?(epci/autre), role, email, justification? }.
// Le demandeur devient membre ADMIN ACTIF de sa propre demande.
router.post('/organizations', async (req, res) => {
  const auth = await requireAccount(req, res); if (!auth) return;
  if (!createRateOk(auth.id)) return res.status(429).json({ error: 'Trop de demandes, réessayez dans quelques minutes.' });
  const b = req.body || {};

  // Honeypot anti-robot : champ leurre rempli → on répond un succès NEUTRE sans rien créer
  // (ne pas renseigner le bot sur l'échec).
  if (ol.isHoneypotFilled(b)) {
    return res.status(201).json({ organization: null, message: 'Demande enregistrée. Elle sera examinée avant toute publication.' });
  }

  try {
    // Une seule demande EN ATTENTE par compte.
    const pend = await pool.query(
      "SELECT 1 FROM organizations WHERE requester_subscriber_id = $1 AND status = 'pending' LIMIT 1", [auth.id]);
    if (pend.rows.length) return res.status(409).json({ error: 'Vous avez déjà une demande en attente. Patientez le temps de sa vérification.' });

    // Résolution commune → INSEE via la liste officielle existante (geo.api), comme
    // community-reports. Le département du profil lève les homonymes.
    let inseeResolved = null;
    if (String(b.type || '').toLowerCase() === 'commune') {
      if (ol.isInsee(b.commune_insee)) {
        inseeResolved = String(b.commune_insee).toUpperCase();
      } else if (b.ville != null && String(b.ville).trim() !== '') {
        // Département : fourni par le formulaire (code dept ou code postal) sinon profil.
        // Aucune saisie libre d'INSEE : on résout le NOM via la liste officielle.
        let dept = null;
        const raw = String(b.departement || b.code_postal || '').trim();
        if (/^(2[AB]|\d{2,3})$/i.test(raw)) dept = raw.toUpperCase();
        else if (/^\d{4,5}$/.test(raw)) dept = raw.slice(0, 2); // code postal → 2 premiers chiffres
        if (!dept) {
          const prof = await pool.query('SELECT departement FROM subscribers WHERE id = $1', [auth.id]);
          dept = prof.rows[0] ? prof.rows[0].departement : null;
        }
        const r = await resolveCommuneInsee(b.ville, dept);
        inseeResolved = r ? r.insee : null;
      }
    }

    const v = ol.validateCreate(b, inseeResolved);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const o = v.value;

    // Quota : organisations non closes (pending/verified) déjà demandées par ce compte.
    const q = await pool.query(
      "SELECT COUNT(*)::int AS n FROM organizations WHERE requester_subscriber_id = $1 AND status IN ('pending','verified')",
      [auth.id]);
    const qc = ol.checkOrgQuota({ activeCount: q.rows[0].n });
    if (!qc.ok) return res.status(409).json({ error: qc.error });

    // Unicité par INSEE/SIREN (pending/verified) assurée par un index unique partiel. On
    // n'interroge PAS l'existence d'une organisation d'un AUTRE compte (pas de fuite) : on
    // tente l'insertion et on renvoie un message NEUTRE si le conflit se produit (catch 23505).
    const ins = await pool.query(
      `INSERT INTO organizations (name, type, commune_insee, siren, email, justification,
                                  contact_function, contact_phone, status, requester_subscriber_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
       RETURNING ${ORG_COLUMNS}`,
      [o.name, o.type, o.commune_insee, o.siren, o.email, o.justification, o.fonction, o.phone, auth.id]);
    const org = ins.rows[0];

    // Le demandeur est membre ADMIN ACTIF de sa demande (rôle saisi conservé s'il est admin,
    // sinon on force admin : c'est lui qui pilote sa propre organisation).
    await pool.query(
      `INSERT INTO organization_members (org_id, subscriber_id, role, status)
       VALUES ($1, $2, 'admin', 'actif') ON CONFLICT (org_id, subscriber_id) DO NOTHING`,
      [org.id, auth.id]);

    return res.status(201).json({ organization: org, message: 'Demande enregistrée. Elle sera examinée avant toute publication.' });
  } catch (err) {
    // Conflit d'unicité (INSEE/SIREN déjà pris) : message NEUTRE, sans confirmer qu'une
    // organisation existe ni à qui elle appartient.
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'Cette demande ne peut pas être enregistrée en l\'état. Vérifiez les informations ou contactez-nous à contact@labonnealerte.fr.' });
    }
    console.error('[organizations] POST / :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

// POST /api/organizations/:id/members — l'admin ACTIF invite un membre (par e-mail d'un
// compte existant). Statut initial 'invite'. Aucune émission d'événement dans ce lot.
router.post('/organizations/:id/members', async (req, res) => {
  const auth = await requireAccount(req, res); if (!auth) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide.' });
  const b = req.body || {};
  const role = String(b.role || 'editeur').trim().toLowerCase();
  if (!ol.isValidRole(role)) return res.status(400).json({ error: 'Rôle invalide : admin ou editeur.' });
  const email = String(b.email || '').trim().toLowerCase();
  if (!ol.EMAIL_RE.test(email)) return res.status(400).json({ error: 'E-mail du membre invalide.' });

  try {
    // Le demandeur doit être membre ADMIN ACTIF de l'organisation.
    const me = await pool.query('SELECT role, status FROM organization_members WHERE org_id = $1 AND subscriber_id = $2', [id, auth.id]);
    if (!ol.canManageMembers(me.rows[0])) return res.status(403).json({ error: 'Réservé à un administrateur de l\'organisation.' });

    const target = await pool.query('SELECT id FROM subscribers WHERE lower(email) = $1', [email]);
    if (!target.rows.length) return res.status(404).json({ error: 'Aucun compte avec cet e-mail. La personne doit d\'abord créer un compte.' });
    const memberId = target.rows[0].id;

    const ins = await pool.query(
      `INSERT INTO organization_members (org_id, subscriber_id, role, status)
       VALUES ($1, $2, $3, 'invite')
       ON CONFLICT (org_id, subscriber_id) DO NOTHING
       RETURNING org_id, subscriber_id, role, status, created_at`,
      [id, memberId, role]);
    if (!ins.rows.length) return res.status(409).json({ error: 'Cette personne est déjà membre (ou invitée).' });
    return res.status(201).json({ member: ins.rows[0] });
  } catch (err) {
    console.error('[organizations] POST /:id/members :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

// POST /api/organizations/:id/members/accept — un invité accepte (invite → actif).
router.post('/organizations/:id/members/accept', async (req, res) => {
  const auth = await requireAccount(req, res); if (!auth) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide.' });
  try {
    const upd = await pool.query(
      `UPDATE organization_members SET status = 'actif'
        WHERE org_id = $1 AND subscriber_id = $2 AND status = 'invite'
        RETURNING org_id, subscriber_id, role, status`,
      [id, auth.id]);
    if (!upd.rows.length) return res.status(409).json({ error: 'Aucune invitation en attente pour ce compte.' });
    return res.json({ member: upd.rows[0] });
  } catch (err) {
    console.error('[organizations] POST /:id/members/accept :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

module.exports = router;
