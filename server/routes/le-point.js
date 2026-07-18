// « Le Point » : page publique de synthèse. ZÉRO nouvelle donnée — lit l'existant.
// Deux blocs : EN CE MOMENT (états actifs) et À VENIR (10 prochains jours, tirés des
// configs calendaires via le contrat optionnel upcoming() de la calendar-factory).
//
// GARDE-FOUS : page publique, aucun état personnel. Les agrégats paramétrés ne révèlent
// JAMAIS un abonné : ce sont des ÉTATS DE SOURCE (source_param_states) — NB : ces états
// n'existent que pour les combinaisons SOUSCRITES (le poller ne calcule que celles-là),
// donc l'agrégat reflète « les combinaisons suivies actuellement actives », ce qu'on
// assume dans le libellé. Sources en attente (pending / requires_confirmation) EXCLUES
// (seul state='active' apparaît). Résultat mis en cache 2 min (page la plus visitée).

const express = require('express');
const path = require('path');
const fs = require('fs');
const { pool } = require('../db');
const { resolveLabel } = require('../params');

// Charge les modules sources exposant upcoming() (sources calendaires). Lecture seule.
function loadCalendarSources() {
  const dir = path.join(__dirname, '..', 'sources');
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    try {
      const m = require(path.join(dir, f));
      if (m && m.id && typeof m.upcoming === 'function') out.push(m);
    } catch (e) { /* module non chargeable : ignoré */ }
  }
  return out;
}
const CAL_SOURCES = loadCalendarSources();

const apiRouter = express.Router();
const pagesRouter = express.Router();

let cache = { at: 0, data: null };
const CACHE_MS = 2 * 60 * 1000;

async function build() {
  const now = new Date();

  // — EN CE MOMENT : sources broadcast actives (tri par popularité puis ordre kiosque).
  const bc = await pool.query(
    `SELECT s.id, s.name, s.badge, st.message, st.url, st.since
       FROM sources s JOIN source_states st ON st.source_id = s.id
      WHERE s.enabled = true AND s.type <> 'linked' AND st.state = 'active'
      ORDER BY s.likes_count DESC, s.display_order`
  );

  // — EN CE MOMENT : agrégat des sources paramétrées (combinaisons souscrites actives).
  const pv = await pool.query(
    `SELECT sps.source_id, sps.params, sps.since, s.name, s.params_schema
       FROM source_param_states sps
       JOIN sources s ON s.id = sps.source_id
      WHERE s.enabled = true AND s.type <> 'linked' AND sps.state = 'active'`
  );
  const grouped = {};
  for (const r of pv.rows) {
    const g = grouped[r.source_id] || (grouped[r.source_id] = { source_id: r.source_id, name: r.name, schema: r.params_schema, labels: [], since: r.since });
    const label = resolveLabel(r.params_schema, r.params);
    if (label) g.labels.push(label);
    if (r.since && (!g.since || r.since < g.since)) g.since = r.since;
  }

  const active = [
    ...bc.rows.map((r) => ({
      kind: 'broadcast', id: r.id, name: r.name,
      message: r.message, url: r.url || `/source/${r.id}/statut`, since: r.since,
    })),
    ...Object.values(grouped).map((g) => ({
      kind: 'param', id: g.source_id, name: g.name,
      count: g.labels.length, labels: g.labels.slice(0, 8),
      url: `/source/${g.source_id}/statut`, since: g.since,
    })),
  ];

  // — À VENIR : événements des 10 prochains jours (sources calendaires activées).
  const enabled = await pool.query("SELECT id FROM sources WHERE enabled = true AND type <> 'linked'");
  const enabledIds = new Set(enabled.rows.map((r) => r.id));
  const upcoming = [];
  for (const s of CAL_SOURCES) {
    if (!enabledIds.has(s.id)) continue;
    try {
      for (const ev of s.upcoming(now, 10)) {
        upcoming.push({ id: ev.id, start: ev.start, message: ev.message, url: ev.url || `/source/${ev.id}/statut` });
      }
    } catch (e) { /* source défaillante : ignorée */ }
  }
  upcoming.sort((a, b) => a.start - b.start);

  return {
    generated_at: now.toISOString(),
    active,
    upcoming: upcoming.slice(0, 20).map((e) => ({ id: e.id, start: e.start.toISOString(), message: e.message, url: e.url })),
    counts: { active: active.length, upcoming: Math.min(upcoming.length, 20) },
  };
}

apiRouter.get('/le-point', async (req, res) => {
  try {
    if (!cache.data || Date.now() - cache.at > CACHE_MS) {
      cache = { at: Date.now(), data: await build() };
    }
    res.set('Cache-Control', 'public, max-age=120');
    return res.json(cache.data);
  } catch (err) {
    console.error('[le-point] Erreur GET /le-point :', err.message);
    return res.status(503).json({ error: 'Service indisponible' });
  }
});

pagesRouter.get('/le-point', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'le-point.html'));
});

module.exports = { apiRouter, pagesRouter };
