// Source interne : le jeu PC gratuit hebdomadaire de l'Epic Games Store.
//
// API : endpoint public non documenté de la vitrine Epic (le même que celui
// interrogé par la page « Jeux gratuits » du store). Pas de clé requise, mais
// un User-Agent navigateur est nécessaire pour éviter un blocage.
//
// Structure : data.Catalog.searchStore.elements[]. Chaque élément porte
// promotions.promotionalOffers (offres EN COURS) et upcomingPromotionalOffers
// (à venir, ignorées ici). Une offre gratuite = discountSetting.discountPercentage
// à 0, dont la fenêtre [startDate, endDate] contient l'instant présent.
//
// Comme les autres sources, check() rapporte l'état instantané ; la logique de
// transition (et de « nouvel épisode ») vit dans le poller.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_URL =
  'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=fr-FR&country=FR&allowCountries=FR';
const FREE_GAMES_URL = 'https://store.epicgames.com/fr/free-games';
const STORE_PRODUCT_BASE = 'https://store.epicgames.com/fr/p/';
const TIMEOUT_MS = 10_000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Formatage « 16 juillet 2026 » (fuseau Paris pour une date stable côté FR).
function formatDateFr(date) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris',
  }).format(date);
}

// URL de la page produit : productSlug > catalogNs > offerMappings > urlSlug.
function gameUrl(el) {
  let slug =
    el.productSlug ||
    el.catalogNs?.mappings?.[0]?.pageSlug ||
    el.offerMappings?.[0]?.pageSlug ||
    el.urlSlug ||
    null;
  if (!slug) return null;
  slug = slug.replace(/\/home$/, '');
  return STORE_PRODUCT_BASE + slug;
}

// Retourne l'offre gratuite EN COURS d'un élément (fenêtre contenant `now`),
// ou null. Une offre = discountPercentage 0 dans [startDate, endDate].
function currentFreeOffer(el, now) {
  const groups = el?.promotions?.promotionalOffers;
  if (!Array.isArray(groups)) return null;
  for (const group of groups) {
    const offers = Array.isArray(group?.promotionalOffers) ? group.promotionalOffers : [];
    for (const offer of offers) {
      const pct = offer?.discountSetting?.discountPercentage;
      if (pct !== 0) continue;
      const start = parseDate(offer.startDate);
      const end = parseDate(offer.endDate);
      if (!start || !end) continue;
      if (start.getTime() <= now && now < end.getTime()) {
        return { start, end };
      }
    }
  }
  return null;
}

// Liste française : "A", "A et B", "A, B et C".
function joinFr(names) {
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' et ' + names[names.length - 1];
}

/**
 * Vérifie s'il y a un (ou plusieurs) jeu(x) gratuit(s) en ce moment.
 * @returns {Promise<{ state: 'active'|'inactive', since: Date|null, until: Date|null, message: string|null, url: string }>}
 */
async function check() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetchFn(API_URL, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Timeout API Epic Games (>${TIMEOUT_MS} ms)`);
    }
    throw new Error(`Appel API Epic Games échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`Réponse HTTP inattendue Epic Games : ${res.status} ${res.statusText}`);
  }

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error(`Réponse Epic Games illisible (JSON invalide) : ${err.message}`);
  }

  const elements = payload?.data?.Catalog?.searchStore?.elements;
  if (!Array.isArray(elements)) {
    throw new Error('Structure Epic Games inattendue : data.Catalog.searchStore.elements manquant');
  }

  const now = Date.now();
  const free = [];
  for (const el of elements) {
    const offer = currentFreeOffer(el, now);
    if (offer && el.title) {
      free.push({ title: el.title, url: gameUrl(el), start: offer.start, end: offer.end });
    }
  }

  if (free.length === 0) {
    return { state: 'inactive', since: null, until: null, message: null, url: FREE_GAMES_URL };
  }

  // since = début le plus tôt ; until = fin la plus tardive parmi les jeux gratuits.
  const since = free.reduce((min, g) => (g.start < min ? g.start : min), free[0].start);
  const until = free.reduce((max, g) => (g.end > max ? g.end : max), free[0].end);

  const titles = free.map((g) => g.title);
  const verb = free.length === 1 ? 'est gratuit' : 'sont gratuits';
  const message = `🎮 ${joinFr(titles)} ${verb} sur l'Epic Games Store jusqu'au ${formatDateFr(until)}`;

  // Un seul jeu → sa page ; plusieurs → la page des jeux gratuits.
  const url = free.length === 1 && free[0].url ? free[0].url : FREE_GAMES_URL;

  return { state: 'active', since, until, message, url };
}

module.exports = { id: 'epic-jeu-gratuit', check };
