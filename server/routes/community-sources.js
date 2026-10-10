// Routes « Publier une alerte » — grand public, COMPTE REQUIS (LOT 2).
// Montées sous /api. Création d'une source communautaire (veille page/RSS/agenda),
// aperçu (dry-run) réservé à l'auteur, soumission à la revue. La validation par
// Hugo (review → published) et la suspension passent par scripts/source-lifecycle-admin.js
// (aucune route admin existante pour les sources ; requireAdmin de forum.js pourrait
// en accueillir une plus tard). AUCUNE écriture d'état/notification ici.
'use strict';

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { authenticate } = require('../sessions');
const { sanitizeCategories } = require('../categories');
const lc = require('../sources/lib/source-lifecycle');

const router = express.Router();

/* Limite de fréquence par COMPTE pour l'aperçu (réseau sortant). 10 / 10 min. */
const PREVIEW_MAX = 10;
const PREVIEW_WINDOW_MS = 10 * 60_000;
const previewHits = new Map(); // subscriberId -> [timestamps]
function previewRateOk(id) {
  const now = Date.now();
  const recent = (previewHits.get(id) || []).filter((t) => now - t < PREVIEW_WINDOW_MS);
  if (recent.length >= PREVIEW_MAX) return false;
  recent.push(now); previewHits.set(id, recent); return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [id, arr] of previewHits) {
    const r = arr.filter((t) => now - t < PREVIEW_WINDOW_MS);
    if (r.length === 0) previewHits.delete(id); else previewHits.set(id, r);
  }
}, PREVIEW_WINDOW_MS).unref();

function tokenOf(req) {
  const h = req.headers.authorization || '';
  const bearer = h.startsWith('Bearer ') ? h.slice(7) : '';
  return (req.body && req.body.token) || req.query.token || bearer || '';
}
async function requireAuthor(req, res) {
  const auth = await authenticate(tokenOf(req));
  if (!auth || !auth.id) { res.status(401).json({ error: 'Compte requis : connectez-vous.' }); return null; }
  return auth;
}
function slugify(name) {
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'veille';
}

