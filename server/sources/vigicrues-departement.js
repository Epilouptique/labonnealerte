// Source PARAMÉTRÉE (OpenAlert v2) : Vigilance crues (Vigicrues / SCHAPI) par
// DÉPARTEMENT. Remplace la source broadcast vigicrues-05 (fixée sur les Hautes-Alpes)
// dans le cadre du chantier A2, sur le modèle de vigilance-meteo / seismes-departement.
//
// ⚠️⚠️ COUVERTURE PARTIELLE, EN EXTENSION PROGRESSIVE ⚠️⚠️
// Vigicrues publie ~337 tronçons SANS champ « département » : une section fluviale
// traverse plusieurs départements, l'attribution est donc faite à la main sur le
// DÉPARTEMENT PRINCIPAL de sections clairement nommées. On ne couvre pour l'instant
// que quelques départements des 5 grands bassins (Durance, Rhône, Loire, Seine,
// Garonne) — les codes ci-dessous sont vérifiés dans InfoVigiCru.geojson. D'autres
// départements seront ajoutés au fil d'un mapping revu. Ce caractère partiel est
// affiché AUSSI côté public (description de la source en base). Ne PAS laisser croire
// à une couverture nationale.
//
// Niveaux NivInfViCr : 1 vert · 2 jaune · 3 orange · 4 rouge. On alerte à partir de
// l'orange (≥3), comme vigicrues-05 / vigilance-meteo. Un seul appel API par cycle,
// mutualisé pour tous les départements suivis.

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { DEPARTEMENTS } = require('../geo');

const API_URL = 'https://www.vigicrues.gouv.fr/services/InfoVigiCru.geojson';
const PUBLIC_URL = 'https://www.vigicrues.gouv.fr';
const TIMEOUT_MS = 10_000;
const COLOR_LABEL = { 3: 'ORANGE', 4: 'ROUGE' };
const NIVEAU_LABEL = { 1: 'vert', 2: 'jaune', 3: 'orange', 4: 'rouge' };

const NAME = {};
DEPARTEMENTS.forEach((d) => { NAME[d.code] = d.name; });

// Mapping département → tronçons Vigicrues (codes CdEntCru vérifiés). PARTIEL.
// Chaque section est rattachée à son département principal (sur/sous-couverture de
// bordure assumée, acceptable pour une vigilance crues).
const DEPT_TRONCONS = {
  '05': ['GA30', 'GA21'],   // Durance de Serre-Ponçon à Cadarache (Hautes-Alpes) — vérifié (ex vigicrues-05)
  '13': ['GA9'],            // Rhône d'Avignon à la mer / delta (Bouches-du-Rhône)
  '75': ['IF5'],            // Seine à Paris
  '45': ['LC175'],          // Loire orléanaise (Loiret)
  '37': ['LC195'],          // Loire tourangelle (Indre-et-Loire)
  '31': ['MP18'],           // Garonne toulousaine (Haute-Garonne)
  '33': ['DO23'],           // Garonne girondine (Gironde)
};

// Schéma déclaré (DOIT rester identique à celui inséré en base par init.sql).
const paramsSchema = [
  {
    key: 'departement',
    label: 'Département',
    type: 'enum',
    values: Object.keys(DEPT_TRONCONS).map((code) => ({ value: code, label: NAME[code] || ('département ' + code) })),
    multiple: true,
    required: true,
    default: null,
  },
];

function inactive(params) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

// Récupère la carte { CdEntCru -> niveau } depuis l'API (un seul appel / cycle).
async function fetchLevels() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchFn(API_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout API Vigicrues (>${TIMEOUT_MS} ms)`);
    throw new Error(`Appel API Vigicrues échoué : ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Réponse HTTP inattendue Vigicrues : ${res.status} ${res.statusText}`);

  let payload;
  try { payload = await res.json(); } catch (err) { throw new Error(`Réponse Vigicrues illisible : ${err.message}`); }
  const features = payload && payload.features;
  if (!Array.isArray(features)) throw new Error('Structure Vigicrues inattendue : features manquant');

  const levels = {};
  for (const f of features) {
    const p = f && f.properties;
    if (!p || p.CdEntCru == null) continue;
    levels[p.CdEntCru] = { level: Number(p.NivInfViCr) || 0, label: p.lbentcru };
  }
  return levels;
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (!combos.length) return [];

  let levels;
  try {
    levels = await fetchLevels();
  } catch (err) {
    // Échec réseau : on n'invente pas d'état — on remonte l'erreur pour ce cycle.
    console.warn(`[vigicrues-departement] ${err.message}`);
    throw err;
  }

  return combos.map((params) => {
    const dep = String((params && params.departement) || '');
    const codes = DEPT_TRONCONS[dep];
    if (!codes) return inactive(params); // département hors couverture partielle

    let maxLevel = 0;
    const concerned = [];
    for (const code of codes) {
      const t = levels[code];
      if (!t) continue;
      if (t.level > maxLevel) maxLevel = t.level;
      if (t.level >= 3) concerned.push(t.label || code);
    }

    if (maxLevel < 3) return inactive(params);
    const colorLabel = COLOR_LABEL[maxLevel] || 'ORANGE';
    return {
      params,
      state: 'active',
      since: new Date(), // l'API ne publie pas de début d'épisode → première détection
      until: null,
      message: `🌊 Vigilance crues ${colorLabel} : ${concerned.join(', ')}`,
      url: PUBLIC_URL,
    };
  });
}

module.exports = { id: 'vigicrues-departement', paramsSchema, checkWithParams };
