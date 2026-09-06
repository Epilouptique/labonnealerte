// SONDE DE CONTRÔLE TEMPORAIRE — à DÉMONTER après validation de 2-3 week-ends de la
// vraie alerte (ce module + son cron dans poller.js ; la table promo_probe_log peut
// survivre le temps de relire l'historique).
//
// Depuis le 06/09/2026, la détection Dealabs alimente la VRAIE alerte
// (server/sources/leboncoin-livraison.js). Cette sonde ne sert plus à choisir une piste :
// elle continue simplement à journaliser, toutes les 10 min du vendredi au lundi matin,
// ce que voit le détecteur — pour vérifier a posteriori que l'alerte est partie au bon
// moment et qu'aucun faux positif/négatif ne passe. Mode LOG UNIQUEMENT : écrit dans
// promo_probe_log, n'envoie AUCUNE notification.
//
// UNE SEULE PISTE désormais : 'dealabs'. La sonde 'leboncoin-direct' a été supprimée —
// la question du scraping direct est tranchée (DataDome intermittent), et ses 403
// aléatoires polluaient la mesure plus qu'ils ne l'informaient. L'historique de ses
// 42 passages reste dans promo_probe_log.
//
// Le parseur n'est PAS dupliqué ici : il vient de sources/lib/dealabs-promo.js, le même
// module que la source. C'est tout l'intérêt de garder la sonde — mesurer le code réel,
// pas une copie qui pourrait dériver de lui en silence.
//
// Fenêtre vendredi 08:00 → lundi 09:59 (Europe/Paris). Le cron de poller.js couvre déjà
// cette plage ; inWindow() la re-vérifie en ceinture-bretelles (et rend { force } utile
// pour un déclenchement manuel, cf. scripts/probe-leboncoin-force.js).

const { fetchDealabs, analyzeDealabs, parseDealabs, isPromoTitle } = require('./sources/lib/dealabs-promo');

// ── Fenêtre horaire (Europe/Paris) ───────────────────────────────────────────
function parisParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return { weekday: parts.weekday, hour: parseInt(parts.hour, 10) % 24, minute: parseInt(parts.minute, 10) };
}
// Vendredi 08:00 → lundi 09:59 (heure de Paris) : la plage où une promo peut démarrer
// ou s'éteindre. Volontairement large des deux côtés — on mesure, on ne parie pas.
function inWindow(date = new Date()) {
  const { weekday, hour } = parisParts(date);
  if (weekday === 'Sat' || weekday === 'Sun') return true;
  if (weekday === 'Fri') return hour >= 8;
  if (weekday === 'Mon') return hour < 10;
  return false;
}

// ── Piste Dealabs (la seule) ─────────────────────────────────────────────────
// fetchDealabs ne throw jamais : on veut journaliser l'échec (HTTP, réseau) plutôt que
// de le perdre — c'est exactement ce qu'une sonde doit capturer.
async function probeDealabs() {
  const r = await fetchDealabs();
  if (r.status !== 200) {
    return { probe: 'dealabs', detected: false, http_status: r.status, blocked: false,
      latency_ms: r.latency, detail: { error: r.error || null, note: 'HTTP != 200' } };
  }
  const a = analyzeDealabs(r.body);
  return {
    probe: 'dealabs',
    detected: a.active,
    http_status: 200,
    blocked: false,
    latency_ms: r.latency,
    detail: { matched_count: a.matched_count, active_count: a.active_count, best: a.best },
  };
}

// ── Écriture diagnostic ──────────────────────────────────────────────────────
async function logProbe(pool, row) {
  await pool.query(
    `INSERT INTO promo_probe_log (probe, detected, http_status, blocked, latency_ms, detail)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [row.probe, !!row.detected, row.http_status, !!row.blocked, row.latency_ms,
     JSON.stringify(row.detail || {})]
  );
}

/**
 * Lance la sonde et journalise — OBSERVATION SEULE, aucune alerte.
 * @param {object} pool  pool pg
 * @param {object} [opts] { force } bypass de la fenêtre (tests manuels uniquement)
 */
async function runProbe(pool, opts = {}) {
  if (!opts.force && !inWindow()) return { skipped: true, reason: 'hors fenêtre' };
  const results = [];
  for (const fn of [probeDealabs]) {
    try {
      const row = await fn();
      results.push(row);
      try { await logProbe(pool, row); }
      catch (e) { console.warn('[promo-probe] écriture log ignorée :', e.message); }
      console.log(`[promo-probe] ${row.probe} detected=${row.detected} http=${row.http_status} blocked=${row.blocked} (${row.latency_ms}ms)`);
    } catch (err) {
      console.error('[promo-probe] sonde en échec :', err.message);
    }
  }
  return { skipped: false, results };
}

module.exports = { runProbe, inWindow, parseDealabs, isPromoTitle };
