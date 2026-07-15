// Source interne : panne majeure Atlassian (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-atlassian', serviceName: 'Atlassian',
  statusHost: 'https://status.atlassian.com', url: 'https://status.atlassian.com',
});
