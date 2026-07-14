// Source interne : Vigilance Météo-France pour la Loire-Atlantique (44).
const { createVigilanceSource } = require('./lib/vigilance-factory');

module.exports = createVigilanceSource('44', 'la Loire-Atlantique', 'loire-atlantique');
