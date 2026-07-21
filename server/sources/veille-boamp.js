// Source PARAMÉTRÉE (OpenAlert v2) : VEILLE MARCHÉS PUBLICS (BOAMP). L'abonné saisit un mot-clé ;
// la source alerte à la publication d'un NOUVEL avis de marché public dont l'objet correspond.
//
// DISTINCTE de veille-rss : mécanisme différent — API STRUCTURÉE Opendatasoft avec champs dédiés
// (objet, dateparution, idweb), filtrage côté requête (ODSQL `where … like`), déduplication par
// identifiant d'avis. veille-rss, lui, parse un flux RSS générique fourni par l'utilisateur. Même
// idée « mot-clé » en surface, deux implémentations sans code commun.
//
// API publique officielle, SANS clé — testée en réel le 21/07/2026 (1,69 M avis) :
//   GET https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records
//       ?where=objet like "<kw>"&order_by=dateparution desc&limit=1
//
// ── INITIALISATION SANS ALERTE RÉTROACTIVE ───────────────────────────────────
// Au 1er passage sur un mot-clé, on MÉMORISE l'identifiant de l'avis le PLUS RÉCENT comme
// référence, SANS alerter (on ne remonte pas l'historique). Seul un avis PLUS RÉCENT déclenche.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API = 'https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records';
const PUBLIC_URL = 'https://www.boamp.fr/pages/recherche/';
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 4 checks/jour
const MAX_FETCH = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);

const paramsSchema = [
  {
    key: 'motcle',
    label: 'Mot-clé (objet du marché)',
    type: 'string',
    placeholder: 'voirie, informatique, restauration scolaire…',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'Un mot-clé recherché dans l\'objet des avis de marchés publics (BOAMP). Alerte à la publication d\'un nouvel avis correspondant.',
  },
];

// Cache par mot-clé : { lastId, at, result }.
const cache = new Map();

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: 'https://www.boamp.fr/' };
}

// Nettoie le mot-clé pour l'ODSQL (pas de guillemets/backslash → injection impossible dans la clause).
function cleanKw(s) { return String(s || '').replace(/["\\]/g, ' ').trim().slice(0, 60); }

async function fetchLatest(kw) {
  const where = `objet like "${cleanKw(kw)}"`;
  const url = `${API}?where=${encodeURIComponent(where)}&order_by=${encodeURIComponent('dateparution desc')}&limit=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try { res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal }); }
  finally { clearTimeout(timer); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const body = await res.json();
  const rows = Array.isArray(body.results) ? body.results : [];
  return rows[0] || null;
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const now = Date.now();
  let fetches = 0;
  const out = [];

  for (const params of combos) {
    const kw = String((params && params.motcle) || '').trim();
    if (!kw) { out.push(Object.assign({ params }, inactive())); continue; }

    const entry = cache.get(kw);
    if (entry && now - entry.at < CACHE_TTL_MS) { out.push(Object.assign({ params }, entry.result)); continue; }
    if (fetches >= MAX_FETCH) { out.push(Object.assign({ params }, entry ? entry.result : inactive())); continue; }
    fetches += 1;

    let result;
    try {
      const rec = await fetchLatest(kw);
      const id = rec ? String(rec.idweb || rec.id || '') : null;
      if (!rec || !id) {
        result = inactive();
        cache.set(kw, { lastId: entry ? entry.lastId : null, at: now, result });
      } else if (!entry || entry.lastId == null) {
        result = inactive(); // 1er passage : référence, AUCUNE alerte (pas d'historique)
        cache.set(kw, { lastId: id, at: now, result });
      } else if (id !== entry.lastId) {
        const objet = String(rec.objet || 'nouvel avis').replace(/\s+/g, ' ').trim().slice(0, 140);
        const date = rec.dateparution ? ` (paru le ${rec.dateparution})` : '';
        result = { state: 'active', since: new Date(), until: null,
          message: `📢 Nouvel avis de marché public « ${kw} » : ${objet}${date}.`, url: PUBLIC_URL };
        cache.set(kw, { lastId: id, at: now, result });
      } else {
        result = inactive();
        cache.set(kw, { lastId: id, at: now, result });
      }
    } catch (err) {
      console.warn(`[veille-boamp] "${kw}" : ${err.message} → inactive.`);
      result = inactive();
      cache.set(kw, { lastId: entry ? entry.lastId : null, at: now, result });
    }
    out.push(Object.assign({ params }, result));
  }
  return out;
}

module.exports = { id: 'veille-boamp', paramsSchema, checkWithParams };
