// Source interne : panne majeure Zapier (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-zapier', serviceName: 'Zapier',
  statusHost: 'https://status.zapier.com', url: 'https://status.zapier.com',
});
