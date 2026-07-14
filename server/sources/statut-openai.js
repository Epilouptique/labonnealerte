// Source interne : panne majeure OpenAI (standard Statuspage).
const { createStatusSource } = require('./lib/statuspage-factory');

module.exports = createStatusSource({
  id: 'statut-openai', serviceName: 'OpenAI',
  statusHost: 'https://status.openai.com', url: 'https://status.openai.com',
});
