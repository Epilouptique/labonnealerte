// Source interne : panne majeure Bitbucket (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-bitbucket', serviceName: 'Bitbucket',
  statusHost: 'https://bitbucket.status.atlassian.com', url: 'https://bitbucket.status.atlassian.com',
});
