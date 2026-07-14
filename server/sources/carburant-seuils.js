// Source interne : prix des carburants — franchissement de seuil symbolique À LA BAISSE.
//
// API : dataset officiel Opendatasoft 'prix-des-carburants-en-france-flux-instantane-v2'
// (data.economie.gouv.fr, public sans clé). Un seul appel avec agrégation renvoie la
// MOYENNE nationale par carburant via des colonnes plates (gazole_prix, e10_prix) —
// pas de ZIP à décompresser.
// STRUCTURE RÉELLE CONSTATÉE : results[0] = { gazole, e10, n } avec select=avg(...).
//
// Mécanique : on mémorise la dernière moyenne connue par carburant (table counters,
// en millièmes d'euro). Quand une moyenne passe SOUS un seuil symbolique qu'elle
// dépassait au relevé précédent → alerte broadcast. L'alerte reste active 48h
// (until = since+48h) via la même mécanique d'extinction que les séismes : on
// persiste l'échéance et check() renvoie 'active' tant que now < until.
// Premier cycle (aucune mémoire) : on initialise sans alerter.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { pool } = require('../db');

const API_URL =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/' +
  'prix-des-carburants-en-france-flux-instantane-v2/records' +
  '?select=avg(gazole_prix)%20as%20gazole,avg(e10_prix)%20as%20e10&limit=1';
const PUBLIC_URL = 'https://www.prix-carburants.gouv.fr/';
const TIMEOUT_MS = 10_000;

const SEUILS = [1.50, 1.60, 1.70, 1.80]; // €/L, franchissement à la baisse
const SEUILS_M = SEUILS.map((s) => Math.round(s * 1000)); // en millièmes
const ACTIVE_MS = 48 * 60 * 60 * 1000;

// Carburants suivis : clé counter + libellé public.
const FUELS = [
  { key: 'gazole', label: 'Gazole', counter: 'carburant_avg_gazole', field: 'gazole' },
  { key: 'e10', label: 'SP95-E10', counter: 'carburant_avg_e10', field: 'e10' },
];
const K_UNTIL = 'carburant_alert_until'; // epoch ms de fin d'alerte
const K_FUEL = 'carburant_alert_fuel';   // 1=gazole, 2=e10, 0=aucune
const K_SEUIL = 'carburant_alert_seuil'; // seuil franchi, en millièmes

/* ---- accès counters (valeurs entières) ---- */
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

// Seuil le plus profond franchi à la baisse entre prevM et nowM (ou null).
function crossedSeuil(prevM, nowM) {
  let deepest = null;
  for (const sM of SEUILS_M) {
    if (prevM >= sM && nowM < sM) deepest = deepest === null ? sM : Math.min(deepest, sM);
  }
  return deepest;
}

function fmtEur(millimes) {
  return (millimes / 1000).toFixed(2).replace('.', ',');
}

async function check() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API carburants (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API carburants échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue carburants : ${res.status} ${res.statusText}`);

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error(`Réponse carburants illisible (JSON invalide) : ${err.message}`);
  }
  const row = payload && Array.isArray(payload.results) ? payload.results[0] : null;
  if (!row) throw new Error('Structure carburants inattendue : results vide');

  // Moyennes du jour (millièmes). On exige des valeurs plausibles.
  const nowM = {};
  for (const f of FUELS) {
    const v = Number(row[f.field]);
    if (Number.isNaN(v) || v <= 0) throw new Error(`Moyenne ${f.label} invalide`);
    nowM[f.key] = Math.round(v * 1000);
  }

  const now = Date.now();

  // Détection d'un nouveau franchissement par rapport au dernier relevé mémorisé.
  let newCross = null; // { fuel, label, seuilM }
  for (const f of FUELS) {
    const prevM = await readCounter(f.counter);
    if (prevM !== null) {
      const sM = crossedSeuil(prevM, nowM[f.key]);
      // On retient le franchissement le plus profond (seuil le plus bas).
      if (sM !== null && (!newCross || sM < newCross.seuilM)) {
        newCross = { fuel: f, seuilM: sM };
      }
    }
    // Mémorise toujours la moyenne courante (init au 1er cycle inclus).
    await writeCounter(f.counter, nowM[f.key]);
  }

  // Un nouveau franchissement (re)arme l'alerte pour 48h.
  if (newCross) {
    await writeCounter(K_UNTIL, now + ACTIVE_MS);
    await writeCounter(K_FUEL, newCross.fuel.key === 'gazole' ? 1 : 2);
    await writeCounter(K_SEUIL, newCross.seuilM);
  }

  // État actif tant que l'échéance persistée n'est pas dépassée.
  const until = await readCounter(K_UNTIL);
  const fuelCode = await readCounter(K_FUEL);
  const seuilM = await readCounter(K_SEUIL);
  if (!until || now >= until || !fuelCode || !seuilM) {
    return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
  }

  const fuel = fuelCode === 1 ? FUELS[0] : FUELS[1];
  return {
    state: 'active',
    since: new Date(until - ACTIVE_MS),
    until: new Date(until),
    message: `⛽ Le ${fuel.label} passe sous les ${fmtEur(seuilM)} €/L en moyenne nationale (${fmtEur(nowM[fuel.key])} €/L)`,
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'carburant-seuils', check };
