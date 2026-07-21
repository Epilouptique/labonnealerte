// Source PARAMÉTRÉE (OpenAlert v2) : alerte au FRANCHISSEMENT d'un SEUIL DE PRIX (en euros)
// pour une cryptomonnaie au choix. Purement informatif — AUCUN conseil d'investissement (voir
// la description de la carte).
//
// COMPLÉMENTAIRE de bitcoin-mouvement.js (broadcast, variation 24h en %) : ici l'utilisateur
// choisit une PAIRE et un SEUIL ABSOLU précis, et est alerté quand le prix franchit ce seuil
// (à la hausse OU à la baisse). Bitcoin cohabite dans les deux (usages différents).
//
// PRIX : endpoints PUBLICS, SANS clé (donc pas une « vague 2 ») — vérifiés en réel le 21/07/2026 :
//   • Binance (primaire) : GET https://api.binance.com/api/v3/ticker/price?symbol=<SYM>EUR
//       → { "symbol":"BTCEUR", "price":"58220.23" }  (paires EUR natives, pas de conversion).
//   • Coinbase (repli)   : GET https://api.coinbase.com/v2/prices/<SYM>-EUR/spot
//       → { "data": { "amount":"58222.12", "base":"BTC", "currency":"EUR" } }.
// Prix mutualisé par SYMBOLE (1 appel par symbole/cycle, quel que soit le nombre d'abonnés).
//
// ── ANTI-RÉTROACTIF ──────────────────────────────────────────────────────────
// Au 1er passage sur un combo (paire+seuil), on mémorise le CÔTÉ du seuil (au-dessus/en dessous)
// SANS alerter : un seuil déjà franchi au moment de la souscription ne déclenche PAS. Seul un
// changement de côté APRÈS la souscription alerte. Cache mémoire (perte au redémarrage = réinit
// sûre). TTL prix court (5 min) : les prix bougent vite, mais le kiosque n'est pas un outil de
// trading. Dégradation silencieuse si Binance ET Coinbase échouent.
//
// ── PARAMÈTRE COMBINÉ « SYM SEUIL » ──────────────────────────────────────────
// L'UI n'affiche qu'UN champ de paramètre → on combine le symbole et le seuil dans une seule
// chaîne « SYM SEUIL » (ex. « BTC 55000 »), parsée côté serveur (même approche que
// veille-hydrometrie / rappel-personnalise). Le symbole est validé contre une liste fermée.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const BINANCE = 'https://api.binance.com/api/v3/ticker/price?symbol=';
const COINBASE = 'https://api.coinbase.com/v2/prices/';
const PUBLIC_URL = 'https://www.binance.com/fr/price';
const TIMEOUT_MS = 8_000;
const PRICE_TTL_MS = 5 * 60 * 1000; // 5 min

// Cryptos majeures et liquides, paires EUR natives confirmées sur Binance.
const SYMBOLS = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP',
  ADA: 'Cardano', DOGE: 'Dogecoin', BNB: 'BNB', LTC: 'Litecoin',
};
// Ancien format combiné « BTC 55000 » (rétrocompat des abonnements antérieurs au multi-champs).
const LEGACY_RE = /^([A-Za-z]{2,5})\s+(\d{1,12})(?:[.,](\d{1,8}))?$/;

// v2 MULTI-CHAMPS : paire (enum) + seuil (number). Rendu en 2 contrôles distincts par le front.
const paramsSchema = [
  {
    key: 'paire',
    label: 'Cryptomonnaie',
    type: 'enum',
    values: Object.keys(SYMBOLS).map((s) => ({ value: s, label: `${SYMBOLS[s]} (${s})` })),
    multiple: true,
    required: true,
    default: null,
  },
  {
    key: 'seuil',
    label: 'Seuil de prix (€)',
    type: 'number',
    placeholder: '55000',
    min: 0,
    multiple: true,
    required: true,
    default: null,
    hint: 'Le prix en euros au franchissement duquel être alerté (hausse ou baisse). Purement informatif, pas un conseil financier.',
  },
];

