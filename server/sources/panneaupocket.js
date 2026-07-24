// Source PARAMÉTRÉE (OpenAlert v2) : VEILLE PANNEAUPOCKET. L'abonné saisit l'URL de la page
// d'une collectivité sur app.panneaupocket.com (mairie, syndicat des eaux, ASA…) ; la source
// alerte dès qu'un panneau NOUVEAU est publié ou qu'un panneau existant est MODIFIÉ
// (y compris s'il passe « annulé »). Cas d'usage pilote : ASA du Canal de Gap (autorisations
// d'arrosage, tours d'eau, coupures).
//
// Récupération + parsing : lib/panneaupocket-parser.js. Moteur de veille anti-rétroactif
// (détection, cache TTL 2h, re-validation validPanneauUrl, message par défaut) : factorisé dans
// lib/panneaupocket-veille.js (createParamSource) — partagé avec ma-collectivite.

const { validPanneauUrl, parsePanneaux } = require('./lib/panneaupocket-parser');
const { createParamSource } = require('./lib/panneaupocket-veille');

const paramsSchema = [
  {
    key: 'url',
    label: 'URL de la page PanneauPocket',
    type: 'string',
    placeholder: 'https://app.panneaupocket.com/ville/398423648-asa-du-canal-de-gap-05000',
    pattern: '^https://app\\.panneaupocket\\.com/ville/[^\\s]{1,200}$',
    lowercase: false,
    multiple: true,
    required: true,
    default: null,
    hint: 'Copiez l\'adresse de la page de votre collectivité sur app.panneaupocket.com (mairie, syndicat des eaux, ASA…). Vous êtes prévenu à chaque nouveau panneau ou mise à jour (coupure d\'eau, arrosage, travaux…).',
  },
];

const source = createParamSource({ id: 'panneaupocket', paramsSchema });

module.exports = {
  id: source.id,
  paramsSchema,
  checkWithParams: source.checkWithParams,
  _parsePanneaux: parsePanneaux,
  _validPanneauUrl: validPanneauUrl,
  _buildMessage: source._buildMessage,
};
