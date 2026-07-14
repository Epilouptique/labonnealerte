// Source interne : Vigilance Météo-France pour les Hautes-Alpes (05).
// Logique mutualisée dans lib/vigilance-factory.js (un seul appel API partagé
// entre tous les départements).
const { createVigilanceSource } = require('./lib/vigilance-factory');

module.exports = createVigilanceSource('05', 'les Hautes-Alpes', 'hautes-alpes');