function inactive() {
  return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

// Extrait { sym, seuil } d'un objet params, en gérant le NOUVEAU format (paire + seuil) ET
// l'ANCIEN format combiné (cible = « SYM SEUIL ») pour ne perdre aucun abonnement existant.
function comboOf(p) {
  if (p && p.paire != null && p.seuil != null && p.seuil !== '') {
    const sym = String(p.paire).toUpperCase();
    const seuil = Number(p.seuil);
    if (SYMBOLS[sym] && Number.isFinite(seuil) && seuil > 0) return { sym, seuil };
    return null;
  }
  if (p && p.cible != null) return parseLegacy(p.cible); // abonnement antérieur au multi-champs
  return null;
}

function parseLegacy(v) {
  const m = LEGACY_RE.exec(String(v || '').trim());
  if (!m) return null;
  const sym = m[1].toUpperCase();
  if (!SYMBOLS[sym]) return null;
  const seuil = parseFloat(m[3] ? `${m[2]}.${m[3]}` : m[2]);
  if (!Number.isFinite(seuil) || seuil <= 0) return null;
  return { sym, seuil };
}

// Prix EUR d'un symbole via Binance (primaire) puis Coinbase (repli). Throw si les deux échouent.
async function fetchPrice(sym) {
  const withTimeout = async (url, extract) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return extract(await res.json());
    } finally { clearTimeout(timer); }
  };
  try {
    const p = await withTimeout(BINANCE + sym + 'EUR', (j) => parseFloat(j && j.price));
    if (Number.isFinite(p)) return p;
    throw new Error('prix Binance illisible');
  } catch (e1) {
    const p = await withTimeout(`${COINBASE}${sym}-EUR/spot`, (j) => parseFloat(j && j.data && j.data.amount));
    if (Number.isFinite(p)) return p;
    throw new Error('prix indisponible (Binance + Coinbase)');
  }
}

// Cache prix par symbole { price, at } et côté du seuil par combo { above }.
const priceCache = new Map();
const sideCache = new Map();

function formatEur(n) {
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 8 }) + ' €';
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];
  const now = Date.now();

  // 1) Résout le prix de chaque symbole DISTINCT une seule fois (mutualisation + cache 5 min).
  const parsed = combos.map((p) => ({ p, info: comboOf(p) }));
  const symbols = [...new Set(parsed.map((x) => x.info && x.info.sym).filter(Boolean))];
  for (const sym of symbols) {
    const c = priceCache.get(sym);
    if (c && now - c.at < PRICE_TTL_MS) continue;
    try { priceCache.set(sym, { price: await fetchPrice(sym), at: now }); }
    catch (err) { console.warn(`[crypto-seuil] ${sym} : ${err.message} → inactive.`); priceCache.set(sym, { price: null, at: now }); }
  }

  // 2) Compare chaque combo à son seuil, détecte les franchissements.
  return parsed.map(({ p, info }) => {
    if (!info) return Object.assign({ params: p }, inactive());
    const pc = priceCache.get(info.sym);
    if (!pc || pc.price == null) return Object.assign({ params: p }, inactive()); // prix indispo → silencieux
    const key = `${info.sym} ${info.seuil}`;
    const above = pc.price >= info.seuil;
    const prev = sideCache.get(key);
    let result;
    if (!prev) {
      result = inactive(); // 1er passage : côté mémorisé, AUCUNE alerte (anti-rétroactif)
    } else if (above !== prev.above) {
      const nom = SYMBOLS[info.sym];
      const sens = above ? `a dépassé ${formatEur(info.seuil)}` : `est passé sous ${formatEur(info.seuil)}`;
      result = { state: 'active', since: new Date(), until: null,
        message: `${above ? '📈' : '📉'} Le ${nom} (${info.sym}) ${sens} — prix actuel ${formatEur(pc.price)}.`, url: PUBLIC_URL };
    } else {
      result = inactive();
    }
    sideCache.set(key, { above });
    return Object.assign({ params: p }, result);
  });
}

module.exports = { id: 'crypto-seuil', paramsSchema, checkWithParams };
