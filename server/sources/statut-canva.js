// Source interne : panne majeure Canva (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-canva', serviceName: 'Canva',
  statusHost: 'https://www.canvastatus.com', url: 'https://www.canvastatus.com',
});
