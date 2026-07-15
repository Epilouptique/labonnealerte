// Source PARAMÉTRÉE (OpenAlert v2) : avertissements météo en Belgique, PROVINCE au
// choix. Actif à partir du niveau ORANGE (severity Severe|Extreme) ; le jaune
// (Moderate) est ignoré (anti-spam, cohérent avec la vigilance métropole).
//
// API : MeteoAlarm (EUMETNET, alimenté par l'IRM), flux Atom public SANS clé,
// enveloppant du CAP. Un SEUL appel couvre toute la Belgique → mutualisation. Le
// flux legacy est en ANGLAIS : on mappe severity/type vers le français nous-mêmes.
// areaDesc = province belge. Les flux RSS legacy ayant été supprimés (2026-01-14),
// on utilise l'Atom legacy.
const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const FEED_URL = 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-belgium';
const PUBLIC_URL = 'https://www.meteo.be/fr/meteo/avertissements/carte-de-belgique';
const TIMEOUT_MS = 12_000;

// Provinces → terme(s) recherché(s) dans cap:areaDesc (anglais).
const PROVINCES = [
  { value: 'anvers', label: 'Anvers', match: ['antwerp'] },
  { value: 'brabant', label: 'Brabant', match: ['brabant'] },
  { value: 'flandre-occidentale', label: 'Flandre-Occidentale', match: ['west flanders', 'west-flanders'] },
  { value: 'flandre-orientale', label: 'Flandre-Orientale', match: ['east flanders', 'east-flanders'] },
  { value: 'hainaut', label: 'Hainaut', match: ['hainaut'] },
  { value: 'liege', label: 'Liège', match: ['liege', 'liège', 'lüttich'] },
  { value: 'limbourg', label: 'Limbourg', match: ['limburg'] },
  { value: 'luxembourg', label: 'Luxembourg (province)', match: ['luxembourg'] },
  { value: 'namur', label: 'Namur', match: ['namur'] },
  { value: 'littoral', label: 'Littoral (zone côtière)', match: ['coastal'] },
];
const BY_VALUE = {};
PROVINCES.forEach((p) => { BY_VALUE[p.value] = p; });

const paramsSchema = [
  {
    key: 'province',
    label: 'Province',
    type: 'enum',
    values: PROVINCES.map((p) => ({ value: p.value, label: p.label })),
    multiple: true,
    required: true,
    default: null,
  },
];

const SEVERITY_RANK = { moderate: 1, severe: 2, extreme: 3 };
const NIVEAU_FR = { severe: 'orange', extreme: 'rouge' };

function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

// Type de phénomène FR + émoji à partir du libellé cap:event anglais.
function phenomene(eventEn) {
  const n = norm(eventEn);
  if (n.includes('wind')) return { fr: 'vent violent', emoji: '💨' };
  if (n.includes('thunder')) return { fr: 'orages', emoji: '⛈️' };
  if (n.includes('rain')) return { fr: 'pluie', emoji: '🌧️' };
  if (n.includes('snow') || n.includes('ice')) return { fr: 'neige-verglas', emoji: '❄️' };
  if (n.includes('fog')) return { fr: 'brouillard', emoji: '🌫️' };
  if (n.includes('heat') || n.includes('high-temperature') || n.includes('high temperature')) return { fr: 'canicule', emoji: '🌡️' };
  if (n.includes('low-temperature') || n.includes('cold')) return { fr: 'grand froid', emoji: '🥶' };
  if (n.includes('coastal') || n.includes('flood')) return { fr: 'inondation', emoji: '🌊' };
  return { fr: 'phénomène dangereux', emoji: '⚠️' };
}

function tag(block, name) {
  const m = block.match(new RegExp(`<(?:cap:)?${name}>([\\s\\S]*?)</(?:cap:)?${name}>`, 'i'));
  return m ? m[1].trim() : '';
}
function parseDate(v) { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
function inactive(params) { return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

// Parse le flux Atom+CAP → liste d'alertes { severity, event, area, onset, expires }.
function parseAlerts(xml) {
  const out = [];
  const entries = xml.split(/<entry[\s>]/i).slice(1);
  for (const raw of entries) {
    const block = raw.split(/<\/entry>/i)[0];
    const severity = norm(tag(block, 'severity'));
    if (!SEVERITY_RANK[severity]) continue;
    out.push({
      severity,
      rank: SEVERITY_RANK[severity],
      event: tag(block, 'event'),
      area: tag(block, 'areaDesc'),
      onset: parseDate(tag(block, 'onset') || tag(block, 'effective')),
      expires: parseDate(tag(block, 'expires')),
    });
  }
  return out;
}

async function fetchFeed() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(FEED_URL, { headers: { Accept: 'application/atom+xml, application/xml' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout MeteoAlarm BE (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel MeteoAlarm BE échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue MeteoAlarm BE : ${res.status}`);
  return res.text();
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];

  let alerts;
  try { alerts = parseAlerts(await fetchFeed()); }
  catch (err) { console.warn(`[meteo-belgique] ${err.message}`); return combos.map(inactive); }

  return combos.map((p) => {
    const prov = BY_VALUE[String((p && p.province) || '')];
    if (!prov) return inactive(p);
    // Pire alerte orange+ dont areaDesc contient un terme de la province.
    let best = null;
    for (const a of alerts) {
      const area = norm(a.area);
      if (!prov.match.some((m) => area.includes(norm(m)))) continue;
      if (!best || a.rank > best.rank) best = a;
    }
    if (!best) return inactive(p);
    const ph = phenomene(best.event);
    return {
      params: p,
      state: 'active',
      since: best.onset,
      until: best.expires,
      message: `${ph.emoji} Belgique — ${prov.label} : avertissement ${NIVEAU_FR[best.severity] || 'orange'} (${ph.fr}).`,
      url: PUBLIC_URL,
    };
  });
}

module.exports = { id: 'meteo-belgique', paramsSchema, checkWithParams };
