// Source interne : panne majeure Reddit (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-reddit', serviceName: 'Reddit',
  statusHost: 'https://www.redditstatus.com', url: 'https://www.redditstatus.com',
});
