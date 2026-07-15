// Source interne (broadcast) : mouvement fort du Bitcoin sur 24h. Actif si la
// variation 24h en valeur absolue >= 10 % (rare, signal fort). AUCUN conseil
// d'investissement (voir la description de la carte).
//
// API : CoinGecko simple/price (SANS clé). Champ eur_24h_change (en %). Limite
// plan gratuit ~30/min : 1 appel/cycle suffit largement.
//
// Anti-flap : au franchissement du seuil, on arme l'alerte 12h (until persistée
// via counters, comme carburant/maj-navigateurs). Tant qu'armée → active ; pas de
// re-notification à chaque cycle. Après 12h, un nouveau franchissement ré-arme.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { pool } = require('../db');

const API_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur&include_24hr_change=true';
const PUBLIC_URL = 'https://www.coingecko.com/fr/pièces/bitcoin';
const TIMEOUT_MS = 10_000;
const SEUIL = 10; // % en valeur absolue
const ACTIVE_MS = 12 * 60 * 60 * 1000;

const K_UNTIL = 'btc_until';   // epoch ms de fin d'alerte
const K_CHANGE = 'btc_change'; // variation figée à l'armement, en centièmes de % (signé)
const K_PRICE = 'btc_price';   // prix EUR figé à l'armement

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
    if (err.name === 'AbortError') throw new Error(`Timeout CoinGecko (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel CoinGecko échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  // 429 (rate-limit) ou erreur : on n'altère pas l'état, on garde l'armement courant.
  if (res.ok) {
    let payload;
    try { payload = await res.json(); } catch (err) { payload = null; }
    const btc = payload && payload.bitcoin;
    const change = btc && typeof btc.eur_24h_change === 'number' ? btc.eur_24h_change : null;
    const price = btc && typeof btc.eur === 'number' ? btc.eur : null;

    if (change != null && Math.abs(change) >= SEUIL) {
      const now = Date.now();
      const until = await readCounter(K_UNTIL);
      // Ré-arme seulement si aucune alerte n'est déjà en cours (anti-flap).
      if (!until || now >= until) {
        await writeCounter(K_UNTIL, now + ACTIVE_MS);
        await writeCounter(K_CHANGE, Math.round(change * 100));
        if (price != null) await writeCounter(K_PRICE, Math.round(price));
      }
    }
  } else if (res.status !== 403 && res.status !== 429) {
    throw new Error(`Réponse HTTP inattendue CoinGecko : ${res.status}`);
  }

  const now = Date.now();
  const until = await readCounter(K_UNTIL);
  const changeC = await readCounter(K_CHANGE);
  const price = await readCounter(K_PRICE);
  if (!until || now >= until || changeC == null) {
    return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
  }

  const pct = changeC / 100;
  const up = pct >= 0;
  const priceStr = price != null ? ` (${price.toLocaleString('fr-FR')} €)` : '';
  return {
    state: 'active',
    since: new Date(until - ACTIVE_MS),
    until: new Date(until),
    message: `${up ? '📈' : '📉'} Bitcoin : ${up ? '+' : ''}${pct.toFixed(1).replace('.', ',')} % en 24h${priceStr}`,
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'bitcoin-mouvement', check };
