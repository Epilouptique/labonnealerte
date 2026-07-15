// Source PARAMÉTRÉE (OpenAlert v2) : risque d'avalanche (Météo-France DPBRA/BRA),
// MASSIF au choix. Actif si risque MAXIMAL >= 4/5 (Fort ou Très fort) UNIQUEMENT
// (anti-spam). Saisonnière (nov→début juin), silencieuse hors saison.
//
// ⚠️ PRÊTE-À-BRANCHER : l'API DPBRA nécessite une SOUSCRIPTION portail Météo-France
// DISTINCTE de la Vigilance (produit « DPBRA »), donc une clé propre :
//   env METEOFRANCE_DPBRA_API_KEY. Sans cette clé → no-op silencieux (toutes les
//   combinaisons rendues inactive), comme les autres sources sans clé. Une fois la
//   souscription faite et la clé posée, passer enabled=true côté sources.
//
// API : GET https://public-api.meteofrance.fr/public/DPBRA/v1/massif/BRA?id-massif={ID}&format=xml
// header apikey. Réponse XML : élément RISQUE avec attribut RISQUEMAXI (1..5).
// Un appel par massif souscrit (plafonné), échecs isolés.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const KEY = (process.env.METEOFRANCE_DPBRA_API_KEY || '').trim();
const BASE = 'https://public-api.meteofrance.fr/public/DPBRA/v1/massif/BRA';
const PUBLIC_URL = 'https://meteofrance.com/meteo-montagne/bulletin-avalanches';
const TIMEOUT_MS = 10_000;
const MAX_COMBOS = Math.max(1, parseInt(process.env.EXTERNAL_MAX_COMBOS || '20', 10) || 20);
const SEUIL = 4; // Fort (4) ou Très fort (5)
const LABELS = { 4: 'FORT', 5: 'TRÈS FORT' };

// Massifs des Hautes-Alpes (05) et voisins des Alpes du Sud (id DPBRA → nom).
const MASSIFS = [
  { value: '13', label: 'Thabor' },
  { value: '16', label: 'Pelvoux' },
  { value: '17', label: 'Queyras' },
  { value: '18', label: 'Dévoluy' },
  { value: '19', label: 'Champsaur' },
  { value: '20', label: 'Embrunais-Parpaillon' },
  { value: '21', label: 'Ubaye' },
  { value: '23', label: 'Mercantour' },
];
const NAME = {};
MASSIFS.forEach((m) => { NAME[m.value] = m.label; });

const paramsSchema = [
  {
    key: 'massif',
    label: 'Massif',
    type: 'enum',
    values: MASSIFS,
    multiple: true,
    required: true,
    default: null,
  },
];

function isEnabled() { return !!KEY; }

function inactive(params) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

// Extraction du risque maximal depuis le bulletin XML (attribut RISQUEMAXI). Le
// bulletin BRA est du XML : on lit le plus grand RISQUEMAXI présent (robuste aux
// variantes de casse/espacement).
function maxRisqueFromXml(xml) {
  let max = 0;
  const re = /RISQUEMAXI\s*=\s*"?(\d)/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const v = parseInt(m[1], 10);
    if (!Number.isNaN(v) && v > max) max = v;
  }
  return max;
}

async function checkOne(params) {
  const id = String((params && params.massif) || '');
  if (!NAME[id]) return inactive(params);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(`${BASE}?id-massif=${encodeURIComponent(id)}&format=xml`, {
      headers: { apikey: KEY, Accept: 'application/xml' }, signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout DPBRA (massif ${id})`);
    throw new Error(`Appel DPBRA échoué (massif ${id}) : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  // Hors saison, MF peut renvoyer 204/404 (pas de bulletin) → inactif.
  if (res.status === 204 || res.status === 404) return inactive(params);
  if (!res.ok) throw new Error(`Réponse HTTP inattendue DPBRA (massif ${id}) : ${res.status}`);

  const xml = await res.text();
  const max = maxRisqueFromXml(xml);
  if (max < SEUIL) return inactive(params);

  const nom = NAME[id];
  return {
    params,
    state: 'active',
    since: new Date(),
    until: null,
    message: `🏔️ Risque d'avalanche ${LABELS[max] || max + '/5'} sur le massif ${nom} — prudence en montagne`,
    url: PUBLIC_URL,
  };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (!KEY) return combos.map(inactive); // no-op sans souscription DPBRA
  let list = combos;
  if (list.length > MAX_COMBOS) {
    console.warn(`[avalanche] ${list.length} massifs — plafonné à ${MAX_COMBOS} ce cycle.`);
    list = list.slice(0, MAX_COMBOS);
  }
  const settled = await Promise.allSettled(list.map(checkOne));
  const out = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') out.push(r.value);
    else console.warn(`[avalanche] ${JSON.stringify(list[i])} : ${r.reason && r.reason.message}`);
  });
  return out;
}

module.exports = { id: 'risque-avalanche', paramsSchema, checkWithParams, isEnabled };
