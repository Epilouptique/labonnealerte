// Source broadcast : pannes d'électricité MAJEURES au Québec (Hydro-Québec).
// Actif quand le total provincial de clients affectés dépasse un seuil élevé
// (50 000 — signal type tempête de verglas), pas les pannes ordinaires (anti-spam).
//
// API : info-pannes publique Hydro-Québec (sans clé), en 2 temps :
//   1) .../v3_0/bisversion.json → { content: "YYYYMMDDHHmmss" }
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

async function check() {
  let total = 0;
  try {
    const ver = await getJson(`${BASE}/bisversion.json`);
    const version = ver && ver.content ? String(ver.content).replace(/[^0-9]/g, '') : '';
    if (!version) throw new Error('version bisversion.json illisible');
    const data = await getJson(`${BASE}/bismarkers${version}.json`);
    const pannes = data && Array.isArray(data.pannes) ? data.pannes : [];
    for (const entry of pannes) {
      // Entrée = tableau positionnel ; position 0 = nb clients affectés (entier).
      const n = Array.isArray(entry) ? Number(entry[0]) : NaN;
      if (Number.isFinite(n) && n > 0) total += n;
    }
  } catch (err) {
    console.warn(`[pannes-hydro-quebec] ${err.message}`);
    return inactive();
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

module.exports = { id: 'pannes-hydro-quebec', check };
