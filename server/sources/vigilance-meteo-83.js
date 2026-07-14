// Source interne : Vigilance Météo-France pour le Var (83).
// Logique mutualisée dans lib/vigilance-factory.js (un seul appel API partagé).
const { createVigilanceSource } = require('./lib/vigilance-factory');

module.exports = createVigilanceSource('83', 'le Var', 'var');
