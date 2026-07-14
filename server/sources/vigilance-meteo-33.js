// Source interne : Vigilance Météo-France pour la Gironde (33).
const { createVigilanceSource } = require('./lib/vigilance-factory');

module.exports = createVigilanceSource('33', 'la Gironde', 'gironde');
