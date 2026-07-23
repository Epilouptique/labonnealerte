// Source BROADCAST (OpenAlert v2) : nouvelle exoplanète POTENTIELLEMENT HABITABLE confirmée,
// via la NASA Exoplanet Archive (SANS clé).
//
// Requête TAP (SQL) sur la table pscomppars (paramètres composites, une ligne par planète) :
//   select pl_name, pl_rade, pl_insol from pscomppars
//   where pl_rade < 1.6 and pl_insol between 0.25 and 1.5
// → sous-ensemble RARE (~31 planètes) : petites (rocheuses probables, rayon < 1,6 R⊕) ET en
//   zone d'insolation tempérée (0,25 à 1,5 × l'insolation terrestre). « Potentiellement
//   habitable » au sens taille + zone — ce n'est PAS une preuve de vie (message explicite).
//
// ── DÉTECTION + ANTI-RÉTROACTIF ──────────────────────────────────────────────
// Dédoublonnage par pl_name (le champ rowupdate s'est révélé NON fiable pour la fraîcheur → on
// détecte par apparition d'un NOM jamais vu, pas par timestamp). Au 1er passage, on mémorise tout
// le sous-ensemble courant SANS alerter (anti-rétroactif). Cache mémoire (réinit sûre).

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TAP = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
const QUERY = 'select pl_name,pl_rade,pl_insol from pscomppars '
  + 'where pl_rade<1.6 and pl_insol between 0.25 and 1.5';
const PUBLIC_URL = 'https://exoplanetarchive.ipac.caltech.edu/';
const TIMEOUT_MS = 20_000;

// null = pas encore amorcé (anti-rétroactif) ; sinon Set des pl_name déjà vus.
let seen = null;

function inactive() { return { state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL }; }

// Parse le CSV TAP (en-tête pl_name,pl_rade,pl_insol) → [{ name, rade, insol }].
function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.length);
  if (lines.length < 2) return [];
  const out = [];
  for (const line of lines.slice(1)) {
    // Valeurs éventuellement entre guillemets ; pl_name peut contenir des espaces mais pas de virgule.
    const cols = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
    const name = cols[0];
    if (!name) continue;
    out.push({ name, rade: parseFloat(cols[1]), insol: parseFloat(cols[2]) });
  }
  return out;
}

async function fetchSubset() {
  const url = TAP + '?query=' + encodeURIComponent(QUERY) + '&format=csv';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(url, { headers: { Accept: 'text/csv' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timeout NASA Exoplanet Archive');
    throw new Error('Appel TAP échoué : ' + err.message);
  } finally { clearTimeout(timer); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return parseCsv(await res.text());
}

async function check() {
  let planets;
  try { planets = await fetchSubset(); }
  catch (err) { console.warn(`[exoplanete-habitable] ${err.message} → inactive.`); return inactive(); }
  if (!planets.length) return inactive(); // réponse vide/anormale → on ne touche pas la référence

  // 1er passage : amorçage, aucune alerte (anti-rétroactif).
  if (seen === null) {
    seen = new Set(planets.map((p) => p.name));
    return inactive();
  }

  const nouveaux = planets.filter((p) => !seen.has(p.name));
  planets.forEach((p) => seen.add(p.name));
  if (!nouveaux.length) return inactive();

  const p = nouveaux[0];
  const rade = Number.isFinite(p.rade) ? `${p.rade.toFixed(2)} rayon terrestre` : 'taille rocheuse';
  const insol = Number.isFinite(p.insol) ? `insolation ${p.insol.toFixed(2)}× celle de la Terre` : 'zone tempérée';
  return {
    state: 'active',
    since: new Date(), // pas de timestamp fiable ; ces planètes rares apparaissent très espacées
    until: null,
    message: `🪐 Nouvelle exoplanète potentiellement habitable confirmée : ${p.name} (${rade}, ${insol}) — taille et zone compatibles avec de l'eau liquide, ce n'est PAS une preuve de vie.`,
    url: PUBLIC_URL,
  };
}

module.exports = { id: 'exoplanete-habitable', check, _test: { peek: () => seen, poke: (k) => seen && seen.delete(k) } };
