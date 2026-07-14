// Source interne : Vigilance Météo-France pour Paris (75).
const { createVigilanceSource } = require('./lib/vigilance-factory');

module.exports = createVigilanceSource('75', 'Paris', 'paris');
