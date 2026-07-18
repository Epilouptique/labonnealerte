// Source PARAMÉTRÉE (OpenAlert v2) : vigilance météo dans un PAYS d'expatriation
// francophone (Europe). Même flux MeteoAlarm (EUMETNET) que meteo-belgique, généralisé
// à plusieurs pays via la brique partagée lib/meteoalarm.js.
//
// ÉCHELLE : le PAYS ENTIER (pas de région). On l'assume : « une vigilance grave quelque
// part en Espagne ». Actif à partir de l'ORANGE (severity Severe|Extreme) ; jaune ignoré
// (anti-spam, cohérent avec la vigilance métropole et meteo-belgique).
//
// MUTUALISATION : un seul appel réseau par PAYS souscrit (cache par pays dans le cycle).
// Flux legacy Atom en anglais → mapping FR partagé. NE TOUCHE PAS meteo-belgique/suisse.
//
// ⚠️ Réglage possible (voir rapport) : pour un très grand pays, l'orange peut être
// fréquent. Si la fréquence constatée s'avère bruyante, passer ce pays à Extreme seul.
const { fetchCountryAlerts, phenomene, NIVEAU_FR } = require('./lib/meteoalarm');

const TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 min : dédoublonne les appels rapprochés par pays

// value, label, feed (nom anglais du flux MeteoAlarm), url officielle nationale.
const COUNTRIES = [
  { value: 'espagne', label: 'Espagne', feed: 'spain', url: 'https://www.aemet.es/' },
  { value: 'allemagne', label: 'Allemagne', feed: 'germany', url: 'https://www.dwd.de/' },
  { value: 'italie', label: 'Italie', feed: 'italy', url: 'https://www.meteoam.it/' },
  { value: 'portugal', label: 'Portugal', feed: 'portugal', url: 'https://www.ipma.pt/' },
  { value: 'grece', label: 'Grèce', feed: 'greece', url: 'https://www.meteo.gr/' },
  { value: 'pays-bas', label: 'Pays-Bas', feed: 'netherlands', url: 'https://www.knmi.nl/' },
  { value: 'irlande', label: 'Irlande', feed: 'ireland', url: 'https://www.met.ie/' },
  { value: 'luxembourg', label: 'Luxembourg', feed: 'luxembourg', url: 'https://www.meteolux.lu/' },
];
const BY_VALUE = {};
COUNTRIES.forEach((c) => { BY_VALUE[c.value] = c; });

const PUBLIC_URL = 'https://www.meteoalarm.org/';
const paramsSchema = [{
  key: 'pays',
  label: 'Pays',
  type: 'enum',
  values: COUNTRIES.map((c) => ({ value: c.value, label: c.label })),
  multiple: true,
  required: true,
  default: null,
}];

const cache = new Map(); // feed → { at, alerts }
function inactive(params, url) { return { params, state: 'inactive', since: null, until: null, message: null, url: url || PUBLIC_URL }; }

async function alertsFor(feed) {
  const hit = cache.get(feed);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.alerts;
  const alerts = await fetchCountryAlerts(feed, { timeoutMs: TIMEOUT_MS, label: 'MeteoAlarm' });
  cache.set(feed, { at: Date.now(), alerts });
  return alerts;
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  const out = [];
  for (const p of combos) {
    const c = BY_VALUE[String((p && p.pays) || '')];
    if (!c) { out.push(inactive(p)); continue; }
    let alerts;
    try { alerts = await alertsFor(c.feed); }
    catch (err) { console.warn(`[meteo-europe] ${c.feed} : ${err.message}`); out.push(inactive(p, c.url)); continue; }
    // Pire alerte orange+ du pays (Severe|Extreme uniquement — la lib ne garde que les severities connues).
    let best = null;
    for (const a of alerts) {
      if (a.rank < 2) continue; // ignore jaune (moderate)
      if (!best || a.rank > best.rank) best = a;
    }
    if (!best) { out.push(inactive(p, c.url)); continue; }
    const ph = phenomene(best.event);
    out.push({
      params: p,
      state: 'active',
      since: best.onset,
      until: best.expires,
      message: `${ph.emoji} ${c.label} : vigilance ${NIVEAU_FR[best.severity] || 'orange'} (${ph.fr}) quelque part dans le pays.`,
      url: c.url,
    });
  }
  return out;
}

module.exports = { id: 'meteo-europe', paramsSchema, checkWithParams };
