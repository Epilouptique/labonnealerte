// Source interne : grandes soldes saisonnières Steam.
//
// API publique (sans clé) : featuredcategories. Les soldes saisonnières
// apparaissent comme un « spotlight » dont le nom contient « Soldes » (localisé
// fr : « Soldes d'été », « Soldes d'hiver »...). Heuristique : on cherche ce
// mot dans les noms des mises en avant. requires_confirmation=true (prudence).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_URL = 'https://store.steampowered.com/api/featuredcategories?cc=FR&l=french';
const PUBLIC_URL = 'https://store.steampowered.com';
const TIMEOUT_MS = 10_000;

function normalize(s) {
  // NFD + suppression des diacritiques (U+0300..U+036F) → comparaison sans accent.
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Récupère les libellés de mise en avant (catégories numérotées = spotlights).
function candidateNames(payload) {
  const names = [];
  for (const key of Object.keys(payload)) {
    if (!/^\d+$/.test(key)) continue; // seulement les blocs spotlight numérotés
    const cat = payload[key];
    if (!cat || typeof cat !== 'object') continue;
    if (cat.name) names.push(cat.name);
    const items = Array.isArray(cat.items) ? cat.items : [];
    items.forEach((it) => {
      if (it && it.name) names.push(it.name);
      if (it && it.headline) names.push(it.headline);
    });
  }
  return names;
}

async function check() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API Steam (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API Steam échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue Steam : ${res.status} ${res.statusText}`);

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error(`Réponse Steam illisible (JSON invalide) : ${err.message}`);
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('Structure Steam inattendue');
  }

  const saleName = candidateNames(payload).find((n) => normalize(n).includes('soldes'));
  if (!saleName) {
    return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
  }

  return {
    state: 'active',
    since: new Date(), // première détection (l'API ne donne pas de début fiable)
    until: null,
    message: `🎮 ${saleName} en cours — des milliers de jeux en promo`,
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'soldes-steam', check };
