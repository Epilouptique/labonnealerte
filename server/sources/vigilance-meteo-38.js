// Source interne : Vigilance Météo-France pour l'Isère (38).
// Logique mutualisée dans lib/vigilance-factory.js (un seul appel API partagé).
const { createVigilanceSource } = require('./lib/vigilance-factory');

module.exports = createVigilanceSource('38', "l'Isère", 'isere');
