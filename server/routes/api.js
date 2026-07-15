const express = require('express');
const { pool } = require('../db');
const { CATEGORIES } = require('../categories');
const { COUNTRIES, DEPARTEMENTS } = require('../geo');
const { paramsFromQuery } = require('../params');

const router = express.Router();

// Fusion v2 : ancien id départemental → source paramétrée (301 avec ?departement).
const OLD_VIG = /^vigilance-meteo-(.+)$/;
// Fusion v2 (vague 12) : anciens ids broadcast retirés → source paramétrée.
const FUSED_REDIRECTS = {
  'vigieau-gap': { to: 'vigieau', qs: 'commune=05061' },
  'vacances-zone-a': { to: 'vacances-scolaires', qs: 'zone=A' },
  'vacances-zone-b': { to: 'vacances-scolaires', qs: 'zone=B' },
  'vacances-zone-c': { to: 'vacances-scolaires', qs: 'zone=C' },
  'carburant-seuils': { to: 'carburant', qs: '' },
  'indice-uv-gap': { to: 'indice-uv', qs: 'departement=05' },
};
function redirectOldVig(id, suffix, res) {
  const m = id.match(OLD_VIG);
  if (m) {
    res.redirect(301, `/api/sources/vigilance-meteo/${suffix}?departement=${encodeURIComponent(m[1])}`);
    return true;
  }
  const f = FUSED_REDIRECTS[id];
  if (f) {
    res.redirect(301, `/api/sources/${f.to}/${suffix}${f.qs ? '?' + f.qs : ''}`);
    return true;
  }
  return false;
}

// GET /api/categories — taxonomie complète (publique, cacheable).
router.get('/categories', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(CATEGORIES);
});

// GET /api/geo — référentiel pays + départements (personnalisation, cacheable).
router.get('/geo', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.json({ countries: COUNTRIES, departements: DEPARTEMENTS });
});

