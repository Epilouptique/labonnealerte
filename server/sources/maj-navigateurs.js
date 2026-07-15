// Source interne (broadcast) : sortie d'une nouvelle version MAJEURE stable de
// Firefox ou Chrome. Discret (une notif à chaque nouvelle majeure, ~toutes les
// 4 semaines par navigateur), utile aux devs/curieux.
//
// APIs publiques SANS clé :
//   Firefox : https://product-details.mozilla.org/1.0/firefox_versions.json
//             → { LATEST_FIREFOX_VERSION: "152.0.6", ... }
//   Chrome  : https://versionhistory.googleapis.com/v1/chrome/platforms/win/channels/stable/versions
//             → { versions: [ { version: "150.0.7871.125" }, ... ] } (récent d'abord)
//
// Mécanique : on mémorise le numéro MAJEUR connu par navigateur (counters). Quand
// il augmente → alerte active 4 jours (until persistée), message nommant la
// version. 1er cycle (aucune mémoire) : initialisation sans alerter.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { pool } = require('../db');

const FF_URL = 'https://product-details.mozilla.org/1.0/firefox_versions.json';
const CH_URL = 'https://versionhistory.googleapis.com/v1/chrome/platforms/win/channels/stable/versions';
const FF_PAGE = 'https://www.mozilla.org/firefox/notes/';
const CH_PAGE = 'https://developer.chrome.com/release-notes';
const TIMEOUT_MS = 10_000;
const ACTIVE_MS = 4 * 24 * 60 * 60 * 1000;

const K_FF = 'navigateur_major_firefox';
const K_CH = 'navigateur_major_chrome';
const K_UNTIL = 'navigateur_until';
const K_BROWSER = 'navigateur_browser'; // 1=firefox, 2=chrome
const K_VERSION = 'navigateur_version'; // numéro majeur affiché

async function readCounter(key) {
  const { rows } = await pool.query('SELECT value FROM counters WHERE key = $1', [key]);
  return rows[0] ? Number(rows[0].value) : null;
}
async function writeCounter(key, value) {
  await pool.query(
    `INSERT INTO counters (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, Math.round(value)]
  );
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

function majorOf(v) {
  const n = parseInt(String(v || '').split('.')[0], 10);
  return Number.isNaN(n) ? null : n;
}

async function check() {
  const now = Date.now();

  // Versions majeures courantes (best-effort : un échec d'un navigateur n'empêche
  // pas l'autre).
  let ffMajor = null;
  let chMajor = null;
  try { ffMajor = majorOf((await fetchJson(FF_URL)).LATEST_FIREFOX_VERSION); }
  catch (err) { console.warn(`[maj-navigateurs] Firefox : ${err.message}`); }
  try {
    const data = await fetchJson(CH_URL);
    const list = data && Array.isArray(data.versions) ? data.versions : [];
    chMajor = list.length ? majorOf(list[0].version) : null;
  } catch (err) { console.warn(`[maj-navigateurs] Chrome : ${err.message}`); }

  // Détection d'une nouvelle majeure vs la mémoire (init sans alerte au 1er cycle).
  let armed = null; // { browser:1|2, version }
  if (ffMajor != null) {
    const prev = await readCounter(K_FF);
    if (prev != null && ffMajor > prev) armed = { browser: 1, version: ffMajor };
    await writeCounter(K_FF, ffMajor);
  }
  if (chMajor != null) {
    const prev = await readCounter(K_CH);
    if (prev != null && chMajor > prev && !armed) armed = { browser: 2, version: chMajor };
    else if (prev != null && chMajor > prev) armed = { browser: 2, version: chMajor }; // Chrome plus récent l'emporte si les deux
    await writeCounter(K_CH, chMajor);
  }

  if (armed) {
    await writeCounter(K_UNTIL, now + ACTIVE_MS);
    await writeCounter(K_BROWSER, armed.browser);
    await writeCounter(K_VERSION, armed.version);
  }

  const until = await readCounter(K_UNTIL);
  const browser = await readCounter(K_BROWSER);
  const version = await readCounter(K_VERSION);
  if (!until || now >= until || !browser || !version) {
    return { state: 'inactive', since: null, until: null, message: null, url: FF_PAGE };
  }

  const name = browser === 1 ? 'Firefox' : 'Chrome';
  const page = browser === 1 ? FF_PAGE : CH_PAGE;
  return {
    state: 'active',
    since: new Date(until - ACTIVE_MS),
    until: new Date(until),
    message: `🦊 ${name} ${version} est disponible — nouvelle version majeure du navigateur`,
    url: page,
  };
}

module.exports = { id: 'maj-navigateurs', check };
