// Cartes COMMUNAUTAIRES — premier type : « Chat perdu ». Contrairement aux sources
// classiques (source_param_states = un état par combinaison de params), les
// instances de ce type vivent dans community_reports : contenu PARTAGÉ entre tous
// les abonnés d'une même commune (dédup par commune, spécifique à ce type), avec
// auteur, description, lien, compteur « Repéré » et expiration prolongeable.
//
// GET  /api/community-reports            — instances actives visibles pour le profil
// POST /api/community-reports             — crée une instance (1re commune) ou rejoint
// POST /api/community-reports/:id/spot    — « Repéré » (idempotent, ferme à 3)
// POST /api/community-reports/:id/extend  — prolongation (auteur seul, max 3)
// POST /api/community-reports/:id/resolve — clôture manuelle (auteur seul)

const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../sessions');
const { resolveCommuneInsee, resolveCommuneCoords } = require('../sources/lib/commune-insee');
const { distanceKm } = require('../sources/lib/geo-distance');
const ugc = require('../ugc');

const router = express.Router();

const TYPE = 'chat-perdu';
const EXPIRE_DAYS = 7;
const MAX_EXTENSIONS = 3;
const MIN_RADIUS_KM = 10;
const MAX_RADIUS_KM = 50;
const DEFAULT_RADIUS_KM = 15;
const SPOTS_TO_CLOSE = 3;

function clampRadius(v) {
  const n = parseInt(v, 10);
  if (!Number.isInteger(n)) return DEFAULT_RADIUS_KM;
  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, n));
}

const REPORT_COLUMNS = `
  r.id, r.type, r.commune_nom, r.commune_insee, r.lat, r.lon, r.radius_km,
  r.description, r.link, r.author_subscriber_id, r.created_at, r.expires_at,
  r.extensions_count, r.status,
  (SELECT COUNT(*) FROM community_report_spots sp WHERE sp.report_id = r.id)::int AS spot_count
`;

