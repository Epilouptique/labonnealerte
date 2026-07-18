// Brique partagée MeteoAlarm (EUMETNET) : flux Atom+CAP publics SANS clé, un flux par
// pays. Extrait de meteo-belgique pour être réutilisé par meteo-europe (multi-pays).
// Le flux legacy est en ANGLAIS → on mappe severity/type vers le français.
//
// NOTE : meteo-belgique conserve sa propre copie (source en production, non touchée).
// Cette lib sert les nouvelles sources ; une migration de belgique/suisse est possible
// mais non faite ici (voir rapport).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const SEVERITY_RANK = { moderate: 1, severe: 2, extreme: 3 };
const NIVEAU_FR = { severe: 'orange', extreme: 'rouge' };
const FEED_BASE = 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-';

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
  if (n.includes('forest') || n.includes('fire')) return { fr: 'feux de forêt', emoji: '🔥' };
  if (n.includes('avalanche')) return { fr: 'avalanches', emoji: '🏔️' };
  return { fr: 'phénomène dangereux', emoji: '⚠️' };
}

function tag(block, name) {
  const m = block.match(new RegExp(`<(?:cap:)?${name}>([\\s\\S]*?)</(?:cap:)?${name}>`, 'i'));
  return m ? m[1].trim() : '';
}
function parseDate(v) { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }

// Parse le flux Atom+CAP → liste d'alertes { severity, rank, event, area, onset, expires }.
// Ne garde que les severities connues (moderate/severe/extreme).
function parseAlerts(xml) {
  const out = [];
  const entries = String(xml || '').split(/<entry[\s>]/i).slice(1);
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

// Récupère et parse le flux d'un pays. countryFeed = suffixe (ex. 'spain').
async function fetchCountryAlerts(countryFeed, { timeoutMs = 12000, label = 'MeteoAlarm' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchFn(FEED_BASE + countryFeed, {
      headers: { Accept: 'application/atom+xml, application/xml' }, signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout ${label} ${countryFeed} (>${timeoutMs} ms)`);
    throw new Error(`Appel ${label} ${countryFeed} échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue ${label} ${countryFeed} : ${res.status}`);
  return parseAlerts(await res.text());
}

module.exports = { SEVERITY_RANK, NIVEAU_FR, FEED_BASE, norm, phenomene, tag, parseDate, parseAlerts, fetchCountryAlerts };
