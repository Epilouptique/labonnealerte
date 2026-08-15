// Cartes COMMUNAUTAIRES — routeur MULTI-TYPES (chat-perdu, chien-perdu, …).
// Contrairement aux sources classiques (source_param_states = un état par
// combinaison de params), les instances vivent dans community_reports : contenu
// PARTAGÉ entre tous les abonnés d'une même commune, avec auteur, description,
// lien, compteur « Repéré » et expiration prolongeable.
//
// Le TYPE arrive du client (corps du POST / query du GET) et passe TOUJOURS par la
// liste blanche de community-types.js — jamais inséré brut. Tout ce qui varie d'un
// type à l'autre (libellés, dédup, durées, seuils, rayons) est dans ce module ;
// ce fichier ne contient plus aucune valeur propre à un type donné.
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
const { sendCommunityReportSpotNotification } = require('../mailer');
const { getType } = require('../community-types');

const router = express.Router();

function clampRadius(v, cfg) {
  const n = parseInt(v, 10);
  if (!Number.isInteger(n)) return cfg.defaultRadiusKm;
  return Math.min(cfg.maxRadiusKm, Math.max(cfg.minRadiusKm, n));
}

// Routes adressant une instance PAR SON ID (/spot, /extend, /resolve) : le type ne
// vient PAS du client, il est relu sur la ligne elle-même. Un client ne peut donc
// pas emprunter les réglages d'un autre type (seuil de clôture, prolongation) en
// envoyant un `type` de son choix.
function cfgOfRow(row) { return getType(row && row.type); }

// author_subscriber_id (id interne) est VOLONTAIREMENT absent de la sortie client : le
// besoin légitime du front est couvert par le booléen is_author (calculé dans le GET,
// cf. plus bas). Même principe que collections.js (owner_subscriber_id jamais exposé).
// Les requêtes internes qui ont besoin de l'auteur le sélectionnent explicitement ailleurs.
const REPORT_COLUMNS = `
  r.id, r.type, r.commune_nom, r.commune_insee, r.lat, r.lon, r.radius_km,
  r.description, r.link, r.created_at, r.expires_at,
  r.extensions_count, r.status,
  (SELECT COUNT(*) FROM community_report_spots sp WHERE sp.report_id = r.id)::int AS spot_count
`;

