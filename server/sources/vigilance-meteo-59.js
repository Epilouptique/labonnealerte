// Source interne : Vigilance Météo-France pour le Nord (59).
const { createVigilanceSource } = require('./lib/vigilance-factory');

module.exports = createVigilanceSource('59', 'le Nord', 'nord');
