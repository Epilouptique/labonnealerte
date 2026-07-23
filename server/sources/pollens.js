// Source PARAMÉTRÉE (OpenAlert v2) : risque d'allergie aux pollens, DÉPARTEMENT au choix.
// Actif si au moins un taxon atteint un niveau ÉLEVÉ (≥ 4/6) dans le département — anti-spam :
// les niveaux faible/moyen (1..3) sont ignorés. 6 taxons suivis : ambroisie, armoise, aulne,
// bouleau, graminées, olivier.
//
// ⚠️ SOURCE RÉCENTE — À SURVEILLER (Robot 2). La surveillance pollinique a été REPRISE par
// Atmo France / les AASQA en 2025-2026 (décret du 2 mars 2026), après la LIQUIDATION
// JUDICIAIRE du RNSA (26 mars 2025). On NE dépend donc PLUS de pollens.fr / RNSA (organisme
// liquidé), mais du nouvel « indice pollen » Atmo France (open data data.gouv, sans clé).
// Dispositif jeune : sa stabilité (URL, format WFS) est à surveiller — un échec de récupération
// dégrade silencieusement en inactive, jamais de fausse alerte.
//
// Données : connecteur partagé lib/atmo-connector.js (même WFS/agrégation que qualite-air).
// Échelle 1..6, seuil d'alerte = 4. MAJ ~quotidienne à hebdomadaire selon la saison.

const { getByDept } = require('./lib/atmo-connector');
const { DEPARTEMENTS } = require('../geo');

const PUBLIC_URL = 'https://www.atmo-france.org/article/lindice-pollens';
const SEUIL = 4;

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
    ({ byDept } = await getByDept('pollens'));
  } catch (err) {
    console.warn('[pollens] appel Atmo échoué (' + err.message + ') → inactive.');
    return combos.map(inactive);
  }

  return combos.map((params) => {
    const dep = String((params && params.departement) || '');
    const info = byDept[dep];
    if (!info || info.level < SEUIL) return inactive(params);
    const nom = NAME[dep] || ('département ' + dep);
    const taxon = info.taxon ? ` (${info.taxon})` : '';
    return {
      params,
      state: 'active',
      since: new Date(),
      until: null,
      message: `🤧 Risque d'allergie aux pollens ÉLEVÉ dans le ${nom}${taxon} (indice ${info.level}/6) — personnes allergiques, adaptez traitement et sorties. Source : Atmo France / AASQA.`,
      url: PUBLIC_URL,
    };
  });
}

module.exports = { id: 'pollens', paramsSchema, checkWithParams };