/* ------------------------------------------------------------------ */
/* GET /api/community-reports?token=…&type=… — instances actives      */
/* visibles : abonnements directs + tout profil dans le radius_km de   */
/* l'instance, sauf hide_community_reports = true. `type` absent =     */
/* chat-perdu (compatibilité des clients d'avant le multi-types).      */
/* ------------------------------------------------------------------ */
router.get('/community-reports', async (req, res) => {
  const auth = await authenticate(req.query.token);
  if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });
  const cfg = getType(req.query.type);
  if (!cfg) return res.status(400).json({ error: 'Type de signalement inconnu' });
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
                      WHERE sp.report_id = r.id AND sp.subscriber_id = $1) AS spotted,
              (r.author_subscriber_id = $1) AS is_author
         FROM community_reports r
        WHERE r.type = $2 AND r.status = 'active'`,
      [auth.id, cfg.id]
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
/* Corps : { token, type?, ville, radius_km?, description?, link? }.   */
/* description/link ne sont requis QUE pour la création (aucune         */
/* instance active pour cette commune, et seulement si le type dédup). */
/* ------------------------------------------------------------------ */
router.post('/community-reports', async (req, res) => {
  const { token, type, ville, radius_km, description, link } = req.body || {};
  if (!ville || !String(ville).trim()) return res.status(400).json({ error: 'commune requise' });
  const cfg = getType(type);
  if (!cfg) return res.status(400).json({ error: 'Type de signalement inconnu' });
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

    // Dédup par commune — OPTIONNELLE (cfg.dedupByCommune) : une seule instance
    // active par commune, les suivants REJOIGNENT au lieu de créer. Un type sans
    // dédup saute entièrement ce bloc et tombe dans le chemin de création directe
    // ci-dessous, qui est donc le comportement par défaut.
    if (cfg.dedupByCommune) {
      // Code INSEE si résolu, sinon nom normalisé (repli).
      const existing = insee
        ? await pool.query(
            `SELECT ${REPORT_COLUMNS} FROM community_reports r
              WHERE r.type = $1 AND r.status = 'active' AND r.commune_insee = $2 LIMIT 1`,
            [cfg.id, insee.insee])
        : await pool.query(
            `SELECT ${REPORT_COLUMNS} FROM community_reports r
              WHERE r.type = $1 AND r.status = 'active' AND r.commune_insee IS NULL
                AND lower(r.commune_nom) = lower($2) LIMIT 1`,
            [cfg.id, coords.nom]);

      if (existing.rows.length) {
        const report = existing.rows[0];
        await pool.query(
          `INSERT INTO community_report_subscriptions (report_id, subscriber_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [report.id, auth.id]
        );
        return res.status(200).json({ joined: true, report });
      }
    }

    // Nouvelle instance : description + rate-limit (1 seule active par auteur).
    const desc = ugc.validateText(description, { min: 5, max: 500, allowed: ugc.ALLOWED_FORUM_BODY });
    if (!desc.ok) return res.status(400).json({ error: desc.error });
    const lk = ugc.validateLink(link);
    if (!lk.ok) return res.status(400).json({ error: lk.error });

    // Rate-limit PAR TYPE (assumé) : un même compte peut avoir 1 chat-perdu ET
    // 1 chien-perdu actifs simultanément — ce sont deux signalements distincts,
    // pas un contournement du quota.
    const active = await pool.query(
      `SELECT COUNT(*)::int AS n FROM community_reports
        WHERE type = $1 AND status = 'active' AND author_subscriber_id = $2`,
      [cfg.id, auth.id]
    );
    if (active.rows[0].n > 0) {
      return res.status(409).json({ error: 'Vous avez déjà un signalement actif pour ce type de carte.' });
    }

    const radius = clampRadius(radius_km, cfg);
    // expires_at : durée passée en PARAMÈTRE (make_interval), jamais interpolée dans
    // la chaîne SQL — cfg vient d'un module, mais la règle du projet reste la règle.
    const ins = await pool.query(
      `INSERT INTO community_reports
         (type, commune_nom, commune_insee, lat, lon, radius_km, description, link,
          author_subscriber_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() + make_interval(days => $10))
       RETURNING id, type, commune_nom, commune_insee, lat, lon, radius_km, description, link,
                 created_at, expires_at, extensions_count, status`,
      [cfg.id, coords.nom, insee ? insee.insee : null, coords.lat, coords.lon, radius, desc.value, lk.value, auth.id, cfg.expireDays]
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
/* POST /api/community-reports/:id/spot — « Je l'ai vu » (témoin,       */
/* idempotent), Où/Quand OBLIGATOIRES, fermeture auto au 3e signalant   */
/* distinct. Notifie l'auteur par email dès le 1er spot (best-effort,   */
/* ne bloque jamais la réponse HTTP ni ne peut la faire échouer).       */
/* ------------------------------------------------------------------ */
router.post('/community-reports/:id/spot', async (req, res) => {
  const { token, where, when } = req.body || {};
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  try {
    const auth = await authenticate(token);
    if (!auth) return res.status(401).json({ error: 'Session invalide ou expirée' });

    const w = ugc.validateText(where, { min: 2, max: 200, allowed: ugc.ALLOWED_FORUM_BODY });
    if (!w.ok) return res.status(400).json({ error: 'Où : ' + w.error });
    const wh = ugc.validateText(when, { min: 2, max: 200, allowed: ugc.ALLOWED_FORUM_BODY });
    if (!wh.ok) return res.status(400).json({ error: 'Quand : ' + wh.error });

    const rep = await pool.query('SELECT id, type, status, commune_nom, author_subscriber_id FROM community_reports WHERE id = $1', [id]);
    if (!rep.rows.length) return res.status(404).json({ error: 'Signalement introuvable' });
    if (rep.rows[0].status !== 'active') return res.status(409).json({ error: 'Ce signalement n’est plus actif' });
    // Type relu SUR LA LIGNE (pas envoyé par le témoin) — cf. cfgOfRow.
    const cfg = cfgOfRow(rep.rows[0]);
    if (!cfg) return res.status(409).json({ error: 'Type de signalement inconnu' });

    const already = await pool.query('SELECT 1 FROM community_report_spots WHERE report_id = $1 AND subscriber_id = $2', [id, auth.id]);
    const isNewSpot = already.rows.length === 0;

    await pool.query(
      `INSERT INTO community_report_spots (report_id, subscriber_id, seen_where, seen_when)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (report_id, subscriber_id) DO NOTHING`,
      [id, auth.id, w.value, wh.value]
    );
    const count = await pool.query('SELECT COUNT(*)::int AS n FROM community_report_spots WHERE report_id = $1', [id]);
    const spotCount = count.rows[0].n;
    let status = rep.rows[0].status;
    if (spotCount >= cfg.spotsToClose && status === 'active') {
      await pool.query(`UPDATE community_reports SET status = 'resolved' WHERE id = $1 AND status = 'active'`, [id]);
      status = 'resolved';
    }
    res.status(200).json({ spot_count: spotCount, status });

    // Notif email à l'auteur, best-effort, APRÈS la réponse (jamais awaité par elle,
    // ne peut donc jamais la faire échouer) — même patron que forum.js (notif réponse).
    // Seulement pour un NOUVEAU spot (idempotence : un témoin qui reposte where/when
    // sur un spot déjà enregistré via ON CONFLICT DO NOTHING ne redéclenche pas l'email).
    if (isNewSpot && rep.rows[0].author_subscriber_id !== auth.id) {
      pool.query('SELECT email, token FROM subscribers WHERE id = $1', [rep.rows[0].author_subscriber_id])
        .then((a) => {
          if (a.rows.length && a.rows[0].email) {
            return sendCommunityReportSpotNotification(
              { email: a.rows[0].email, token: a.rows[0].token },
              { communeNom: rep.rows[0].commune_nom, seenWhere: w.value, seenWhen: wh.value, type: cfg }
            );
          }
        })
        .catch((e) => console.error('[community-reports] notif spot :', e.message));
    }
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

    // Durée et plafond dépendent du TYPE, relu sur la ligne (jamais du client).
    // Le SELECT ne sert qu'à choisir les réglages : TOUTES les garanties (auteur,
    // statut, plafond) restent dans le WHERE de l'UPDATE, donc atomiques.
    const rep = await pool.query('SELECT type FROM community_reports WHERE id = $1', [id]);
    if (!rep.rows.length) return res.status(404).json({ error: 'Signalement introuvable' });
    const cfg = cfgOfRow(rep.rows[0]);
    if (!cfg) return res.status(409).json({ error: 'Type de signalement inconnu' });

    const upd = await pool.query(
      `UPDATE community_reports
          SET expires_at = expires_at + make_interval(days => $4), extensions_count = extensions_count + 1
        WHERE id = $1 AND author_subscriber_id = $2 AND status = 'active' AND extensions_count < $3
        RETURNING expires_at, extensions_count`,
      [id, auth.id, cfg.maxExtensions, cfg.expireDays]
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
