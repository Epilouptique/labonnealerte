// Source interne : panne majeure PyPI (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-pypi', serviceName: 'PyPI',
  statusHost: 'https://status.python.org', url: 'https://status.python.org',
});
