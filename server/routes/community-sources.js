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
const { sanitizeCategories, VALID_SLUGS } = require('../categories');
const { hashIp } = require('../ugc');
const { clientIp } = require('../profile-autofill');
const { isValidSelector, zoneVisibleText } = require('../sources/lib/page-zone');
const { hashHtml } = require('../sources/lib/hash-diff-html');
const { safeFetchText, BROWSER_UA } = require('../safe-fetch');
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

// Doublon : URL normalisée déjà surveillée (option : exclure une source donnée).
async function findDuplicate(url, excludeId) {
  const norm = lc.normalizeUrl(url);
  if (!norm) return null;
  const cand = await pool.query('SELECT id, name, endpoint_url FROM sources WHERE endpoint_url IS NOT NULL');
  const dup = cand.rows.find((r) => r.id !== excludeId && lc.normalizeUrl(r.endpoint_url) === norm);
  return dup ? { id: dup.id, name: dup.name, url: `/source/${encodeURIComponent(dup.id)}/statut` } : null;
}

// POST /community-sources — crée un brouillon MINIMAL (type + url) dès l'étape adresse.
// Nom provisoire (hôte), aucune catégorie : la présentation (PATCH) les complète. Un tel
// brouillon ne peut pas passer en review (cf. validateSubmittable dans /submit).
router.post('/community-sources', async (req, res) => {
  const auth = await requireAuthor(req, res); if (!auth) return;
  const v = lc.validateUrlType(req.body);
  if (!v.ok) return res.status(400).json({ error: v.error });
  const { engine, url } = v.value; // validateUrlType renvoie { ok, value: { engine, url, … } }

  const config = {};
  const zone = req.body && typeof req.body.zone === 'string' ? req.body.zone.trim() : '';
  if (zone) {
    if (engine !== 'veille-page') return res.status(400).json({ error: 'Le sélecteur de zone ne s\'applique qu\'à une veille de page.' });
    if (!isValidSelector(zone)) return res.status(400).json({ error: 'Sélecteur invalide (balise, #id ou .classe simples).' });
    config.zone = zone;
  }

  try {
    const dup = await findDuplicate(url, null);
    if (dup) return res.status(409).json({ error: 'Une source surveille déjà cette URL.', existing: dup });

    const q = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = ANY($2))::int AS unpublished
         FROM sources WHERE author_subscriber_id = $1`,
      [auth.id, lc.UNPUBLISHED_STATUSES]);
    const qc = lc.checkQuota(q.rows[0]);
    if (!qc.ok) return res.status(409).json({ error: qc.error });

    const name = lc.provisionalName(url);
    const base = slugify(name);
    let id = base, attempts = 0;
    while ((await pool.query('SELECT 1 FROM sources WHERE id = $1', [id])).rows.length) {
      id = `${base}-${crypto.randomBytes(2).toString('hex')}`;
      if (++attempts > 6) return res.status(503).json({ error: 'Impossible de générer un identifiant, réessayez.' });
    }

    const cfg = Object.keys(config).length ? JSON.stringify(config) : null;
    await pool.query(
      `INSERT INTO sources
         (id, name, description, type, badge, status, engine, endpoint_url,
          author_subscriber_id, categories, requires_confirmation, engine_config)
       VALUES ($1, $2, $3, 'internal', 'community', 'draft', $4, $5, $6, '{}', true, $7::jsonb)`,
      [id, name, name, engine, url, auth.id, cfg]);

    return res.status(201).json({ id, status: 'draft', engine,
      message: 'Brouillon créé. Lancez un aperçu, puis présentez votre alerte.' });
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
              categories, engine_config, status_changed_at, published_at
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
    'SELECT id, name, description, status, engine, endpoint_url, engine_config, categories, author_subscriber_id FROM sources WHERE id = $1', [id]);
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
    const cfg = (() => { try { return typeof s.engine_config === 'string' ? JSON.parse(s.engine_config) : (s.engine_config || {}); } catch { return {}; } })();
    const detected = {};
    let excerpt = null, unstable = false, zoneFound = true;

    try {
      if (s.engine === 'veille-page') {
        // Lecture 1 : extrait de la zone (ce qui sera surveillé) + hash.
        const html1 = await safeFetchText(s.endpoint_url, { timeoutMs: 8000, maxBytes: 2 * 1024 * 1024, robots: true, accept: 'text/html', headers: { 'User-Agent': BROWSER_UA } });
        const zv = zoneVisibleText(html1, cfg.zone || null);
        zoneFound = zv.found;
        excerpt = zv.text ? zv.text.slice(0, 400) : '';
        const h1 = hashHtml(zv.found ? (cfg.zone ? zv.text : html1) : html1).hash;
        // Lecture 2 (quelques secondes plus tard) : page instable si le hash diffère.
        await new Promise((r) => setTimeout(r, 2500));
        const html2 = await safeFetchText(s.endpoint_url, { timeoutMs: 8000, maxBytes: 2 * 1024 * 1024, robots: true, accept: 'text/html', headers: { 'User-Agent': BROWSER_UA } });
        const zv2 = zoneVisibleText(html2, cfg.zone || null);
        const h2 = hashHtml(zv2.found ? (cfg.zone ? zv2.text : html2) : html2).hash;
        unstable = h1 !== h2;
        detected.state = 'inactive'; // 1re lecture = référence, aucune alerte
      } else {
        const src = lc.buildEngineSource(s);
        if (!src) return res.status(400).json({ error: 'Moteur de source non pris en charge.' });
        const result = await src.check();
        detected.state = result.state || 'inactive';
        detected.since = result.since ? new Date(result.since).toISOString() : null;
        detected.until = result.until ? new Date(result.until).toISOString() : null;
        detected.url = result.url || s.endpoint_url;
        excerpt = result.message ? String(result.message).slice(0, 400) : null;
      }
    } catch (err) {
      return res.status(200).json({ ok: false, error: err && err.public ? err.message : 'La vérification a échoué (cible injoignable, interdite ou invalide).' });
    }

    if (s.engine === 'veille-page' && cfg.zone && !zoneFound) {
      return res.status(200).json({ ok: false, error: 'Zone introuvable sur la page : vérifiez le sélecteur.', detected: { excerpt: '' } });
    }

    // Mémorise le dernier extrait pour la revue admin (fusion dans engine_config).
    try {
      const merged = Object.assign({}, cfg, { last_extract: (excerpt || '').slice(0, 280), last_extract_at: new Date().toISOString() });
      await pool.query('UPDATE sources SET engine_config = $2::jsonb WHERE id = $1 AND author_subscriber_id = $3', [s.id, JSON.stringify(merged), auth.id]);
    } catch { /* best-effort */ }

    // Aperçu réussi : promotion draft → testing (idempotent).
    if (s.status === 'draft' && lc.canTransition('draft', 'testing', 'author')) {
      await pool.query("UPDATE sources SET status = 'testing' WHERE id = $1 AND author_subscriber_id = $2 AND status = 'draft'", [s.id, auth.id]);
    }
    return res.json({
      ok: true,
      status: s.status === 'draft' ? 'testing' : s.status,
      unstable,
      warning: unstable ? 'La page change à chaque lecture (contenu dynamique) : risque de fausses alertes. Ciblez une zone plus stable.' : null,
      detected: Object.assign({ excerpt, zone: cfg.zone || null, url: s.endpoint_url }, detected),
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
    // Verrou de complétude : un brouillon minimal (sans nom réel ni catégorie) ne passe pas.
    const comp = lc.validateSubmittable(s);
    if (!comp.ok) return res.status(409).json({ error: comp.error });
    await pool.query("UPDATE sources SET status = 'review', status_reason = NULL WHERE id = $1 AND author_subscriber_id = $2 AND status = 'testing'", [s.id, auth.id]);
    return res.json({ id: s.id, status: 'review', message: 'Envoyée en revue. Vous serez informé après examen.' });
  } catch (err) {
    console.error('[community] submit :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

// PATCH /community-sources/:id — modifie un brouillon ou une source « testing ».
// Mêmes validations qu'à la création. Changer l'URL ou la zone repasse en 'draft'
// et invalide l'aperçu (nouvel aperçu requis). Refusé en review/published/suspended.
router.patch('/community-sources/:id', async (req, res) => {
  const auth = await requireAuthor(req, res); if (!auth) return;
  const b = req.body || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  try {
    const s = await loadOwned(req.params.id, auth.id);
    if (!s) return res.status(404).json({ error: 'Source introuvable.' });
    if (!['draft', 'testing'].includes(s.status)) {
      return res.status(409).json({ error: `Modification impossible : cette source est « ${s.status} » (seuls les brouillons et sources en test sont modifiables).` });
    }
    const isPage = s.engine === 'veille-page';

    let name = s.name, description = s.description, categories = s.categories, endpoint = s.endpoint_url;
    const config = (() => { try { return typeof s.engine_config === 'string' ? JSON.parse(s.engine_config) : (s.engine_config || {}); } catch (e) { return {}; } })();
    let urlChanged = false, zoneChanged = false;

    if (has('name')) {
      const n = String(b.name || '').trim();
      if (n.length < 3 || n.length > 60) return res.status(400).json({ error: 'Le nom doit faire de 3 à 60 caractères.' });
      name = n; description = n;
    }
    if (has('categories')) {
      const cat = sanitizeCategories(b.categories);
      if (!cat.ok) return res.status(400).json({ error: cat.error });
      const unknown = cat.categories.filter((c) => !VALID_SLUGS.includes(c));
      if (unknown.length) return res.status(400).json({ error: `Catégorie inconnue : ${unknown.join(', ')}.` });
      categories = cat.categories;
    }
    if (has('alert_message') || has('alert_url')) {
      const perso = lc.validatePersonalization(b);
      if (!perso.ok) return res.status(400).json({ error: perso.error });
      if (has('alert_message')) { if (perso.value.message) config.message = perso.value.message; else delete config.message; }
      if (has('alert_url')) { if (perso.value.url) config.url = perso.value.url; else delete config.url; }
    }
    if (has('preavis') && s.engine === 'veille-agenda') config.preavis = lc.clampPreavis(b.preavis);
    if (has('zone')) {
      const z = String(b.zone || '').trim();
      if (z) {
        if (!isPage) return res.status(400).json({ error: 'Le sélecteur de zone ne s\'applique qu\'à une veille de page.' });
        if (!isValidSelector(z)) return res.status(400).json({ error: 'Sélecteur invalide (balise, #id ou .classe simples).' });
      }
      if ((config.zone || '') !== z) zoneChanged = true;
      if (z) config.zone = z; else delete config.zone;
    }
    if (has('url')) {
      const u = String(b.url || '').trim();
      if (!lc.HTTPS_RE.test(u)) return res.status(400).json({ error: 'URL https valide requise (max 300 caractères).' });
      const dup = await findDuplicate(u, s.id);
      if (dup) return res.status(409).json({ error: 'Une source surveille déjà cette URL.', existing: dup });
      if (lc.normalizeUrl(u) !== lc.normalizeUrl(endpoint)) urlChanged = true;
      endpoint = u;
    }

    // Changement d'URL/zone → retour en brouillon + aperçu invalidé.
    if (urlChanged || zoneChanged) { delete config.last_extract; delete config.last_extract_at; }
    const newStatus = (urlChanged || zoneChanged) ? 'draft' : s.status;
    const cfg = Object.keys(config).length ? JSON.stringify(config) : null;

    await pool.query(
      `UPDATE sources SET name = $2, description = $3, categories = $4, endpoint_url = $5,
              engine_config = $6::jsonb, status = $7
         WHERE id = $1 AND author_subscriber_id = $8 AND status IN ('draft','testing')`,
      [s.id, name, description, categories, endpoint, cfg, newStatus, auth.id]);

    return res.json({ id: s.id, status: newStatus,
      previewInvalidated: urlChanged || zoneChanged,
      message: (urlChanged || zoneChanged) ? 'Modifié. L\'adresse ayant changé, relancez un aperçu avant de soumettre.' : 'Modifié.' });
  } catch (err) {
    console.error('[community] PATCH :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

// DELETE /community-sources/:id — supprime un brouillon ou une source « testing »
// (ou refusée = redevenue draft). Interdit en review/published/suspended. Libère quota+URL.
router.delete('/community-sources/:id', async (req, res) => {
  const auth = await requireAuthor(req, res); if (!auth) return;
  try {
    const s = await loadOwned(req.params.id, auth.id);
    if (!s) return res.status(404).json({ error: 'Source introuvable.' });
    if (!['draft', 'testing'].includes(s.status)) {
      return res.status(409).json({ error: `Suppression impossible : cette source est « ${s.status} ».` });
    }
    await pool.query("DELETE FROM sources WHERE id = $1 AND author_subscriber_id = $2 AND status IN ('draft','testing')", [s.id, auth.id]);
    return res.json({ ok: true, deleted: s.id, message: 'Brouillon supprimé.' });
  } catch (err) {
    console.error('[community] DELETE :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

/* Limite de fréquence des signalements par compte : 20 / heure. */
const REPORT_MAX = 20;
const REPORT_WINDOW_MS = 60 * 60_000;
const reportHits = new Map();
function reportRateOk(id) {
  const now = Date.now();
  const recent = (reportHits.get(id) || []).filter((t) => now - t < REPORT_WINDOW_MS);
  if (recent.length >= REPORT_MAX) return false;
  recent.push(now); reportHits.set(id, recent); return true;
}

// POST /community-sources/:id/report — signale une source (compte requis).
// 1 signalement par compte et par source. Au seuil de comptes distincts : une source
// COMMUNAUTAIRE publiée passe en 'suspended' automatiquement, SANS notifier ses abonnés.
router.post('/community-sources/:id/report', async (req, res) => {
  const auth = await requireAuthor(req, res); if (!auth) return;
  if (!reportRateOk(auth.id)) return res.status(429).json({ error: 'Trop de signalements, réessayez plus tard.' });
  const reason = String((req.body && req.body.reason) || '').trim();
  if (!lc.isValidReportReason(reason)) {
    return res.status(400).json({ error: `Motif invalide. Attendus : ${lc.REPORT_REASONS.join(', ')}.` });
  }
  let comment = req.body && req.body.comment != null ? String(req.body.comment).replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : null;
  if (comment === '') comment = null;
  if (comment && comment.length > 280) comment = comment.slice(0, 280);

  try {
    const sres = await pool.query('SELECT id, badge, status FROM sources WHERE id = $1', [req.params.id]);
    if (!sres.rows.length) return res.status(404).json({ error: 'Source introuvable.' });
    const s = sres.rows[0];

    const ins = await pool.query(
      `INSERT INTO source_reports (source_id, reporter_subscriber_id, reason, comment, ip_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (source_id, reporter_subscriber_id) DO NOTHING RETURNING id`,
      [s.id, auth.id, reason, comment, hashIp(clientIp(req))]);
    const already = ins.rows.length === 0;

    const cnt = await pool.query('SELECT COUNT(DISTINCT reporter_subscriber_id)::int AS n FROM source_reports WHERE source_id = $1', [s.id]);
    const distinct = cnt.rows[0].n;

    let suspended = false;
    if (lc.shouldAutoSuspend({ badge: s.badge, status: s.status, distinctReports: distinct })) {
      // Aucune notification aux abonnés : simple bascule de statut (le trigger coupe enabled).
      await pool.query(
        "UPDATE sources SET status = 'suspended', status_reason = $2 WHERE id = $1 AND status = 'published'",
        [s.id, `Suspendue automatiquement : ${distinct} signalements distincts.`]);
      suspended = true;
    }
    return res.json({
      ok: true, already, distinct, suspended,
      message: already ? 'Vous aviez déjà signalé cette source.' : 'Signalement enregistré. Merci.',
    });
  } catch (err) {
    console.error('[community] report :', err.message);
    return res.status(503).json({ error: 'Service indisponible.' });
  }
});

module.exports = router;
