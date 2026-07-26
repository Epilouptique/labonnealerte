// OBSERVATION SEULE — sonde de détection de la promo « livraison Mondial Relay 0,99 € »
// sur leboncoin. Mode « log uniquement » : écrit dans la table promo_probe_log, n'envoie
// AUCUNE alerte aux abonnés (la vraie source leboncoin-livraison reste neutralisée, elle
// renvoie toujours inactive() pendant cette phase).
//
// Deux pistes comparées à chaque passage :
//   · 'dealabs'          : source tierce communautaire (accessible, non bloquée) — piste
//                          principale. On lit le JSON __INITIAL_STATE__ de la recherche.
//   · 'leboncoin-direct' : retest du scraping direct depuis l'IP Railway — sert uniquement
//                          à mesurer dans le temps la stabilité du blocage DataDome.
//
// Fenêtre STRICTE vendredi 13:58–15:00 (Europe/Paris) : hors fenêtre, runProbe() sort
// immédiatement sans aucune requête réseau. La planification fine (cron dédié 3 min) vit
// dans poller.js — voir le commentaire « EXCEPTION ASSUMÉE » là-bas.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DEALABS_URL =
  'https://www.dealabs.com/search?q=mondial%20relay%200%2C99%20leboncoin';
const LBC_URL = 'https://www.leboncoin.fr/service/bons-plans';
const LBC_MARKER = 'Livraison à 0,99';

// ── Fenêtre horaire (Europe/Paris) ───────────────────────────────────────────
function parisParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return { weekday: parts.weekday, hour: parseInt(parts.hour, 10) % 24, minute: parseInt(parts.minute, 10) };
}
// Vendredi, entre 13:58 et 15:00 inclus (heure de Paris).
function inWindow(date = new Date()) {
  const { weekday, hour, minute } = parisParts(date);
  if (weekday !== 'Fri') return false;
  const mins = hour * 60 + minute;
  return mins >= (13 * 60 + 58) && mins <= (15 * 60 + 0);
}

// ── Utilitaires ──────────────────────────────────────────────────────────────
function normalizeSpaces(text) {
  return String(text || '').replace(/[  \s]+/g, ' ');
}
async function timedFetch(url, headers, timeoutMs = 8000) {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { headers, signal: controller.signal });
    const body = await res.text();
    return { status: res.status, body, latency: Date.now() - t0 };
  } catch (err) {
    return { status: null, body: '', latency: Date.now() - t0, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

// ── Piste Dealabs ──────────────────────────────────────────────────────────────
// Titre pertinent = contient à la fois « mondial relay », « 0,99/0.99 » et « leboncoin ».
function isPromoTitle(title) {
  const t = String(title || '').toLowerCase();
  return t.includes('mondial relay') && (t.includes('0,99') || t.includes('0.99')) && t.includes('leboncoin');
}
// Extrait les threads pertinents du HTML (blob JSON __INITIAL_STATE__) : pour chaque titre
// promo, on récupère isExpired / publishedAt / status / temperature dans sa fenêtre proche.
function parseDealabs(html) {
  const threads = [];
  const re = /"title":"([^"]{5,140})"/g;
  let m;
  while ((m = re.exec(html))) {
    const rawTitle = m[1];
    const title = rawTitle.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    if (!isPromoTitle(title)) continue;
    const around = html.slice(m.index, m.index + 900);
    const exp = /"isExpired":(true|false)/.exec(around);
    const pub = /"publishedAt":(\d{9,13})/.exec(around);
    const st = /"status":"([^"]+)"/.exec(around);
    const temp = /"temperature":([\d.]+)/.exec(around);
    threads.push({
      title,
      isExpired: exp ? exp[1] === 'true' : null,
      publishedAt: pub ? Number(pub[1]) : null,
      status: st ? st[1] : null,
      temperature: temp ? Number(temp[1]) : null,
    });
  }
  return threads;
}
async function probeDealabs() {
  const r = await timedFetch(DEALABS_URL, { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' });
  if (r.status !== 200) {
    return { probe: 'dealabs', detected: false, http_status: r.status, blocked: false,
      latency_ms: r.latency, detail: { error: r.error || null, note: 'HTTP != 200' } };
  }
  const threads = parseDealabs(r.body);
  // Un thread ACTIF (isExpired=false) = promo en cours d'après la communauté.
  const active = threads.filter((t) => t.isExpired === false);
  // À défaut d'un actif, on garde le plus récemment publié (info de fraîcheur).
  const freshest = threads.slice().sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))[0] || null;
  const best = active[0] || freshest;
  return {
    probe: 'dealabs',
    detected: active.length > 0,
    http_status: 200,
    blocked: false,
    latency_ms: r.latency,
    detail: {
      matched_count: threads.length,
      active_count: active.length,
      best: best ? {
        title: best.title, isExpired: best.isExpired, publishedAt: best.publishedAt,
        status: best.status, temperature: best.temperature,
      } : null,
    },
  };
}

// ── Piste Leboncoin direct (retest du blocage DataDome) ──────────────────────────
function looksLikeAntiBot(text) {
  const hay = normalizeSpaces(text).toLowerCase();
  return hay.includes('captcha-delivery') || hay.includes('datadome') || hay.includes('geo.captcha')
    || hay.includes('pardon our interruption') || hay.includes('vous avez été bloqué')
    || hay.includes('verifying you are human');
}
async function probeLeboncoinDirect() {
  const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    Referer: 'https://www.leboncoin.fr/',
    'Upgrade-Insecure-Requests': '1',
  };
  const r = await timedFetch(LBC_URL, headers);
  if (r.status == null) {
    return { probe: 'leboncoin-direct', detected: false, http_status: null, blocked: false,
      latency_ms: r.latency, detail: { error: r.error || 'réseau' } };
  }
  const blocked = r.status === 403 || looksLikeAntiBot(r.body);
  const realPage = r.body.includes('__NEXT_DATA__');
  const markerFound = !blocked && realPage && normalizeSpaces(r.body).includes(LBC_MARKER);
  return {
    probe: 'leboncoin-direct',
    detected: markerFound,
    http_status: r.status,
    blocked,
    latency_ms: r.latency,
    detail: { realPage, markerFound, blocked },
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
 * Lance les deux sondes et journalise — OBSERVATION SEULE, aucune alerte.
 * @param {object} pool  pool pg
 * @param {object} [opts] { force } bypass de la fenêtre (tests manuels uniquement)
 */
async function runProbe(pool, opts = {}) {
  if (!opts.force && !inWindow()) return { skipped: true, reason: 'hors fenêtre' };
  const results = [];
  for (const fn of [probeDealabs, probeLeboncoinDirect]) {
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
