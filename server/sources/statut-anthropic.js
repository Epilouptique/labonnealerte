// Source interne : panne majeure Anthropic / Claude (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-anthropic', serviceName: 'Anthropic',
  statusHost: 'https://status.anthropic.com', url: 'https://status.anthropic.com',
});
