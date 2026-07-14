// Source interne : Vigilance Météo-France pour la Haute-Savoie (74).
// Logique mutualisée dans lib/vigilance-factory.js (un seul appel API partagé).
const { createVigilanceSource } = require('./lib/vigilance-factory');

module.exports = createVigilanceSource('74', 'la Haute-Savoie', 'haute-savoie');
