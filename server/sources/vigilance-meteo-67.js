// Source interne : Vigilance Météo-France pour le Bas-Rhin (67).
const { createVigilanceSource } = require('./lib/vigilance-factory');

module.exports = createVigilanceSource('67', 'le Bas-Rhin', 'bas-rhin');
