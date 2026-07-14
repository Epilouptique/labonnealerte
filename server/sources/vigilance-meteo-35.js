// Source interne : Vigilance Météo-France pour l'Ille-et-Vilaine (35).
const { createVigilanceSource } = require('./lib/vigilance-factory');

module.exports = createVigilanceSource('35', "l'Ille-et-Vilaine", 'ille-et-vilaine');
