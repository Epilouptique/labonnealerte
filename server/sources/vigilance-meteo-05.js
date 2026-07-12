// Source interne : Vigilance Météo-France pour les Hautes-Alpes (05).
// Première source basée sur une API publique officielle (pas de scraping).
//
// API : Bulletin Vigilance (DPVigilance V6) du portail-api.meteofrance.fr.
// Endpoint carte en cours : /public/DPVigilance/v1/cartevigilance/encours
// Clé passée en header "apikey" (type "API Key", JWT complet à 3 segments).
//
// Comme les autres sources, check() rapporte l'état instantané ; la logique
// de transition (pending / notification) vit dans le poller.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_URL =
  'https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours';
const DOMAIN_ID = '05'; // Hautes-Alpes
const PUBLIC_URL = 'https://vigilance.meteofrance.fr/fr/hautes-alpes';
const TIMEOUT_MS = 10_000;

// Niveaux de couleur DPVigilance : 1 vert · 2 jaune · 3 orange · 4 rouge.
const COLOR_LABEL = { 3: 'ORANGE', 4: 'ROUGE' };

// Identifiants de phénomènes DPVigilance → libellé français.
const PHENOMENON_LABEL = {
  1: 'vent violent',
  2: 'pluie-inondation',
  3: 'orages',
  4: 'crues',
  5: 'neige-verglas',
  6: 'canicule',
  7: 'grand froid',
  8: 'avalanches',
  9: 'vagues-submersion',
};

function labelForPhenomenon(id) {
  return PHENOMENON_LABEL[Number(id)] || `phénomène ${id}`;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Vérifie l'état instantané de la vigilance pour le département 05.
 * @returns {Promise<{ state: 'active'|'inactive', since: Date|null, until: Date|null, message: string|null, url: string }>}
 */
async function check() {
  const apiKey = (process.env.METEOFRANCE_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('METEOFRANCE_API_KEY absente de l\'environnement');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetchFn(API_URL, {
      headers: { apikey: apiKey, Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Timeout API Météo-France (>${TIMEOUT_MS} ms)`);
    }
    throw new Error(`Appel API Météo-France échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Clé API Météo-France invalide ou non autorisée (HTTP ${res.status})`);
  }
  if (res.status === 429) {
    throw new Error('Quota API Météo-France dépassé (HTTP 429)');
  }
  if (!res.ok) {
    throw new Error(`Réponse HTTP inattendue Météo-France : ${res.status} ${res.statusText}`);
  }

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error(`Réponse Météo-France illisible (JSON invalide) : ${err.message}`);
  }

  return extractVigilance(payload);
}

/**
 * Extrait l'état du département 05 de la réponse DPVigilance V6.
 *
 * Structure attendue (V6) :
 *   product.periods[] : une entrée par échéance (J, J1...), chacune avec
 *     begin_validity_time / end_validity_time et
 *     timelaps.domain_ids[] : un objet par domaine (département), avec
 *       domain_id, max_color_id, phenomenon_items[]
 *         (phenomenon_id, phenomenon_max_color_id).
 *
 * On calcule la couleur max du 05 sur l'ensemble des périodes ; orange (3)
 * ou rouge (4) → active, avec la liste des phénomènes atteignant ce seuil et
 * les échéances de début/fin des périodes concernées.
 */
function extractVigilance(payload) {
  const periods = payload?.product?.periods;
  if (!Array.isArray(periods)) {
    throw new Error('Structure DPVigilance inattendue : product.periods manquant');
  }

  let maxColor = 0;
  const phenomenaColors = new Map(); // phenomenon_id -> couleur max
  let since = null;
  let until = null;

  for (const period of periods) {
    const domains = period?.timelaps?.domain_ids;
    if (!Array.isArray(domains)) continue;

    const dept = domains.find((d) => String(d?.domain_id) === DOMAIN_ID);
    if (!dept) continue;

    const deptColor = Number(dept.max_color_id) || 0;
    if (deptColor > maxColor) maxColor = deptColor;

    // Phénomènes atteignant orange/rouge sur cette période.
    const items = Array.isArray(dept.phenomenon_items) ? dept.phenomenon_items : [];
    let periodHasAlert = false;
    for (const item of items) {
      const color = Number(item.phenomenon_max_color_id) || 0;
      if (color >= 3) {
        periodHasAlert = true;
        const id = item.phenomenon_id;
        if (color > (phenomenaColors.get(id) || 0)) phenomenaColors.set(id, color);
      }
    }
    // Certaines réponses ne détaillent pas les phénomènes mais donnent max_color_id.
    if (deptColor >= 3) periodHasAlert = true;

    if (periodHasAlert) {
      const begin = parseDate(period.begin_validity_time);
      const end = parseDate(period.end_validity_time);
      if (begin && (!since || begin < since)) since = begin;
      if (end && (!until || end > until)) until = end;
    }
  }

  if (maxColor < 3) {
    return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
  }

  const colorLabel = COLOR_LABEL[maxColor] || 'ORANGE';
  const phenomenaList = [...phenomenaColors.keys()].map(labelForPhenomenon);
  const phenomenaText = phenomenaList.length > 0 ? phenomenaList.join(', ') : 'phénomène non précisé';

  return {
    state: 'active',
    since,
    until,
    message: `Vigilance ${colorLabel} dans les Hautes-Alpes : ${phenomenaText}`,
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'vigilance-meteo-05', check };