/* ------------------------------------------------------------------ */
/* GET /api/community-reports?token=… — instances actives visibles :   */
/* abonnements directs + tout profil dans le radius_km de l'instance,  */
/* sauf hide_community_reports = true.                                 */
/* ------------------------------------------------------------------ */
router.get('/community-reports', async (req, res) => {
  const auth = await authenticate(req.query.token);
  if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });
  try {
    const prof = await pool.query(
      'SELECT departement, ville, hide_community_reports FROM subscribers WHERE id = $1',
      [auth.id]
    );
    const p = prof.rows[0] || {};
    if (p.hide_community_reports) return res.json([]);

    const { rows } = await pool.query(
      `SELECT ${REPORT_COLUMNS},
              EXISTS(SELECT 1 FROM community_report_subscriptions rs
                      WHERE rs.report_id = r.id AND rs.subscriber_id = $1) AS subscribed,
              EXISTS(SELECT 1 FROM community_report_spots sp
                      WHERE sp.report_id = r.id AND sp.subscriber_id = $1) AS spotted
         FROM community_reports r
        WHERE r.type = $2 AND r.status = 'active'`,
      [auth.id, TYPE]
    );
    if (!rows.length) return res.json([]);

    // Coordonnées du profil résolues À LA VOLÉE (pas stockées sur subscribers) — coût
    // borné à un appel réseau par requête, seulement si la commune du profil est déclarée.
    let subCoords = null;
    if (p.ville) {
      try { subCoords = await resolveCommuneCoords(p.ville, p.departement); } catch (e) { subCoords = null; }
    }

    const visible = rows.filter((r) => {
      if (r.subscribed) return true;
      if (!subCoords) return false;
      const km = distanceKm(subCoords.lat, subCoords.lon, r.lat, r.lon);
      return km <= r.radius_km;
    });
    res.json(visible);
  } catch (err) {
    console.error('[community-reports] Erreur GET / :', err.message);
    res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/community-reports — crée (1re commune) ou rejoint.        */
/* Corps : { token, ville, radius_km?, description?, link? }.          */
/* description/link ne sont requis QUE pour la création (aucune         */
/* instance active pour cette commune).                                */
/* ------------------------------------------------------------------ */
router.post('/community-reports', async (req, res) => {
  const { token, ville, radius_km, description, link } = req.body || {};
  if (!ville || !String(ville).trim()) return res.status(400).json({ error: 'commune requise' });
  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });

    const prof = await pool.query('SELECT departement FROM subscribers WHERE id = $1', [auth.id]);
    const dept = prof.rows[0] ? prof.rows[0].departement : null;

    const [insee, coords] = await Promise.all([
      resolveCommuneInsee(ville, dept),
      resolveCommuneCoords(ville, dept),
    ]);
    if (!coords) {
      return res.status(400).json({ error: 'Commune introuvable — vérifiez l’orthographe ou précisez le département.' });
    }

    // Dédup par commune : code INSEE si résolu, sinon nom normalisé (repli).
    const existing = insee
      ? await pool.query(
          `SELECT ${REPORT_COLUMNS} FROM community_reports r
            WHERE r.type = $1 AND r.status = 'active' AND r.commune_insee = $2 LIMIT 1`,
          [TYPE, insee.insee])
      : await pool.query(
          `SELECT ${REPORT_COLUMNS} FROM community_reports r
            WHERE r.type = $1 AND r.status = 'active' AND r.commune_insee IS NULL
              AND lower(r.commune_nom) = lower($2) LIMIT 1`,
          [TYPE, coords.nom]);

    if (existing.rows.length) {
      const report = existing.rows[0];
      await pool.query(
        `INSERT INTO community_report_subscriptions (report_id, subscriber_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [report.id, auth.id]
      );
      return res.status(200).json({ joined: true, report });
    }

    // Nouvelle instance : description + rate-limit (1 seule active par auteur).
    const desc = ugc.validateText(description, { min: 5, max: 500, allowed: ugc.ALLOWED_FORUM_BODY });
    if (!desc.ok) return res.status(400).json({ error: desc.error });
    const lk = ugc.validateLink(link);
    if (!lk.ok) return res.status(400).json({ error: lk.error });

    const active = await pool.query(
      `SELECT COUNT(*)::int AS n FROM community_reports
        WHERE type = $1 AND status = 'active' AND author_subscriber_id = $2`,
      [TYPE, auth.id]
    );
    if (active.rows[0].n > 0) {
      return res.status(409).json({ error: 'Vous avez déjà un signalement actif pour ce type de carte.' });
    }

    const radius = clampRadius(radius_km);
    const ins = await pool.query(
      `INSERT INTO community_reports
         (type, commune_nom, commune_insee, lat, lon, radius_km, description, link,
          author_subscriber_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() + INTERVAL '${EXPIRE_DAYS} days')
       RETURNING id, type, commune_nom, commune_insee, lat, lon, radius_km, description, link,
                 author_subscriber_id, created_at, expires_at, extensions_count, status`,
      [TYPE, coords.nom, insee ? insee.insee : null, coords.lat, coords.lon, radius, desc.value, lk.value, auth.id]
    );
    const report = Object.assign({ spot_count: 0 }, ins.rows[0]);
    await pool.query(
      `INSERT INTO community_report_subscriptions (report_id, subscriber_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [report.id, auth.id]
    );
    res.status(201).json({ created: true, report });
  } catch (err) {
    console.error('[community-reports] Erreur POST / :', err.message);
    res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/community-reports/:id/spot — « Repéré » (idempotent),     */
/* fermeture automatique (status='resolved') au 3e signalant distinct. */
/* ------------------------------------------------------------------ */
router.post('/community-reports/:id/spot', async (req, res) => {
  const { token } = req.body || {};
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });

    const rep = await pool.query('SELECT id, status FROM community_reports WHERE id = $1', [id]);
    if (!rep.rows.length) return res.status(404).json({ error: 'Signalement introuvable' });
    if (rep.rows[0].status !== 'active') return res.status(409).json({ error: 'Ce signalement n’est plus actif' });

    await pool.query(
      `INSERT INTO community_report_spots (report_id, subscriber_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, auth.id]
    );
    const count = await pool.query('SELECT COUNT(*)::int AS n FROM community_report_spots WHERE report_id = $1', [id]);
    const spotCount = count.rows[0].n;
    let status = rep.rows[0].status;
    if (spotCount >= SPOTS_TO_CLOSE && status === 'active') {
      await pool.query(`UPDATE community_reports SET status = 'resolved' WHERE id = $1 AND status = 'active'`, [id]);
      status = 'resolved';
    }
    res.status(200).json({ spot_count: spotCount, status });
  } catch (err) {
    console.error('[community-reports] Erreur POST /:id/spot :', err.message);
    res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/community-reports/:id/extend — prolongation de 7 jours,   */
/* auteur seul, max MAX_EXTENSIONS.                                    */
/* ------------------------------------------------------------------ */
router.post('/community-reports/:id/extend', async (req, res) => {
  const { token } = req.body || {};
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });

    const upd = await pool.query(
      `UPDATE community_reports
          SET expires_at = expires_at + INTERVAL '${EXPIRE_DAYS} days', extensions_count = extensions_count + 1
        WHERE id = $1 AND author_subscriber_id = $2 AND status = 'active' AND extensions_count < $3
        RETURNING expires_at, extensions_count`,
      [id, auth.id, MAX_EXTENSIONS]
    );
    if (!upd.rows.length) {
      return res.status(409).json({ error: 'Prolongation impossible (déjà close, non auteur, ou maximum atteint)' });
    }
    res.status(200).json(upd.rows[0]);
  } catch (err) {
    console.error('[community-reports] Erreur POST /:id/extend :', err.message);
    res.status(503).json({ error: 'Service indisponible' });
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/community-reports/:id/resolve — clôture manuelle,          */
/* auteur seul.                                                        */
/* ------------------------------------------------------------------ */
router.post('/community-reports/:id/resolve', async (req, res) => {
  const { token } = req.body || {};
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });

    const upd = await pool.query(
      `UPDATE community_reports SET status = 'resolved'
        WHERE id = $1 AND author_subscriber_id = $2 AND status = 'active'
        RETURNING id`,
      [id, auth.id]
    );
    if (!upd.rows.length) return res.status(409).json({ error: 'Clôture impossible (déjà close ou non auteur)' });
    res.status(200).json({ status: 'resolved' });
  } catch (err) {
    console.error('[community-reports] Erreur POST /:id/resolve :', err.message);
    res.status(503).json({ error: 'Service indisponible' });
  }
});

module.exports = router;
