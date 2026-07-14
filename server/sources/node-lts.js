// Source interne : nouvelles versions LTS de Node.js (sans clé).
//
// API : https://nodejs.org/dist/index.json — tableau trié par version décroissante ;
// chaque entrée { version ('v24.18.0'), date, lts (false | nom de code ex. 'Krypton') }.
// La dernière LTS = première entrée dont `lts` est une chaîne.
//
// On mémorise la dernière version LTS connue (table counters, version encodée en
// entier major*1e6+minor*1e3+patch — pattern des carburants). Apparition d'une
// version LTS plus récente (nouvelle majeure LTS ou nouveau patch LTS) → alerte 72h.
// Premier cycle (aucune mémoire) : initialisation sans alerte.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { pool } = require('../db');

const API_URL = 'https://nodejs.org/dist/index.json';
const PUBLIC_URL = 'https://nodejs.org/en/download';
const TIMEOUT_MS = 10_000;
const ACTIVE_MS = 72 * 60 * 60 * 1000;

const K_LATEST = 'node_lts_latest'; // version LTS connue (encodée)
const K_UNTIL = 'node_lts_until';   // epoch ms de fin d'alerte

// 'v24.18.0' → 24018000 (comparable). null si non parsable.
function encodeVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
  if (!m) return null;
  return Number(m[1]) * 1_000_000 + Number(m[2]) * 1_000 + Number(m[3]);
}

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

async function check() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API nodejs.org (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API nodejs.org échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue nodejs.org : ${res.status} ${res.statusText}`);

  let list;
  try {
    list = await res.json();
  } catch (err) {
    throw new Error(`Réponse nodejs.org illisible (JSON invalide) : ${err.message}`);
  }
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('Structure nodejs.org inattendue : tableau vide');
  }

  // Dernière LTS = première entrée dont lts est une chaîne (liste triée desc).
  const latest = list.find((e) => e && typeof e.lts === 'string' && e.lts);
  if (!latest) {
    throw new Error('Aucune version LTS trouvée dans l\'index nodejs.org');
  }
  const encoded = encodeVersion(latest.version);
  if (encoded === null) throw new Error(`Version LTS illisible : ${latest.version}`);

  const now = Date.now();
  const prev = await readCounter(K_LATEST);

  // Nouvelle LTS détectée → arme l'alerte 72h. Premier cycle : init sans alerte.
  if (prev !== null && encoded > prev) {
    await writeCounter(K_UNTIL, now + ACTIVE_MS);
  }
  await writeCounter(K_LATEST, encoded);

  const until = await readCounter(K_UNTIL);
  if (!until || now >= until) {
    return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
  }
  return {
    state: 'active',
    since: new Date(until - ACTIVE_MS),
    until: new Date(until),
    message: `🟢 Node.js ${latest.version} LTS « ${latest.lts} » est disponible`,
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'node-lts', check };
