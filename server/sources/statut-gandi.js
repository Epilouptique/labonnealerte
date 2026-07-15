// Source interne : panne majeure Gandi (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-gandi', serviceName: 'Gandi',
  statusHost: 'https://status.gandi.net', url: 'https://status.gandi.net',
});
