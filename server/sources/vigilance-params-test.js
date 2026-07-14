// BANC D'ESSAI (OpenAlert v2 — sources paramétrées). Source interne PARAMÉTRÉE
// servant à valider le poller multi-instances sur la vigilance météo.
//
// Volontairement ABSENTE du kiosque : aucun INSERT dans `sources` en init.sql,
// donc jamais listée (GET /api/sources filtre enabled=true) ni exécutée par le
// cycle normal du poller (runCycle filtre les sources présentes en base). Elle
// n'est activée que par le script documenté server/db/test-vigilance-params.js,
// qui l'insère puis la nettoie dans une transaction. Zéro empreinte en prod.
//
// Contrat v2 : { id, paramsSchema, checkWithParams(paramsList) } — pas de
// check() broadcast (cette source n'existe qu'en mode paramétré).

const { createVigilanceParamSource } = require('./lib/vigilance-factory');
const { DEPARTEMENTS } = require('../geo');

// Slug d'URL publique Météo-France à partir du nom du département.
function slugify(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const NAME_BY_CODE = {};
DEPARTEMENTS.forEach((d) => { NAME_BY_CODE[d.code] = d.name; });

// Schéma déclaré : un enum « departement » multiple (les 101 codes).
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
  id: 'vigilance-meteo-params-test',
  paramsSchema,
  nameFor: (code) => NAME_BY_CODE[code] || ('département ' + code),
  urlFor: (code) => 'https://vigilance.meteofrance.fr/fr/' + slugify(NAME_BY_CODE[code] || code),
});