// GET /api/sources — liste des sources avec leur état courant.
router.get('/sources', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.subtitle, s.description, s.badge, s.type, s.link_url,
              s.categories, s.submitted_by_github, s.params_schema,
              CASE WHEN s.type = 'linked' THEN NULL
                   ELSE COALESCE(st.state, 'inactive') END AS state,
              (SELECT COUNT(*) FROM subscriptions sub
                 JOIN subscribers subr ON subr.id = sub.subscriber_id
                WHERE sub.source_id = s.id AND subr.confirmed = true)::int AS subscriber_count,
              (SELECT MAX(created_at) FROM source_events e
                WHERE e.source_id = s.id AND e.event = 'activated') AS last_activated_at
         FROM sources s
         LEFT JOIN source_states st ON st.source_id = s.id
        WHERE s.enabled = true
        ORDER BY s.display_order ASC, s.name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[api] Erreur GET /sources :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// GET /api/sources/:id/alert.json — manifeste OpenAlert d'une source.
// Paramétrée : ?departement=05 lit source_param_states de la combinaison.
router.get('/sources/:id/alert.json', async (req, res) => {
  try {
    if (redirectOldVig(req.params.id, 'alert.json', res)) return;
    const base = await pool.query('SELECT id, name, type, params_schema FROM sources WHERE id = $1', [req.params.id]);
    if (base.rows.length === 0) {
      return res.status(404).json({ error: 'Source inconnue' });
    }
    const s = base.rows[0];
    // Les sources liées (services partenaires) n'ont pas de manifeste OpenAlert.
    if (s.type === 'linked') {
      return res.status(404).json({
        error: 'Cette source est un service externe lié, sans manifeste OpenAlert',
      });
    }

    const schema = s.params_schema || null;
    const params = schema ? paramsFromQuery(schema, req.query) : null;
    const stateRes = params
      ? await pool.query(
          `SELECT state, since, until_date, message, url, checked_at
             FROM source_param_states WHERE source_id = $1 AND params = $2::jsonb`,
          [s.id, JSON.stringify(params)])
      : await pool.query(
          `SELECT state, since, until_date, message, url, checked_at
             FROM source_states WHERE source_id = $1`, [s.id]);
    const r = stateRes.rows[0] || {};

    res.json({
      id: s.id,
      name: s.name,
      state: r.state || 'inactive',
      since: r.since ? r.since.toISOString() : null,
      until: r.until_date ? r.until_date.toISOString() : null,
      message: r.message ?? null,
      url: r.url ?? null,
      checked_at: r.checked_at ? r.checked_at.toISOString() : null,
    });
  } catch (err) {
    console.error('[api] Erreur GET /sources/:id/alert.json :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// GET /api/sources/:id/history — 50 derniers events + 90 jours d'uptime.
// Sources paramétrées : ?departement=05 (etc.) filtre l'historique sur la
// combinaison (source_param_states / source_events.params). Sans param valide,
// on retombe sur le chemin broadcast (source_states) — inchangé.
router.get('/sources/:id/history', async (req, res) => {
  const id = req.params.id;
  try {
    if (redirectOldVig(id, 'history', res)) return;
    const schemaRes = await pool.query('SELECT params_schema FROM sources WHERE id = $1', [id]);
    if (schemaRes.rows.length === 0) return res.status(404).json({ error: 'Source inconnue' });
    const schema = schemaRes.rows[0].params_schema || null;
    const params = schema ? paramsFromQuery(schema, req.query) : null;

    const src = await pool.query(
      params
        ? `SELECT s.created_at, COALESCE(sps.state,'inactive') AS state
             FROM sources s LEFT JOIN source_param_states sps
               ON sps.source_id = s.id AND sps.params = $2::jsonb
            WHERE s.id = $1`
        : `SELECT s.created_at, COALESCE(st.state,'inactive') AS state
             FROM sources s LEFT JOIN source_states st ON st.source_id = s.id
            WHERE s.id = $1`,
      params ? [id, JSON.stringify(params)] : [id]
    );
    if (src.rows.length === 0) return res.status(404).json({ error: 'Source inconnue' });
    const createdAt = new Date(src.rows[0].created_at);

    // Filtre événementiel : par combinaison si paramétré, sinon broadcast (params NULL).
    const paramFilter = params ? 'AND params = $2::jsonb' : '';
    const evArgs = params ? [id, JSON.stringify(params)] : [id];

    const evRes = await pool.query(
      `SELECT event, message, created_at FROM source_events
        WHERE source_id = $1 ${paramFilter} ORDER BY created_at DESC LIMIT 50`,
      evArgs
    );
    const events = evRes.rows.map((r) => ({
      event: r.event, message: r.message, created_at: r.created_at.toISOString(),
    }));

    // Tous les events (asc) pour reconstruire les intervalles actifs + compter les échecs.
    const allRes = await pool.query(
      `SELECT event, created_at FROM source_events
        WHERE source_id = $1 ${paramFilter} ORDER BY created_at ASC`,
      evArgs
    );
    const all = allRes.rows;

    // Intervalles [début, fin] où la source était active.
    const intervals = [];
    let openStart = null;
    for (const e of all) {
      const t = new Date(e.created_at);
      if (e.event === 'activated' && openStart === null) openStart = t;
      else if (e.event === 'deactivated' && openStart !== null) { intervals.push([openStart, t]); openStart = null; }
    }
    if (openStart !== null) intervals.push([openStart, new Date()]);

    // Si l'état courant est actif mais aucun event (données anciennes), couvrir aujourd'hui.
    if (src.rows[0].state === 'active' && intervals.length === 0) {
      intervals.push([new Date(Date.now() - 86400000), new Date()]);
    }

    const days = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 89; i >= 0; i--) {
      const dayStart = new Date(today); dayStart.setDate(today.getDate() - i);
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayStart.getDate() + 1);
      const dateStr = dayStart.toISOString().slice(0, 10);
      let status;
      if (dayEnd <= createdAt) {
        status = 'nodata';
      } else {
        const failCount = all.filter((e) => e.event === 'failed' &&
          new Date(e.created_at) >= dayStart && new Date(e.created_at) < dayEnd).length;
        if (failCount >= 3) status = 'failed';
        else if (intervals.some(([a, b]) => a < dayEnd && b >= dayStart)) status = 'active';
        else status = 'calm';
      }
      days.push({ date: dateStr, status });
    }

    res.json({ events, days });
  } catch (err) {
    console.error('[api] Erreur GET /sources/:id/history :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// GET /api/stats — chiffres du mois courant pour le bloc marketing.
router.get('/stats', async (req, res) => {
  try {
    const d = new Date();
    const mk = String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0');
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();

    const counters = await pool.query('SELECT key, value FROM counters');
    const cmap = {};
    counters.rows.forEach((r) => { cmap[r.key] = Number(r.value); });

    const alerts = await pool.query(
      `SELECT COUNT(*)::int AS n FROM source_events WHERE event = 'activated' AND created_at >= $1`,
      [monthStart]
    );
    const srcCount = await pool.query('SELECT COUNT(*)::int AS n FROM sources WHERE enabled = true');

    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      checks_this_month: cmap['checks_' + mk] || 0,
      emails_this_month: cmap['emails_' + mk] || 0,
      alerts_this_month: alerts.rows[0].n,
      sources_count: srcCount.rows[0].n,
    });
  } catch (err) {
    console.error('[api] Erreur GET /stats :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

// GET /api/sources/:id/badge.svg — badge SVG dynamique auto-contenu.
router.get('/sources/:id/badge.svg', async (req, res) => {
  try {
    const id = req.params.id;
    if (redirectOldVig(id, 'badge.svg', res)) return;
    const schemaRes = await pool.query('SELECT params_schema FROM sources WHERE id = $1 AND enabled = true', [id]);
    const schema = schemaRes.rows.length ? (schemaRes.rows[0].params_schema || null) : null;
    const params = schema ? paramsFromQuery(schema, req.query) : null;

    const { rows } = await pool.query(
      params
        ? `SELECT s.name, COALESCE(sps.state,'inactive') AS state
             FROM sources s LEFT JOIN source_param_states sps
               ON sps.source_id = s.id AND sps.params = $2::jsonb
            WHERE s.id = $1 AND s.enabled = true`
        : `SELECT s.name, COALESCE(st.state,'inactive') AS state
             FROM sources s LEFT JOIN source_states st ON st.source_id = s.id
            WHERE s.id = $1 AND s.enabled = true`,
      params ? [id, JSON.stringify(params)] : [id]
    );
    // Dernier event pour distinguer « erreur » du calme.
    let recentFailed = false;
    if (rows.length) {
      const ev = await pool.query(
        `SELECT event, created_at FROM source_events
          WHERE source_id = $1 ${params ? 'AND params = $2::jsonb' : ''} ORDER BY created_at DESC LIMIT 1`,
        params ? [id, JSON.stringify(params)] : [id]
      );
      const last = ev.rows[0];
      recentFailed = last && last.event === 'failed' && (Date.now() - new Date(last.created_at).getTime()) < 5400_000;
    }

    let label = 'calme', color = '#9aa3ad';
    if (rows.length) {
      if (rows[0].state === 'active') { label = 'active'; color = '#22c55e'; }
      else if (recentFailed) { label = 'erreur'; color = '#f5a623'; }
    }
    const name = rows.length ? rows[0].name : 'source inconnue';
    const shortName = (name.length > 22 ? name.slice(0, 21) + '…' : name);

    function xesc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="44" viewBox="0 0 260 44" role="img" aria-label="${xesc(name)} : ${label}">
  <rect width="260" height="44" rx="10" fill="#161d24"/>
  <text x="16" y="19" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="700" fill="#a567e3">labonnealerte</text>
  <text x="16" y="33" font-family="Arial,Helvetica,sans-serif" font-size="12" fill="#f2efe9">${xesc(shortName)}</text>
  <circle cx="222" cy="22" r="5" fill="${color}"/>
  <text x="234" y="26" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="700" fill="${color}" text-anchor="middle">${label}</text>
</svg>`;
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(svg);
  } catch (err) {
    console.error('[api] Erreur GET /badge.svg :', err.message);
    res.status(503).send('');
  }
});

// GET /api/status — compat : état de leboncoin-livraison au format historique.
router.get('/status', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT state, since, until_date, checked_at
         FROM source_states
        WHERE source_id = 'leboncoin-livraison'`
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Aucun statut en base' });
    }

    const r = rows[0];
    res.json({
      active: r.state === 'active',
      pending: r.state === 'pending',
      date_debut: r.since ? r.since.toISOString() : null,
      date_fin: r.until_date ? r.until_date.toISOString() : null,
      checked_at: r.checked_at ? r.checked_at.toISOString() : null,
    });
  } catch (err) {
    console.error('[api] Erreur GET /status :', err.message);
    res.status(503).json({ error: 'DB unavailable' });
  }
});

module.exports = router;
