// Source interne : Vigilance Météo-France pour les Alpes-Maritimes (06).
const { createVigilanceSource } = require('./lib/vigilance-factory');

module.exports = createVigilanceSource('06', 'les Alpes-Maritimes', 'alpes-maritimes');
