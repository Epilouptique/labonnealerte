// Source interne : panne majeure Scaleway (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-scaleway', serviceName: 'Scaleway',
  statusHost: 'https://status.scaleway.com', url: 'https://status.scaleway.com',
});
