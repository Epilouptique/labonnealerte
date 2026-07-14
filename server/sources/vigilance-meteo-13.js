// Source interne : Vigilance Météo-France pour les Bouches-du-Rhône (13).
const { createVigilanceSource } = require('./lib/vigilance-factory');

module.exports = createVigilanceSource('13', 'les Bouches-du-Rhône', 'bouches-du-rhone');
