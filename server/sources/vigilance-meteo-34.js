// Source interne : Vigilance Météo-France pour l'Hérault (34).
// Logique mutualisée dans lib/vigilance-factory.js (un seul appel API partagé).
const { createVigilanceSource } = require('./lib/vigilance-factory');

module.exports = createVigilanceSource('34', "l'Hérault", 'herault');
