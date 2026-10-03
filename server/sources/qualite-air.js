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
const { DEPARTEMENTS, locatifDepartement } = require('../geo');

const PUBLIC_URL = 'https://www.atmo-france.org/';
const SEUIL = 4;
const LABEL = { 4: 'mauvaise', 5: 'très mauvaise', 6: 'extrêmement mauvaise' };

// (Le nom seul n'est plus utilisé dans le message : locatifDepartement() fournit la
//  locution complète, article compris. DEPARTEMENTS reste nécessaire pour l'enum.)

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
    // OSCILLATION ALERTE/CALME (fil #9bis, constat des 24-25/07/2026). Cette branche
    // renvoyait « inactive » pour TOUS les abonnés dès que l'appel Atmo échouait — or
    // « inactive » n'est pas « je ne sais pas » : le poller y voit la fin de l'épisode,
    // écrit l'état, journalise 'deactivated', puis ré-active (et RE-NOTIFIE) au cycle
    // suivant dès que l'appel repasse. Un incident technique produisait donc une fausse
    // fin d'alerte. On PROPAGE désormais l'erreur : le poller enregistre un 'failed'
    // (« incident de surveillance », dédupliqué à 1/h, aucun mail aux abonnés) et LAISSE
    // l'état précédent intact — c'est la seule hystérésis dont cette source a besoin, et
    // elle ne touche pas au seuil ATMO (inchangé à 4/6).
    console.warn('[qualite-air] appel Atmo échoué (' + err.message + ') → incident, état précédent conservé.');
    throw err;
  }

  return combos.map((params) => {
    const dep = String((params && params.departement) || '');
    const q = byDept[dep] || 0;
    if (q < SEUIL) return inactive(params);
    // Locution de lieu AVEC L'ARTICLE DU DÉPARTEMENT (geo.js) : « dans les Hautes-Alpes »,
    // « dans le Var », « dans la Drôme », « dans l'Aisne », « en Haute-Corse », « à Paris ».
    // Le message disait « dans le ${nom} », faux pour la grande majorité des 101
    // départements (« dans le Hautes-Alpes » — constaté en production le 24/07/2026).
    const lieu = locatifDepartement(dep);
    return {
      params,
      state: 'active',
      since: new Date(),
      until: null,
      message: `😷 Qualité de l'air ${LABEL[q] || 'mauvaise'} ${lieu} (indice ATMO ${q}/6) — limitez les activités physiques intenses en extérieur, personnes sensibles prudentes. Source : Atmo France / AASQA.`,
      url: PUBLIC_URL,
    };
  });
}

module.exports = { id: 'qualite-air', paramsSchema, checkWithParams };
