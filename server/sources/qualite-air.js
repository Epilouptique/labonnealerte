// Source PARAMÉTRÉE (OpenAlert v2) : qualité de l'air (indice ATMO), DÉPARTEMENT au choix.
// Actif si l'indice ATMO du département est « mauvais » ou pire (≥ 4/6) — anti-spam : les
// niveaux bon/moyen/dégradé (1..3) sont ignorés.
//
// Données : connecteur partagé lib/atmo-connector.js (WFS national Atmo France, sans clé,
// indice par commune agrégé au « pire cas » départemental). MAJ quotidienne. Un seul appel
// réseau mutualisé (cache du connecteur), quel que soit le nombre d'abonnés.
//
// Échelle ATMO (code_qual) : 1 bon · 2 moyen · 3 dégradé · 4 mauvais · 5 très mauvais ·
// 6 extrêmement mauvais. Seuil d'alerte = 4.

const { getByDept } = require('./lib/atmo-connector');
const { DEPARTEMENTS } = require('../geo');

const PUBLIC_URL = 'https://www.atmo-france.org/';
const SEUIL = 4;
const LABEL = { 4: 'mauvaise', 5: 'très mauvaise', 6: 'extrêmement mauvaise' };

const NAME = {};
DEPARTEMENTS.forEach((d) => { NAME[d.code] = d.name; });

const paramsSchema = [
  {
    key: 'departement',
    label: 'Département',
    type: 'enum',
    values: DEPARTEMENTS.map((d) => ({ value: d.code, label: d.name })),
    multiple: true,
    required: true,
    default: null,
  },
];

function inactive(params) {
  return { params, state: 'inactive', since: null, until: null, message: null, url: PUBLIC_URL };
}

async function checkWithParams(paramsList) {
  const combos = Array.isArray(paramsList) ? paramsList : [];
  if (combos.length === 0) return [];

  let byDept;
  try {
    ({ byDept } = await getByDept('air'));
  } catch (err) {
    // Échec réseau / structure changée → inactive silencieux (jamais de fausse alerte).
    console.warn('[qualite-air] appel Atmo échoué (' + err.message + ') → inactive.');
    return combos.map(inactive);
  }

  return combos.map((params) => {
    const dep = String((params && params.departement) || '');
    const q = byDept[dep] || 0;
    if (q < SEUIL) return inactive(params);
    const nom = NAME[dep] || ('département ' + dep);
    return {
      params,
      state: 'active',
      since: new Date(),
      until: null,
      message: `😷 Qualité de l'air ${LABEL[q] || 'mauvaise'} dans le ${nom} (indice ATMO ${q}/6) — limitez les activités physiques intenses en extérieur, personnes sensibles prudentes`,
      url: PUBLIC_URL,
    };
  });
}

module.exports = { id: 'qualite-air', paramsSchema, checkWithParams };
