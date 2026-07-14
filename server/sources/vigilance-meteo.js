// Source PARAMÉTRÉE (OpenAlert v2) : Vigilance Météo-France, un ou plusieurs
// départements au choix de l'abonné. Un seul appel Météo-France par cycle (cache
// mutualisé de la vigilance-factory), quel que soit le nombre de départements.
//
// Contrat v2 : { id, paramsSchema, checkWithParams(paramsList) }. Coexiste en
// dual-run avec les 15 sources vigilance-meteo-XX (broadcast, inchangées).

const { createVigilanceParamSource } = require('./lib/vigilance-factory');
const { DEPARTEMENTS } = require('../geo');

function slugify(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const NAME_BY_CODE = {};
DEPARTEMENTS.forEach((d) => { NAME_BY_CODE[d.code] = d.name; });

// Schéma déclaré (identique à celui inséré en base par init.sql — même référentiel geo).
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

module.exports = createVigilanceParamSource({
  id: 'vigilance-meteo',
  paramsSchema,
  nameFor: (code) => NAME_BY_CODE[code] || ('département ' + code),
  urlFor: (code) => 'https://vigilance.meteofrance.fr/fr/' + slugify(NAME_BY_CODE[code] || code),
});
