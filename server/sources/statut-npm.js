// Source interne : panne majeure npm (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-npm', serviceName: 'npm',
  statusHost: 'https://status.npmjs.org', url: 'https://status.npmjs.org',
});
