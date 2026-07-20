// Source PARAMÉTRÉE (OpenAlert v2) : variation notable d'un taux de change, PAIRE
// au choix (base EUR). Actif si la variation sur ~7 jours atteint 3 % (mouvement
// rare et notable). Message FACTUEL, SANS aucun conseil.
//
// API : Frankfurter (api.frankfurter.dev, taux de référence BCE, sans clé, pas de
// quota). Un SEUL appel « plage de dates » renvoie toutes les paires souscrites ET
// tout l'historique 7 jours → mutualisation complète (1 appel réseau par cycle,
// quel que soit le nombre d'abonnés/paires). Cache mémoire 12h (les taux BCE ne
// bougent qu'une fois par jour ouvré).
const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const BASE = 'https://api.frankfurter.dev/v1';
const PUBLIC_URL = 'https://www.frankfurter.dev/';
const TIMEOUT_MS = 10_000;
const SEUIL = 0.03;              // 3 % de variation sur la fenêtre
const WINDOW_DAYS = 7;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

// Devises réellement servies par Frankfurter (panier BCE). MAD (dirham) ABSENT.
// Ajout expatriés : 9 devises supplémentaires, toutes servies par Frankfurter
// (vérifié) et pertinentes pour les diasporas françaises hors zone euro.
const DEVISES = [
  { code: 'USD', nom: 'dollar américain' },
  { code: 'GBP', nom: 'livre sterling' },
  { code: 'CHF', nom: 'franc suisse' },
  { code: 'CAD', nom: 'dollar canadien' },
  { code: 'JPY', nom: 'yen japonais' },
  { code: 'AUD', nom: 'dollar australien' },
  { code: 'CNY', nom: 'yuan chinois' },
  { code: 'SGD', nom: 'dollar de Singapour' },
  { code: 'HKD', nom: 'dollar de Hong Kong' },
  { code: 'ILS', nom: 'shekel israélien' },
  { code: 'BRL', nom: 'réal brésilien' },
  { code: 'THB', nom: 'baht thaïlandais' },
  { code: 'INR', nom: 'roupie indienne' },
  { code: 'ZAR', nom: 'rand sud-africain' },
  { code: 'MXN', nom: 'peso mexicain' },
];
const NOM = {};
DEVISES.forEach((d) => { NOM[d.code] = d.nom; });
const VALID = new Set(DEVISES.map((d) => d.code));

const paramsSchema = [
  {
    key: 'devise',
    label: 'Devise (base euro)',
    type: 'enum',
    values: DEVISES.map((d) => ({ value: d.code, label: `EUR → ${d.code} (${d.nom})` })),
    multiple: true,
    required: true,
    default: null,
  },
];

function inactive(params) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// Cache mémoire mutualisé (clé = liste triée des symboles).
let cache = { at: 0, key: '', byDevise: null };

// Un appel plage : renvoie Map code → { first, last } (premiers/derniers taux dispo).
async function fetchRange(codes) {
  const end = new Date();
  const start = new Date(end.getTime() - (WINDOW_DAYS + 3) * 24 * 60 * 60 * 1000); // marge week-ends
  const url = `${BASE}/${ymd(start)}..${ymd(end)}?base=EUR&symbols=${codes.join(',')}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout Frankfurter (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel Frankfurter échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue Frankfurter : ${res.status}`);
  const payload = await res.json();
  const rates = payload && payload.rates;
  if (!rates || typeof rates !== 'object') throw new Error('Structure Frankfurter inattendue (rates manquant)');

  const dates = Object.keys(rates).sort(); // ordre chronologique (clés YYYY-MM-DD)
  const out = new Map();
  for (const code of codes) {
    let first = null;
    let last = null;
    for (const dt of dates) {
      const v = rates[dt] && rates[dt][code];
      if (typeof v === 'number') { if (first === null) first = v; last = v; }
    }
    if (first !== null && last !== null) out.set(code, { first, last });
  }
  return out;
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];

  const uniq = [];
  for (const p of combos) {
    const c = String((p && p.devise) || '').toUpperCase();
    if (VALID.has(c) && uniq.indexOf(c) === -1) uniq.push(c);
  }

  let byDevise = new Map();
  if (uniq.length) {
    const key = uniq.slice().sort().join(',');
    const now = Date.now();
    if (cache.byDevise && cache.key === key && now - cache.at < CACHE_TTL_MS) {
      byDevise = cache.byDevise;
    } else {
      try {
        byDevise = await fetchRange(uniq);
        cache = { at: now, key, byDevise };
      } catch (err) {
        console.warn(`[taux-de-change] ${err.message}`);
        return combos.map(inactive);
      }
    }
  }

  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const until = new Date(midnight.getTime() + 24 * 60 * 60 * 1000);

  return combos.map((p) => {
    const code = String((p && p.devise) || '').toUpperCase();
    const data = byDevise.get(code);
    if (!data || !data.first) return inactive(p);
    const variation = (data.last - data.first) / data.first;
    if (Math.abs(variation) < SEUIL) return inactive(p);
    const pct = Math.round(Math.abs(variation) * 100);
    const sens = variation > 0 ? "s'est renforcé" : "s'est affaibli";
    const nom = NOM[code] || code;
    return {
      params: p,
      state: 'active',
      since: midnight,
      until,
      message: `💱 L'euro ${sens} de ${pct} % face au ${nom} (EUR/${code}) sur 7 jours.`,
      url: PUBLIC_URL,
    };
  });
}

module.exports = { id: 'taux-de-change', paramsSchema, checkWithParams };