// POST /community-sources — crée une source communautaire (status draft).
router.post('/community-sources', async (req, res) => {
  const auth = await requireAuthor(req, res); if (!auth) return;
  const v = lc.validateCreate(req.body);
  if (!v.ok) return res.status(400).json({ error: v.error });
  const cat = sanitizeCategories(req.body && req.body.categories);
  if (!cat.ok) return res.status(400).json({ error: cat.error });

  try {
    // Quota (COUNT, pas de table).
    const q = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = ANY($2))::int AS unpublished
         FROM sources WHERE author_subscriber_id = $1`,
      [auth.id, lc.UNPUBLISHED_STATUSES]);
    const qc = lc.checkQuota(q.rows[0]);
    if (!qc.ok) return res.status(409).json({ error: qc.error });

    // id unique : slug + suffixe aléatoire en cas de collision.
    const base = slugify(v.name);
    let id = base, attempts = 0;
    while ((await pool.query('SELECT 1 FROM sources WHERE id = $1', [id])).rows.length) {
      id = `${base}-${crypto.randomBytes(2).toString('hex')}`;
      if (++attempts > 6) return res.status(503).json({ error: 'Impossible de générer un identifiant, réessayez.' });
    }

    await pool.query(
      `INSERT INTO sources
         (id, name, description, type, badge, status, engine, endpoint_url,
          author_subscriber_id, categories, requires_confirmation)
       VALUES ($1, $2, $3, 'internal', 'community', 'draft', $4, $5, $6, $7, true)`,
      [id, v.name.slice(0, 255), v.description, v.engine, v.url, auth.id, cat.categories]);

    return res.status(201).json({ id, status: 'draft', engine: v.engine,
      message: 'Brouillon créé. Lancez un aperçu pour vérifier qu\'il détecte bien, puis soumettez-le.' });
  } catch (err) {
    console.error('[community] POST /community-sources :', err.message);
    return res.status(503).json({ error: 'Service indisponible, réessayez plus tard.' });
  }
});

// GET /community-sources — liste les sources de l'auteur (toutes visibilités).
router.get('/community-sources', async (req, res) => {
  const auth = await requireAuthor(req, res); if (!auth) return;
  try {
    const { rows } = await pool.query(
      `SELECT id, name, status, engine, endpoint_url, badge, status_reason,
              status_changed_at, published_at
         FROM sources WHERE author_subscriber_id = $1 ORDER BY status_changed_at DESC`,
      [auth.id]);
    return res.json({ sources: rows });
  } catch (err) {
    console.error('[community] GET /community-sources :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

// Charge une source de l'auteur (sinon 404, jamais la source d'un autre).
async function loadOwned(id, authorId) {
  const { rows } = await pool.query(
    'SELECT id, name, status, engine, endpoint_url, author_subscriber_id FROM sources WHERE id = $1', [id]);
  const s = rows[0];
  if (!lc.isOwner(s, authorId)) return null;
  return s;
}

// POST /community-sources/:id/preview — APERÇU (dry-run) réservé à l'auteur.
// Exécute le check BRUT du moteur (jamais processSource) → aucun état, aucune notif.
// Si l'aperçu réussit et que la source est en brouillon : passage draft → testing.
router.post('/community-sources/:id/preview', async (req, res) => {
  const auth = await requireAuthor(req, res); if (!auth) return;
  if (!previewRateOk(auth.id)) return res.status(429).json({ error: 'Trop d\'aperçus, réessayez dans quelques minutes.' });
  try {
    const s = await loadOwned(req.params.id, auth.id);
    if (!s) return res.status(404).json({ error: 'Source introuvable.' });
    if (!['draft', 'testing'].includes(s.status)) {
      return res.status(409).json({ error: `Aperçu indisponible pour une source en « ${s.status} ».` });
    }
    const src = lc.buildEngineSource(s);
    if (!src) return res.status(400).json({ error: 'Moteur de source non pris en charge.' });

    let result;
    try {
      result = await src.check(); // robots:true est porté par le module générique
    } catch (err) {
      return res.status(200).json({ ok: false, error: err && err.public ? err.message : 'La vérification a échoué (cible injoignable, interdite ou invalide).' });
    }

    // Aperçu réussi : promotion draft → testing (idempotent).
    if (s.status === 'draft' && lc.canTransition('draft', 'testing', 'author')) {
      await pool.query("UPDATE sources SET status = 'testing' WHERE id = $1 AND author_subscriber_id = $2 AND status = 'draft'", [s.id, auth.id]);
    }
    const excerpt = result.message ? String(result.message).slice(0, 200) : null;
    return res.json({
      ok: true,
      status: s.status === 'draft' ? 'testing' : s.status,
      detected: {
        state: result.state || 'inactive',
        since: result.since ? new Date(result.since).toISOString() : null,
        until: result.until ? new Date(result.until).toISOString() : null,
        excerpt,
        url: result.url || s.endpoint_url,
      },
      note: 'Aperçu uniquement : rien n\'a été enregistré ni notifié.',
    });
  } catch (err) {
    console.error('[community] preview :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

// POST /community-sources/:id/submit — soumission à la revue (testing → review).
router.post('/community-sources/:id/submit', async (req, res) => {
  const auth = await requireAuthor(req, res); if (!auth) return;
  try {
    const s = await loadOwned(req.params.id, auth.id);
    if (!s) return res.status(404).json({ error: 'Source introuvable.' });
    if (!lc.canTransition(s.status, 'review', 'author')) {
      return res.status(409).json({ error: `Soumission impossible depuis « ${s.status} » : lancez d'abord un aperçu réussi (passage en test).` });
    }
    await pool.query("UPDATE sources SET status = 'review', status_reason = NULL WHERE id = $1 AND author_subscriber_id = $2 AND status = 'testing'", [s.id, auth.id]);
    return res.json({ id: s.id, status: 'review', message: 'Envoyée en revue. Vous serez informé après examen.' });
  } catch (err) {
    console.error('[community] submit :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

module.exports = router;
