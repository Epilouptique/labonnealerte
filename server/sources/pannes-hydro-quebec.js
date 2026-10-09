// Source broadcast : pannes d'électricité MAJEURES au Québec (Hydro-Québec).
// Actif quand le total provincial de clients affectés dépasse un seuil élevé
// (50 000 — signal type tempête de verglas), pas les pannes ordinaires (anti-spam).
//
// API : info-pannes publique Hydro-Québec (sans clé), en 2 temps :
//   1) .../v3_0/bisversion.json → "YYYYMMDDHHmmss" (chaîne JSON nue depuis début octobre 2026 ;
//      ancien format { content: "YYYYMMDDHHmmss" } toujours accepté)
//   2) .../v3_0/bismarkers<VERSION>.json → { pannes: [ [nbClients, debut, ...], ... ] }
// Il n'existe PAS de total provincial prêt à lire : on SOMME le champ « clients
// affectés » (1re position de chaque entrée). Schéma positionnel non documenté →
// lecture défensive (entier en tête, sinon entrée ignorée).
const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const BASE = 'https://pannes.hydroquebec.com/pannes/donnees/v3_0';
const PUBLIC_URL = 'https://www.hydroquebec.com/pannes-interruptions-electricite/';
const TIMEOUT_MS = 12_000;
const SEUIL_CLIENTS = 50_000;

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout Hydro-Québec (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel Hydro-Québec échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue Hydro-Québec : ${res.status}`);
  return res.json();
}

function inactive() { return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

// Numéro de version : chaîne nue (format actuel) ou { content } (ancien format).
function readVersion(ver) {
  const raw = typeof ver === 'string' || typeof ver === 'number' ? ver : ver && ver.content;
  return raw != null ? String(raw).replace(/[^0-9]/g, '') : '';
}

async function check() {
  // Toute erreur (réseau, HTTP, format illisible) est PROPAGÉE : le poller journalise un 'failed'
  // (« incident de surveillance »), garde l'état précédent et ne notifie personne. Renvoyer
  // inactive() masquait la panne (changement de format de bisversion.json, début octobre 2026).
  const ver = await getJson(`${BASE}/bisversion.json`);
  const version = readVersion(ver);
  if (!version) throw new Error('Hydro-Québec : version bisversion.json illisible');
  const data = await getJson(`${BASE}/bismarkers${version}.json`);
  if (!data || !Array.isArray(data.pannes)) throw new Error('Hydro-Québec : liste des pannes illisible');
  let total = 0;
  for (const entry of data.pannes) {
    // Entrée = tableau positionnel ; position 0 = nb clients affectés (entier).
    const n = Array.isArray(entry) ? Number(entry[0]) : NaN;
    if (Number.isFinite(n) && n > 0) total += n;
  }

  if (total < SEUIL_CLIENTS) return inactive();

  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const arrondi = Math.round(total / 1000) * 1000;
  return {
    state: 'active',
    since: midnight,
    until: null,
    message: `⚡ Pannes d'électricité majeures au Québec : environ ${arrondi.toLocaleString('fr-CA')} foyers privés de courant.`,
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'pannes-hydro-quebec', check, _test: { readVersion } };
