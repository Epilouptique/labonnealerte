// Source interne : Vigilance Météo-France pour la Haute-Garonne (31).
const { createVigilanceSource } = require('./lib/vigilance-factory');

module.exports = createVigilanceSource('31', 'la Haute-Garonne', 'haute-garonne');
