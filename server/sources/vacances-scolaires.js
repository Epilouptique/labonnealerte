// Source PARAMÉTRÉE (OpenAlert v2) : vacances scolaires, zone(s) au choix de
// l'abonné (A / B / C). Un seul appel API par cycle (cache mutualisé 24h de la
// vacances-factory), quel que soit le nombre de zones suivies. Remplace les 3
// sources broadcast vacances-zone-a/b/c (migrées + désactivées par init.sql).
//
// Contrat v2 : { id, paramsSchema, checkWithParams(paramsList) }.

const { createVacancesParamSource } = require('./lib/vacances-factory');

// Schéma déclaré (identique à celui inséré en base par init.sql).
const paramsSchema = [
  {
    key: 'zone',
    label: 'Zone',
    type: 'enum',
    values: [
      { value: 'A', label: 'Zone A (Besançon, Bordeaux, Clermont, Dijon, Grenoble, Lyon, Poitiers…)' },
      { value: 'B', label: 'Zone B (Aix-Marseille, Lille, Nantes, Nice, Rennes, Rouen, Strasbourg…)' },
      { value: 'C', label: 'Zone C (Paris, Créteil, Versailles, Montpellier, Toulouse)' },
    ],
    multiple: true,
    required: true,
    default: null,
  },
];

module.exports = createVacancesParamSource({ id: 'vacances-scolaires', paramsSchema });
