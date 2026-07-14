// Source interne : panne majeure Slack (API propre à Slack, pas Statuspage).
const { createSlackSource } = require('./lib/statuspage-factory');

module.exports = createSlackSource({
  id: 'statut-slack', serviceName: 'Slack',
  apiUrl: 'https://status.slack.com/api/v2.0.0/current', url: 'https://status.slack.com',
});
