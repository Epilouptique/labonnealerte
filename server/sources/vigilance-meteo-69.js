// Source interne : Vigilance Météo-France pour le Rhône (69).
const { createVigilanceSource } = require('./lib/vigilance-factory');

module.exports = createVigilanceSource('69', 'le Rhône', 'rhone');
