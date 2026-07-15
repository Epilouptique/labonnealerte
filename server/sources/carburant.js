// Source PARAMÉTRÉE (OpenAlert v2) : prix des carburants — franchissement d'un
// seuil symbolique À LA BAISSE, par TYPE de carburant au choix de l'abonné.
// Remplace la source broadcast carburant-seuils (Gazole + SP95-E10) : ses abonnés
// sont migrés vers les deux instances {carburant:"gazole"} et {carburant:"e10"}.
//
// API : dataset officiel Opendatasoft 'prix-des-carburants-en-france-flux-
// instantane-v2' (data.economie.gouv.fr, public sans clé). Un SEUL appel avec
// agrégation renvoie la moyenne nationale par carburant (colonnes plates).
// Colonnes constatées : gazole_prix, e10_prix (=SP95-E10), sp98_prix, e85_prix,
// gplc_prix. E85/GPLc : couverture partielle mais moyenne nationale exploitable.
//
// Mécanique (par carburant, via counters en millièmes d'euro) : on mémorise la
// dernière moyenne connue ; quand elle passe SOUS un seuil symbolique qu'elle
// dépassait au relevé précédent → alerte, active 48h (until persistée). 1er cycle
// (aucune mémoire) : initialisation sans alerte. requires_confirmation = false.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { pool } = require('../db');

const API_URL =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/' +
  'prix-des-carburants-en-france-flux-instantane-v2/records' +
  '?select=avg(gazole_prix)%20as%20gazole,avg(e10_prix)%20as%20e10,' +
  'avg(sp98_prix)%20as%20sp98,avg(e85_prix)%20as%20e85,avg(gplc_prix)%20as%20gplc&limit=1';
const PUBLIC_URL = 'https://www.prix-carburants.gouv.fr/';
const TIMEOUT_MS = 10_000;
const ACTIVE_MS = 48 * 60 * 60 * 1000;

// Carburants exposés : seuils symboliques (€/L) adaptés à la gamme de prix de
// chaque type. field = colonne d'agrégation ; key = valeur de paramètre.
const FUELS = {
  gazole: { label: 'Gazole',   field: 'gazole', seuils: [1.50, 1.60, 1.70, 1.80] },
  e10:    { label: 'SP95-E10', field: 'e10',    seuils: [1.50, 1.60, 1.70, 1.80] },
  sp98:   { label: 'SP98',     field: 'sp98',   seuils: [1.60, 1.70, 1.80, 1.90] },
  e85:    { label: 'E85',      field: 'e85',    seuils: [0.70, 0.80, 0.90] },
  gplc:   { label: 'GPLc',     field: 'gplc',   seuils: [0.90, 1.00, 1.10] },
};

const paramsSchema = [
  {
    key: 'carburant',
    label: 'Carburant',
    type: 'enum',
    values: Object.keys(FUELS).map((k) => ({ value: k, label: FUELS[k].label })),
    multiple: true,
    required: true,
    default: 'gazole',
  },
];

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

// Seuil le plus profond franchi à la baisse entre prevM et nowM (millièmes), ou null.
function crossedSeuil(seuilsM, prevM, nowM) {
  let deepest = null;
  for (const sM of seuilsM) {
    if (prevM >= sM && nowM < sM) deepest = deepest === null ? sM : Math.min(deepest, sM);
  }
  return deepest;
}

function fmtEur(millimes) {
  return (millimes / 1000).toFixed(2).replace('.', ',');
}

// État d'UN carburant (lecture des moyennes déjà récupérées).
async function resultFor(params, nowByKey) {
  const key = String((params && params.carburant) || '');
  const fuel = FUELS[key];
  if (!fuel) return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };

  const nowM = nowByKey[key];
  const now = Date.now();
  const seuilsM = fuel.seuils.map((s) => Math.round(s * 1000));

  const cAvg = `carburant_avg_${key}`;
  const cUntil = `carburant_until_${key}`;
  const cSeuil = `carburant_seuil_${key}`;

  // Moyenne indisponible (colonne vide pour ce type ce cycle) : on n'altère pas
  // l'état persistant, on rend l'état courant (actif si échéance encore valide).
  if (nowM != null) {
    const prevM = await readCounter(cAvg);
    if (prevM !== null) {
      const sM = crossedSeuil(seuilsM, prevM, nowM);
      if (sM !== null) {
        await writeCounter(cUntil, now + ACTIVE_MS);
        await writeCounter(cSeuil, sM);
      }
    }
    await writeCounter(cAvg, nowM); // mémorise (init au 1er cycle inclus)
  }

  const until = await readCounter(cUntil);
  const seuilM = await readCounter(cSeuil);
  if (!until || now >= until || !seuilM) {
    return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
  }
  const priceM = nowM != null ? nowM : seuilM;
  return {
    params,
    state: 'active',
    since: new Date(until - ACTIVE_MS),
    until: new Date(until),
    message: `⛽ Le ${fuel.label} passe sous les ${fmtEur(seuilM)} €/L en moyenne nationale (${fmtEur(priceM)} €/L)`,
    url: PUBLIC_URL,
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];

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
  try { payload = await res.json(); }
  catch (err) { throw new Error(`Réponse carburants illisible (JSON invalide) : ${err.message}`); }
  const row = payload && Array.isArray(payload.results) ? payload.results[0] : null;
  if (!row) throw new Error('Structure carburants inattendue : results vide');

  // Moyennes du jour (millièmes) par type ; null si colonne vide/invalide.
  const nowByKey = {};
  for (const key of Object.keys(FUELS)) {
    const v = Number(row[FUELS[key].field]);
    nowByKey[key] = (Number.isNaN(v) || v <= 0) ? null : Math.round(v * 1000);
  }

  // Séquentiel : les writes de counters partagent la même moyenne, pas de course.
  const out = [];
  for (const p of combos) out.push(await resultFor(p, nowByKey));
  return out;
}

module.exports = { id: 'carburant', paramsSchema, checkWithParams };
